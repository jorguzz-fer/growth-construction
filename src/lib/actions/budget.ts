"use server";

import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  getUnits,
  getReembolsos,
  getInccRows,
  getDespesas,
  toCalcUnit,
  reembToCalc,
} from "@/lib/queries";
import {
  calcProjectionBySource,
  reembursementsByMonth,
  PROJECTION_SOURCES,
} from "@/lib/calc";
import { isBudgetVersion } from "@/lib/budget/config";

export interface BudgetCell {
  rowKey: string;
  dreCategory: string | null;
  mes: string;
  valor: number;
}

type Ctx = NonNullable<Awaited<ReturnType<typeof getActiveContext>>>;

/**
 * Carrega a versão-alvo do lançamento simplificado direto do banco (por id,
 * no escopo do tenant) — as telas de Budget/Forecast são por projeto e não
 * dependem mais de um "projeto ativo". Valida tipo, permissão e trava.
 */
async function loadBudgetTarget(ctx: Ctx, versionId: string) {
  const [v] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.id, versionId),
        eq(schema.versions.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!v) throw new Error("Versão inválida.");
  if (!isBudgetVersion(v.kind)) {
    throw new Error("Lançamento simplificado é só para Budget/Forecast.");
  }
  // Permissão pela tela correspondente ao tipo da versão (budget/forecast).
  if (!can(ctx.perms, v.kind, "editar")) throw new Error("Sem permissão.");
  if (v.locked) throw new Error("Versão congelada.");
  return v;
}

/** Versão de um dado tipo no mesmo projeto da versão-alvo. */
async function siblingVersion(projectId: string, kind: string) {
  const [v] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.projectId, projectId),
        eq(schema.versions.kind, kind as typeof schema.versions.$inferSelect.kind),
      ),
    )
    .limit(1);
  return v ?? null;
}

/** Revalida as duas telas de lançamento simplificado e os reports afetados. */
function revalidateLancamento() {
  revalidatePath("/budget");
  revalidatePath("/forecast");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
}

/** Substitui todas as linhas de um tipo (receita/despesa) da versão. */
async function replaceLines(
  tenantId: string,
  versionId: string,
  kind: "receita" | "despesa",
  cells: BudgetCell[],
) {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, kind),
        ),
      );
    const rows = cells
      .filter((c) => c.rowKey && c.mes && Number(c.valor) !== 0)
      .map((c) => ({
        tenantId,
        versionId,
        kind,
        rowKey: c.rowKey,
        dreCategory: c.dreCategory ?? (kind === "receita" ? "Receita" : null),
        mes: c.mes,
        valor: String(Number(c.valor)),
      }));
    if (rows.length) await tx.insert(schema.budgetLines).values(rows);
  });
}

/** Salva o lançamento simplificado (uma aba: receita ou despesa) de uma versão. */
export async function saveBudgetLines(
  versionId: string,
  kind: "receita" | "despesa",
  cells: BudgetCell[],
) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sem permissão.");
  await loadBudgetTarget(ctx, versionId);
  await replaceLines(ctx.tenant.id, versionId, kind, cells);
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "budget.save",
    entity: "budget_line",
    entityId: versionId,
    meta: { kind, count: cells.length },
  });
  revalidateLancamento();
}

/** Copia os lançamentos do Budget do projeto para a versão Forecast. */
export async function importFromBudget(forecastVersionId: string) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sem permissão.");
  const target = await loadBudgetTarget(ctx, forecastVersionId);
  const budget = await siblingVersion(target.projectId, "budget");
  if (!budget) throw new Error("Este projeto não tem versão Budget.");

  const lines = await db
    .select()
    .from(schema.budgetLines)
    .where(eq(schema.budgetLines.versionId, budget.id));
  await db.transaction(async (tx) => {
    await tx.delete(schema.budgetLines).where(eq(schema.budgetLines.versionId, forecastVersionId));
    if (lines.length)
      await tx.insert(schema.budgetLines).values(
        lines.map((l) => ({
          tenantId: ctx.tenant.id,
          versionId: forecastVersionId,
          kind: l.kind,
          rowKey: l.rowKey,
          dreCategory: l.dreCategory,
          mes: l.mes,
          valor: l.valor,
        })),
      );
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "budget.importFromBudget",
    entity: "budget_line",
    entityId: forecastVersionId,
    meta: { from: budget.id, count: lines.length },
  });
  revalidateLancamento();
}

const numCell = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const raw = String(v).trim();
  const br = /,\d{1,2}$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  const n = Number(br);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Importa uma planilha (mesmo formato do export: abas Receitas e Despesas,
 * linhas × meses) para o lançamento simplificado da versão.
 */
export async function importBudgetXlsx(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sem permissão.");
  const versionId = (formData.get("versionId") as string) || "";
  await loadBudgetTarget(ctx, versionId);
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione uma planilha.");

  const wb = XLSX.read(await file.arrayBuffer(), { type: "buffer" });
  const readSheet = (name: string) => {
    const ws = wb.Sheets[name];
    if (!ws) return [] as unknown[][];
    return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }).filter((r) => r.length);
  };

  const recCells: BudgetCell[] = [];
  const recRows = readSheet("Receitas");
  if (recRows.length) {
    const months = (recRows[0] as unknown[]).slice(1).map(String);
    for (const row of recRows.slice(1)) {
      const rowKey = String((row as unknown[])[0] ?? "").trim();
      if (!rowKey) continue;
      months.forEach((mes, i) => {
        const valor = numCell((row as unknown[])[i + 1]);
        if (valor !== 0) recCells.push({ rowKey, dreCategory: "Receita", mes, valor });
      });
    }
  }

  const despCells: BudgetCell[] = [];
  const despRows = readSheet("Despesas");
  if (despRows.length) {
    const months = (despRows[0] as unknown[]).slice(2).map(String);
    for (const row of despRows.slice(1)) {
      const label = String((row as unknown[])[0] ?? "").trim();
      const code = label.split(" · ")[0].trim();
      const dre = String((row as unknown[])[1] ?? "").trim() || "Despesa Fixa";
      if (!code) continue;
      months.forEach((mes, i) => {
        const valor = numCell((row as unknown[])[i + 2]);
        if (valor !== 0) despCells.push({ rowKey: code, dreCategory: dre, mes, valor });
      });
    }
  }

  await replaceLines(ctx.tenant.id, versionId, "receita", recCells);
  await replaceLines(ctx.tenant.id, versionId, "despesa", despCells);
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "budget.import",
    entity: "budget_line",
    entityId: versionId,
    meta: { receita: recCells.length, despesa: despCells.length },
  });
  revalidateLancamento();
}

/** Deriva os lançamentos simplificados a partir da versão "atual" (detalhada). */
export async function replicateFromAtual(targetVersionId: string) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sem permissão.");
  const target = await loadBudgetTarget(ctx, targetVersionId);
  const atual = await siblingVersion(target.projectId, "atual");
  if (!atual) throw new Error("Não encontrei a versão Atual.");

  const [units, reembRows, incc, despesas] = await Promise.all([
    getUnits(atual.id),
    getReembolsos(atual.id),
    getInccRows(target.projectId),
    getDespesas(atual.id),
  ]);

  // Receita por fonte × mês.
  const receitaCells: BudgetCell[] = [];
  const bySource = Object.fromEntries(
    PROJECTION_SOURCES.map((s) => [s, {} as Record<string, number>]),
  ) as Record<string, Record<string, number>>;
  for (const u of units) {
    const bs = calcProjectionBySource(toCalcUnit(u), incc);
    for (const s of PROJECTION_SOURCES)
      for (const [mm, v] of Object.entries(bs[s]))
        bySource[s][mm] = (bySource[s][mm] || 0) + v;
  }
  for (const s of PROJECTION_SOURCES)
    for (const [mes, valor] of Object.entries(bySource[s]))
      receitaCells.push({ rowKey: s, dreCategory: "Receita", mes, valor });
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  for (const [mes, valor] of Object.entries(reemb))
    receitaCells.push({ rowKey: "Reembolso", dreCategory: "Receita", mes, valor });

  // Despesa por grupo CEF × mês (com a categoria DRE já lançada).
  const despMap = new Map<string, BudgetCell>();
  for (const d of despesas) {
    if (!d.contaCef || !d.competencia) continue;
    const grp = d.contaCef.split(".")[0];
    const key = `${grp}|${d.competencia}`;
    const cur = despMap.get(key);
    const val = Number(d.valor);
    if (cur) cur.valor += val;
    else despMap.set(key, { rowKey: grp, dreCategory: d.categoriaDre ?? "Custo Variável", mes: d.competencia, valor: val });
  }

  await replaceLines(ctx.tenant.id, targetVersionId, "receita", receitaCells);
  await replaceLines(ctx.tenant.id, targetVersionId, "despesa", [...despMap.values()]);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "budget.replicateFromAtual",
    entity: "budget_line",
    entityId: targetVersionId,
    meta: { receita: receitaCells.length, despesa: despMap.size },
  });
  revalidateLancamento();
}
