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
import { aggregateInputs, emptyInputs, NO_COMP, waterfall, type Inputs } from "@/lib/calc/dre-cascata";
import { resumirForaDaCascata, type ForaDaCascata } from "@/lib/dre";
import { chaveLigada } from "@/lib/chaves-tenant";

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
  /**
   * Prompt AC, Parte 10 — a chave "dre_definicao_nova" (por empresa, nasce
   * DESLIGADA). Desligada (padrão): exatamente o cálculo de antes.
   * Ligada: (2) despesa classificada como "Receita" não soma na receita;
   * (3.1) encargos entram na competência da despesa que os gerou.
   */
  opts: { definicaoNova?: boolean } = {},
): Promise<Record<string, Inputs>> {
  const nova = !!opts.definicaoNova;
  const [revenue, despesas, permutas, encargosMes] = await Promise.all([
    getMonthlyRevenue(vid, projectId),
    getExpenseRows(vid),
    getPermutas(tenantId, vid),
    nova ? getEncargosPorCompetencia(vid) : getEncargosByVersion(vid),
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
    // Parte 2 (chave ligada): a "quinta origem" sai da soma — a tela lista à parte.
    if (nova && d.categoriaDre === "Receita") continue;
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

  // A MESMA definição da DRE (Prompt AC, Parte 10): o card segue a chave.
  const definicaoNova = await chaveLigada(tenantId, "dre_definicao_nova");
  const [linhasBudget, porMesBudget, porMesAtual] = await Promise.all([
    budget ? getBudgetLines(budget.id) : Promise.resolve([]),
    budget ? versionInputsByMonth(tenantId, budget.id, projectId, { definicaoNova }) : Promise.resolve({}),
    atual ? versionInputsByMonth(tenantId, atual.id, projectId, { definicaoNova }) : Promise.resolve({}),
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
export async function foraDaCascataDaVersao(vid: string, opts: { definicaoNova?: boolean } = {}): Promise<ForaDaCascata> {
  return resumirForaDaCascata(await getExpenseRows(vid), { receitaFora: !!opts.definicaoNova });
}

/**
 * Prompt AC, 3.1 (chave ligada) — encargos financeiros (multa + juros +
 * outros − desconto) na COMPETÊNCIA da despesa que os gerou, e não no mês do
 * pagamento. Despesa sem competência cai no mesmo balde "sem competência" da
 * despesa. Função nova: `getEncargosByVersion` (data de pagamento) não muda.
 */
export async function getEncargosPorCompetencia(versionId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      competencia: schema.despesas.competencia,
      multa: schema.pagamentos.multa,
      juros: schema.pagamentos.juros,
      outros: schema.pagamentos.outrosAcrescimos,
      desconto: schema.pagamentos.desconto,
    })
    .from(schema.pagamentos)
    .innerJoin(schema.despesas, eq(schema.pagamentos.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId));
  const out: Record<string, number> = {};
  for (const r of rows) {
    const enc = Number(r.multa) + Number(r.juros) + Number(r.outros) - Number(r.desconto);
    const mm = r.competencia && r.competencia.trim() ? r.competencia.trim() : NO_COMP;
    out[mm] = (out[mm] || 0) + enc;
  }
  return out;
}

export interface PreviaDreProjeto {
  projeto: string;
  /** Resultado Final acumulado, hoje e pela definição nova. */
  hoje: number;
  nova: number;
  /** Competências em que o Resultado Final muda (mês: hoje → novo). */
  meses: { mes: string; hoje: number; nova: number }[];
  /** Despesas classificadas como "Receita" que deixam de somar na receita. */
  comoReceita: { numDoc: string | null; competencia: string | null; valor: number }[];
  /** Cenários que o projeto NÃO tem (na Empresa toda, deixa de entrar com o Realizado). */
  semCenario: string[];
}

/**
 * Prompt AC, 10.3 — prévia da chave "dre_definicao_nova", por projeto e
 * competência, sobre a versão Atual: o Resultado Final de hoje, o pela
 * definição nova, a diferença e os lançamentos que deixam de somar na
 * receita. SOMENTE LEITURA.
 */
export async function previaDreDefinicaoNova(
  tenantId: string,
  projetos: readonly { id: string; name: string }[],
): Promise<PreviaDreProjeto[]> {
  const out: PreviaDreProjeto[] = [];
  for (const p of projetos) {
    const vs = await db
      .select({ id: schema.versions.id, kind: schema.versions.kind })
      .from(schema.versions)
      .where(and(eq(schema.versions.tenantId, tenantId), eq(schema.versions.projectId, p.id)))
      .orderBy(asc(schema.versions.createdAt));
    const atual = vs.find((v) => v.kind === "atual");
    const semCenario = (["budget", "forecast", "atual"] as const).filter((k) => !vs.some((v) => v.kind === k));
    if (!atual) {
      out.push({ projeto: p.name, hoje: 0, nova: 0, meses: [], comoReceita: [], semCenario });
      continue;
    }
    const [bmHoje, bmNova, receitaDespesa] = await Promise.all([
      versionInputsByMonth(tenantId, atual.id, p.id),
      versionInputsByMonth(tenantId, atual.id, p.id, { definicaoNova: true }),
      db
        .select({ numDoc: schema.despesas.numDoc, competencia: schema.despesas.competencia, valor: schema.despesas.valor })
        .from(schema.despesas)
        .where(
          and(
            eq(schema.despesas.tenantId, tenantId),
            eq(schema.despesas.versionId, atual.id),
            eq(schema.despesas.categoriaDre, "Receita"),
            eq(schema.despesas.cancelado, false),
          ),
        ),
    ]);
    const rf = (i: Inputs) => waterfall([i]).rows.find((r) => r.kind === "final")!.value;
    const meses = [...new Set([...Object.keys(bmHoje), ...Object.keys(bmNova)])]
      .map((mes) => ({ mes: mes === NO_COMP ? "sem competência" : mes, hoje: rf(bmHoje[mes] ?? emptyInputs()), nova: rf(bmNova[mes] ?? emptyInputs()) }))
      .filter((m) => Math.abs(m.hoje - m.nova) >= 0.005);
    out.push({
      projeto: p.name,
      hoje: rf(aggregateInputs(bmHoje, null)),
      nova: rf(aggregateInputs(bmNova, null)),
      meses,
      comoReceita: receitaDespesa.map((r) => ({ numDoc: r.numDoc, competencia: r.competencia, valor: Number(r.valor) })),
      semCenario,
    });
  }
  return out;
}
