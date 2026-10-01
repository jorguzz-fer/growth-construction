"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { monthValue } from "@/lib/planning";
import { RECEITAS_PROJETO_KEY } from "@/lib/budget/config";
import { getBudgetPlanning, getChartAccounts } from "@/lib/queries";
import { naturezaDoGrupo } from "@/lib/natureza-grupo";
import { recusaDaInclusao, recusaDaRemocao, resumoDaRemocao, totalReceitasDoProjeto, type GrupoDoPlano } from "@/lib/orcamento-regras";

export interface PlanningAccountInput {
  rowKey: string;
  dreCategory: string | null;
  total: number;
  months: { mes: string; pct: number }[];
}

/** Screen id de permissão conforme o tipo da versão. */
function screenOf(kind: string): "budget" | "forecast" | null {
  return kind === "budget" ? "budget" : kind === "forecast" ? "forecast" : null;
}

/**
 * Grava um bloco (receitas OU despesas) de uma versão de Budget/Forecast no
 * modelo total + %. O valor mensal é derivado: valor = total × pct / 100.
 *
 * Prompt D (pré-condição BG-11): a gravação é NÃO DESTRUTIVA para linhas
 * ausentes — só as chaves que vieram no formulário são substituídas (delete +
 * insert transacional); chave que não veio (linha legada, grupo fora da
 * seleção) fica intacta. Remover linha é ação explícita
 * (`removerLinhaDoOrcamento`). Conta zerada enviada é apagada (o usuário a
 * zerou) e não reinserida.
 *
 * "Receitas do Projeto" (3.1): o total é derivado do cadastro do projeto no
 * servidor — o que o cliente mandar nessa linha é ignorado — e continua
 * gravado em `budget_account.total`, para que relatórios não mudem de
 * mecanismo. NÃO toca no bloco oposto nem em outras versões.
 */
export async function saveBudgetPlanning(
  versionId: string,
  bloco: "receita" | "despesa",
  accounts: PlanningAccountInput[],
) {
  const ctx = await getTenantContext();
  if (!ctx) throw new Error("Sessão inválida.");

  const [version] = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!version) throw new Error("Versão não encontrada.");
  const screen = screenOf(version.kind);
  if (!screen || !can(ctx.perms, screen, "editar")) {
    throw new Error("Sem permissão para editar esta versão.");
  }
  if (version.locked) throw new Error("Versão congelada — edição bloqueada.");
  if (version.kind !== "budget" && version.kind !== "forecast") {
    throw new Error("Só é possível planejar versões de Budget ou Forecast.");
  }

  // Validação: sem percentuais negativos; soma por conta não pode ultrapassar 100%.
  for (const a of accounts) {
    let soma = 0;
    for (const m of a.months) {
      const p = Number(m.pct) || 0;
      if (p < 0) throw new Error(`Percentual negativo em "${a.rowKey}".`);
      soma += p;
    }
    if (soma > 100.01) {
      throw new Error(
        `A distribuição mensal de "${a.rowKey}" não pode ultrapassar 100% do total.`,
      );
    }
  }

  // BD-1: o total da linha fixa vem do cadastro, não do formulário.
  if (bloco === "receita" && accounts.some((a) => a.rowKey === RECEITAS_PROJETO_KEY)) {
    const [projeto] = await db
      .select({ valorConstrucao: schema.projects.valorConstrucao, valorTerreno: schema.projects.valorTerreno, terrenoForaCaixa: schema.projects.terrenoForaCaixa })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, version.projectId), eq(schema.projects.tenantId, ctx.tenant.id)))
      .limit(1);
    const doCadastro = projeto ? totalReceitasDoProjeto(projeto) : null;
    accounts = accounts.map((a) => (a.rowKey === RECEITAS_PROJETO_KEY ? { ...a, dreCategory: "Receita", total: doCadastro ?? 0 } : a));
  }
  const chaves = [...new Set(accounts.map((a) => a.rowKey))];

  await db.transaction(async (tx) => {
    if (chaves.length > 0) {
      await tx
        .delete(schema.budgetAccounts)
        .where(
          and(
            eq(schema.budgetAccounts.versionId, versionId),
            eq(schema.budgetAccounts.kind, bloco),
            inArray(schema.budgetAccounts.rowKey, chaves),
          ),
        );
      await tx
        .delete(schema.budgetLines)
        .where(
          and(eq(schema.budgetLines.versionId, versionId), eq(schema.budgetLines.kind, bloco), inArray(schema.budgetLines.rowKey, chaves)),
        );
    }

    const accVals = accounts
      .filter((a) => Number(a.total) !== 0 || a.months.some((m) => (Number(m.pct) || 0) !== 0))
      .map((a) => ({
        tenantId: ctx.tenant.id,
        versionId,
        kind: bloco,
        rowKey: a.rowKey,
        dreCategory: a.dreCategory,
        total: String(Number(a.total) || 0),
      }));
    if (accVals.length > 0) await tx.insert(schema.budgetAccounts).values(accVals);

    const lineVals: (typeof schema.budgetLines.$inferInsert)[] = [];
    for (const a of accounts) {
      const total = Number(a.total) || 0;
      for (const m of a.months) {
        const pct = Number(m.pct) || 0;
        if (pct === 0) continue;
        lineVals.push({
          tenantId: ctx.tenant.id,
          versionId,
          kind: bloco,
          rowKey: a.rowKey,
          dreCategory: a.dreCategory,
          mes: m.mes,
          valor: String(monthValue(total, pct)),
          pct: String(pct),
        });
      }
    }
    if (lineVals.length > 0) await tx.insert(schema.budgetLines).values(lineVals);
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "budget.planning.save",
    entity: "version",
    entityId: versionId,
    meta: { bloco, contas: accounts.length, chaves },
  });
  revalidatePath("/budget");
  revalidatePath("/forecast");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
}

const FORECAST_COLORS = [
  "#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#6366f1", "#f43f5e",
];
const MAX_FORECASTS = 12;

/** Copia budget_account + budget_line de uma versão de origem para a nova versão. */
async function copyPlanningData(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: string,
  fromVersionId: string,
  toVersionId: string,
) {
  const [accs, lines] = await Promise.all([
    tx.select().from(schema.budgetAccounts).where(eq(schema.budgetAccounts.versionId, fromVersionId)),
    tx.select().from(schema.budgetLines).where(eq(schema.budgetLines.versionId, fromVersionId)),
  ]);
  if (accs.length > 0) {
    await tx.insert(schema.budgetAccounts).values(
      accs.map((a) => ({
        tenantId,
        versionId: toVersionId,
        kind: a.kind,
        rowKey: a.rowKey,
        dreCategory: a.dreCategory,
        total: a.total,
      })),
    );
  }
  if (lines.length > 0) {
    await tx.insert(schema.budgetLines).values(
      lines.map((l) => ({
        tenantId,
        versionId: toVersionId,
        kind: l.kind,
        rowKey: l.rowKey,
        dreCategory: l.dreCategory,
        mes: l.mes,
        valor: l.valor,
        pct: l.pct,
      })),
    );
  }
  // BD-7: a Previsão herda a seleção de linhas do Orçamento de origem.
  const sel = await tx.select().from(schema.budgetSelecoes).where(eq(schema.budgetSelecoes.versionId, fromVersionId));
  if (sel.length > 0) {
    await tx.insert(schema.budgetSelecoes).values(sel.map((r) => ({ tenantId, versionId: toVersionId, kind: r.kind, rowKey: r.rowKey, ordem: r.ordem })));
  }
}

/* ─── incluir / excluir linha da grade (Prompt D, 4-A) ───────────────── */

export type ResultadoLinha = { ok: true; aviso?: string } | { ok: false; error: string };

/** Grupos do Plano de Contas com natureza e "ativo" derivados dos subitens. */
async function gruposDoPlano(tenantId: string): Promise<GrupoDoPlano[]> {
  const contas = await getChartAccounts(tenantId);
  const porGrupo = new Map<string, { groupCode: string; groupName: string; kind: "cef" | "complementar"; subitens: { natureza: string | null; ativo: boolean }[] }>();
  for (const c of contas) {
    const g = porGrupo.get(c.groupCode) ?? { groupCode: c.groupCode, groupName: c.groupName, kind: c.kind, subitens: [] };
    g.subitens.push({ natureza: c.natureza, ativo: c.ativo ?? true });
    porGrupo.set(c.groupCode, g);
  }
  return [...porGrupo.values()].map((g) => ({ groupCode: g.groupCode, groupName: g.groupName, kind: g.kind, natureza: naturezaDoGrupo(g.subitens), ativo: g.subitens.some((x) => x.ativo) }));
}

/**
 * Versão alvo de incluir/excluir: do tenant, de Orçamento (a Previsão herda
 * a seleção — BD-7), com permissão de editar e não congelada.
 */
async function versaoParaSelecao(versionId: string): Promise<{ ok: true; ctx: NonNullable<Awaited<ReturnType<typeof getTenantContext>>>; version: typeof schema.versions.$inferSelect } | { ok: false; error: string }> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  const [version] = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!version) return { ok: false, error: "Versão não encontrada." };
  if (version.kind !== "budget") return { ok: false, error: "A Previsão Atualizada herda as linhas do Orçamento de origem: inclua ou remova lá." };
  if (!can(ctx.perms, "budget", "editar")) return { ok: false, error: "Sem permissão para editar o orçamento." };
  if (version.locked) return { ok: false, error: "Versão congelada — edição bloqueada." };
  return { ok: true, ctx, version };
}

/**
 * Sem seleção gravada para (versão, bloco), a grade mostra o padrão. Na
 * primeira inclusão/exclusão o padrão daquele momento é materializado na
 * tabela, para que a mudança tenha onde ser registrada. Devolve as chaves.
 */
async function materializarSelecao(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], tenantId: string, projectId: string, versionId: string, bloco: "receita" | "despesa"): Promise<string[]> {
  const atual = await tx.select().from(schema.budgetSelecoes).where(and(eq(schema.budgetSelecoes.versionId, versionId), eq(schema.budgetSelecoes.kind, bloco)));
  if (atual.length > 0) return atual.sort((a, b) => a.ordem - b.ordem).map((r) => r.rowKey);
  const data = await getBudgetPlanning(tenantId, projectId, "budget", versionId);
  const rows = (bloco === "receita" ? data.receitas : data.despesas).filter((r) => r.fromChart);
  if (rows.length > 0) {
    await tx.insert(schema.budgetSelecoes).values(rows.map((r, i) => ({ tenantId, versionId, kind: bloco, rowKey: r.rowKey, ordem: i })));
  }
  return rows.map((r) => r.rowKey);
}

/**
 * 4-A.2 — inclui na grade um grupo do Plano de Contas (ativo, da natureza do
 * bloco, ainda ausente). Entra zerado: nada é gravado em budget_account.
 * Não cria grupo: cadastro é na tela de Plano de Contas.
 */
export async function incluirLinhaDoOrcamento(versionId: string, bloco: "receita" | "despesa", rowKey: string): Promise<ResultadoLinha> {
  const alvo = await versaoParaSelecao(versionId);
  if (!alvo.ok) return alvo;
  const { ctx, version } = alvo;
  const grupos = await gruposDoPlano(ctx.tenant.id);
  const data = await getBudgetPlanning(ctx.tenant.id, version.projectId, "budget", versionId);
  const naGrade = (bloco === "receita" ? data.receitas : data.despesas).map((r) => r.rowKey);
  const grupo = grupos.find((g) => g.groupCode === rowKey);
  const recusa = recusaDaInclusao(grupo, bloco, naGrade);
  if (recusa) return { ok: false, error: recusa };
  await db.transaction(async (tx) => {
    const chaves = await materializarSelecao(tx, ctx.tenant.id, version.projectId, versionId, bloco);
    if (!chaves.includes(rowKey)) {
      await tx.insert(schema.budgetSelecoes).values({ tenantId: ctx.tenant.id, versionId, kind: bloco, rowKey, ordem: chaves.length });
    }
    await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "budget.linha.incluir", entity: "version", entityId: versionId, meta: { bloco, rowKey, grupo: grupo!.groupName } }, tx);
  });
  revalidatePath("/budget");
  return { ok: true };
}

/**
 * 4-A.3 — retira uma linha da GRADE (nunca do Plano de Contas). Como a
 * gravação passou a ser não destrutiva, é aqui que o lançamento daquela conta
 * é removido da versão: budget_account e budget_line da chave. O log guarda
 * conta, total e competências. Fixa e legadas não saem (4-A.4). A tela pede
 * confirmação quando há valor; o servidor exige `confirmado` nesse caso.
 */
export async function removerLinhaDoOrcamento(versionId: string, bloco: "receita" | "despesa", rowKey: string, confirmado = false): Promise<ResultadoLinha> {
  const alvo = await versaoParaSelecao(versionId);
  if (!alvo.ok) return alvo;
  const { ctx, version } = alvo;
  const data = await getBudgetPlanning(ctx.tenant.id, version.projectId, "budget", versionId);
  const rows = bloco === "receita" ? data.receitas : data.despesas;
  const row = rows.find((r) => r.rowKey === rowKey);
  if (!row) return { ok: false, error: "Essa linha não está na grade." };
  const recusa = recusaDaRemocao(row);
  if (recusa) return { ok: false, error: recusa };
  const resumo = resumoDaRemocao(row.total, row.pct);
  if (resumo.temValor && !confirmado) return { ok: false, error: "Esta linha tem lançamento: confirme a remoção na tela." };
  const meses = Object.entries(row.pct).filter(([, p]) => (Number(p) || 0) !== 0).map(([m, p]) => ({ mes: m, pct: Number(p) }));
  await db.transaction(async (tx) => {
    await materializarSelecao(tx, ctx.tenant.id, version.projectId, versionId, bloco);
    await tx.delete(schema.budgetSelecoes).where(and(eq(schema.budgetSelecoes.versionId, versionId), eq(schema.budgetSelecoes.kind, bloco), eq(schema.budgetSelecoes.rowKey, rowKey)));
    await tx.delete(schema.budgetAccounts).where(and(eq(schema.budgetAccounts.versionId, versionId), eq(schema.budgetAccounts.kind, bloco), eq(schema.budgetAccounts.rowKey, rowKey)));
    await tx.delete(schema.budgetLines).where(and(eq(schema.budgetLines.versionId, versionId), eq(schema.budgetLines.kind, bloco), eq(schema.budgetLines.rowKey, rowKey)));
    await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "budget.linha.remover", entity: "version", entityId: versionId, meta: { bloco, rowKey, conta: row.label, total: resumo.total, competencias: resumo.competencias, meses } }, tx);
  });
  revalidatePath("/budget");
  revalidatePath("/forecast");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
  return { ok: true, aviso: resumo.temValor ? `Lançamento de “${row.label}” removido (${resumo.competencias} competência(s)).` : `“${row.label}” retirada da grade.` };
}

/**
 * Cria uma versão de Forecast como SNAPSHOT independente a partir de uma versão
 * de Budget do mesmo projeto: copia contas, totais, percentuais e valores, e
 * registra a origem (source_version_id) apenas para rastreabilidade/comparação.
 * O Forecast não fica sincronizado com o Budget depois de criado.
 */
export async function createForecastFromBudget(
  projectId: string,
  budgetVersionId: string,
  label: string,
): Promise<string> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "forecast", "criar")) {
    throw new Error("Sem permissão para criar Forecast.");
  }
  if (!ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Projeto inválido.");
  }
  const [budget] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.id, budgetVersionId),
        eq(schema.versions.tenantId, ctx.tenant.id),
        eq(schema.versions.projectId, projectId),
        eq(schema.versions.kind, "budget"),
      ),
    )
    .limit(1);
  if (!budget) throw new Error("Versão de Budget de origem não encontrada.");

  const existing = await db
    .select({ id: schema.versions.id })
    .from(schema.versions)
    .where(
      and(eq(schema.versions.projectId, projectId), eq(schema.versions.kind, "forecast")),
    );
  if (existing.length >= MAX_FORECASTS) {
    throw new Error(`Limite de ${MAX_FORECASTS} versões de Forecast por projeto atingido.`);
  }
  const clean = (label || "").trim() || "Forecast";
  const key = `forecast-${crypto.randomUUID().slice(0, 8)}`;
  const color = FORECAST_COLORS[existing.length % FORECAST_COLORS.length];

  const newId = await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(schema.versions)
      .values({
        projectId,
        tenantId: ctx.tenant.id,
        key,
        kind: "forecast",
        label: clean,
        color,
        isDefault: false,
        locked: false,
        status: "Rascunho",
        sourceVersionId: budgetVersionId,
      })
      .returning();
    await copyPlanningData(tx, ctx.tenant.id, budgetVersionId, v.id);
    return v.id;
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "forecast.createFromBudget",
    entity: "version",
    entityId: newId,
    meta: { projectId, budgetVersionId, label: clean },
  });
  revalidatePath("/forecast");
  return newId;
}

/** Duplica uma versão de Forecast em uma nova versão independente. */
export async function duplicateForecast(
  forecastVersionId: string,
  label: string,
): Promise<string> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "forecast", "criar")) {
    throw new Error("Sem permissão para duplicar Forecast.");
  }
  const [src] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.id, forecastVersionId),
        eq(schema.versions.tenantId, ctx.tenant.id),
        eq(schema.versions.kind, "forecast"),
      ),
    )
    .limit(1);
  if (!src) throw new Error("Forecast de origem não encontrado.");

  const existing = await db
    .select({ id: schema.versions.id })
    .from(schema.versions)
    .where(
      and(eq(schema.versions.projectId, src.projectId), eq(schema.versions.kind, "forecast")),
    );
  if (existing.length >= MAX_FORECASTS) {
    throw new Error(`Limite de ${MAX_FORECASTS} versões de Forecast por projeto atingido.`);
  }
  const clean = (label || "").trim() || `${src.label} (cópia)`;
  const key = `forecast-${crypto.randomUUID().slice(0, 8)}`;
  const color = FORECAST_COLORS[existing.length % FORECAST_COLORS.length];

  const newId = await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(schema.versions)
      .values({
        projectId: src.projectId,
        tenantId: ctx.tenant.id,
        key,
        kind: "forecast",
        label: clean,
        color,
        isDefault: false,
        locked: false,
        status: "Rascunho",
        sourceVersionId: src.sourceVersionId,
      })
      .returning();
    await copyPlanningData(tx, ctx.tenant.id, src.id, v.id);
    return v.id;
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "forecast.duplicate",
    entity: "version",
    entityId: newId,
    meta: { from: forecastVersionId, label: clean },
  });
  revalidatePath("/forecast");
  return newId;
}

/** Atualiza o status do workflow da versão (Rascunho/Concluído/Aprovado). */
export async function setVersionStatus(versionId: string, status: string) {
  const ctx = await getTenantContext();
  if (!ctx) throw new Error("Sessão inválida.");
  const allowed = ["Rascunho", "Concluído", "Aprovado"];
  if (!allowed.includes(status)) throw new Error("Status inválido.");
  const [version] = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!version) return;
  const screen = screenOf(version.kind);
  if (!screen || !can(ctx.perms, screen, "editar")) {
    throw new Error("Sem permissão.");
  }
  await db
    .update(schema.versions)
    .set({ status })
    .where(eq(schema.versions.id, versionId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "version.status",
    entity: "version",
    entityId: versionId,
    meta: { status },
  });
  revalidatePath("/budget");
  revalidatePath("/forecast");
}
