/**
 * Inputs da DRE lidos do banco (Prompt B, B-3) — a fonte única que a página
 * da DRE e o card Orçado x Realizado compartilham. Extraído de
 * `dre/page.tsx` sem mudar o resultado. A DRE é por competência e NÃO lê o
 * caixa (Prompt L, 6.1): este arquivo também não (teste `dre-sem-caixa`).
 */
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Project } from "@/lib/context";
import { getBudgetLines, getExpenseRows, getMonthlyRevenue, getPermutas, permToResale } from "@/lib/queries";
import { permutaRevenueByMonth } from "@/lib/calc";
import { getEncargosByVersion } from "@/lib/actions/pagamentos";
import { aggregateInputs, emptyInputs, NO_COMP, type Inputs } from "@/lib/calc/dre-cascata";
import { resumirForaDaCascata, type ForaDaCascata } from "@/lib/dre";

export async function defaultVersionId(projectId: string): Promise<string | null> {
  return versionIdOfKind(projectId, "atual");
}

/**
 * Id da versão de um tipo (atual/forecast/budget) do projeto — usado na visão
 * "Empresa toda", onde as versões são por projeto e o usuário escolhe o TIPO.
 * Cai para Atual → default → 1ª se o tipo pedido não existir.
 */
export async function versionIdOfKind(
  projectId: string,
  kind: string,
): Promise<string | null> {
  const vs = await db
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.projectId, projectId))
    .orderBy(asc(schema.versions.createdAt));
  return (
    vs.find((v) => v.kind === kind) ??
    vs.find((v) => v.kind === "atual") ??
    vs.find((v) => v.isDefault) ??
    vs[0]
  )?.id ?? null;
}

/**
 * Inputs da DRE detalhados por mês (competência). Um único fetch alimenta tanto
 * a visão consolidada (soma dos meses) quanto a visão mensal (coluna por mês).
 */
export async function versionInputsByMonth(
  tenantId: string,
  vid: string,
  projectId: string,
): Promise<Record<string, Inputs>> {
  const [revenue, despesas, permutas, encargosMes] = await Promise.all([
    getMonthlyRevenue(vid, projectId),
    getExpenseRows(vid),
    getPermutas(tenantId, vid),
    getEncargosByVersion(vid),
  ]);
  const out: Record<string, Inputs> = {};
  const bucket = (mm: string | null) => (out[mm ?? NO_COMP] ??= emptyInputs());

  // Receita do projeto.
  for (const [mm, v] of Object.entries(revenue)) bucket(mm).receita += v;
  // Receita da revenda de bens de permuta (inclui escambo), item 10.
  const permRev = permutaRevenueByMonth(permToResale(permutas));
  for (const [mm, v] of Object.entries(permRev)) bucket(mm).receita += v;
  // Despesas por categoria da DRE.
  for (const d of despesas) {
    if (!d.categoriaDre) continue;
    const b = bucket(d.competencia);
    b.byCat[d.categoriaDre] = (b.byCat[d.categoriaDre] || 0) + Number(d.valor);
    // Receita/Custo Variável lançados como despesa entram na linha própria.
    // Prompt AC, 5.3: `byCat["Receita"]` e `byCat["Custo Variável"]` NÃO são
    // somados pela cascata (ela usa `receita` e `custoVar`); servem só para a
    // tela saber que a linha teve lançamento (Parte 9). Quem passar a ler
    // `cat("Custo Variável")` na cascata DUPLICA o custo.
    if (d.categoriaDre === "Receita") b.receita += Number(d.valor);
    if (d.categoriaDre === "Custo Variável") b.custoVar += Number(d.valor);
  }
  // Custo Variável vem apenas das despesas lançadas como "Custo Variável"
  // (por competência) — a medição de obra NÃO entra na DRE (evita duplicidade).
  // Encargos financeiros (multa/juros/outros − desconto) por data de pagamento.
  for (const [mm, v] of Object.entries(encargosMes))
    bucket(mm).byCat["Despesas Financeiras"] =
      (bucket(mm).byCat["Despesas Financeiras"] || 0) + v;
  return out;
}

export async function projectInputsByMonth(
  project: Project,
  versionKind?: string,
): Promise<Record<string, Inputs>> {
  const vid = versionKind
    ? await versionIdOfKind(project.id, versionKind)
    : await defaultVersionId(project.id);
  if (!vid) return {};
  return versionInputsByMonth(project.tenantId, vid, project.id);
}

export async function projectInputs(
  project: Project,
  periodMonths: Set<string> | null,
  versionKind?: string,
): Promise<Inputs> {
  return aggregateInputs(await projectInputsByMonth(project, versionKind), periodMonths);
}

export async function versionInputs(
  tenantId: string,
  vid: string,
  projectId: string,
  periodMonths: Set<string> | null,
): Promise<Inputs> {
  return aggregateInputs(await versionInputsByMonth(tenantId, vid, projectId), periodMonths);
}


/* ─── Orçado x Realizado da tela de Projetos (Prompt B, 19–20) ───────── */

export interface EntradaOrcadoRealizado {
  /** Inputs agregados da versão `budget`; null = sem orçamento lançado. */
  orcado: Inputs | null;
  /** Inputs agregados da versão `atual`; null = sem lançamentos. */
  realizado: Inputs | null;
  versaoBudgetId: string | null;
  versaoAtualId: string | null;
}

/**
 * Fontes do card (mapeamento da Fase 1): Orçado = `budget_line` da versão
 * `budget` do projeto (a padrão, senão a mais antiga — a mesma que `/budget`
 * abre); Realizado = versão `atual`, pela MESMA função da DRE. Todas as
 * consultas filtram o tenant; o projeto já vem validado pela página.
 */
export async function getOrcadoRealizado(tenantId: string, projectId: string): Promise<EntradaOrcadoRealizado> {
  const versoes = await db
    .select({ id: schema.versions.id, kind: schema.versions.kind, isDefault: schema.versions.isDefault })
    .from(schema.versions)
    .where(and(eq(schema.versions.tenantId, tenantId), eq(schema.versions.projectId, projectId)))
    .orderBy(asc(schema.versions.createdAt));
  const budgets = versoes.filter((v) => v.kind === "budget");
  const budget = budgets.find((v) => v.isDefault) ?? budgets[0] ?? null;
  const atual = versoes.find((v) => v.kind === "atual") ?? null;

  const [linhasBudget, porMesBudget, porMesAtual] = await Promise.all([
    budget ? getBudgetLines(budget.id) : Promise.resolve([]),
    budget ? versionInputsByMonth(tenantId, budget.id, projectId) : Promise.resolve({}),
    atual ? versionInputsByMonth(tenantId, atual.id, projectId) : Promise.resolve({}),
  ]);
  return {
    orcado: budget && linhasBudget.length > 0 ? aggregateInputs(porMesBudget, null) : null,
    realizado: atual && Object.keys(porMesAtual).length > 0 ? aggregateInputs(porMesAtual, null) : null,
    versaoBudgetId: budget?.id ?? null,
    versaoAtualId: atual?.id ?? null,
  };
}

/**
 * Prompt AC, Partes 4 e 5 — o que a DRE desta versão NÃO soma na cascata: sem
 * categoria, categoria fora da lista, e (só no Acumulado) sem competência.
 * Lê as MESMAS linhas que `versionInputsByMonth` (`getExpenseRows`) e só
 * conta: não muda nenhum número.
 */
export async function foraDaCascataDaVersao(vid: string): Promise<ForaDaCascata> {
  return resumirForaDaCascata(await getExpenseRows(vid));
}
