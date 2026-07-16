"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getDespesas, getUnits, toCalcUnit } from "@/lib/queries";

/** "MM/DD/YYYY" | "MM/YYYY" → "MM/YYYY" (para casar por competência). */
function monthKeyFrom(d?: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[0].padStart(2, "0")}/${p[2]}`;
  if (p.length === 2) return `${p[0].padStart(2, "0")}/${p[1]}`;
  return null;
}

const cents = (v: number) => Math.round(v * 100);

export async function addCash(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "criar")) return;
  if (ctx.version.locked) throw new Error("Versão congelada.");

  // Tipo de lançamento define o sinal do valor e a categoria:
  //  - receita: entrada (+), categoria escolhida (mensais/AS/…);
  //  - despesa: saída (−), lançamento avulso do extrato sem contraparte;
  //  - ajuste:  ajuste manual de caixa, + ou − conforme "sinal".
  // Entradas de ajuste e avulsas do extrato já nascem conciliadas (não têm
  // contraparte nos módulos de receita/despesa para casar).
  const tipo = ((formData.get("tipo") as string) || "receita").toLowerCase();
  const magnitude = Math.abs(Number(formData.get("valor")) || 0);

  let sign = 1;
  let cat = (formData.get("cat") as string) || "outro";
  let rec = false;
  if (tipo === "despesa") {
    sign = -1;
    cat = "despesa_extrato";
    rec = true;
  } else if (tipo === "ajuste") {
    sign = (formData.get("sinal") as string) === "menos" ? -1 : 1;
    cat = "ajuste";
    rec = true;
  } else if (tipo === "receita" && cat === "extrato") {
    // Receita avulsa do extrato (sem categoria de receita conhecida).
    cat = "receita_extrato";
    rec = true;
  }

  const [row] = await db
    .insert(schema.cashEntries)
    .values({
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      data: (formData.get("data") as string) || null,
      descricao: (formData.get("descricao") as string) || null,
      valor: String(sign * magnitude),
      cat,
      unitCode: (formData.get("unitCode") as string) || null,
      bankAccountId: (formData.get("bankAccountId") as string) || null,
      rec,
    })
    .returning();

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: tipo === "ajuste" ? "cash.adjust" : "cash.create",
    entity: "cash_entry",
    entityId: row.id,
    meta: { tipo, cat, valor: row.valor },
  });
  revalidatePath("/caixa");
}

export interface ImportCashRow {
  data?: string;
  descricao?: string;
  valor?: number;
  cat?: string;
  /** nº do documento do extrato (para dedup e exibição). */
  doc?: string;
}

export interface ImportExtratoInput {
  rows: ImportCashRow[];
  /** conta corrente à qual os lançamentos e o saldo final pertencem. */
  bankAccountId?: string | null;
  /** saldo final do extrato — atualiza o saldo da conta se informado. */
  saldoFinal?: number | null;
}

export interface ImportExtratoResult {
  inserted: number;
  conciliated: number;
  saldoUpdated: boolean;
  /** lançamentos ignorados por já terem sido importados antes (dedup). */
  skipped: number;
}

/** Assinatura de dedup de um lançamento do extrato (por conta). */
function importSignature(
  bankAccountId: string | null,
  data: string | null | undefined,
  valor: number,
  doc: string | null | undefined,
): string {
  return `${bankAccountId ?? "-"}|${(data ?? "").trim()}|${cents(valor)}|${(doc ?? "").trim()}`;
}

/**
 * Importa lançamentos de um extrato (XLSX/CSV) para uma conta corrente:
 *  1) atribui cada lançamento à conta informada;
 *  2) tenta casar (conciliar) automaticamente com as despesas previstas
 *     (por valor + mês) e com as receitas previstas das unidades (por valor);
 *  3) atualiza o saldo final da conta, quando informado.
 * Lançamentos sem correspondência ficam pendentes para conciliação manual.
 */
export async function importCash(
  input: ImportExtratoInput,
): Promise<ImportExtratoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "criar")) {
    throw new Error("Sem permissão para importar extrato.");
  }
  if (ctx.version.locked) throw new Error("Versão congelada.");

  const { rows, saldoFinal } = input;
  // Valida a conta (deve pertencer ao tenant).
  const contas = await db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, ctx.tenant.id));
  const bankAccountId =
    input.bankAccountId && contas.some((c) => c.id === input.bankAccountId)
      ? input.bankAccountId
      : null;

  // Dedup: ignora lançamentos já importados antes (mesma conta, data, valor e
  // documento). Carrega as assinaturas existentes uma vez.
  const existentes = await db
    .select({ importHash: schema.cashEntries.importHash })
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.tenantId, ctx.tenant.id));
  const jaImportados = new Set(
    existentes.map((e) => e.importHash).filter((h): h is string => !!h),
  );

  const naoZero = rows.filter((r) => r.valor != null && r.valor !== 0);
  const vistos = new Set<string>();
  let skipped = 0;
  const valid = naoZero.filter((r) => {
    const sig = importSignature(bankAccountId, r.data, Number(r.valor), r.doc);
    if (jaImportados.has(sig) || vistos.has(sig)) {
      skipped++;
      return false;
    }
    vistos.add(sig);
    return true;
  });

  // Pools para conciliação automática.
  const [despesas, units] = await Promise.all([
    getDespesas(ctx.version.id),
    getUnits(ctx.version.id),
  ]);
  // Despesas previstas: chave (centavos|mês) → quantidade disponível.
  const despPool = new Map<string, number>();
  for (const d of despesas) {
    if (d.cancelado) continue;
    const mm = monthKeyFrom(d.competencia) ?? monthKeyFrom(d.vencimento);
    if (!mm) continue;
    const key = `${cents(Math.abs(Number(d.valor)))}|${mm}`;
    despPool.set(key, (despPool.get(key) ?? 0) + 1);
  }
  // Receitas previstas: conjunto de valores de parcela esperados (em centavos).
  const receitaVals = new Set<number>();
  for (const u of units) {
    const c = toCalcUnit(u);
    for (const val of [
      c.AS.val,
      c.S1.val,
      c.S2.val,
      c.S3.val,
      c.Mensais.val,
      c.Semestrais.val,
      c.Anuais.val,
      c.FGTS.val,
      c.Subsidio.val,
      c.Permuta.val,
    ]) {
      if (val && val > 0) receitaVals.add(cents(val));
    }
  }

  let conciliated = 0;
  const toInsert = valid.map((r) => {
    const v = Number(r.valor);
    let rec = false;
    let cat = r.cat || "extrato";
    if (v < 0) {
      // Saída → tenta casar com uma despesa prevista (valor + mês).
      const mm = monthKeyFrom(r.data);
      const key = `${cents(Math.abs(v))}|${mm}`;
      const avail = despPool.get(key) ?? 0;
      if (mm && avail > 0) {
        despPool.set(key, avail - 1);
        rec = true;
        cat = "despesa";
        conciliated++;
      }
    } else if (receitaVals.has(cents(v))) {
      // Entrada → casa com um valor de parcela previsto das unidades.
      rec = true;
      cat = "receita";
      conciliated++;
    }
    return {
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      bankAccountId,
      data: r.data || null,
      descricao: r.descricao || null,
      valor: String(v),
      cat,
      doc: r.doc || null,
      importHash: importSignature(bankAccountId, r.data, v, r.doc),
      rec,
    };
  });

  if (toInsert.length > 0) {
    await db.insert(schema.cashEntries).values(toInsert);
  }

  // Atualiza o saldo final da conta, se informado.
  let saldoUpdated = false;
  if (bankAccountId && saldoFinal != null && Number.isFinite(saldoFinal)) {
    await db
      .update(schema.bankAccounts)
      .set({
        saldo: String(saldoFinal),
        saldoSource: "auto",
        lastSync: new Date(),
      })
      .where(
        and(
          eq(schema.bankAccounts.id, bankAccountId),
          eq(schema.bankAccounts.tenantId, ctx.tenant.id),
        ),
      );
    saldoUpdated = true;
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cash.import",
    entity: "cash_entry",
    meta: {
      count: toInsert.length,
      conciliated,
      skipped,
      bankAccountId,
      saldoUpdated,
    },
  });
  revalidatePath("/caixa");
  revalidatePath("/contas");
  return { inserted: toInsert.length, conciliated, saldoUpdated, skipped };
}

/** Alterna o estado de conciliação de um lançamento de caixa. */
export async function toggleConciliado(id: string, rec: boolean) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) return;
  await db
    .update(schema.cashEntries)
    .set({ rec })
    .where(eq(schema.cashEntries.id, id));
  revalidatePath("/caixa");
}
