import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { emptyUnit } from "./calc/__fixtures__";
import {
  calcProjection,
  calcProjectionBySource,
  reembursementsByMonth,
  PROJECTION_SOURCES,
  type CalcPermutaResale,
  type ProjectionSource,
} from "./calc/projection";
import { expandUnitReceivables } from "./calc/receivables";
import { OUTRAS_RECEITAS_KEY, OUTRAS_RECEITAS_PID } from "./budget/config";
import type {
  CalcPermuta,
  CalcReembolso,
  CalcUnit,
  InccRow,
  MonthlyProjection,
} from "./calc/types";

export type UnitRow = typeof schema.units.$inferSelect;
export type ReembolsoRow = typeof schema.reembolsos.$inferSelect;
export type PermutaRow = typeof schema.permutas.$inferSelect;

/** Converte uma linha de unidade do banco para o tipo consumido pelos cálculos. */
export function toCalcUnit(row: UnitRow): CalcUnit {
  // Mescla o plano salvo sobre um plano padrão COMPLETO. Assim, planos antigos
  // ou parciais (com algum subobjeto ausente, ex.: sem "S2") não quebram os
  // cálculos (dashboard, projeção, etc.) — os campos faltantes viram defaults.
  const base = stripIdentity(emptyUnit(row.code)) as Record<string, unknown>;
  const stored = (row.paymentPlan ?? {}) as Record<string, unknown>;
  const plan: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) {
    const b = base[k];
    const s = stored[k];
    if (b && typeof b === "object" && !Array.isArray(b)) {
      plan[k] = s && typeof s === "object" ? { ...(b as object), ...(s as object) } : b;
    } else if (s !== undefined) {
      plan[k] = s;
    }
  }
  // Preserva chaves extras do plano salvo (flags de nível superior, etc.).
  for (const k of Object.keys(stored)) {
    if (!(k in plan)) plan[k] = stored[k];
  }
  return {
    ...(plan as Omit<CalcUnit, "code" | "status" | "valor">),
    code: row.code,
    status: row.status,
    valor: Number(row.valor),
  };
}

/** Remove os campos de identidade, deixando só o plano de pagamento (JSONB). */
function stripIdentity(u: CalcUnit) {
  const { code: _c, status: _s, valor: _v, ...plan } = u;
  void _c;
  void _s;
  void _v;
  return plan;
}

export function toInccRows(
  rows: (typeof schema.inccRates.$inferSelect)[],
): InccRow[] {
  return rows.map((r) => ({
    m: r.mes,
    mo: Number(r.monthly),
    ac: Number(r.accumulated),
    projected: r.projected,
  }));
}

// ─────────────────────────────── leituras ───────────────────────────────

export async function getUnits(versionId: string): Promise<UnitRow[]> {
  return db
    .select()
    .from(schema.units)
    .where(eq(schema.units.versionId, versionId))
    .orderBy(asc(schema.units.code));
}

/**
 * Todas as unidades do tenant (versão Atual de cada projeto) — para os cadastros
 * de cliente/contrato listarem unidades de qualquer projeto, não só do ativo.
 */
export async function getUnitCodesByTenant(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ code: schema.units.code })
    .from(schema.units)
    .where(eq(schema.units.tenantId, tenantId))
    .orderBy(asc(schema.units.code));
  return [...new Set(rows.map((r) => r.code))];
}

export async function getUnit(
  versionId: string,
  unitId: string,
): Promise<UnitRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.units)
    .where(
      and(eq(schema.units.versionId, versionId), eq(schema.units.id, unitId)),
    )
    .limit(1);
  return row;
}

/** Unidade por id no escopo do tenant, com o projeto da sua versão. */
export async function getUnitWithProject(
  tenantId: string,
  unitId: string,
): Promise<(UnitRow & { projectId: string }) | undefined> {
  const [row] = await db
    .select({ u: schema.units, projectId: schema.versions.projectId })
    .from(schema.units)
    .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
    .where(and(eq(schema.units.id, unitId), eq(schema.units.tenantId, tenantId)))
    .limit(1);
  return row ? { ...row.u, projectId: row.projectId } : undefined;
}

export async function getReembolsos(
  versionId: string,
): Promise<ReembolsoRow[]> {
  return db
    .select()
    .from(schema.reembolsos)
    .where(eq(schema.reembolsos.versionId, versionId));
}

export async function getPermutas(versionId: string): Promise<PermutaRow[]> {
  return db
    .select()
    .from(schema.permutas)
    .where(eq(schema.permutas.versionId, versionId));
}

export async function getInccRows(projectId: string): Promise<InccRow[]> {
  const rows = await db
    .select()
    .from(schema.inccRates)
    .where(eq(schema.inccRates.projectId, projectId))
    .orderBy(asc(schema.inccRates.ordem));
  return toInccRows(rows);
}

// helpers de conversão para agregados

export function reembToCalc(rows: ReembolsoRow[]): CalcReembolso[] {
  return rows.map((r) => ({ data: r.data ?? "", valor: Number(r.valor ?? 0) }));
}

export function permToCalc(rows: PermutaRow[]): CalcPermuta[] {
  return rows.map((p) => ({
    estimado: Number(p.estimado ?? 0),
    status: p.status ?? "",
    valorVenda: Number(p.valorVenda ?? 0),
  }));
}

/** Mapeia permutas → dados de revenda para os cálculos de caixa/DRE (item 10). */
export function permToResale(rows: PermutaRow[]): CalcPermutaResale[] {
  return rows.map((p) => ({
    valorVenda: Number(p.valorVenda ?? 0),
    dataVenda: p.dataVenda ?? "",
    formaVenda: p.formaVenda ?? "",
    parcelas: Number(p.parcelas ?? 0),
    periodicidade: p.periodicidade ?? "mensal",
    dataPrimParcela: p.dataPrimParcela ?? "",
  }));
}

// ────────────────────────── Módulo Despesas ──────────────────────────

export type StakeholderRow = typeof schema.stakeholders.$inferSelect;
export type BankAccountRow = typeof schema.bankAccounts.$inferSelect;
export type ChartAccountRow = typeof schema.chartAccounts.$inferSelect;
export type DespesaRow = typeof schema.despesas.$inferSelect;

export async function getStakeholders(
  tenantId: string,
): Promise<StakeholderRow[]> {
  return db
    .select()
    .from(schema.stakeholders)
    .where(eq(schema.stakeholders.tenantId, tenantId))
    .orderBy(asc(schema.stakeholders.nome));
}

/**
 * Sócios do tenant: stakeholders ATIVOS com o papel "Sócio/Quotista". Usado no
 * cadastro de "despesa paga por sócio" (seleção sem digitação livre).
 */
export async function getSocios(
  tenantId: string,
): Promise<{ id: string; nome: string }[]> {
  const rows = await db
    .select({ id: schema.stakeholders.id, nome: schema.stakeholders.nome, papeis: schema.stakeholders.papeis, ativo: schema.stakeholders.ativo })
    .from(schema.stakeholders)
    .where(eq(schema.stakeholders.tenantId, tenantId))
    .orderBy(asc(schema.stakeholders.nome));
  return rows
    .filter((r) => r.ativo && (r.papeis ?? []).includes("Sócio/Quotista"))
    .map((r) => ({ id: r.id, nome: r.nome }));
}

export async function getBankAccounts(
  tenantId: string,
): Promise<BankAccountRow[]> {
  return db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, tenantId))
    .orderBy(asc(schema.bankAccounts.banco));
}

export async function getChartAccounts(
  tenantId: string,
): Promise<ChartAccountRow[]> {
  return db
    .select()
    .from(schema.chartAccounts)
    .where(eq(schema.chartAccounts.tenantId, tenantId));
}

export async function getDespesas(versionId: string): Promise<DespesaRow[]> {
  return db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesas.competencia));
}

export type DespesaComOrigem = DespesaRow & {
  projectId: string;
  projectName: string;
  projectKind: string;
  /** rótulo de origem: obra (projeto) ou "Filial/Matriz". */
  origem: string;
};

/**
 * Todas as despesas do tenant (todos os projetos/filiais), na versão Atual de
 * cada projeto, com o rótulo de origem — base da consulta consolidada.
 */
export async function getDespesasByTenant(
  tenantId: string,
): Promise<DespesaComOrigem[]> {
  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      projectKind: schema.projects.kind,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.despesas.tenantId, tenantId),
        eq(schema.versions.kind, "atual"),
      ),
    )
    .orderBy(asc(schema.despesas.competencia));
  return rows.map((r) => ({
    ...r.d,
    projectId: r.projectId,
    projectName: r.projectName,
    projectKind: r.projectKind,
    origem: r.projectKind === "office" ? `Filial/Matriz · ${r.projectName}` : r.projectName,
  }));
}

export interface ContaPagarRow {
  id: string;
  numDoc: string | null;
  fornecedorNome: string | null;
  descricao: string | null;
  categoriaDre: string | null;
  contaCef: string | null;
  valor: number;
  vencimento: string | null;
  competencia: string | null;
  dataPagamento: string | null;
  formaPagamento: string | null;
  status: string | null;
  projectId: string;
  projectName: string;
  clienteId: string | null;
  clienteNome: string | null;
}

/**
 * Contas a pagar do tenant: todas as despesas lançadas, com fornecedor,
 * projeto (obra) e cliente da obra. Base do módulo Contas a Pagar e do
 * painel esquerdo do Fechamento de Caixa.
 */
export async function getContasPagar(tenantId: string): Promise<ContaPagarRow[]> {
  const rows = await db
    .select({
      d: schema.despesas,
      fornecedorNome: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      clienteId: schema.projects.clienteId,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .leftJoin(schema.clientes, eq(schema.projects.clienteId, schema.clientes.id))
    .where(
      and(
        eq(schema.despesas.tenantId, tenantId),
        eq(schema.despesas.cancelado, false),
      ),
    );
  return rows.map((r) => ({
    id: r.d.id,
    numDoc: r.d.numDoc,
    fornecedorNome: r.fornecedorNome,
    descricao: r.d.obs ?? r.d.numDoc,
    categoriaDre: r.d.categoriaDre,
    contaCef: r.d.contaCef,
    valor: Number(r.d.valor),
    vencimento: r.d.vencimento,
    competencia: r.d.competencia,
    dataPagamento: r.d.dataCaixa,
    formaPagamento: r.d.formaPagamento,
    status: r.d.status,
    projectId: r.projectId,
    projectName: r.projectName,
    clienteId: r.clienteId,
    clienteNome: r.clienteNome,
  }));
}

export interface ReceivableRow {
  refId: string;
  dia: string; // "MM/DD/YYYY"
  valor: number;
  descricao: string;
  unitCode: string;
  projectId: string;
  projectName: string;
  clienteNome: string | null;
  status: string;
}

/**
 * Recebíveis previstos do tenant: expande os planos de pagamento das unidades
 * vendidas (versão Atual de cada obra) em recebíveis datados, com projeto e
 * cliente comprador. Base do painel "Receitas a Receber do Dia".
 */
export async function getReceivables(tenantId: string): Promise<ReceivableRow[]> {
  const rows = await db
    .select({
      u: schema.units,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.units)
    .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(
      schema.clientes,
      and(
        eq(schema.clientes.unitCode, schema.units.code),
        eq(schema.clientes.tenantId, tenantId),
      ),
    )
    .where(and(eq(schema.units.tenantId, tenantId), eq(schema.versions.kind, "atual")));

  const out: ReceivableRow[] = [];
  for (const r of rows) {
    const recs = expandUnitReceivables(r.u.paymentPlan, r.u.status);
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      out.push({
        refId: `${r.u.id}:${i}`,
        dia: rec.dia,
        valor: rec.valor,
        descricao: `${r.u.code} — ${rec.label}`,
        unitCode: r.u.code,
        projectId: r.projectId,
        projectName: r.projectName,
        clienteNome: r.clienteNome,
        status: "A receber",
      });
    }
  }
  return out;
}

export type DailyClosingRow = typeof schema.dailyClosings.$inferSelect & {
  projectName: string | null;
  clienteNome: string | null;
};

/** Fechamentos diários (Balanço do Dia) do tenant, mais recentes primeiro. */
export async function getDailyClosings(tenantId: string): Promise<DailyClosingRow[]> {
  const rows = await db
    .select({
      c: schema.dailyClosings,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.dailyClosings)
    .leftJoin(schema.projects, eq(schema.dailyClosings.projectId, schema.projects.id))
    .leftJoin(schema.clientes, eq(schema.projects.clienteId, schema.clientes.id))
    .where(eq(schema.dailyClosings.tenantId, tenantId))
    .orderBy(desc(schema.dailyClosings.closedAt));
  return rows.map((r) => ({
    ...r.c,
    projectName: r.projectName,
    clienteNome: r.clienteNome,
  }));
}

export type StockItemRow = typeof schema.stockItems.$inferSelect;
export type StockMovementRow = typeof schema.stockMovements.$inferSelect & {
  itemNome: string;
  unidade: string;
  projectName: string | null;
  clienteNome: string | null;
  despesaNumDoc: string | null;
  permutaDescricao: string | null;
};

export interface DespesaOption {
  id: string;
  numDoc: string;
  fornecedorNome: string | null;
  valor: number;
}
/** Despesas do tenant para vincular a uma entrada de estoque (mais recentes primeiro). */
export async function getDespesaOptions(tenantId: string): Promise<DespesaOption[]> {
  const rows = await db
    .select({
      id: schema.despesas.id,
      numDoc: schema.despesas.numDoc,
      valor: schema.despesas.valor,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(eq(schema.despesas.tenantId, tenantId))
    .orderBy(desc(schema.despesas.createdAt))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    numDoc: r.numDoc ?? "—",
    fornecedorNome: r.fornecedorNome,
    valor: Number(r.valor),
  }));
}

export interface PermutaOption {
  id: string;
  descricao: string | null;
  cliente: string | null;
  estimado: number | null;
}
/** Permutas do tenant para vincular a uma entrada de estoque recebida via permuta. */
export async function getPermutaOptions(tenantId: string): Promise<PermutaOption[]> {
  const rows = await db
    .select({
      id: schema.permutas.id,
      descricao: schema.permutas.descricao,
      cliente: schema.permutas.cliente,
      estimado: schema.permutas.estimado,
    })
    .from(schema.permutas)
    .where(eq(schema.permutas.tenantId, tenantId))
    .orderBy(desc(schema.permutas.id))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    descricao: r.descricao,
    cliente: r.cliente,
    estimado: r.estimado === null ? null : Number(r.estimado),
  }));
}

export async function getStockItems(tenantId: string): Promise<StockItemRow[]> {
  return db
    .select()
    .from(schema.stockItems)
    .where(eq(schema.stockItems.tenantId, tenantId))
    .orderBy(asc(schema.stockItems.nome));
}

/** Movimentações de estoque do tenant, com item, obra e cliente. */
export async function getStockMovements(tenantId: string): Promise<StockMovementRow[]> {
  const rows = await db
    .select({
      m: schema.stockMovements,
      itemNome: schema.stockItems.nome,
      unidade: schema.stockItems.unidade,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
      despesaNumDoc: schema.despesas.numDoc,
      permutaDescricao: schema.permutas.descricao,
    })
    .from(schema.stockMovements)
    .innerJoin(schema.stockItems, eq(schema.stockMovements.itemId, schema.stockItems.id))
    .leftJoin(schema.projects, eq(schema.stockMovements.projectId, schema.projects.id))
    .leftJoin(schema.clientes, eq(schema.projects.clienteId, schema.clientes.id))
    .leftJoin(schema.despesas, eq(schema.stockMovements.despesaId, schema.despesas.id))
    .leftJoin(schema.permutas, eq(schema.stockMovements.permutaId, schema.permutas.id))
    .where(eq(schema.stockMovements.tenantId, tenantId))
    .orderBy(desc(schema.stockMovements.createdAt));
  return rows.map((r) => ({
    ...r.m,
    itemNome: r.itemNome,
    unidade: r.unidade,
    projectName: r.projectName,
    clienteNome: r.clienteNome,
    despesaNumDoc: r.despesaNumDoc,
    permutaDescricao: r.permutaDescricao,
  }));
}

export type BudgetLineRow = typeof schema.budgetLines.$inferSelect;

/** Lançamentos simplificados (Budget/Forecast) de uma versão. */
export async function getBudgetLines(versionId: string): Promise<BudgetLineRow[]> {
  return db
    .select()
    .from(schema.budgetLines)
    .where(eq(schema.budgetLines.versionId, versionId));
}

/**
 * Versão "Atual" (detalhada) de um projeto, no escopo do tenant. Como não há
 * mais "versão ativa", os lançamentos de despesas/receitas sempre gravam aqui.
 */
export async function getAtualVersion(tenantId: string, projectId: string) {
  const [v] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.tenantId, tenantId),
        eq(schema.versions.projectId, projectId),
        eq(schema.versions.kind, "atual"),
      ),
    )
    .orderBy(asc(schema.versions.createdAt))
    .limit(1);
  return v ?? null;
}

/** kind da versão (para decidir entre lançamento detalhado × simplificado). */
export async function getVersionKind(versionId: string): Promise<string | null> {
  const [v] = await db
    .select({ kind: schema.versions.kind })
    .from(schema.versions)
    .where(eq(schema.versions.id, versionId))
    .limit(1);
  return v?.kind ?? null;
}

export interface ExpenseRow {
  contaCef: string | null;
  categoriaDre: string | null;
  competencia: string | null;
  valor: number;
}

/**
 * Despesas normalizadas para os relatórios (DRE/Fluxo). Para Budget/Forecast
 * vêm do lançamento simplificado (budget_line, despesa); para a detalhada, das
 * despesas reais.
 */
export async function getExpenseRows(versionId: string): Promise<ExpenseRow[]> {
  const kind = await getVersionKind(versionId);
  if (kind === "budget" || kind === "forecast") {
    const lines = await db
      .select()
      .from(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, "despesa"),
        ),
      );
    return lines.map((l) => ({
      contaCef: l.rowKey,
      categoriaDre: l.dreCategory,
      competencia: l.mes,
      valor: Number(l.valor),
    }));
  }
  const d = await getDespesas(versionId);
  // Despesas canceladas (exclusão lógica) não compõem a DRE/relatórios.
  return d
    .filter((x) => !x.cancelado)
    .map((x) => ({
      contaCef: x.contaCef,
      categoriaDre: x.categoriaDre,
      competencia: x.competencia,
      valor: Number(x.valor),
    }));
}

export type ParcelaRow = typeof schema.despesaParcelas.$inferSelect;

/** Parcelas de contas a pagar de uma versão (join com despesa). Fase 2. */
export async function getParcelasByVersion(
  versionId: string,
): Promise<(ParcelaRow & { despesaNumDoc: string | null; contaCef: string | null; categoriaDre: string | null })[]> {
  const rows = await db
    .select({
      p: schema.despesaParcelas,
      numDoc: schema.despesas.numDoc,
      contaCef: schema.despesas.contaCef,
      categoriaDre: schema.despesas.categoriaDre,
    })
    .from(schema.despesaParcelas)
    .innerJoin(schema.despesas, eq(schema.despesaParcelas.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId));
  return rows.map((r) => ({
    ...r.p,
    despesaNumDoc: r.numDoc,
    contaCef: r.contaCef,
    categoriaDre: r.categoriaDre,
  }));
}

/** Parcelas de uma despesa específica. */
export async function getParcelasByDespesa(
  despesaId: string,
): Promise<ParcelaRow[]> {
  return db
    .select()
    .from(schema.despesaParcelas)
    .where(eq(schema.despesaParcelas.despesaId, despesaId))
    .orderBy(asc(schema.despesaParcelas.numeroParcela));
}

export type DocumentRow = typeof schema.documents.$inferSelect;

export async function getDocuments(tenantId: string): Promise<DocumentRow[]> {
  return db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.tenantId, tenantId))
    .orderBy(desc(schema.documents.uploadedAt));
}

/** Documentos anexados a uma despesa específica (mais recentes primeiro). */
export async function getDocumentsByDespesa(
  tenantId: string,
  despesaId: string,
): Promise<DocumentRow[]> {
  return db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.tenantId, tenantId),
        eq(schema.documents.despesaId, despesaId),
      ),
    )
    .orderBy(desc(schema.documents.uploadedAt));
}

export type CashRow = typeof schema.cashEntries.$inferSelect;

export async function getCash(versionId: string): Promise<CashRow[]> {
  return db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.versionId, versionId))
    .orderBy(asc(schema.cashEntries.data));
}

/** Lançamentos de caixa de todas as versões Atual do tenant (caixa real). */
export async function getCashByTenant(tenantId: string): Promise<CashRow[]> {
  const rows = await db
    .select({ c: schema.cashEntries })
    .from(schema.cashEntries)
    .innerJoin(schema.versions, eq(schema.cashEntries.versionId, schema.versions.id))
    .where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.versions.kind, "atual")))
    .orderBy(asc(schema.cashEntries.data));
  return rows.map((r) => r.c);
}

export type ClienteRow = typeof schema.clientes.$inferSelect;

export async function getClientes(tenantId: string): Promise<ClienteRow[]> {
  return db
    .select()
    .from(schema.clientes)
    .where(eq(schema.clientes.tenantId, tenantId))
    .orderBy(asc(schema.clientes.nomeCompleto));
}

export type MedicaoRow = typeof schema.medicoes.$inferSelect;

export async function getMedicoes(versionId: string): Promise<MedicaoRow[]> {
  return db
    .select()
    .from(schema.medicoes)
    .where(eq(schema.medicoes.versionId, versionId))
    .orderBy(asc(schema.medicoes.competencia), asc(schema.medicoes.grupoCode));
}

/**
 * Receita projetada mês a mês de uma versão. Para Budget/Forecast usa o
 * lançamento simplificado (budget_line, receita); para a versão detalhada usa
 * unidades + reembolsos (calcProjection).
 */
export async function getMonthlyRevenue(
  versionId: string,
  projectId: string,
): Promise<MonthlyProjection> {
  const kind = await getVersionKind(versionId);
  if (kind === "budget" || kind === "forecast") {
    const lines = await db
      .select({ mes: schema.budgetLines.mes, valor: schema.budgetLines.valor })
      .from(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, "receita"),
        ),
      );
    const out: MonthlyProjection = {};
    for (const l of lines) out[l.mes] = (out[l.mes] || 0) + Number(l.valor);
    return out;
  }

  const [unitRows, reembRows, incc] = await Promise.all([
    getUnits(versionId),
    getReembolsos(versionId),
    getInccRows(projectId),
  ]);
  const out: MonthlyProjection = {};
  for (const r of unitRows) {
    const p = calcProjection(toCalcUnit(r), incc);
    for (const [mm, v] of Object.entries(p)) out[mm] = (out[mm] || 0) + v;
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  for (const [mm, v] of Object.entries(reemb)) out[mm] = (out[mm] || 0) + v;
  return out;
}

export interface ReceitaProjetoRow {
  projectId: string;
  projectName: string;
  /** versão do tipo pedido (budget/forecast) do projeto; null se não existir. */
  versionId: string | null;
  /** receita consolidada por mês ("MM/YYYY" → valor). */
  values: Record<string, number>;
}
export interface ReceitaByProject {
  months: string[];
  rows: ReceitaProjetoRow[];
}

/**
 * Receita do Budget/Forecast consolidada como matriz projetos × meses: uma
 * linha por projeto (empreendimento). Cada projeto criado vira uma nova linha.
 */
export async function getReceitaByProject(
  tenantId: string,
  kind: "budget" | "forecast",
): Promise<ReceitaByProject> {
  const [projs, vers, incc] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.tenantId, tenantId), eq(schema.projects.kind, "proj")))
      .orderBy(asc(schema.projects.createdAt)),
    db
      .select()
      .from(schema.versions)
      .where(and(eq(schema.versions.tenantId, tenantId), eq(schema.versions.kind, kind))),
    db
      .select({ mes: schema.inccRates.mes })
      .from(schema.inccRates)
      .where(eq(schema.inccRates.tenantId, tenantId)),
  ]);

  const verByProj = new Map(vers.map((v) => [v.projectId, v.id]));
  const versionIds = vers.map((v) => v.id);

  const lines = versionIds.length
    ? await db
        .select()
        .from(schema.budgetLines)
        .where(
          and(
            inArray(schema.budgetLines.versionId, versionIds),
            eq(schema.budgetLines.kind, "receita"),
          ),
        )
    : [];
  // Meses = união do horizonte INCC com todos os meses efetivamente lançados.
  // Garante que dados de anos além do INCC (ex.: import de Budget multi-ano)
  // apareçam na matriz e sejam considerados ao salvar.
  const monthSet = new Set(incc.map((r) => r.mes));
  for (const l of lines) monthSet.add(l.mes);
  const months = [...monthSet].sort(sortMonthKey);
  // Separa a receita do projeto ("Receita") da linha "Outras Receitas".
  const receitaByVer = new Map<string, Record<string, number>>();
  const outrasByVer = new Map<string, Record<string, number>>();
  for (const l of lines) {
    const map = l.rowKey === OUTRAS_RECEITAS_KEY ? outrasByVer : receitaByVer;
    const bag = map.get(l.versionId) ?? {};
    bag[l.mes] = (bag[l.mes] || 0) + Number(l.valor);
    map.set(l.versionId, bag);
  }

  const rows: ReceitaProjetoRow[] = projs.map((p) => {
    const vId = verByProj.get(p.id) ?? null;
    return {
      projectId: p.id,
      projectName: p.name,
      versionId: vId,
      values: vId ? receitaByVer.get(vId) ?? {} : {},
    };
  });

  // "Outras Receitas": guardada na versão do projeto mais antigo (âncora).
  const anchorVid = rows.find((r) => r.versionId)?.versionId ?? null;
  rows.push({
    projectId: OUTRAS_RECEITAS_PID,
    projectName: OUTRAS_RECEITAS_KEY,
    versionId: anchorVid,
    values: anchorVid ? outrasByVer.get(anchorVid) ?? {} : {},
  });

  return { months, rows };
}

export interface DespesaLinha {
  projectId: string;
  projectName: string;
  grupoCode: string;
  grupoLabel: string;
  dreCategory: string;
  values: Record<string, number>;
}
export interface DespesaLinhasData {
  months: string[];
  /** projetos + filiais/unidades para o "de-para" (office = filial/matriz). */
  projetos: { id: string; nome: string; office: boolean }[];
  /** grupos do plano de contas; cef = custo direto de obra (só p/ projetos). */
  grupos: { code: string; label: string; dreCategory: string; cef: boolean }[];
  lines: DespesaLinha[];
}

/**
 * Despesas do Budget/Forecast como linhas criadas pelo usuário: cada linha é
 * um grupo do plano de contas vinculado a um projeto/filial. Retorna também as
 * opções de projeto e de grupo, além das linhas já lançadas.
 */
export async function getDespesaLinhas(
  tenantId: string,
  kind: "budget" | "forecast",
): Promise<DespesaLinhasData> {
  const [projs, vers, chart, incc] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.tenantId, tenantId))
      .orderBy(asc(schema.projects.createdAt)),
    db
      .select()
      .from(schema.versions)
      .where(and(eq(schema.versions.tenantId, tenantId), eq(schema.versions.kind, kind))),
    getChartAccounts(tenantId),
    db.select({ mes: schema.inccRates.mes }).from(schema.inccRates).where(eq(schema.inccRates.tenantId, tenantId)),
  ]);

  const projById = new Map(projs.map((p) => [p.id, p.name]));
  const verById = new Map(vers.map((v) => [v.id, v.projectId]));

  const grupoMap = new Map<
    string,
    { code: string; label: string; dreCategory: string; cef: boolean }
  >();
  for (const r of chart) {
    if (!grupoMap.has(r.groupCode))
      grupoMap.set(r.groupCode, {
        code: r.groupCode,
        label: `${r.groupCode} · ${r.groupName}`,
        dreCategory: r.kind === "cef" ? "Custo Variável" : "Despesa Fixa",
        cef: r.kind === "cef",
      });
  }
  const grupos = [...grupoMap.values()].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
  const grupoLabel = (code: string) => grupoMap.get(code)?.label ?? code;

  const versionIds = vers.map((v) => v.id);
  const bl = versionIds.length
    ? await db
        .select()
        .from(schema.budgetLines)
        .where(
          and(
            inArray(schema.budgetLines.versionId, versionIds),
            eq(schema.budgetLines.kind, "despesa"),
          ),
        )
    : [];

  // Meses = união do horizonte INCC com todos os meses efetivamente lançados
  // (mostra despesas de anos além do INCC, ex.: import de Budget multi-ano).
  const monthSet = new Set(incc.map((r) => r.mes));
  for (const l of bl) monthSet.add(l.mes);
  const months = [...monthSet].sort(sortMonthKey);

  const lineMap = new Map<string, DespesaLinha>();
  for (const l of bl) {
    const projectId = verById.get(l.versionId);
    if (!projectId) continue;
    const key = `${projectId}|${l.rowKey}`;
    let line = lineMap.get(key);
    if (!line) {
      line = {
        projectId,
        projectName: projById.get(projectId) ?? "",
        grupoCode: l.rowKey,
        grupoLabel: grupoLabel(l.rowKey),
        dreCategory: l.dreCategory ?? grupoMap.get(l.rowKey)?.dreCategory ?? "Despesa Fixa",
        values: {},
      };
      lineMap.set(key, line);
    }
    line.values[l.mes] = (line.values[l.mes] || 0) + Number(l.valor);
    if (l.dreCategory) line.dreCategory = l.dreCategory;
  }

  return {
    months,
    projetos: projs.map((p) => ({
      id: p.id,
      nome: p.kind === "office" ? `${p.name} · Filial/Matriz` : p.name,
      office: p.kind === "office",
    })),
    grupos,
    lines: [...lineMap.values()],
  };
}

export interface RevenueBySource {
  sources: Record<ProjectionSource, MonthlyProjection>;
  reemb: MonthlyProjection;
}

function emptyBySource(): Record<ProjectionSource, MonthlyProjection> {
  return Object.fromEntries(
    PROJECTION_SOURCES.map((s) => [s, {} as MonthlyProjection]),
  ) as Record<ProjectionSource, MonthlyProjection>;
}

/**
 * Receita projetada por fonte × mês de uma versão. Para Budget/Forecast usa o
 * lançamento simplificado (budget_line, receita, rowKey = fonte); para a versão
 * detalhada usa unidades (calcProjectionBySource) + reembolsos.
 */
export async function getRevenueBySource(
  versionId: string,
  projectId: string,
): Promise<RevenueBySource> {
  const sources = emptyBySource();
  const reemb: MonthlyProjection = {};
  const kind = await getVersionKind(versionId);

  if (kind === "budget" || kind === "forecast") {
    const lines = await db
      .select({
        rowKey: schema.budgetLines.rowKey,
        mes: schema.budgetLines.mes,
        valor: schema.budgetLines.valor,
      })
      .from(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, "receita"),
        ),
      );
    for (const l of lines) {
      if (l.rowKey === "Reembolso") {
        reemb[l.mes] = (reemb[l.mes] || 0) + Number(l.valor);
      } else if ((PROJECTION_SOURCES as readonly string[]).includes(l.rowKey)) {
        const s = l.rowKey as ProjectionSource;
        sources[s][l.mes] = (sources[s][l.mes] || 0) + Number(l.valor);
      } else {
        // Receita lançada por projeto (linha única "Receita") ou qualquer chave
        // não mapeada: agrega na fonte primária para preservar o total nos
        // relatórios "por fonte" (Consolidado/Projeção).
        const s = PROJECTION_SOURCES[0] as ProjectionSource;
        sources[s][l.mes] = (sources[s][l.mes] || 0) + Number(l.valor);
      }
    }
    return { sources, reemb };
  }

  const [unitRows, reembRows, incc] = await Promise.all([
    getUnits(versionId),
    getReembolsos(versionId),
    getInccRows(projectId),
  ]);
  for (const u of unitRows) {
    const bs = calcProjectionBySource(toCalcUnit(u), incc);
    for (const s of PROJECTION_SOURCES)
      for (const [mm, v] of Object.entries(bs[s]))
        sources[s][mm] = (sources[s][mm] || 0) + v;
  }
  const rb = reembursementsByMonth(reembToCalc(reembRows));
  for (const [mm, v] of Object.entries(rb)) reemb[mm] = (reemb[mm] || 0) + v;
  return { sources, reemb };
}

/** Ordena chaves "MM/YYYY" cronologicamente. */
export function sortMonthKey(a: string, b: string): number {
  const [ma, ya] = a.split("/").map(Number);
  const [mb, yb] = b.split("/").map(Number);
  return ya - yb || ma - mb;
}

// ──────────────────────── Config & multi-tenant ──────────────────────────

export interface MemberRow {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  permissions: import("@/lib/permissions").PermMatrix | null;
  mfaEnabled: boolean;
  /** já definiu senha? (senão, ainda não consegue logar). */
  hasPassword: boolean;
}

export async function getMembers(tenantId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      userId: schema.memberships.userId,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
      permissions: schema.memberships.permissions,
      mfaEnabled: schema.users.mfaEnabled,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.tenantId, tenantId))
    .orderBy(asc(schema.memberships.createdAt));
  return rows.map(({ passwordHash, ...m }) => ({
    ...m,
    hasPassword: Boolean(passwordHash),
  }));
}

// ──────────────────────── Super-admin (plataforma) ───────────────────────

export interface TenantOverview {
  id: string;
  name: string;
  createdAt: Date;
  members: number;
  projects: number;
  owners: string[];
}

/**
 * Visão geral de TODOS os tenants — usada apenas na tela de super-admin da
 * plataforma. Não é filtrada por tenant (é uma visão de plataforma), então o
 * chamador é responsável por restringir o acesso a super-admins.
 */
export async function getAllTenantsOverview(): Promise<TenantOverview[]> {
  const tenants = await db
    .select()
    .from(schema.tenants)
    .orderBy(desc(schema.tenants.createdAt));

  const memberCounts = await db
    .select({
      tenantId: schema.memberships.tenantId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.memberships)
    .groupBy(schema.memberships.tenantId);

  const projectCounts = await db
    .select({
      tenantId: schema.projects.tenantId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.projects)
    .groupBy(schema.projects.tenantId);

  const ownerRows = await db
    .select({
      tenantId: schema.memberships.tenantId,
      email: schema.users.email,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.role, "owner"));

  const memberMap = new Map(memberCounts.map((r) => [r.tenantId, r.n]));
  const projectMap = new Map(projectCounts.map((r) => [r.tenantId, r.n]));
  const ownerMap = new Map<string, string[]>();
  for (const r of ownerRows) {
    if (!r.email) continue;
    const list = ownerMap.get(r.tenantId) ?? [];
    list.push(r.email);
    ownerMap.set(r.tenantId, list);
  }

  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
    members: memberMap.get(t.id) ?? 0,
    projects: projectMap.get(t.id) ?? 0,
    owners: ownerMap.get(t.id) ?? [],
  }));
}

export type AuditRow = typeof schema.auditLog.$inferSelect;

export async function getAuditLog(
  tenantId: string,
  limit = 20,
): Promise<AuditRow[]> {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.tenantId, tenantId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
}

// ─────────────────────── Conciliação bancária (Caixa) ───────────────────────

export interface ConciliacaoSugestao {
  despesaId: string;
  numDoc: string | null;
  fornecedor: string | null;
  descricao: string | null;
  valor: number;
  vencimento: string | null;
  /** grau de compatibilidade (só orientação — decisão é do usuário). */
  grau: "alta" | "media" | "baixa";
}
export interface MovimentoPendente {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  doc: string | null;
  valor: number;
  sugestoes: ConciliacaoSugestao[];
}
export interface SugestaoReceber {
  contaReceberId: string;
  descricao: string | null;
  projectName: string;
  valor: number;
  vencimento: string | null;
  grau: "alta" | "media" | "baixa";
}
export interface MovimentoPendenteEntrada {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  doc: string | null;
  valor: number;
  sugestoes: SugestaoReceber[];
}
export interface MovimentoConciliado {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  valor: number;
  despesaId: string | null;
  despesaNumDoc: string | null;
  fornecedor: string | null;
  conciliadoPor: string | null;
  conciliadoEm: string | null;
}
export interface ConciliacaoData {
  pendentes: MovimentoPendente[];
  pendentesEntrada: MovimentoPendenteEntrada[];
  conciliados: MovimentoConciliado[];
}

const normStr = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
/** "MM/DD/YYYY" → dia serial UTC (para diferença em dias); null se inválido. */
const diaSerial = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const p = s.split("/");
  if (p.length !== 3) return null;
  const [mo, d, y] = p.map(Number);
  if (!y || !mo || !d) return null;
  return Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
};

/**
 * Dados da conciliação bancária: movimentos do extrato ainda não conciliados
 * (saídas) com SUGESTÕES de contas a pagar em aberto (com grau de
 * compatibilidade), e os movimentos já conciliados (para desfazer/histórico).
 * As sugestões são só orientação — nada é conciliado sem ação do usuário.
 */
export async function getConciliacaoData(
  tenantId: string,
  versionId: string,
): Promise<ConciliacaoData> {
  const [entries, contas, receber] = await Promise.all([
    db
      .select()
      .from(schema.cashEntries)
      .where(
        and(
          eq(schema.cashEntries.tenantId, tenantId),
          eq(schema.cashEntries.versionId, versionId),
        ),
      ),
    getContasPagar(tenantId),
    getContasReceber(tenantId),
  ]);
  const despById = new Map(contas.map((c) => [c.id, c]));
  const recById = new Map(receber.map((c) => [c.id, c]));
  const abertas = contas.filter((c) => c.status !== "Pago");
  const receberAbertas = receber.filter((c) => c.status !== "Recebido" && c.status !== "Cancelada");

  const pendentes: MovimentoPendente[] = [];
  const rankGrau = { alta: 0, media: 1, baixa: 2 } as const;
  for (const e of entries) {
    if (e.rec || e.conciliadoDespesaId) continue;
    const valor = Number(e.valor);
    if (!valor || valor >= 0) continue; // só saídas do extrato, por ora
    const movCents = Math.round(Math.abs(valor) * 100);
    const movDia = diaSerial(e.data);
    const desc = normStr(e.descricao ?? "");
    const sugestoes: (ConciliacaoSugestao & { _prox: number })[] = [];
    for (const c of abertas) {
      const cCents = Math.round(Math.abs(c.valor) * 100);
      const exato = cCents === movCents;
      const aprox = !exato && Math.abs(cCents - movCents) <= Math.max(50, movCents * 0.02);
      if (!exato && !aprox) continue;
      const vDia = diaSerial(c.vencimento);
      const prox = movDia != null && vDia != null ? Math.abs(vDia - movDia) : 9999;
      const vencida = movDia != null && vDia != null && vDia <= movDia;
      const dataProx = prox <= 7 || vencida;
      const primeiroNome = c.fornecedorNome ? normStr(c.fornecedorNome).split(/\s+/)[0] : "";
      const nomeMatch = primeiroNome.length >= 3 && desc.includes(primeiroNome);
      let grau: "alta" | "media" | "baixa";
      if (exato && (dataProx || nomeMatch)) grau = "alta";
      else if (exato || (aprox && (dataProx || nomeMatch))) grau = "media";
      else grau = "baixa";
      sugestoes.push({
        despesaId: c.id,
        numDoc: c.numDoc,
        fornecedor: c.fornecedorNome,
        descricao: c.descricao,
        valor: c.valor,
        vencimento: c.vencimento,
        grau,
        _prox: prox,
      });
    }
    sugestoes.sort((a, b) => rankGrau[a.grau] - rankGrau[b.grau] || a._prox - b._prox);
    pendentes.push({
      cashEntryId: e.id,
      data: e.data,
      descricao: e.descricao,
      doc: e.doc,
      valor,
      sugestoes: sugestoes.slice(0, 4).map(({ _prox, ...s }) => { void _prox; return s; }),
    });
  }

  // Entradas do extrato (crédito) ainda não conciliadas → sugere contas a receber.
  const pendentesEntrada: MovimentoPendenteEntrada[] = [];
  for (const e of entries) {
    if (e.rec || e.conciliadoDespesaId || e.conciliadoContaReceberId) continue;
    const valor = Number(e.valor);
    if (!valor || valor <= 0) continue; // só entradas
    const movCents = Math.round(Math.abs(valor) * 100);
    const movDia = diaSerial(e.data);
    const desc = normStr(e.descricao ?? "");
    const sugestoes: (SugestaoReceber & { _prox: number })[] = [];
    for (const c of receberAbertas) {
      const saldo = c.valor - c.valorRecebido;
      const cCents = Math.round(Math.abs(saldo || c.valor) * 100);
      const exato = cCents === movCents;
      const aprox = !exato && Math.abs(cCents - movCents) <= Math.max(50, movCents * 0.02);
      if (!exato && !aprox) continue;
      const vDia = diaSerial(c.vencimento);
      const prox = movDia != null && vDia != null ? Math.abs(vDia - movDia) : 9999;
      const dataProx = prox <= 7 || (movDia != null && vDia != null && vDia <= movDia);
      const nomeAlvo = normStr(c.clienteNome ?? c.descricao ?? "").split(/\s+/)[0];
      const nomeMatch = nomeAlvo.length >= 3 && desc.includes(nomeAlvo);
      let grau: "alta" | "media" | "baixa";
      if (exato && (dataProx || nomeMatch)) grau = "alta";
      else if (exato || (aprox && (dataProx || nomeMatch))) grau = "media";
      else grau = "baixa";
      sugestoes.push({
        contaReceberId: c.id,
        descricao: c.descricao ?? c.tipo,
        projectName: c.projectName,
        valor: c.valor,
        vencimento: c.vencimento,
        grau,
        _prox: prox,
      });
    }
    sugestoes.sort((a, b) => rankGrau[a.grau] - rankGrau[b.grau] || a._prox - b._prox);
    pendentesEntrada.push({
      cashEntryId: e.id,
      data: e.data,
      descricao: e.descricao,
      doc: e.doc,
      valor,
      sugestoes: sugestoes.slice(0, 4).map(({ _prox, ...s }) => { void _prox; return s; }),
    });
  }

  const conciliados: MovimentoConciliado[] = entries
    .filter((e) => e.conciliadoDespesaId || e.conciliadoContaReceberId)
    .map((e) => {
      const d = e.conciliadoDespesaId ? despById.get(e.conciliadoDespesaId) : undefined;
      const r = e.conciliadoContaReceberId ? recById.get(e.conciliadoContaReceberId) : undefined;
      return {
        cashEntryId: e.id,
        data: e.data,
        descricao: e.descricao,
        valor: Number(e.valor),
        despesaId: e.conciliadoDespesaId ?? e.conciliadoContaReceberId,
        despesaNumDoc: d?.numDoc ?? (r ? "Conta a receber" : null),
        fornecedor: d?.fornecedorNome ?? r?.clienteNome ?? r?.descricao ?? null,
        conciliadoPor: e.conciliadoPor,
        conciliadoEm: e.conciliadoEm,
      };
    });

  return { pendentes, pendentesEntrada, conciliados };
}

// ─────────────────────────── Contas a Receber ───────────────────────────────

export interface ContaReceberRow {
  id: string;
  projectId: string;
  projectName: string;
  unitCode: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  descricao: string | null;
  tipo: string;
  valor: number;
  vencimento: string | null;
  dataRecebimento: string | null;
  valorRecebido: number;
  status: string;
  bancoId: string | null;
  origemCashEntryId: string | null;
  createdAt: string | null;
}

/** Contas a receber criadas manualmente / convertidas do extrato (não canceladas). */
export async function getContasReceber(tenantId: string): Promise<ContaReceberRow[]> {
  const rows = await db
    .select({
      c: schema.contasReceber,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.contasReceber)
    .innerJoin(schema.projects, eq(schema.contasReceber.projectId, schema.projects.id))
    .leftJoin(schema.clientes, eq(schema.contasReceber.clienteId, schema.clientes.id))
    .where(
      and(
        eq(schema.contasReceber.tenantId, tenantId),
        eq(schema.contasReceber.cancelado, false),
      ),
    )
    .orderBy(asc(schema.contasReceber.vencimento));
  return rows.map((r) => ({
    id: r.c.id,
    projectId: r.c.projectId,
    projectName: r.projectName,
    unitCode: r.c.unitCode,
    clienteId: r.c.clienteId,
    clienteNome: r.clienteNome,
    descricao: r.c.descricao,
    tipo: r.c.tipo,
    valor: Number(r.c.valor),
    vencimento: r.c.vencimento,
    dataRecebimento: r.c.dataRecebimento,
    valorRecebido: Number(r.c.valorRecebido),
    status: r.c.status,
    bancoId: r.c.bancoId,
    origemCashEntryId: r.c.origemCashEntryId,
    createdAt: r.c.createdAt ? new Date(r.c.createdAt).toISOString() : null,
  }));
}
