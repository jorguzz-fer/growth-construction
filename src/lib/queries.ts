import { and, asc, desc, eq, sql } from "drizzle-orm";
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
  // Plano salvo no banco, ou a cascata desligada (unidade ainda sem venda).
  const plan = row.paymentPlan ?? stripIdentity(emptyUnit(row.code));
  return {
    ...plan,
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
    .where(eq(schema.despesas.tenantId, tenantId));
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
  return d.map((x) => ({
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

export type CashRow = typeof schema.cashEntries.$inferSelect;

export async function getCash(versionId: string): Promise<CashRow[]> {
  return db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.versionId, versionId))
    .orderBy(asc(schema.cashEntries.data));
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
