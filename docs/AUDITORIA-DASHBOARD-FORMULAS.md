# AUDITORIA — fórmulas do Dashboard

Coleta das funções que produzem cada número do Dashboard, em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

> **Escopo.** `getRevenueBySource` entra por pedido explícito, mas registro
> que **o Dashboard não a chama** — ela é usada por `/consolidado`
> (`consolidado/page.tsx:66` e `:117`) e `/projecao`
> (`projecao/page.tsx:71`). A função do
> Dashboard que cumpre papel equivalente é `getMonthlyRevenue`.

---

## 1. As sete funções e o helper `razao`


`razao` não é exportado: é uma closure declarada dentro de `getStatusProjeto`
(`queries.ts:2170`) e só existe ali. Aparece no bloco da própria função.

### `src/lib/queries.ts` · linhas 2085–2194

`getStatusProjeto` — inclui o `razao` na linha 2170.

```ts
export async function getStatusProjeto(
  tenantId: string,
  projectIds: string[],
): Promise<StatusProjeto> {
  if (projectIds.length === 0) {
    return {
      receitaPrevista: 0, recebido: 0, pctRecebido: 0,
      despesaPrevista: 0, executado: 0, pctExecutado: 0,
      margemContribuicao: 0, pctMargem: 0,
      receitaAtual: 0, custoVariavel: 0, despesaVariavel: 0,
      metragem: 0, custoPorM2: 0, receitaPorM2: 0,
    };
  }

  const [projs, versoes] = await Promise.all([
    db.select().from(schema.projects).where(eq(schema.projects.tenantId, tenantId)),
    db.select().from(schema.versions).where(eq(schema.versions.tenantId, tenantId)),
  ]);
  const doProjeto = <T extends { projectId: string }>(xs: T[]) =>
    xs.filter((x) => projectIds.includes(x.projectId));

  const num = (v: unknown) => Number(v) || 0;

  // Receita prevista = valor global de venda informado no cadastro do projeto.
  const receitaPrevista = projs
    .filter((p) => projectIds.includes(p.id))
    .reduce((a, p) => a + num(p.valorConstrucao) + num(p.valorTerreno), 0);

  const versoesProj = doProjeto(versoes);
  const idsAtual = versoesProj.filter((v) => v.kind === "atual").map((v) => v.id);
  const idsBudget = versoesProj.filter((v) => v.kind === "budget").map((v) => v.id);
  const todosIds = versoesProj.map((v) => v.id);

  const [cashRows, despRows, budgetRows] = await Promise.all([
    todosIds.length
      ? db.select({ valor: schema.cashEntries.valor, versionId: schema.cashEntries.versionId })
          .from(schema.cashEntries)
          .where(eq(schema.cashEntries.tenantId, tenantId))
      : Promise.resolve([]),
    db.select({
        valor: schema.despesas.valor,
        categoriaDre: schema.despesas.categoriaDre,
        cancelado: schema.despesas.cancelado,
        versionId: schema.despesas.versionId,
      })
      .from(schema.despesas)
      .where(eq(schema.despesas.tenantId, tenantId)),
    db.select({ valor: schema.budgetLines.valor, versionId: schema.budgetLines.versionId })
      .from(schema.budgetLines)
      .where(and(eq(schema.budgetLines.tenantId, tenantId), eq(schema.budgetLines.kind, "despesa")))
      .catch(() => []),
  ]);

  // Recebido = entradas de caixa das versões do projeto.
  const recebido = cashRows
    .filter((c) => todosIds.includes(c.versionId) && num(c.valor) > 0)
    .reduce((a, c) => a + num(c.valor), 0);

  // Despesa prevista = planejamento da versão Budget.
  const despesaPrevista = budgetRows
    .filter((b) => idsBudget.includes(b.versionId))
    .reduce((a, b) => a + num(b.valor), 0);

  // Executado = despesas lançadas na versão Atual, exceto canceladas.
  const daAtual = despRows.filter(
    (d) => idsAtual.includes(d.versionId) && !d.cancelado,
  );
  const executado = daAtual.reduce((a, d) => a + num(d.valor), 0);
  const porCat = (cat: string) =>
    daAtual.filter((d) => d.categoriaDre === cat).reduce((a, d) => a + num(d.valor), 0);
  const custoVariavel = porCat("Custo Variável");
  const despesaVariavel = porCat("Despesa Variável");

  // Receita realizada da versão Atual (mesma fonte da DRE).
  let receitaAtual = 0;
  for (const pid of projectIds) {
    const vid = versoesProj.find((v) => v.projectId === pid && v.kind === "atual")?.id;
    if (!vid) continue;
    const mensal = await getMonthlyRevenue(vid, pid);
    receitaAtual += Object.values(mensal).reduce((a, v) => a + v, 0);
  }

  // Definição de negócio confirmada pelo cliente:
  // Margem de Contribuição = Receita − Custo Variável − Despesa Variável.
  const margemContribuicao = receitaAtual - custoVariavel - despesaVariavel;
  const razao = (n: number, d: number) => (d > 0 ? n / d : 0);

  // Metragem total dos projetos selecionados (cadastro do projeto).
  const metragem = projs
    .filter((p) => projectIds.includes(p.id))
    .reduce((a, p) => a + num(p.metragem), 0);

  return {
    receitaPrevista,
    recebido,
    pctRecebido: razao(recebido, receitaPrevista),
    despesaPrevista,
    executado,
    pctExecutado: razao(executado, despesaPrevista),
    margemContribuicao,
    // %MC = MC ÷ Receita Total do Projeto (cadastro).
    pctMargem: razao(margemContribuicao, receitaPrevista),
    receitaAtual,
    custoVariavel,
    despesaVariavel,
    metragem,
    custoPorM2: razao(executado, metragem),
    receitaPorM2: razao(receitaAtual, metragem),
  };
}
```

### `src/lib/queries.ts` · linhas 1885–1980

`getIndicadoresObra`.

```ts
export async function getIndicadoresObra(
  tenantId: string,
  projectId: string,
): Promise<IndicadoresObra> {
  const [proj] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.tenantId, tenantId)))
    .limit(1);

  const servicoRows = proj
    ? await db
        .select()
        .from(schema.servicos)
        .where(eq(schema.servicos.projectId, projectId))
        .orderBy(asc(schema.servicos.ordem))
    : [];
  const servicoIds = servicoRows.map((s) => s.id);
  const medRows =
    servicoIds.length > 0
      ? await db
          .select()
          .from(schema.medicaoServicos)
          .where(eq(schema.medicaoServicos.tenantId, tenantId))
      : [];

  const num = (v: unknown) => Number(v) || 0;
  const financiamentoConstrucao = num(proj?.financiamentoConstrucao);
  const financiamentoTerreno = num(proj?.financiamentoTerreno);
  const cub = num(proj?.cub);
  const metragem = num(proj?.metragem);
  const pctBdi = num(proj?.pctBdi);
  const pctTaxa = num(proj?.pctTaxaLiberacao);
  const parcelaReferencia = num(proj?.parcelaReferencia);

  const servicos = servicoRows.map((s) => ({
    id: s.id,
    nome: s.nome,
    custoProposto: num(s.custoProposto),
    limiteMin: s.limiteMin == null ? null : num(s.limiteMin),
    limiteMax: s.limiteMax == null ? null : num(s.limiteMax),
  }));

  const incid = calcIncidencias(servicos);
  const bdi = calcBdi(servicos, pctBdi);
  const custoRef = custoReferencial(cub, metragem);

  const medicoes = medRows
    .filter((m) => servicoIds.includes(m.servicoId))
    .map((m) => ({
      servicoId: m.servicoId,
      competencia: m.competencia,
      pctExecutadoAcum: num(m.pctExecutadoAcum),
    }));
  const evolucao = calcEvolucao(servicos, medicoes);
  const provis = calcProvisionamento(evolucao, {
    financiamentoConstrucao,
    financiamentoTerreno,
    custoReferencial: custoRef,
    parcelaReferencia,
    pctTaxa,
  });
  const ultimo = provis[provis.length - 1];
  const ultimaEvol = evolucao[evolucao.length - 1];

  return {
    financiamentoConstrucao,
    financiamentoTerreno,
    totalAquisicao: financiamentoConstrucao + financiamentoTerreno,
    cub,
    metragem,
    custoReferencial: custoRef,
    parcelaReferencia,
    pctBdi,
    pctTaxa,
    tipoExecutor: proj?.tipoExecutor ?? null,
    custoTotalServicos: bdi.custoTotalServicos,
    valorBdi: bdi.valorBdi,
    custoTotalComBdi: bdi.custoTotalComBdi,
    servicosForaDosLimites: incid.filter(
      (s) => s.status === "Abaixo do mínimo" || s.status === "Acima do máximo",
    ).length,
    qtdServicos: servicos.length,
    evolucaoAcumulada: ultimaEvol?.acumulado ?? 0,
    evolucaoMes: ultimaEvol?.variacao ?? 0,
    liberacaoMes: ultimo?.liberacao ?? 0,
    liberacaoAcumulada: ultimo?.liberacaoAcumulada ?? financiamentoTerreno,
    saldoFinanciamento:
      ultimo?.saldoFinanciamento ?? financiamentoConstrucao,
    custoEstimadoMes: ultimo?.custoEstimado ?? 0,
    geracaoCaixaMes: ultimo?.caixa ?? 0,
    pctRecebido: ultimo?.pctRecebido ?? 0,
    temMedicao: evolucao.length > 0,
    temParametros: financiamentoConstrucao > 0 || cub > 0 || pctBdi > 0,
  };
}
```

### `src/lib/queries.ts` · linhas 1992–2046

`getIndicadoresObraConsolidado`.

```ts
export async function getIndicadoresObraConsolidado(
  tenantId: string,
  projectIds: string[],
): Promise<IndicadoresObra> {
  const todos = await Promise.all(
    projectIds.map((id) => getIndicadoresObra(tenantId, id)),
  );
  const soma = (f: (i: IndicadoresObra) => number) =>
    todos.reduce((a, i) => a + f(i), 0);

  const custoTotalServicos = soma((i) => i.custoTotalServicos);
  const valorBdi = soma((i) => i.valorBdi);
  const totalAquisicao = soma((i) => i.totalAquisicao);
  const liberacaoAcumulada = soma((i) => i.liberacaoAcumulada);

  // Média ponderada pelo custo dos serviços; sem base, cai para média simples.
  const ponderada = (f: (i: IndicadoresObra) => number) => {
    const base = custoTotalServicos;
    if (base > 0) {
      return todos.reduce((a, i) => a + f(i) * i.custoTotalServicos, 0) / base;
    }
    const comDados = todos.filter((i) => i.temMedicao);
    if (comDados.length === 0) return 0;
    return comDados.reduce((a, i) => a + f(i), 0) / comDados.length;
  };

  return {
    financiamentoConstrucao: soma((i) => i.financiamentoConstrucao),
    financiamentoTerreno: soma((i) => i.financiamentoTerreno),
    totalAquisicao,
    // CUB e metragem não se somam entre obras — não têm leitura consolidada.
    cub: 0,
    metragem: soma((i) => i.metragem),
    custoReferencial: soma((i) => i.custoReferencial),
    parcelaReferencia: soma((i) => i.parcelaReferencia),
    pctBdi: custoTotalServicos > 0 ? (valorBdi / custoTotalServicos) * 100 : 0,
    pctTaxa: 0,
    tipoExecutor: null,
    custoTotalServicos,
    valorBdi,
    custoTotalComBdi: soma((i) => i.custoTotalComBdi),
    servicosForaDosLimites: soma((i) => i.servicosForaDosLimites),
    qtdServicos: soma((i) => i.qtdServicos),
    evolucaoAcumulada: ponderada((i) => i.evolucaoAcumulada),
    evolucaoMes: ponderada((i) => i.evolucaoMes),
    liberacaoMes: soma((i) => i.liberacaoMes),
    liberacaoAcumulada,
    saldoFinanciamento: soma((i) => i.saldoFinanciamento),
    custoEstimadoMes: soma((i) => i.custoEstimadoMes),
    geracaoCaixaMes: soma((i) => i.geracaoCaixaMes),
    pctRecebido: totalAquisicao > 0 ? liberacaoAcumulada / totalAquisicao : 0,
    temMedicao: todos.some((i) => i.temMedicao),
    temParametros: todos.some((i) => i.temParametros),
  };
}
```

### `src/lib/queries.ts` · linhas 1100–1176

`getMonthlyRevenue`, com o comentário que descreve as origens.

```ts
/**
 * Receita projetada mês a mês de uma versão.
 *
 * Cada versão respeita o que foi lançado NELA:
 *  - Budget/Forecast → budget_line (planejamento);
 *  - Atual → o que está efetivamente lançado, isto é, as CONTAS A RECEBER
 *    lançadas mais os recebíveis derivados dos planos de pagamento das vendas,
 *    mais os reembolsos. É daí que sai a projeção de receita futura.
 *
 * As duas origens da Atual são complementares, não duplicadas: os recebíveis de
 * venda são derivados do plano da unidade e não são copiados para conta_receber
 * (ver comentário do schema em `contasReceber`).
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

  const [unitRows, reembRows] = await Promise.all([
    getUnits(versionId),
    getReembolsos(versionId),
  ]);
  const out: MonthlyProjection = {};
  // Receita da versão Atual = recebíveis das vendas (MESMA fonte da tela Contas
  // a Receber: expandUnitReceivables — leitura tolerante do plano, sem depender
  // das flags usar*). Assim DRE e Fluxo batem com os recebíveis exibidos.
  // Agrega por mês do vencimento ("MM/DD/YYYY" → "MM/YYYY").
  for (const r of unitRows) {
    for (const rec of expandUnitReceivables(r.paymentPlan, r.status)) {
      const p = rec.dia.split("/");
      if (p.length !== 3) continue;
      const mk = `${p[0]}/${p[2]}`;
      out[mk] = (out[mk] || 0) + rec.valor;
    }
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  for (const [mm, v] of Object.entries(reemb)) out[mm] = (out[mm] || 0) + v;

  // CONTAS A RECEBER lançadas do projeto — a projeção de receita futura da
  // versão Atual depende delas. Sem isto, uma receita lançada à mão (fora de um
  // plano de venda) aparecia em Contas a Receber e sumia da DRE, do Fluxo de
  // Caixa e do Dashboard. Agrega pelo mês do vencimento e ignora as canceladas.
  const crRows = await db
    .select({
      valor: schema.contasReceber.valor,
      vencimento: schema.contasReceber.vencimento,
    })
    .from(schema.contasReceber)
    .where(
      and(
        eq(schema.contasReceber.projectId, projectId),
        eq(schema.contasReceber.cancelado, false),
      ),
    );
  for (const c of crRows) {
    const p = (c.vencimento ?? "").split("/");
    if (p.length !== 3) continue;
    const mk = `${p[0]}/${p[2]}`;
    out[mk] = (out[mk] || 0) + Number(c.valor);
  }
  return out;
}
```

### `src/lib/queries.ts` · linhas 1392–1450

`getRevenueBySource` — **não chamada pelo Dashboard**.

```ts
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
```

### `src/lib/queries.ts` · linhas 406–450

`getReceivables`.

```ts
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
```

### `src/lib/queries.ts` · linhas 348–392

`getContasPagar`.

```ts
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
```

---

## 2. Os módulos de `src/lib/calc/` usados


| Módulo | Função | Quem chama |
|---|---|---|
| `calc/medicao-bdi.ts` | `calcIncidencias`, `calcBdi`, `calcEvolucao`, `calcProvisionamento`, `custoReferencial` | `getIndicadoresObra` |
| `calc/receivables.ts` | `expandUnitReceivables` | `getMonthlyRevenue`, `getReceivables` |
| `calc/projection.ts` | `reembursementsByMonth` | `getMonthlyRevenue`, `getRevenueBySource` |
| `calc/projection.ts` | `calcProjectionBySource` | `getRevenueBySource` |

`getStatusProjeto`, `getContasPagar` e `getIndicadoresObraConsolidado` **não
importam nada de `calc/`** — fazem as contas inline.

### `src/lib/calc/medicao-bdi.ts`

`calc/medicao-bdi.ts` inteiro.

```ts
/**
 * Medição de obra, BDI e provisionamento de liberação.
 *
 * Todas as fórmulas foram derivadas da planilha de referência do cliente e
 * conferidas contra os números dela — ver docs/BDI-PROVISIONAMENTO.md, que
 * traz a validação número a número.
 *
 * Funções PURAS: nenhum valor é fixado em código. Percentuais de BDI, taxas,
 * CUB, metragem e valores financiados vêm sempre do cadastro do projeto.
 */

export interface ServicoOrcado {
  id: string;
  nome: string;
  /** custo proposto do serviço (R$). */
  custoProposto: number;
  /** faixa aceitável de incidência (%), opcional. */
  limiteMin?: number | null;
  limiteMax?: number | null;
}

export type StatusIncidencia = "OK" | "Abaixo do mínimo" | "Acima do máximo" | "—";

export interface ServicoCalculado extends ServicoOrcado {
  /** custo do serviço ÷ custo total dos serviços × 100. */
  incidencia: number;
  status: StatusIncidencia;
}

/** Custo total dos serviços do projeto. */
export function custoTotalServicos(servicos: ServicoOrcado[]): number {
  return servicos.reduce((a, s) => a + (Number(s.custoProposto) || 0), 0);
}

/**
 * Incidência de cada serviço no orçamento e status frente aos limites.
 * `status` só é avaliado quando há limites cadastrados.
 */
export function calcIncidencias(servicos: ServicoOrcado[]): ServicoCalculado[] {
  const total = custoTotalServicos(servicos);
  return servicos.map((s) => {
    const incidencia = total > 0 ? ((Number(s.custoProposto) || 0) / total) * 100 : 0;
    const min = s.limiteMin == null ? null : Number(s.limiteMin);
    const max = s.limiteMax == null ? null : Number(s.limiteMax);
    let status: StatusIncidencia = "—";
    if (min != null || max != null) {
      if (min != null && incidencia < min) status = "Abaixo do mínimo";
      else if (max != null && incidencia > max) status = "Acima do máximo";
      else status = "OK";
    }
    return { ...s, incidencia, status };
  });
}

export interface BdiResultado {
  custoTotalServicos: number;
  pctBdi: number;
  valorBdi: number;
  custoTotalComBdi: number;
}

/**
 * BDI sobre o custo total dos serviços.
 *
 *   valor do BDI      = custo total dos serviços × %BDI
 *   custo total c/BDI = custo total dos serviços + valor do BDI
 *
 * O `pctBdi` é sempre um parâmetro do projeto — a alíquota varia conforme o
 * tipo de executor da obra e NÃO é presumida aqui.
 */
export function calcBdi(servicos: ServicoOrcado[], pctBdi: number): BdiResultado {
  const custo = custoTotalServicos(servicos);
  const pct = Number(pctBdi) || 0;
  const valorBdi = custo * (pct / 100);
  return {
    custoTotalServicos: custo,
    pctBdi: pct,
    valorBdi,
    custoTotalComBdi: custo + valorBdi,
  };
}

/** Ordena competências "MM/YYYY" cronologicamente. */
export function sortCompetencias(ms: string[]): string[] {
  return [...ms].sort((a, b) => {
    const [ma, ya] = a.split("/");
    const [mb, yb] = b.split("/");
    return (
      Number(ya) - Number(yb) || Number(ma) - Number(mb)
    );
  });
}

export interface MedicaoServicoInput {
  servicoId: string;
  competencia: string;
  /** % executado ACUMULADO do serviço ao fim da competência (0..100). */
  pctExecutadoAcum: number;
}

export interface EvolucaoMes {
  competencia: string;
  /** execução acumulada da OBRA (%) ao fim do mês. */
  acumulado: number;
  /** variação do mês = acumulado atual − acumulado anterior. */
  variacao: number;
}

/**
 * Evolução física da obra mês a mês.
 *
 *   execução acumulada do serviço = incidência × %executado do serviço
 *   acumulado da obra             = Σ execuções acumuladas dos serviços
 *   variação mensal               = acumulado atual − acumulado anterior
 *
 * O %executado de um serviço é "carregado" para os meses seguintes enquanto não
 * houver nova medição — o acumulado nunca regride sozinho por falta de
 * lançamento no mês.
 */
export function calcEvolucao(
  servicos: ServicoOrcado[],
  medicoes: MedicaoServicoInput[],
): EvolucaoMes[] {
  const incid = new Map(calcIncidencias(servicos).map((s) => [s.id, s.incidencia]));
  const competencias = sortCompetencias([
    ...new Set(medicoes.map((m) => m.competencia)),
  ]);

  // Último % executado conhecido de cada serviço (carregado mês a mês).
  const ultimoPct = new Map<string, number>();
  const out: EvolucaoMes[] = [];
  let anterior = 0;

  for (const comp of competencias) {
    for (const m of medicoes.filter((x) => x.competencia === comp)) {
      ultimoPct.set(m.servicoId, Number(m.pctExecutadoAcum) || 0);
    }
    let acumulado = 0;
    for (const [servicoId, pct] of ultimoPct) {
      acumulado += ((incid.get(servicoId) ?? 0) * pct) / 100;
    }
    out.push({ competencia: comp, acumulado, variacao: acumulado - anterior });
    anterior = acumulado;
  }
  return out;
}

export interface ParamsProvisionamento {
  /** valor financiado destinado à CONSTRUÇÃO. */
  financiamentoConstrucao: number;
  /** valor financiado do TERRENO (entra no acumulado, sem custo de obra). */
  financiamentoTerreno: number;
  /** custo referencial da obra = CUB × metragem. */
  custoReferencial: number;
  /** parcela de referência do caixa (base do E.V.O). */
  parcelaReferencia: number;
  /** % de taxas incidentes sobre a liberação do mês (ex.: 1,5). */
  pctTaxa: number;
}

export interface LinhaProvisionamento {
  competencia: string;
  /** variação física do mês (%). */
  obraMes: number;
  liberacao: number;
  custoEstimado: number;
  /** geração de caixa/margem = liberação − custo estimado. */
  caixa: number;
  liberacaoAcumulada: number;
  /** liberação acumulada ÷ total financiado (0..1). */
  pctRecebido: number;
  evo: number;
  taxa: number;
  soma: number;
  /** saldo de financiamento ainda disponível. */
  saldoFinanciamento: number;
}

/**
 * Quadro mensal de liberação/provisionamento (docs/BDI-PROVISIONAMENTO.md §5):
 *
 *   liberação do mês  = variação mensal × financiamento da construção
 *   custo estimado    = variação mensal × custo referencial (CUB × metragem)
 *   geração de caixa  = liberação − custo estimado
 *   % recebido        = liberação acumulada ÷ (financ. construção + terreno)
 *   E.V.O             = parcela de referência × % recebido
 *   taxa              = %taxa × liberação do mês
 *
 * A liberação do TERRENO entra no acumulado inicial (não tem variação de obra
 * nem custo associados).
 */
export function calcProvisionamento(
  evolucao: EvolucaoMes[],
  p: ParamsProvisionamento,
): LinhaProvisionamento[] {
  const totalFinanciado =
    (Number(p.financiamentoConstrucao) || 0) + (Number(p.financiamentoTerreno) || 0);
  // O terreno já liberado compõe o acumulado desde o início.
  let acumulado = Number(p.financiamentoTerreno) || 0;

  return evolucao.map((e) => {
    const fracao = e.variacao / 100;
    const liberacao = fracao * (Number(p.financiamentoConstrucao) || 0);
    const custoEstimado = fracao * (Number(p.custoReferencial) || 0);
    acumulado += liberacao;
    const pctRecebido = totalFinanciado > 0 ? acumulado / totalFinanciado : 0;
    const evo = (Number(p.parcelaReferencia) || 0) * pctRecebido;
    const taxa = liberacao * ((Number(p.pctTaxa) || 0) / 100);
    return {
      competencia: e.competencia,
      obraMes: e.variacao,
      liberacao,
      custoEstimado,
      caixa: liberacao - custoEstimado,
      liberacaoAcumulada: acumulado,
      pctRecebido,
      evo,
      taxa,
      soma: evo + taxa,
      saldoFinanciamento: totalFinanciado - acumulado,
    };
  });
}

/** Custo referencial da obra = CUB × metragem. */
export function custoReferencial(cub: number, metragem: number): number {
  return (Number(cub) || 0) * (Number(metragem) || 0);
}
```

### `src/lib/calc/receivables.ts`

`calc/receivables.ts` inteiro.

```ts
import { parseDate } from "./projection";
import { serieVencimentos } from "./carencia";
import type { PaymentPlan, UnitStatus } from "./types";

export interface Receivable {
  /** data prevista, "MM/DD/YYYY". */
  dia: string;
  valor: number;
  label: string;
}

/**
 * Expande o plano de pagamento de uma unidade vendida em recebíveis datados
 * (uma linha por vencimento). Base do painel "Receitas a Receber do Dia".
 * Só gera recebíveis para unidades com status "Vendido".
 */
export function expandUnitReceivables(
  plan: PaymentPlan | null | undefined,
  status: UnitStatus,
): Receivable[] {
  if (status !== "Vendido" || !plan) return [];
  const out: Receivable[] = [];
  const fmt = (mo: number, d: number, yr: number) =>
    `${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}/${yr}`;

  // Planos antigos/parciais podem não conter todas as seções — leia de forma
  // tolerante (seção ausente = campos vazios/zero) para nunca quebrar o cálculo.
  const p = plan as unknown as Record<string, unknown>;
  const sec = (k: string) => (p[k] ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => Number(v) || 0;

  const periodic: { venc: string; val: number; n: number; label: string; step: number }[] = [
    { venc: str(sec("AS").venc), val: num(sec("AS").val), n: num(sec("AS").n), label: "Ato", step: 1 },
    { venc: str(sec("S1").venc), val: num(sec("S1").val), n: num(sec("S1").n), label: "Sinal 1", step: 1 },
    { venc: str(sec("S2").venc), val: num(sec("S2").val), n: num(sec("S2").n), label: "Sinal 2", step: 1 },
    { venc: str(sec("S3").venc), val: num(sec("S3").val), n: num(sec("S3").n), label: "Sinal 3", step: 1 },
    { venc: str(sec("Mensais").venc), val: num(sec("Mensais").val), n: num(sec("Mensais").n), label: "Mensal", step: 1 },
    { venc: str(sec("Semestrais").venc), val: num(sec("Semestrais").val), n: num(sec("Semestrais").n), label: "Semestral", step: 6 },
    { venc: str(sec("Anuais").venc), val: num(sec("Anuais").val), n: num(sec("Anuais").n), label: "Anual", step: 12 },
  ];
  for (const s of periodic) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    const n = Math.max(1, Number(s.n) || 1);
    if (!d || val <= 0) continue;
    // Item 6.2 / 2.4 — o dia de vencimento é ENCOLHIDO para o último dia do mês
    // quando o mês de destino não o tem. Antes a data era montada com o dia
    // ORIGINAL no mês deslocado, produzindo strings como "04/31/2026" — data
    // que não existe no calendário e que nenhuma tela conseguia interpretar.
    //
    // O dia desejado é sempre o da data-base: encolher em fevereiro NÃO
    // contamina março (31/01 → 28/02 → 31/03, e não 28/03).
    const datas = serieVencimentos(s.venc, n, s.step);
    for (let i = 0; i < n; i++) {
      out.push({
        dia: datas[i] ?? fmt(d.mo, d.d, d.yr),
        valor: val,
        label: n > 1 ? `${s.label} #${i + 1}` : s.label,
      });
    }
  }

  const singles: { venc: string; val: number; label: string }[] = [
    { venc: str(sec("FGTS").dataPrev), val: num(sec("FGTS").val), label: "FGTS" },
    { venc: str(sec("Subsidio").dataPrev), val: num(sec("Subsidio").val), label: "Subsídio" },
    { venc: str(sec("Permuta").dataPrev), val: num(sec("Permuta").val), label: "Permuta" },
    { venc: str(sec("Banco").dataPrimParc), val: num(sec("Banco").valFinanc), label: "Financiamento" },
  ];
  for (const s of singles) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    if (!d || val <= 0) continue;
    out.push({ dia: fmt(d.mo, d.d, d.yr), valor: val, label: s.label });
  }
  return out;
}
```

### `src/lib/calc/projection.ts` · linhas 337–351

`reembursementsByMonth`.

```ts
export function reembursementsByMonth(
  reembolsos: readonly CalcReembolso[],
): MonthlyProjection {
  const m: MonthlyProjection = {};
  reembolsos.forEach((r) => {
    if (r.data && r.valor > 0) {
      const p = r.data.split("/");
      if (p.length === 3) {
        const k = p[0] + "/" + p[2];
        m[k] = (m[k] || 0) + r.valor;
      }
    }
  });
  return m;
}
```

### `src/lib/calc/projection.ts` · linhas 156–239

`calcProjectionBySource` — usada só por `getRevenueBySource`.

```ts
/**
 * Igual a `calcProjection`, mas separando a receita projetada por tipo de fonte
 * (AS/Sinais, Mensais, …). Usado no Consolidado. Retorna um mapa vazio por
 * fonte se a unidade não estiver vendida.
 */
export function calcProjectionBySource(
  u: CalcUnit,
  incc: readonly InccRow[] = [],
): Record<ProjectionSource, MonthlyProjection> {
  const out = {
    "AS/Sinais": {},
    Mensais: {},
    Semestrais: {},
    Anuais: {},
    FGTS: {},
    Subsídio: {},
    Permuta: {},
  } as Record<ProjectionSource, MonthlyProjection>;
  if (u.status !== "Vendido") return out;
  const add = (key: ProjectionSource, mm: string, v: number) => {
    if (v > 0) out[key][mm] = (out[key][mm] || 0) + v;
  };
  const periodic = (val: number, i: number, mk: string) =>
    Math.round(
      val * (1 + (i >= INCC_FROM_INSTALLMENT ? getIncc(incc, mk) : 0) / 100) * 100,
    ) / 100;

  const signals: { use: boolean; val: number; venc: string; n: number }[] = [
    { use: u.usarAS, val: u.AS.val, venc: u.AS.venc, n: u.AS.n },
    { use: u.AS.usarS1, val: u.S1.val, venc: u.S1.venc, n: u.S1.n },
    { use: u.S1.usarS2, val: u.S2.val, venc: u.S2.venc, n: u.S2.n },
    { use: u.S2.usarS3, val: u.S3.val, venc: u.S3.venc, n: u.S3.n },
  ];
  for (const s of signals) {
    if (s.use && s.val > 0) {
      const d = parseDate(s.venc);
      if (d)
        for (let i = 0; i < (s.n || 1); i++) {
          const dt = addMonths(d.mo, d.yr, i);
          add("AS/Sinais", monthKey(dt.mo, dt.yr), s.val);
        }
    }
  }
  if (u.S3.usarMens && u.Mensais.val > 0) {
    const d = parseDate(u.Mensais.venc);
    if (d)
      for (let i = 0; i < (u.Mensais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        const mk = monthKey(dt.mo, dt.yr);
        add("Mensais", mk, periodic(u.Mensais.val, i, mk));
      }
  }
  if (u.Mensais.usarSem && u.Semestrais.val > 0) {
    const d = parseDate(u.Semestrais.venc);
    if (d)
      for (let i = 0; i < (u.Semestrais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 6);
        const mk = monthKey(dt.mo, dt.yr);
        add("Semestrais", mk, periodic(u.Semestrais.val, i, mk));
      }
  }
  if (u.Semestrais.usarAnu && u.Anuais.val > 0) {
    const d = parseDate(u.Anuais.venc);
    if (d)
      for (let i = 0; i < (u.Anuais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 12);
        const mk = monthKey(dt.mo, dt.yr);
        add("Anuais", mk, periodic(u.Anuais.val, i, mk));
      }
  }
  if (u.Anuais.usarFGTS && u.FGTS.val > 0) {
    const d = parseDate(u.FGTS.dataPrev);
    if (d) add("FGTS", monthKey(d.mo, d.yr), u.FGTS.val);
  }
  if (u.FGTS.usarSub && u.Subsidio.val > 0 && u.Subsidio.statusSub === "Recebido") {
    const d = parseDate(u.Subsidio.dataPrev);
    if (d) add("Subsídio", monthKey(d.mo, d.yr), u.Subsidio.val);
  }
  if (u.Subsidio.usarPer && u.Permuta.val > 0) {
    const d = parseDate(u.Permuta.dataPrev);
    if (d) add("Permuta", monthKey(d.mo, d.yr), u.Permuta.val);
  }
  return out;
}
```

---

## 3. A página e os componentes de cartão

### `src/app/(app)/dashboard/page.tsx`

```tsx
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext, type Version } from "@/lib/context";
import {
  getMonthlyRevenue,
  getUnits,
  getIndicadoresObra,
  getIndicadoresObraConsolidado,
  getStatusProjeto,
  getVersionsDoProjeto,
  getContasPagar,
  getReceivables,
} from "@/lib/queries";
import { parseDate } from "@/lib/calc";
import { brlk, monthInRange, dateInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { ProjectPicker } from "@/components/app/project-picker";
import { Card, CardContent } from "@/components/ui/card";
import { IndicadoresObraPanel, StatusProjetoPanel } from "@/components/app/indicadores-obra";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import { DateRangeFilter } from "@/components/app/date-range-filter";

export const dynamic = "force-dynamic";


interface Summary {
  version: Version;
  vgv: number;
  realizado: number;
  receitaProj: number;
  aReceber: number;
  /** contas a pagar não pagas no período (só faz sentido na versão Atual). */
  aPagar: number;
  monthly: Record<string, number>;
  /** entradas realizadas (fechamentos de caixa) por mês "MM/YYYY". */
  realizadoMonthly: Record<string, number>;
}

/** Indicadores agregados de uma versão (para os KPIs e o comparativo). */
async function versionSummary(
  projectId: string,
  version: Version,
  de: string,
  ate: string,
): Promise<Summary> {
  const hasRange = !!(de || ate);
  const [unitRows, revenueAll, cashRows] = await Promise.all([
    getUnits(version.id),
    getMonthlyRevenue(version.id, projectId),
    db
      .select({ valor: schema.cashEntries.valor, data: schema.cashEntries.data })
      .from(schema.cashEntries)
      .where(eq(schema.cashEntries.versionId, version.id)),
  ]);
  // Filtro de período (item 3): receita por mês e realizado por data.
  const revenue = hasRange
    ? Object.fromEntries(
        Object.entries(revenueAll).filter(([mm]) => monthInRange(mm, de, ate)),
      )
    : revenueAll;
  const receitaProj = Object.values(revenue).reduce((a, b) => a + b, 0);
  // Entradas realizadas (fechamentos de caixa) no período, por data e por mês.
  const realizadoRows = cashRows.filter(
    (c) => Number(c.valor) > 0 && (!hasRange || dateInRange(c.data, de, ate)),
  );
  const realizado = realizadoRows.reduce((a, c) => a + Number(c.valor), 0);
  const realizadoMonthly: Record<string, number> = {};
  for (const c of realizadoRows) {
    const d = parseDate(c.data);
    if (!d) continue;
    const key = `${String(d.mo).padStart(2, "0")}/${d.yr}`;
    realizadoMonthly[key] = (realizadoMonthly[key] || 0) + Number(c.valor);
  }
  return {
    version,
    vgv: unitRows.reduce((a, u) => a + Number(u.valor), 0),
    realizado,
    receitaProj,
    aReceber: Math.max(0, receitaProj - realizado),
    aPagar: 0,
    monthly: revenue,
    realizadoMonthly,
  };
}


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vs?: string; de?: string; ate?: string; proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  // Projeto vem do seletor (?proj=), não do "projeto ativo" da sessão — assim o
  // filtro do topo realmente troca a obra exibida. "all" consolida a empresa.
  const isAll = sp.proj === "all";
  const project =
    ctx.projects.find((p) => p.id === sp.proj) ?? ctx.project ?? ctx.projects[0];

  // As versões exibidas são as DO PROJETO selecionado (ctx.versions são as do
  // projeto ativo da sessão, que pode ser outro).
  const versoesProjeto = await getVersionsDoProjeto(ctx.tenant.id, project.id);
  const versoes = versoesProjeto.length > 0 ? versoesProjeto : ctx.versions;

  const wanted = (sp.vs ?? "").split(",").filter(Boolean);
  const validWanted = versoes.filter((v) => wanted.includes(v.id)).slice(0, 3);
  const selected = validWanted.length > 0 ? validWanted : versoes.slice(0, 3);

  const summaries = await Promise.all(
    selected.map((v) => versionSummary(project.id, v, de, ate)),
  );

  const indicadores = isAll
    ? await getIndicadoresObraConsolidado(
        ctx.tenant.id,
        ctx.projects.map((p) => p.id),
      )
    : await getIndicadoresObra(ctx.tenant.id, project.id);
  const statusProjeto = await getStatusProjeto(
    ctx.tenant.id,
    isAll ? ctx.projects.map((p) => p.id) : [project.id],
  );

  // ── Versão "Atual — caixa real": dados reais ────────────────────────────
  // Budget/Forecast permanecem estritamente em suas seções. A versão Atual
  // reflete o caixa real do período: (a) fechamentos já realizados (entradas
  // conciliadas), (b) recebíveis das unidades vendidas ainda não recebidos
  // (entradas projetadas) e (c) despesas lançadas ainda não pagas (saídas
  // projetadas / contas a pagar).
  const hasRangeDash = !!(de || ate);
  const realReceb = (await getReceivables(ctx.tenant.id)).filter(
    (r) =>
      (isAll || r.projectId === project.id) &&
      (!hasRangeDash || dateInRange(r.dia, de, ate)),
  );
  const totalReceb = realReceb.reduce((a, r) => a + r.valor, 0);

  // Contas a pagar (despesas não pagas) do projeto, com vencimento no período.
  const contasPagarProj = (await getContasPagar(ctx.tenant.id)).filter(
    (c) =>
      (isAll || c.projectId === project.id) &&
      c.status !== "Pago" &&
      !!c.vencimento &&
      (!hasRangeDash || dateInRange(c.vencimento, de, ate)),
  );
  const totalPagar = contasPagarProj.reduce((a, c) => a + c.valor, 0);

  // Recebíveis por mês (entradas projetadas) — compõem o comparativo do Atual.
  const recebByMonth: Record<string, number> = {};
  for (const r of realReceb) {
    const d = parseDate(r.dia);
    if (!d) continue;
    const key = `${String(d.mo).padStart(2, "0")}/${d.yr}`;
    recebByMonth[key] = (recebByMonth[key] || 0) + r.valor;
  }
  for (const s of summaries) {
    if (s.version.kind !== "atual") continue;
    // Comparativo mensal = entradas realizadas (fechamentos) + recebíveis projetados.
    const monthly: Record<string, number> = { ...s.realizadoMonthly };
    for (const [mm, v] of Object.entries(recebByMonth)) {
      monthly[mm] = (monthly[mm] || 0) + v;
    }
    s.monthly = monthly;
    s.receitaProj = s.realizado + totalReceb;
    s.aReceber = totalReceb; // recebíveis ainda não recebidos
    s.aPagar = totalPagar; // despesas ainda não pagas
  }

  const kpis = [
    { icon: "🏢", label: "VGV total", get: (s: Summary) => brlk(s.vgv) },
    { icon: "↗", label: "Realizado acum.", get: (s: Summary) => brlk(s.realizado) },
    { icon: "⏱", label: "A receber", get: (s: Summary) => brlk(s.aReceber) },
    {
      icon: "⬇",
      label: "A pagar",
      // Contas a pagar são exclusivas da versão Atual (caixa real).
      get: (s: Summary) => (s.version.kind === "atual" ? brlk(s.aPagar) : "—"),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={
          isAll
            ? `Todos os projetos · ${ctx.tenant.name}`
            : `${project.name} · ${ctx.tenant.name}`
        }
        title="Dashboard"
        subtitle={
          isAll
            ? "Visão geral da empresa — matriz e filiais consolidados"
            : "Visão geral do projeto — independente da versão ativa"
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <ProjectPicker
              projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
              selected={isAll ? "all" : project.id}
              allOption
            />
            <DateRangeFilter de={de} ate={ate} />
            <VersionMultiSelect
              versions={versoes.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
              selected={selected.map((v) => v.id)}
            />
          </div>
        }
      />

      {/* KPIs por versão */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5">
              <p className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                <span aria-hidden>{k.icon}</span> {k.label}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {summaries.map((s) => (
                  <div key={s.version.id}>
                    <div
                      className="font-[family-name:var(--font-mono)] text-[10px]"
                      style={{ color: s.version.color }}
                    >
                      {s.version.label}
                    </div>
                    <div
                      className="text-lg font-semibold"
                      style={{ color: s.version.color }}
                    >
                      {k.get(s)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Indicadores físico-financeiros da obra (BDI, evolução, liberação). */}
      <StatusProjetoPanel st={statusProjeto} />
      <IndicadoresObraPanel ind={indicadores} />

    </>
  );
}
```

### `src/components/app/indicadores-obra.tsx`

`KPI` (o cartão), `IndicadoresObraPanel` (16 cartões) e `StatusProjetoPanel` (8 cartões).

```tsx
import type { IndicadoresObra, StatusProjeto } from "@/lib/queries";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const pct = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Um indicador. `hint` explica a origem do número quando ela não é óbvia. */
function KPI({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "good" | "warn" | "muted";
}) {
  const cor =
    tone === "good"
      ? "text-[var(--color-success)]"
      : tone === "warn"
        ? "text-[var(--color-warning)]"
        : tone === "muted"
          ? "text-[var(--color-ink4)]"
          : "text-[var(--color-ink)]";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className={`mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold ${cor}`}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-[11px] text-[var(--color-ink4)]">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Painel de indicadores físico-financeiros da obra: aquisição/financiamento,
 * custo com BDI, evolução física e liberação do financiamento.
 *
 * Os números saem do cadastro do projeto (CUB, metragem, valores financiados,
 * %BDI) e das medições por serviço. Quando esses dados ainda não existem, o
 * painel diz o que falta em vez de exibir valor inventado.
 */
export function IndicadoresObraPanel({ ind }: { ind: IndicadoresObra }) {
  return (
    <div className="mt-6 space-y-4">
      {/* Aquisição e financiamento */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Aquisição e financiamento
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI label="Financiado — construção" value={brl0(ind.financiamentoConstrucao)} />
          <KPI label="Financiado — terreno" value={brl0(ind.financiamentoTerreno)} />
          <KPI label="Total da aquisição" value={brl0(ind.totalAquisicao)} />
          <KPI
            label="Saldo de financiamento"
            value={brl0(ind.saldoFinanciamento)}
            hint="ainda não liberado"
            tone={ind.saldoFinanciamento > 0 ? "normal" : "muted"}
          />
        </div>
      </div>

      {/* Custo da obra e BDI */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Custo da obra e BDI
          {ind.tipoExecutor && (
            <span className="ml-2 font-normal text-[var(--color-ink3)]">
              · executor: {ind.tipoExecutor}
            </span>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Custo total dos serviços"
            value={brl0(ind.custoTotalServicos)}
            hint={`${ind.qtdServicos} serviço(s)`}
          />
          <KPI
            label="BDI"
            value={ind.pctBdi > 0 ? pct(ind.pctBdi) : "—"}
            hint={ind.pctBdi > 0 ? undefined : "informe no cadastro do projeto"}
            tone={ind.pctBdi > 0 ? "normal" : "muted"}
          />
          <KPI label="Valor do BDI" value={brl0(ind.valorBdi)} />
          <KPI label="Custo total com BDI" value={brl0(ind.custoTotalComBdi)} />
        </div>
      </div>

      {/* Evolução física e liberação */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
          Evolução da obra e liberação
          {!ind.temMedicao && (
            <Badge tone="warning">sem medição lançada</Badge>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Evolução física acumulada"
            value={ind.temMedicao ? pct(ind.evolucaoAcumulada) : "—"}
            tone={ind.temMedicao ? "good" : "muted"}
          />
          <KPI
            label="Evolução do mês"
            value={ind.temMedicao ? pct(ind.evolucaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação do mês"
            value={ind.temMedicao ? brl0(ind.liberacaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação acumulada"
            value={brl0(ind.liberacaoAcumulada)}
            hint={`${pct(ind.pctRecebido * 100)} do financiado`}
          />
          <KPI
            label="Custo estimado do mês"
            value={ind.temMedicao ? brl0(ind.custoEstimadoMes) : "—"}
            hint="CUB × metragem × evolução"
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Geração de caixa do mês"
            value={ind.temMedicao ? brl0(ind.geracaoCaixaMes) : "—"}
            hint="liberação − custo estimado"
            tone={
              !ind.temMedicao ? "muted" : ind.geracaoCaixaMes >= 0 ? "good" : "warn"
            }
          />
          <KPI
            label="Custo referencial"
            value={brl0(ind.custoReferencial)}
            hint={
              ind.cub > 0
                ? `CUB ${brl0(ind.cub)} × ${ind.metragem} m²`
                : "informe CUB e metragem"
            }
            tone={ind.cub > 0 ? "normal" : "muted"}
          />
          <KPI
            label="Serviços fora dos limites"
            value={String(ind.servicosForaDosLimites)}
            hint="incidência fora da faixa aceitável"
            tone={ind.servicosForaDosLimites > 0 ? "warn" : "good"}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Status atual do projeto: quanto já entrou frente ao previsto no cadastro,
 * quanto já foi gasto frente ao planejado no Budget, margem de contribuição e
 * indicadores por metro quadrado.
 *
 * Definições de negócio confirmadas com o cliente:
 *   MC  = Receita − Custo Variável − Despesa Variável
 *   %MC = MC ÷ Receita Total do Projeto (valor global do cadastro)
 */
export function StatusProjetoPanel({ st }: { st: StatusProjeto }) {
  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Status atual
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Recebido"
            value={brl0(st.recebido)}
            hint={`de ${brl0(st.receitaPrevista)} previstos`}
          />
          <KPI
            label="% recebido"
            value={st.receitaPrevista > 0 ? pct(st.pctRecebido * 100) : "—"}
            hint="sobre a receita do cadastro"
            tone={st.receitaPrevista > 0 ? "good" : "muted"}
          />
          <KPI
            label="Executado"
            value={brl0(st.executado)}
            hint={`de ${brl0(st.despesaPrevista)} no Budget`}
          />
          <KPI
            label="% executado"
            value={st.despesaPrevista > 0 ? pct(st.pctExecutado * 100) : "—"}
            hint="sobre a despesa planejada"
            tone={
              st.despesaPrevista === 0
                ? "muted"
                : st.pctExecutado > 1
                  ? "warn"
                  : "normal"
            }
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Margem e produtividade
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Margem de contribuição"
            value={brl0(st.margemContribuicao)}
            hint="receita − custo var. − despesa var."
            tone={st.margemContribuicao >= 0 ? "good" : "warn"}
          />
          <KPI
            label="% margem de contribuição"
            value={st.receitaPrevista > 0 ? pct(st.pctMargem * 100) : "—"}
            hint="sobre a receita total do projeto"
            tone={
              st.receitaPrevista === 0
                ? "muted"
                : st.pctMargem >= 0
                  ? "good"
                  : "warn"
            }
          />
          <KPI
            label="Custo por m²"
            value={st.metragem > 0 ? brl0(st.custoPorM2) : "—"}
            hint={st.metragem > 0 ? `${st.metragem} m²` : "informe a metragem"}
            tone={st.metragem > 0 ? "normal" : "muted"}
          />
          <KPI
            label="Receita por m²"
            value={st.metragem > 0 ? brl0(st.receitaPorM2) : "—"}
            hint={st.metragem > 0 ? `${st.metragem} m²` : "informe a metragem"}
            tone={st.metragem > 0 ? "normal" : "muted"}
          />
        </div>
      </div>
    </div>
  );
}
```

---

## 4. As tabelas envolvidas no schema


| Tabela | Lida por |
|---|---|
| `project` | `getStatusProjeto`, `getIndicadoresObra`, `getContasPagar`, `getReceivables` |
| `version` | `getStatusProjeto`, `getContasPagar`, `getReceivables`, `getVersionKind` |
| `cash_entry` | `getStatusProjeto`, consulta inline do `page.tsx` |
| `despesa` | `getStatusProjeto`, `getContasPagar` |
| `budget_line` | `getStatusProjeto`, `getMonthlyRevenue` |
| `unit` | `getMonthlyRevenue`, `getReceivables`, `versionSummary` |
| `conta_receber` | `getMonthlyRevenue` |
| `reembolso` | `getMonthlyRevenue` |
| `servico` · `medicao_servico` | `getIndicadoresObra` |
| `stakeholder` · `cliente` | join de nome em `getContasPagar` / `getReceivables` |

### `src/lib/db/schema.ts` · linhas 1201–1235

`cash_entry`.

```ts
// ───────────────────────────── Caixa & INCC ─────────────────────────────

/** Lançamento de caixa (real) por versão, conciliável. Ver docs/SPEC.md §9.4. */
export const cashEntries = pgTable("cash_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  data: text("data"),
  descricao: text("descricao"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  cat: text("cat"),
  unitCode: text("unit_code"),
  /** nº do documento do extrato (quando importado). */
  doc: text("doc"),
  /** assinatura do lançamento importado (dedup do extrato). */
  importHash: text("import_hash"),
  /** conciliado com o extrato? */
  rec: boolean("rec").notNull().default(false),
  /** despesa conciliada a este movimento (para desfazer/histórico da conciliação). */
  conciliadoDespesaId: uuid("conciliado_despesa_id").references(() => despesas.id, {
    onDelete: "set null",
  }),
  /** conta a receber conciliada a este movimento (entradas). */
  conciliadoContaReceberId: uuid("conciliado_conta_receber_id"),
  /** usuário e data/hora da conciliação (auditoria). */
  conciliadoPor: text("conciliado_por"),
  conciliadoEm: text("conciliado_em"),
});
```

### `src/lib/db/schema.ts` · linhas 1086–1128

`servico` e `medicao_servico`.

```ts
export const servicos = pgTable("servico", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** ordem de exibição (1..N), como na planilha de referência. */
  ordem: integer("ordem").notNull().default(0),
  nome: text("nome").notNull(),
  custoProposto: numeric("custo_proposto", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  /** faixa aceitável de incidência (%), opcional. */
  limiteMin: numeric("limite_min", { precision: 8, scale: 4 }),
  limiteMax: numeric("limite_max", { precision: 8, scale: 4 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Medição de um serviço numa competência: o usuário informa APENAS o percentual
 * EXECUTADO ACUMULADO do serviço ao final do mês. A variação mensal e o valor
 * medido são derivados pelo sistema (nunca digitados) — ver
 * docs/BDI-PROVISIONAMENTO.md §4.
 */
export const medicaoServicos = pgTable("medicao_servico", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  servicoId: uuid("servico_id")
    .notNull()
    .references(() => servicos.id, { onDelete: "cascade" }),
  /** "MM/YYYY". */
  competencia: text("competencia").notNull(),
  /** % executado ACUMULADO do serviço até o fim desta competência (0..100). */
  pctExecutadoAcum: numeric("pct_executado_acum", { precision: 8, scale: 4 })
    .notNull()
    .default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 1243–1290

`conta_receber`.

```ts
export const contasReceber = pgTable("conta_receber", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** unidade/venda de origem (opcional). */
  unitCode: text("unit_code"),
  clienteId: uuid("cliente_id").references((): AnyPgColumn => clientes.id, {
    onDelete: "set null",
  }),
  descricao: text("descricao"),
  /** Sinal | Parcela mensal | Outros | Outras Receitas. */
  tipo: text("tipo").notNull().default("Outros"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  /** data prevista "MM/DD/YYYY". */
  vencimento: text("vencimento"),
  dataRecebimento: text("data_recebimento"),
  valorRecebido: numeric("valor_recebido", { precision: 15, scale: 2 }).notNull().default("0"),
  /** A receber | Recebido | Parcialmente recebido | Cancelado. */
  status: text("status").notNull().default("A receber"),
  bancoId: uuid("banco_id").references(() => bankAccounts.id, { onDelete: "set null" }),
  /** rastreabilidade: item do extrato que originou/conciliou esta conta. */
  origemCashEntryId: uuid("origem_cash_entry_id").references(() => cashEntries.id, {
    onDelete: "set null",
  }),
  cancelado: boolean("cancelado").notNull().default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Tabela INCC por projeto (48 meses, editável). Ver docs/SPEC.md §6. */
export const inccRates = pgTable(
  "incc_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** "MM/YYYY". */
    mes: text("mes").notNull(),
    /** variação mensal (%). */
    monthly: numeric("monthly", { precision: 8, scale: 4 }).notNull(),
```

---

## 5. Os 28 cartões


Legenda das colunas: **Versão aplicada** = qual `kind` de versão determina o
número; **Escopo de projeto** = de quantos projetos o número sai; **Tenant no
WHERE** = se `tenant_id` está na cláusula SQL; **Filtro em memória** = se há
`.filter()` em JS depois da consulta.

### 5.1 KPIs do topo (4) — um valor por versão selecionada

| Cartão | Expressão exata | Origem | Tabelas | Coluna de data | Versão | Escopo | Tenant no WHERE | Filtro em memória |
|---|---|---|---|---|---|---|---|---|
| VGV total | `unitRows.reduce((a,u) => a + Number(u.valor), 0)` (`page.tsx:76`) | `versionSummary` → `getUnits` | `unit` | — | a selecionada (qualquer kind) | 1 projeto | **não** (só `version_id`) | não |
| Realizado acum. | `realizadoRows.reduce((a,c) => a + Number(c.valor), 0)` (`page.tsx:66`) | consulta inline | `cash_entry` | `data` (text) | a selecionada | 1 projeto | **não** (só `version_id`) | **sim** — `valor > 0` e `dateInRange` (`page.tsx:63–65`) |
| A receber | `Math.max(0, receitaProj − realizado)` (`page.tsx:79`) · na Atual: `totalReceb` (`:169`) | `versionSummary` / `getReceivables` | `budget_line` ou `unit`+`reembolso`+`conta_receber` | `mes` / `vencimento` / dia do plano | a selecionada; na Atual mistura tenant | 1 projeto | varia — ver 6a | **sim** |
| A pagar | `s.version.kind === "atual" ? brlk(s.aPagar) : "—"` (`page.tsx:181`); `aPagar = totalPagar` (`:170`) | `getContasPagar` | `despesa`+`version`+`project` | `vencimento` (text) | **só Atual** | 1 projeto (ou todos se `proj=all`) | **sim** (`queries.ts:370`) | **sim** (`page.tsx:143–149`) |

### 5.2 Painel "Status atual" e "Margem e produtividade" (8)

Todos de `getStatusProjeto`. **Nenhum tem coluna de data: a função não
recebe nem aplica `de`/`ate`.**

| Cartão | Expressão exata | Origem | Tabelas | Data | Versão | Escopo | Tenant no WHERE | Filtro em memória |
|---|---|---|---|---|---|---|---|---|
| Recebido | `cashRows.filter(c => todosIds.includes(c.versionId) && num(c.valor) > 0).reduce(…)` (`2139–2141`) | `getStatusProjeto` | `cash_entry` | — | **todas** as versões do projeto | 1 ou todos | **sim** (`2122`) | **sim** — versão filtrada em JS |
| % recebido | `razao(recebido, receitaPrevista)` (`2180`) | idem | `cash_entry` + `project` | — | todas | idem | sim | sim |
| Executado | `daAtual.reduce((a,d) => a + num(d.valor), 0)` (`2152`) | idem | `despesa` | — | **`kind = "atual"`** | idem | **sim** (`2131`) | **sim** (`2149–2151`) |
| % executado | `razao(executado, despesaPrevista)` (`2183`) | idem | `despesa` + `budget_line` | — | Atual ÷ Budget | idem | sim | sim |
| Margem de contribuição | `receitaAtual − custoVariavel − despesaVariavel` (`2169`) | idem | `despesa` + tudo de `getMonthlyRevenue` | — | Atual | idem | parcial — ver 6a | sim |
| % margem de contribuição | `razao(margemContribuicao, receitaPrevista)` (`2186`) | idem | idem + `project` | — | Atual | idem | parcial | sim |
| Custo por m² | `razao(executado, metragem)` (`2191`) | idem | `despesa` + `project` | — | Atual | idem | sim | sim |
| Receita por m² | `razao(receitaAtual, metragem)` (`2192`) | idem | `getMonthlyRevenue` + `project` | — | Atual | idem | parcial | sim |

Dois componentes auxiliares, exibidos como *hint*: **`receitaPrevista`** =
`Σ (project.valor_construcao + project.valor_terreno)` (`2109–2111`) — do
**cadastro do projeto**, não das unidades; **`despesaPrevista`** =
`Σ budget_line.valor` das versões Budget (`2144–2146`).

### 5.3 Painel "Indicadores da obra" (16)

Todos de `getIndicadoresObra` (ou do consolidado). **Nenhum tem coluna de
data**; a única dimensão temporal é `medicao_servico.competencia`
(`"MM/YYYY"`), usada por `calcEvolucao` para ordenar os meses. **Nenhum
depende de versão** — `servico` e `medicao_servico` são do projeto, não de
uma versão.

| Cartão | Expressão exata | Origem | Tabelas | Versão | Escopo | Tenant no WHERE | Filtro em memória |
|---|---|---|---|---|---|---|---|
| Financiado — construção | `num(proj?.financiamentoConstrucao)` (`1912`) | `getIndicadoresObra` | `project` | **nenhuma** | 1 projeto | **sim** (`1892`) | não |
| Financiado — terreno | `num(proj?.financiamentoTerreno)` (`1913`) | idem | `project` | nenhuma | 1 | sim | não |
| Total da aquisição | `financiamentoConstrucao + financiamentoTerreno` (`1953`) | idem | `project` | nenhuma | 1 | sim | não |
| Saldo de financiamento | `ultimo?.saldoFinanciamento ?? financiamentoConstrucao` (`1972–1973`); dentro: `totalFinanciado − acumulado` (`medicao-bdi.ts:220`) | `calcProvisionamento` | `project`+`servico`+`medicao_servico` | nenhuma | 1 | sim (project) / sim (medicao) / **não** (servico) | **sim** (`1933`) |
| Custo total dos serviços | `servicos.reduce((a,s) => a + (Number(s.custoProposto) \|\| 0), 0)` (`medicao-bdi.ts:32`) | `calcBdi` | `servico` | nenhuma | 1 | **não** — só `project_id` (`1899`) | não |
| BDI | `Number(pctBdi) \|\| 0` (`medicao-bdi.ts:73`) — vem de `project.pct_bdi` | `calcBdi` | `project` | nenhuma | 1 | sim | não |
| Valor do BDI | `custo * (pct / 100)` (`medicao-bdi.ts:74`) | `calcBdi` | `servico`+`project` | nenhuma | 1 | parcial | não |
| Custo total com BDI | `custo + valorBdi` (`medicao-bdi.ts:79`) | `calcBdi` | idem | nenhuma | 1 | parcial | não |
| Evolução física acumulada | `ultimaEvol?.acumulado ?? 0` (`1968`); dentro: `Σ (incidência × pctExecutadoAcum) / 100` (`medicao-bdi.ts:140`) | `calcEvolucao` | `servico`+`medicao_servico` | nenhuma | 1 | **não** (servico) / sim (medicao, `1908`) | **sim** (`1933`) |
| Evolução do mês | `ultimaEvol?.variacao ?? 0` (`1969`); dentro: `acumulado − anterior` (`medicao-bdi.ts:142`) | `calcEvolucao` | idem | nenhuma | 1 | parcial | sim |
| Liberação do mês | `ultimo?.liberacao ?? 0` (`1970`); dentro: `(variacao/100) × financiamentoConstrucao` (`medicao-bdi.ts:203`) | `calcProvisionamento` | idem + `project` | nenhuma | 1 | parcial | sim |
| Liberação acumulada | `ultimo?.liberacaoAcumulada ?? financiamentoTerreno` (`1971`); acumula a partir do terreno (`medicao-bdi.ts:199`) | idem | idem | nenhuma | 1 | parcial | sim |
| Custo estimado do mês | `ultimo?.custoEstimado ?? 0` (`1974`); dentro: `(variacao/100) × custoReferencial` (`medicao-bdi.ts:204`) | idem | idem | nenhuma | 1 | parcial | sim |
| Geração de caixa do mês | `ultimo?.caixa ?? 0` (`1975`); dentro: `liberacao − custoEstimado` (`medicao-bdi.ts:214`) | idem | idem | nenhuma | 1 | parcial | sim |
| Custo referencial | `custoReferencial(cub, metragem)` = `cub × metragem` (`medicao-bdi.ts:227`) | `custoReferencial` | `project` | nenhuma | 1 | sim | não |
| Serviços fora dos limites | `incid.filter(s => s.status === "Abaixo do mínimo" \|\| s.status === "Acima do máximo").length` (`1964–1966`) | `calcIncidencias` | `servico` | nenhuma | 1 | **não** | **sim** |

No modo `?proj=all`, os 16 passam por `getIndicadoresObraConsolidado`, que
chama `getIndicadoresObra` **uma vez por projeto** (`1996–1998`) e agrega:
soma para valores monetários, **média ponderada pelo custo dos serviços** para
`evolucaoAcumulada` e `evolucaoMes` (`2035–2036`), razão recalculada para
`pctBdi` e `pctRecebido` (`2027`, `2042`), e `cub: 0` fixo (`2023`).

---

## 6. As perguntas específicas


### 6a. O tenant entra no WHERE do SQL, ou é filtrado depois em JS?

**Linha a linha, todas as consultas do caminho do Dashboard:**

| # | Função | Linha | Tabela | `tenant_id` no WHERE? | O que há no WHERE |
|---|---|---|---|---|---|
| 1 | `getStatusProjeto` | `queries.ts:2100` | `project` | **SIM** | `eq(projects.tenantId, tenantId)` |
| 2 | `getStatusProjeto` | `queries.ts:2101` | `version` | **SIM** | `eq(versions.tenantId, tenantId)` |
| 3 | `getStatusProjeto` | `queries.ts:2122` | `cash_entry` | **SIM** | `eq(cashEntries.tenantId, tenantId)` |
| 4 | `getStatusProjeto` | `queries.ts:2131` | `despesa` | **SIM** | `eq(despesas.tenantId, tenantId)` |
| 5 | `getStatusProjeto` | `queries.ts:2134` | `budget_line` | **SIM** | `tenantId` + `kind = "despesa"` |
| 6 | `getIndicadoresObra` | `queries.ts:1892` | `project` | **SIM** | `projectId` + `tenantId` |
| 7 | `getIndicadoresObra` | `queries.ts:1899` | `servico` | **NÃO** | só `eq(servicos.projectId, projectId)` |
| 8 | `getIndicadoresObra` | `queries.ts:1908` | `medicao_servico` | **SIM** | só `eq(medicaoServicos.tenantId, tenantId)` — **sem filtro de serviço** |
| 9 | `getMonthlyRevenue` | `queries.ts:1122–1127` | `budget_line` | **NÃO** | `version_id` + `kind = "receita"` |
| 10 | `getMonthlyRevenue` → `getUnits` | `queries.ts:89` | `unit` | **NÃO** | só `eq(units.versionId, versionId)` |
| 11 | `getMonthlyRevenue` → `getReembolsos` | `queries.ts:140` | `reembolso` | **NÃO** | só `eq(reembolsos.versionId, versionId)` |
| 12 | `getMonthlyRevenue` | `queries.ts:1163–1168` | `conta_receber` | **NÃO** | `project_id` + `cancelado = false` |
| 13 | `getReceivables` | `queries.ts:429` | `unit` | **SIM** | `units.tenantId` + `versions.kind = "atual"` |
| 14 | `getReceivables` | `queries.ts:426` | `cliente` (join) | **SIM** | `clientes.tenantId` na condição do `leftJoin` |
| 15 | `getContasPagar` | `queries.ts:370` | `despesa` | **SIM** | `despesas.tenantId` + `cancelado = false` |
| 16 | `page.tsx` (inline) | `page.tsx:53` | `cash_entry` | **NÃO** | só `eq(cashEntries.versionId, version.id)` |
| 17 | `getVersionsDoProjeto` | `queries.ts:2204–2209` | `version` | **SIM** | `tenantId` + `projectId` |

**Resumo:** 11 das 17 têm `tenant_id` no WHERE; **6 não têm** — as de número
7, 9, 10, 11, 12 e 16. Nessas, o isolamento vem de outra coluna:
`version_id` (9, 10, 11, 16) ou `project_id` (7, 12), ambas UUID e derivadas
de um contexto já filtrado por tenant. Não encontrei nenhum caso em que o
tenant seja aplicado **só** em JavaScript depois: onde ele não está no SQL,
ele também não é filtrado depois — a garantia é indireta, pelo id.

**O que É filtrado em JavaScript** (e não no SQL):

| Função | Linha | O que é filtrado em memória |
|---|---|---|
| `getStatusProjeto` | `2104` | `projectIds.includes(x.projectId)` — **o projeto** |
| `getStatusProjeto` | `2140` | `todosIds.includes(c.versionId)` — **a versão**, depois de carregar TODO o `cash_entry` do tenant |
| `getStatusProjeto` | `2145` | `idsBudget.includes(b.versionId)` |
| `getStatusProjeto` | `2149–2151` | `idsAtual.includes(d.versionId) && !d.cancelado` |
| `getStatusProjeto` | `2110`, `2174` | `projectIds.includes(p.id)` |
| `getIndicadoresObra` | `1933` | `servicoIds.includes(m.servicoId)` — **o serviço**, depois de carregar TODO o `medicao_servico` do tenant |
| `page.tsx` | `63–65` | `valor > 0` e `dateInRange` |
| `page.tsx` | `136–139` | projeto e `dateInRange` sobre `getReceivables` |
| `page.tsx` | `144–149` | projeto, `status !== "Pago"`, `vencimento` e `dateInRange` sobre `getContasPagar` |

Dois casos carregam a tabela inteira do tenant para descartar em memória:
`cash_entry` em `getStatusProjeto:2118–2123` e `medicao_servico` em
`getIndicadoresObra:1903–1909`.

### 6b. Alguma consulta do Dashboard lê `version.status`?

**Não.** `versions.status` aparece uma única vez em `queries.ts`, na linha
**711**, dentro de `getProjectVersionsByKind` — função que o Dashboard não
chama. Nenhuma das sete funções auditadas, nem a consulta inline da página,
seleciona ou filtra por essa coluna.

### `src/lib/queries.ts` · linhas 701–723

`getProjectVersionsByKind` — o único ponto que lê `version.status`, e não é do Dashboard.

```ts
/** Versões de um tipo (budget/forecast) de um projeto — para seletores/criação. */
export async function getProjectVersionsByKind(
  tenantId: string,
  projectId: string,
  kind: "budget" | "forecast",
): Promise<{ id: string; label: string; status: string }[]> {
  const rows = await db
    .select({
      id: schema.versions.id,
      label: schema.versions.label,
      status: schema.versions.status,
    })
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.tenantId, tenantId),
        eq(schema.versions.projectId, projectId),
        eq(schema.versions.kind, kind),
      ),
    )
    .orderBy(asc(schema.versions.createdAt));
  return rows;
}
```


### 6c. Como a versão "atual" é resolvida em cada função

| Função | Como resolve | Linha |
|---|---|---|
| `getStatusProjeto` | **por `kind`**: carrega todas as versões do tenant e filtra `v.kind === "atual"` em memória | `queries.ts:2114` |
| `getStatusProjeto` (receita) | **por `kind` + projeto**: `versoesProj.find(v => v.projectId === pid && v.kind === "atual")` | `queries.ts:2161` |
| `getMonthlyRevenue` | **por id recebido** — não resolve nada; consulta `getVersionKind(versionId)` só para escolher o ramo | `queries.ts:1117` |
| `getReceivables` | **por `kind` no SQL**: `eq(versions.kind, "atual")` no WHERE | `queries.ts:429` |
| `getIndicadoresObra` | **nenhuma** — não toca em `version` |
| `getIndicadoresObraConsolidado` | **nenhuma** |
| `getContasPagar` | **nenhuma** — traz todas as versões, faz `innerJoin` só para chegar ao projeto | `queries.ts:364–365` |
| `page.tsx` / `versionSummary` | **por id**, vindo do seletor `?vs=` | `page.tsx:109–114` |
| `page.tsx` (sobrescrita) | **por `kind` do objeto em memória**: `s.version.kind !== "atual"` | `page.tsx:161` |

**Nenhuma delas usa `ctx.version`.** O Dashboard não consulta a versão ativa
da sessão em ponto nenhum: usa `getVersionsDoProjeto(tenant, project.id)` e o
`searchParams`.

### 6d. Quais telas além do Dashboard chamam essas três funções

| Função | Chamadores |
|---|---|
| `getStatusProjeto` | **só** `dashboard/page.tsx:123` |
| `getIndicadoresObra` | `dashboard/page.tsx:122` e `getIndicadoresObraConsolidado` (`queries.ts:1997`) |
| `getIndicadoresObraConsolidado` | **só** `dashboard/page.tsx:118` |

As três são exclusivas do Dashboard. Nenhum relatório, nenhuma action e
nenhum script as consome.

### 6e. As quatro origens somadas em `getMonthlyRevenue`, com a coluna de data

A função tem **dois ramos**. O primeiro (Budget/Forecast) tem uma origem só; o
segundo (Atual e qualquer outro kind) soma três.

| # | Ramo | Origem | Tabela | Coluna de data | Formato | Como vira mês |
|---|---|---|---|---|---|---|
| 1 | `kind ∈ {budget, forecast}` | planejamento de receita | `budget_line` | **`mes`** | `"MM/YYYY"` | usada direto como chave (`1129`) |
| 2 | demais kinds | recebíveis das unidades vendidas | `unit.payment_plan` (JSON) | **`rec.dia`**, derivada do plano por `expandUnitReceivables` | `"MM/DD/YYYY"` | `split("/")` → `` `${p[0]}/${p[2]}` `` (`1144–1147`) |
| 3 | demais kinds | reembolsos | `reembolso` | **`data`** | `"MM/DD/YYYY"` | dentro de `reembursementsByMonth` (`projection.ts:337`) |
| 4 | demais kinds | contas a receber lançadas | `conta_receber` | **`vencimento`** | `"MM/DD/YYYY"` | `split("/")` → `` `${p[0]}/${p[2]}` `` (`1170–1173`) |

Três observações factuais sobre isso:

- **As quatro nunca somam juntas.** 1 é exclusiva do ramo Budget/Forecast; 2,
  3 e 4 do outro ramo. O `return` do primeiro ramo está na linha 1130.
- **A origem 4 é a única filtrada por `project_id`** (`1165`); as origens 2 e
  3 são filtradas por `version_id`. Como uma versão pertence a um projeto, na
  prática coincidem — mas por caminhos diferentes.
- **Origens 2 e 4 usam colunas de data diferentes** — o dia derivado do plano
  de pagamento e o `vencimento` da conta lançada — e ambas viram mês pela
  mesma fatia `p[0]/p[2]`, que assume `"MM/DD/YYYY"` sem validar mais que o
  número de partes.

### `src/lib/queries.ts` · linhas 1113–1176

A função, com as quatro origens marcadas pelos comentários do próprio código.

```ts
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

  const [unitRows, reembRows] = await Promise.all([
    getUnits(versionId),
    getReembolsos(versionId),
  ]);
  const out: MonthlyProjection = {};
  // Receita da versão Atual = recebíveis das vendas (MESMA fonte da tela Contas
  // a Receber: expandUnitReceivables — leitura tolerante do plano, sem depender
  // das flags usar*). Assim DRE e Fluxo batem com os recebíveis exibidos.
  // Agrega por mês do vencimento ("MM/DD/YYYY" → "MM/YYYY").
  for (const r of unitRows) {
    for (const rec of expandUnitReceivables(r.paymentPlan, r.status)) {
      const p = rec.dia.split("/");
      if (p.length !== 3) continue;
      const mk = `${p[0]}/${p[2]}`;
      out[mk] = (out[mk] || 0) + rec.valor;
    }
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  for (const [mm, v] of Object.entries(reemb)) out[mm] = (out[mm] || 0) + v;

  // CONTAS A RECEBER lançadas do projeto — a projeção de receita futura da
  // versão Atual depende delas. Sem isto, uma receita lançada à mão (fora de um
  // plano de venda) aparecia em Contas a Receber e sumia da DRE, do Fluxo de
  // Caixa e do Dashboard. Agrega pelo mês do vencimento e ignora as canceladas.
  const crRows = await db
    .select({
      valor: schema.contasReceber.valor,
      vencimento: schema.contasReceber.vencimento,
    })
    .from(schema.contasReceber)
    .where(
      and(
        eq(schema.contasReceber.projectId, projectId),
        eq(schema.contasReceber.cancelado, false),
      ),
    );
  for (const c of crRows) {
    const p = (c.vencimento ?? "").split("/");
    if (p.length !== 3) continue;
    const mk = `${p[0]}/${p[2]}`;
    out[mk] = (out[mk] || 0) + Number(c.valor);
  }
  return out;
}
```

### `src/lib/calc/receivables.ts`

`expandUnitReceivables` — produz `rec.dia` da origem 2.

```ts
import { parseDate } from "./projection";
import { serieVencimentos } from "./carencia";
import type { PaymentPlan, UnitStatus } from "./types";

export interface Receivable {
  /** data prevista, "MM/DD/YYYY". */
  dia: string;
  valor: number;
  label: string;
}

/**
 * Expande o plano de pagamento de uma unidade vendida em recebíveis datados
 * (uma linha por vencimento). Base do painel "Receitas a Receber do Dia".
 * Só gera recebíveis para unidades com status "Vendido".
 */
export function expandUnitReceivables(
  plan: PaymentPlan | null | undefined,
  status: UnitStatus,
): Receivable[] {
  if (status !== "Vendido" || !plan) return [];
  const out: Receivable[] = [];
  const fmt = (mo: number, d: number, yr: number) =>
    `${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}/${yr}`;

  // Planos antigos/parciais podem não conter todas as seções — leia de forma
  // tolerante (seção ausente = campos vazios/zero) para nunca quebrar o cálculo.
  const p = plan as unknown as Record<string, unknown>;
  const sec = (k: string) => (p[k] ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => Number(v) || 0;

  const periodic: { venc: string; val: number; n: number; label: string; step: number }[] = [
    { venc: str(sec("AS").venc), val: num(sec("AS").val), n: num(sec("AS").n), label: "Ato", step: 1 },
    { venc: str(sec("S1").venc), val: num(sec("S1").val), n: num(sec("S1").n), label: "Sinal 1", step: 1 },
    { venc: str(sec("S2").venc), val: num(sec("S2").val), n: num(sec("S2").n), label: "Sinal 2", step: 1 },
    { venc: str(sec("S3").venc), val: num(sec("S3").val), n: num(sec("S3").n), label: "Sinal 3", step: 1 },
    { venc: str(sec("Mensais").venc), val: num(sec("Mensais").val), n: num(sec("Mensais").n), label: "Mensal", step: 1 },
    { venc: str(sec("Semestrais").venc), val: num(sec("Semestrais").val), n: num(sec("Semestrais").n), label: "Semestral", step: 6 },
    { venc: str(sec("Anuais").venc), val: num(sec("Anuais").val), n: num(sec("Anuais").n), label: "Anual", step: 12 },
  ];
  for (const s of periodic) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    const n = Math.max(1, Number(s.n) || 1);
    if (!d || val <= 0) continue;
    // Item 6.2 / 2.4 — o dia de vencimento é ENCOLHIDO para o último dia do mês
    // quando o mês de destino não o tem. Antes a data era montada com o dia
    // ORIGINAL no mês deslocado, produzindo strings como "04/31/2026" — data
    // que não existe no calendário e que nenhuma tela conseguia interpretar.
    //
    // O dia desejado é sempre o da data-base: encolher em fevereiro NÃO
    // contamina março (31/01 → 28/02 → 31/03, e não 28/03).
    const datas = serieVencimentos(s.venc, n, s.step);
    for (let i = 0; i < n; i++) {
      out.push({
        dia: datas[i] ?? fmt(d.mo, d.d, d.yr),
        valor: val,
        label: n > 1 ? `${s.label} #${i + 1}` : s.label,
      });
    }
  }

  const singles: { venc: string; val: number; label: string }[] = [
    { venc: str(sec("FGTS").dataPrev), val: num(sec("FGTS").val), label: "FGTS" },
    { venc: str(sec("Subsidio").dataPrev), val: num(sec("Subsidio").val), label: "Subsídio" },
    { venc: str(sec("Permuta").dataPrev), val: num(sec("Permuta").val), label: "Permuta" },
    { venc: str(sec("Banco").dataPrimParc), val: num(sec("Banco").valFinanc), label: "Financiamento" },
  ];
  for (const s of singles) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    if (!d || val <= 0) continue;
    out.push({ dia: fmt(d.mo, d.d, d.yr), valor: val, label: s.label });
  }
  return out;
}
```

### `src/lib/calc/projection.ts` · linhas 337–351

`reembursementsByMonth` — a origem 3.

```ts
export function reembursementsByMonth(
  reembolsos: readonly CalcReembolso[],
): MonthlyProjection {
  const m: MonthlyProjection = {};
  reembolsos.forEach((r) => {
    if (r.data && r.valor > 0) {
      const p = r.data.split("/");
      if (p.length === 3) {
        const k = p[0] + "/" + p[2];
        m[k] = (m[k] || 0) + r.valor;
      }
    }
  });
  return m;
}
```


### 6f. Há `BETWEEN` ou `ORDER BY` sobre coluna `text` de data?

**`BETWEEN` não existe** — a string não aparece em `queries.ts`, e também não
há `gte()`/`lte()` do Drizzle em nenhuma das funções auditadas. Todo recorte
de período é feito em JavaScript, por `dateInRange` e `monthInRange`.

**`ORDER BY` sobre coluna `text` de data existe no arquivo, mas não no caminho
do Dashboard.** As ocorrências:

| Linha | Expressão | Coluna | Tipo | No caminho do Dashboard? |
|---|---|---|---|---|
| `queries.ts:243` | `asc(despesas.competencia)` | `competencia` | `text` `"MM/YYYY"` | não (`getDespesas`) |
| `queries.ts:310` | `asc(despesas.competencia)` | idem | `text` | não |
| `queries.ts:1066` | `asc(cashEntries.data)` | `data` | `text` `"MM/DD/YYYY"` | não (`getCash`) |
| `queries.ts:1076` | `asc(cashEntries.data)` | idem | `text` | não (`getCashByTenant`) |
| `queries.ts:1097` | `asc(medicoes.competencia)` | `competencia` | `text` | não |
| `queries.ts:1819` | `asc(contasReceber.vencimento)` | `vencimento` | `text` | não |

As sete funções auditadas usam `ORDER BY` em três lugares, nenhum deles sobre
data: `getUnits` por `units.code` (`90`), `getIndicadoresObra` por
`servicos.ordem` (`1900`) e `getVersionsDoProjeto` por `versions.createdAt`
(`2210`) — este último é `timestamp`, não `text`. A consulta inline do
`page.tsx` não tem `ORDER BY`.

Registro o que a ordenação por `text` faria onde ela existe: `"MM/DD/YYYY"` e
`"MM/YYYY"` ordenam lexicograficamente, então `"01/2026"` vem antes de
`"12/2025"`. Nenhuma dessas seis linhas, porém, alimenta um número do
Dashboard.

### 6g. Onde `totalReceb` e `totalPagar` são obtidos e filtrados

Os dois são calculados **na própria página**, fora de `versionSummary`, e
depois injetados nos summaries da versão Atual.

**`totalReceb`** (`page.tsx:135–140`):

```ts
const realReceb = (await getReceivables(ctx.tenant.id)).filter(
  (r) =>
    (isAll || r.projectId === project.id) &&
    (!hasRangeDash || dateInRange(r.dia, de, ate)),
);
const totalReceb = realReceb.reduce((a, r) => a + r.valor, 0);
```

| Etapa | Onde | Filtro |
|---|---|---|
| consulta | `getReceivables(tenantId)` | SQL: `units.tenantId` + `versions.kind = "atual"` |
| projeto | `page.tsx:137` | **memória** — `isAll \|\| r.projectId === project.id` |
| período | `page.tsx:138` | **memória** — `dateInRange(r.dia, de, ate)` sobre `"MM/DD/YYYY"` |
| soma | `page.tsx:140` | — |

**`totalPagar`** (`page.tsx:143–150`):

```ts
const contasPagarProj = (await getContasPagar(ctx.tenant.id)).filter(
  (c) =>
    (isAll || c.projectId === project.id) &&
    c.status !== "Pago" &&
    !!c.vencimento &&
    (!hasRangeDash || dateInRange(c.vencimento, de, ate)),
);
const totalPagar = contasPagarProj.reduce((a, c) => a + c.valor, 0);
```

| Etapa | Onde | Filtro |
|---|---|---|
| consulta | `getContasPagar(tenantId)` | SQL: `despesas.tenantId` + `cancelado = false` |
| projeto | `page.tsx:145` | **memória** |
| status | `page.tsx:146` | **memória** — `status !== "Pago"` |
| vencimento não nulo | `page.tsx:147` | **memória** |
| período | `page.tsx:148` | **memória** — `dateInRange(c.vencimento, …)` |
| soma | `page.tsx:150` | — |

Onde entram: `page.tsx:160–171`, no laço que percorre os summaries e só age
quando `s.version.kind === "atual"`. `totalReceb` também é distribuído por mês
em `recebByMonth` (`:153–159`) e somado ao comparativo mensal (`:163–167`).

**Nenhum dos dois é filtrado por versão.** `getReceivables` já restringe a
`kind = "atual"` no SQL; `getContasPagar` não restringe nada — traz despesas
de **todas** as versões do projeto, e o filtro seguinte é por projeto, não por
versão. O valor injetado em `s.aPagar` é o mesmo para qualquer versão Atual
selecionada.

### `src/app/(app)/dashboard/page.tsx` · linhas 128–171

O bloco inteiro: as duas consultas, os filtros em memória e a injeção nos summaries.

```tsx
  // ── Versão "Atual — caixa real": dados reais ────────────────────────────
  // Budget/Forecast permanecem estritamente em suas seções. A versão Atual
  // reflete o caixa real do período: (a) fechamentos já realizados (entradas
  // conciliadas), (b) recebíveis das unidades vendidas ainda não recebidos
  // (entradas projetadas) e (c) despesas lançadas ainda não pagas (saídas
  // projetadas / contas a pagar).
  const hasRangeDash = !!(de || ate);
  const realReceb = (await getReceivables(ctx.tenant.id)).filter(
    (r) =>
      (isAll || r.projectId === project.id) &&
      (!hasRangeDash || dateInRange(r.dia, de, ate)),
  );
  const totalReceb = realReceb.reduce((a, r) => a + r.valor, 0);

  // Contas a pagar (despesas não pagas) do projeto, com vencimento no período.
  const contasPagarProj = (await getContasPagar(ctx.tenant.id)).filter(
    (c) =>
      (isAll || c.projectId === project.id) &&
      c.status !== "Pago" &&
      !!c.vencimento &&
      (!hasRangeDash || dateInRange(c.vencimento, de, ate)),
  );
  const totalPagar = contasPagarProj.reduce((a, c) => a + c.valor, 0);

  // Recebíveis por mês (entradas projetadas) — compõem o comparativo do Atual.
  const recebByMonth: Record<string, number> = {};
  for (const r of realReceb) {
    const d = parseDate(r.dia);
    if (!d) continue;
    const key = `${String(d.mo).padStart(2, "0")}/${d.yr}`;
    recebByMonth[key] = (recebByMonth[key] || 0) + r.valor;
  }
  for (const s of summaries) {
    if (s.version.kind !== "atual") continue;
    // Comparativo mensal = entradas realizadas (fechamentos) + recebíveis projetados.
    const monthly: Record<string, number> = { ...s.realizadoMonthly };
    for (const [mm, v] of Object.entries(recebByMonth)) {
      monthly[mm] = (monthly[mm] || 0) + v;
    }
    s.monthly = monthly;
    s.receitaProj = s.realizado + totalReceb;
    s.aReceber = totalReceb; // recebíveis ainda não recebidos
    s.aPagar = totalPagar; // despesas ainda não pagas
  }
```


### 6h. Quais cartões passam por `razao` e quais calculam percentual direto

**Passam por `razao`** — os seis valores produzidos por `getStatusProjeto`
(`queries.ts:2180`, `2183`, `2186`, `2191`, `2192`), dos quais **quatro** são
exibidos como percentual e **dois** como valor por m²:

| Cartão | Chamada | Exibição |
|---|---|---|
| % recebido | `razao(recebido, receitaPrevista)` | `pct(st.pctRecebido * 100)` |
| % executado | `razao(executado, despesaPrevista)` | `pct(st.pctExecutado * 100)` |
| % margem de contribuição | `razao(margemContribuicao, receitaPrevista)` | `pct(st.pctMargem * 100)` |
| Custo por m² | `razao(executado, metragem)` | `brl0(st.custoPorM2)` |
| Receita por m² | `razao(receitaAtual, metragem)` | `brl0(st.receitaPorM2)` |

**Calculam a razão diretamente, sem o helper** — `razao` é local a
`getStatusProjeto` e não é visível para as outras funções:

| Cartão | Expressão | Guarda própria | Onde |
|---|---|---|---|
| BDI (cartão) | vem de `project.pct_bdi`, **não é razão** | — | `medicao-bdi.ts:73` |
| BDI (consolidado) | `custoTotalServicos > 0 ? (valorBdi / custoTotalServicos) * 100 : 0` | **sim** | `queries.ts:2027` |
| hint "% do financiado" (Liberação acumulada) | `totalFinanciado > 0 ? acumulado / totalFinanciado : 0` | **sim** | `medicao-bdi.ts:206` |
| hint "% do financiado" (consolidado) | `totalAquisicao > 0 ? liberacaoAcumulada / totalAquisicao : 0` | **sim** | `queries.ts:2042` |
| Evolução acumulada/do mês (consolidado) | `ponderada(…)`, com `if (base > 0)` e fallback de média simples | **sim** | `queries.ts:2008–2016` |
| Incidência (usada em "Serviços fora dos limites") | `total > 0 ? ((custoProposto) / total) * 100 : 0` | **sim** | `medicao-bdi.ts:42` |

**Não são razão nenhuma** — os 4 KPIs do topo, e os cartões monetários dos
dois painéis (Recebido, Executado, Margem de contribuição, os quatro de
financiamento, Custo total dos serviços, Valor do BDI, Custo com BDI,
Liberação do mês e acumulada, Custo estimado, Geração de caixa, Custo
referencial) e o contador "Serviços fora dos limites".

Contagem: **5 cartões** passam por `razao`; **1 cartão** (BDI) exibe um
percentual que vem direto do cadastro, sem divisão; os demais percentuais do
consolidado e os *hints* fazem a razão inline, cada um com seu próprio guard.

### `src/lib/queries.ts` · linhas 2166–2194

O `razao` e seus cinco usos.

```ts

  // Definição de negócio confirmada pelo cliente:
  // Margem de Contribuição = Receita − Custo Variável − Despesa Variável.
  const margemContribuicao = receitaAtual - custoVariavel - despesaVariavel;
  const razao = (n: number, d: number) => (d > 0 ? n / d : 0);

  // Metragem total dos projetos selecionados (cadastro do projeto).
  const metragem = projs
    .filter((p) => projectIds.includes(p.id))
    .reduce((a, p) => a + num(p.metragem), 0);

  return {
    receitaPrevista,
    recebido,
    pctRecebido: razao(recebido, receitaPrevista),
    despesaPrevista,
    executado,
    pctExecutado: razao(executado, despesaPrevista),
    margemContribuicao,
    // %MC = MC ÷ Receita Total do Projeto (cadastro).
    pctMargem: razao(margemContribuicao, receitaPrevista),
    receitaAtual,
    custoVariavel,
    despesaVariavel,
    metragem,
    custoPorM2: razao(executado, metragem),
    receitaPorM2: razao(receitaAtual, metragem),
  };
}
```

### `src/components/app/indicadores-obra.tsx` · linhas 174–252

`StatusProjetoPanel` — onde os cinco são exibidos.

```tsx
export function StatusProjetoPanel({ st }: { st: StatusProjeto }) {
  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Status atual
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Recebido"
            value={brl0(st.recebido)}
            hint={`de ${brl0(st.receitaPrevista)} previstos`}
          />
          <KPI
            label="% recebido"
            value={st.receitaPrevista > 0 ? pct(st.pctRecebido * 100) : "—"}
            hint="sobre a receita do cadastro"
            tone={st.receitaPrevista > 0 ? "good" : "muted"}
          />
          <KPI
            label="Executado"
            value={brl0(st.executado)}
            hint={`de ${brl0(st.despesaPrevista)} no Budget`}
          />
          <KPI
            label="% executado"
            value={st.despesaPrevista > 0 ? pct(st.pctExecutado * 100) : "—"}
            hint="sobre a despesa planejada"
            tone={
              st.despesaPrevista === 0
                ? "muted"
                : st.pctExecutado > 1
                  ? "warn"
                  : "normal"
            }
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Margem e produtividade
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Margem de contribuição"
            value={brl0(st.margemContribuicao)}
            hint="receita − custo var. − despesa var."
            tone={st.margemContribuicao >= 0 ? "good" : "warn"}
          />
          <KPI
            label="% margem de contribuição"
            value={st.receitaPrevista > 0 ? pct(st.pctMargem * 100) : "—"}
            hint="sobre a receita total do projeto"
            tone={
              st.receitaPrevista === 0
                ? "muted"
                : st.pctMargem >= 0
                  ? "good"
                  : "warn"
            }
          />
          <KPI
            label="Custo por m²"
            value={st.metragem > 0 ? brl0(st.custoPorM2) : "—"}
            hint={st.metragem > 0 ? `${st.metragem} m²` : "informe a metragem"}
            tone={st.metragem > 0 ? "normal" : "muted"}
          />
          <KPI
            label="Receita por m²"
            value={st.metragem > 0 ? brl0(st.receitaPorM2) : "—"}
            hint={st.metragem > 0 ? `${st.metragem} m²` : "informe a metragem"}
            tone={st.metragem > 0 ? "normal" : "muted"}
          />
        </div>
      </div>
    </div>
  );
}
```

---

# APÊNDICE — leituras de base, helpers e tipos

Segunda rodada da coleta, em `main` (commit `45f4ce3`). Sem resumo, sem
análise.

---

## A1. As cinco leituras de base

### `src/lib/queries.ts` · linhas 85–91

`getUnits` — filtra só por `version_id`.

```ts
export async function getUnits(versionId: string): Promise<UnitRow[]> {
  return db
    .select()
    .from(schema.units)
    .where(eq(schema.units.versionId, versionId))
    .orderBy(asc(schema.units.code));
}
```

### `src/lib/queries.ts` · linhas 134–141

`getReembolsos` — filtra só por `version_id`. Ver A6b.

```ts
export async function getReembolsos(
  versionId: string,
): Promise<ReembolsoRow[]> {
  return db
    .select()
    .from(schema.reembolsos)
    .where(eq(schema.reembolsos.versionId, versionId));
}
```

### `src/lib/queries.ts` · linhas 944–952

`getVersionKind` — a consulta que decide o ramo de `getMonthlyRevenue`.

```ts
/** kind da versão (para decidir entre lançamento detalhado × simplificado). */
export async function getVersionKind(versionId: string): Promise<string | null> {
  const [v] = await db
    .select({ kind: schema.versions.kind })
    .from(schema.versions)
    .where(eq(schema.versions.id, versionId))
    .limit(1);
  return v?.kind ?? null;
}
```

### `src/lib/queries.ts` · linhas 2197–2211

`getVersionsDoProjeto`.

```ts
export async function getVersionsDoProjeto(
  tenantId: string,
  projectId: string,
): Promise<(typeof schema.versions.$inferSelect)[]> {
  return db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.tenantId, tenantId),
        eq(schema.versions.projectId, projectId),
      ),
    )
    .orderBy(asc(schema.versions.createdAt));
}
```

### `src/lib/context.ts` · linhas 42–108

`getActiveContext` — monta tenant, projeto, versão ativa, projetos, versões e permissões.

```ts
export async function getActiveContext(): Promise<ActiveContext | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const ck = await cookies();

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) return null;

  // Vínculos do usuário (multi-tenant); por ora usa o primeiro tenant.
  const memberships = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id))
    .orderBy(asc(schema.memberships.createdAt));
  if (memberships.length === 0) return null;
  const membership = memberships[0];

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, membership.tenantId))
    .limit(1);
  if (!tenant) return null;

  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.tenantId, tenant.id))
    .orderBy(asc(schema.projects.createdAt));
  if (projects.length === 0) return null;

  const wantedProject = ck.get(ACTIVE_PROJECT_COOKIE)?.value;
  const project = projects.find((p) => p.id === wantedProject) ?? projects[0];

  const versions = await db
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.projectId, project.id))
    .orderBy(asc(schema.versions.createdAt));

  // A versão de trabalho é sempre a "Atual" (não é mais selecionável na
  // sidebar). Budget e Forecast existem apenas nas telas dedicadas de
  // lançamento e na comparação dos relatórios.
  const version =
    versions.find((v) => v.kind === "atual") ??
    versions.find((v) => v.isDefault) ??
    versions[0];

  const role = membership.role as Role;
  return {
    tenant,
    projects,
    project,
    versions,
    version,
    userId: user.id,
    userEmail: user.email,
    role,
    perms: effectivePermissions(role, membership.permissions ?? null),
  };
}
```

---

## A2. `reembToCalc` e `toCalcUnit`

### `src/lib/queries.ts` · linhas 159–163

`reembToCalc` — conversão de três linhas, sem filtro.

```ts
// helpers de conversão para agregados

export function reembToCalc(rows: ReembolsoRow[]): CalcReembolso[] {
  return rows.map((r) => ({ data: r.data ?? "", valor: Number(r.valor ?? 0) }));
}
```

### `src/lib/queries.ts` · linhas 34–61

`toCalcUnit` — mescla o plano salvo sobre um plano padrão COMPLETO. Ver A6c.

```ts
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
```

---

## A3. De `src/lib/utils.ts`


`dateInRange` e `monthInRange` dependem de dois helpers do mesmo arquivo,
`ymd` e `ym`, que incluo junto — são eles que definem a forma da comparação
(ver A6a).

### `src/lib/utils.ts` · linhas 91–114

`ymd` e `ym` — as duas conversões para inteiro comparável.

```ts
/** "MM/DD/YYYY" → número YYYYMMDD (comparável); null se inválido. */
export function ymd(s: string | null | undefined): number | null {
  if (!s) return null;
  const p = s.trim().split("/");
  if (p.length !== 3) return null;
  const [mo, d, y] = p.map(Number);
  if (!y || !mo || !d) return null;
  return y * 10000 + mo * 100 + d;
}

/** "MM/YYYY" → número YYYYMM (comparável); null se inválido. */
export function ym(s: string | null | undefined): number | null {
  if (!s) return null;
  const p = s.trim().split("/");
  if (p.length === 2) {
    const [mo, y] = p.map(Number);
    return y && mo ? y * 100 + mo : null;
  }
  if (p.length === 3) {
    const [mo, , y] = p.map(Number);
    return y && mo ? y * 100 + mo : null;
  }
  return null;
}
```

### `src/lib/utils.ts` · linhas 116–142

`dateInRange` e `monthInRange`.

```ts
/** Verdadeiro se a DATA "MM/DD/YYYY" está no intervalo [de, ate] (inclusive). */
export function dateInRange(
  data: string | null | undefined,
  de: string,
  ate: string,
): boolean {
  const v = ymd(data);
  const lo = ymd(de);
  const hi = ymd(ate);
  if (lo != null && (v == null || v < lo)) return false;
  if (hi != null && (v == null || v > hi)) return false;
  return true;
}

/** Verdadeiro se o MÊS "MM/YYYY" está no intervalo [de, ate] (por competência). */
export function monthInRange(
  mes: string | null | undefined,
  de: string,
  ate: string,
): boolean {
  const v = ym(mes);
  const lo = ym(de);
  const hi = ym(ate);
  if (lo != null && (v == null || v < lo)) return false;
  if (hi != null && (v == null || v > hi)) return false;
  return true;
}
```

### `src/lib/utils.ts` · linhas 27–34

`brl0`.

```ts
/** BRL sem casas decimais (ex.: R$ 1.235). */
export function brl0(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(clampZero(value, 0));
}
```

### `src/lib/utils.ts` · linhas 42–57

`brlk`, com o comentário sobre hydration mismatch.

```ts
/**
 * BRL compacto em milhares/milhões (ex.: R$ 46,8 mi). Implementação
 * determinística (sem Intl compact) para evitar divergência de formatação
 * entre servidor (Node/ICU) e navegador — que causava hydration mismatch
 * (ex.: "R$ 0,0" vs "R$ 0").
 */
export function brlk(value: number): string {
  const v = clampZero(value, 0);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const fix1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
  if (abs >= 1e9) return `${sign}R$ ${fix1(abs / 1e9)} bi`;
  if (abs >= 1e6) return `${sign}R$ ${fix1(abs / 1e6)} mi`;
  if (abs >= 1e3) return `${sign}R$ ${fix1(abs / 1e3)} mil`;
  return `${sign}R$ ${Math.round(abs)}`;
}
```

---

## A4. De `src/lib/calc/`

### `src/lib/calc/projection.ts` · linhas 11–43

`ParsedDate`, `parseDate`, `monthKey`, `addMonths` e a constante `INCC_FROM_INSTALLMENT`.

```ts
// ─────────────────────────── helpers de data ────────────────────────────

interface ParsedDate {
  mo: number;
  d: number;
  yr: number;
}

/** Parse de "MM/DD/YYYY" → {mo,d,yr} (null se vazio/ inválido). */
export function parseDate(s: string | null | undefined): ParsedDate | null {
  if (!s || !s.trim()) return null;
  const p = s.split("/");
  if (p.length < 3) return null;
  return { mo: parseInt(p[0], 10), d: parseInt(p[1], 10), yr: parseInt(p[2], 10) };
}

/** Chave de mês "MM/YYYY". */
export function monthKey(mo: number, yr: number): string {
  return String(mo).padStart(2, "0") + "/" + yr;
}

/** Avança `n` meses a partir de (mo, yr), normalizando o ano. */
export function addMonths(mo: number, yr: number, n: number): ParsedDate {
  let m = mo + n;
  let y = yr;
  while (m > 12) {
    m -= 12;
    y++;
  }
  return { mo: m, d: 1, yr: y };
}

const INCC_FROM_INSTALLMENT = 4; // correção a partir da 5ª parcela (i >= 4)
```

### `src/lib/calc/incc.ts` · linhas 1–43

`recalcIncc`, `getIncc` e `projectIncc` — o arquivo de INCC.

```ts
import type { InccRow } from "./types";

/**
 * Recalcula o acumulado encadeado a partir das variações mensais (`mo`).
 * Espelha `recalcINCC()` do protótipo: o primeiro mês usa a própria variação;
 * os seguintes compõem `(1+ac/100)*(1+mo/100)`. Retorna uma NOVA lista
 * (função pura) — não muta a entrada.
 */
export function recalcIncc(rows: readonly InccRow[]): InccRow[] {
  let acc = 0;
  return rows.map((row, i) => {
    acc =
      i === 0
        ? row.mo
        : Math.round(((1 + acc / 100) * (1 + row.mo / 100) * 100 - 100) * 1000) /
          1000;
    return { ...row, ac: acc };
  });
}

/** Retorna o acumulado de um mês ("MM/YYYY"), ou 0 se ausente. */
export function getIncc(rows: readonly InccRow[], month: string): number {
  const row = rows.find((r) => r.m === month);
  return row ? row.ac : 0;
}

/**
 * Preenche as variações mensais dos meses projetados (`projected === true`) com
 * a média móvel das últimas 12 variações (oficiais ou já projetadas), na ordem
 * cronológica. Meses oficiais (índice real) nunca são alterados. Depois
 * recalcula o acumulado encadeado de toda a série. Função pura.
 */
export function projectIncc(rows: readonly InccRow[]): InccRow[] {
  const out: InccRow[] = rows.map((r) => ({ ...r }));
  for (let i = 0; i < out.length; i++) {
    if (!out[i].projected) continue;
    const window = out.slice(Math.max(0, i - 12), i);
    if (window.length === 0) continue; // sem histórico → mantém valor atual
    const avg = window.reduce((a, r) => a + r.mo, 0) / window.length;
    out[i].mo = Math.round(avg * 1000) / 1000;
  }
  return recalcIncc(out);
}
```

### `src/lib/calc/carencia.ts` · linhas 74–93

`serieVencimentos`.

```ts
/**
 * Série de vencimentos mensais (ou de passo `passoMeses`) a partir da data-base.
 *
 * `qtd` parcelas, todas com o mesmo dia de vencimento, ajustado ao fim de mês.
 */
export function serieVencimentos(
  dataBase: string,
  qtd: number,
  passoMeses = 1,
  diaVencimento?: number,
): string[] {
  const base = parseDataInterna(dataBase);
  if (!base || qtd <= 0) return [];
  const dia = diaVencimento ?? base.d;
  const out: string[] = [];
  for (let i = 0; i < qtd; i++) {
    out.push(formatDataInterna(avancaMeses(base, i * passoMeses, dia)));
  }
  return out;
}
```

---

## A5. `PROJECTION_SOURCES` e o tipo `PaymentPlan`

### `src/lib/calc/projection.ts` · linhas 144–154

`PROJECTION_SOURCES` e o tipo derivado `ProjectionSource`.

```ts
/** Fontes de receita usadas no consolidado (quebra da projeção por tipo). */
export const PROJECTION_SOURCES = [
  "AS/Sinais",
  "Mensais",
  "Semestrais",
  "Anuais",
  "FGTS",
  "Subsídio",
  "Permuta",
] as const;
export type ProjectionSource = (typeof PROJECTION_SOURCES)[number];
```

### `src/lib/calc/types.ts` · linhas 21–77

As fontes, `PaymentPlan` e `CalcUnit`.

```ts
/** Fontes periódicas (mensais/semestrais/anuais): corrigidas por INCC. */
export interface PeriodicSource {
  val: number;
  venc: string;
  n: number;
}

export interface FgtsSource {
  val: number;
  dataPrev: string;
}

export interface SubsidioSource {
  val: number;
  dataPrev: string;
  statusSub: SubsidioStatus;
}

export interface PermutaSource {
  desc: string;
  val: number;
  dataPrev: string;
}

export interface BancoSource {
  valFinanc: number;
  dataEntrada: string;
  dataPrimParc: string;
  statusFinanc: string;
}

/**
 * Cascata de fontes de recebimento de uma unidade. Cada flag `usar*` ativa a
 * próxima fonte na cascata (ver docs/SPEC.md §5).
 */
export interface PaymentPlan {
  usarAS: boolean;
  AS: SignalSource & { usarS1: boolean };
  S1: SignalSource & { usarS2: boolean };
  S2: SignalSource & { usarS3: boolean };
  S3: SignalSource & { usarMens: boolean };
  Mensais: PeriodicSource & { usarSem: boolean };
  Semestrais: PeriodicSource & { usarAnu: boolean };
  Anuais: PeriodicSource & { usarFGTS: boolean };
  FGTS: FgtsSource & { usarSub: boolean };
  Subsidio: SubsidioSource & { usarPer: boolean };
  Permuta: PermutaSource & { usarFinanc: boolean };
  Banco: BancoSource;
}

/** Unidade com plano de pagamento, na forma consumida pelos cálculos. */
export interface CalcUnit extends PaymentPlan {
  code: string;
  status: UnitStatus;
  /** VGV da unidade. */
  valor: number;
}
```

### `src/lib/db/schema.ts` · linhas 424–427

A coluna que guarda o plano: `jsonb` com `$type<PaymentPlan>()` — tipagem só em TypeScript, sem validação no banco.

```ts
  /** "MM/DD/YYYY" como no protótipo. */
  mesVenda: text("mes_venda"),
  paymentPlan: jsonb("payment_plan").$type<PaymentPlan>(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
```

---

## A6. As perguntas


### A6a. Como `dateInRange` e `monthInRange` comparam?

**Nem string, nem `Date`: comparam INTEIROS**, construídos componente a
componente e depois comparados como número.

| Helper | Entrada | Conversão | Saída |
|---|---|---|---|
| `ymd` (`utils.ts:92`) | `"MM/DD/YYYY"` | `y * 10000 + mo * 100 + d` | inteiro `YYYYMMDD` |
| `ym` (`utils.ts:102`) | `"MM/YYYY"` **ou** `"MM/DD/YYYY"` | `y * 100 + mo` | inteiro `YYYYMM` |

As duas funções de intervalo são idênticas em forma
(`utils.ts:117–128` e `:131–142`):

```ts
const v = ymd(data); const lo = ymd(de); const hi = ymd(ate);
if (lo != null && (v == null || v < lo)) return false;
if (hi != null && (v == null || v > hi)) return false;
return true;
```

Características que saem direto desse código:

- **Intervalo aberto dos dois lados.** Limite ausente (`""`) vira `null` e a
  checagem correspondente é pulada — `de` vazio significa "sem início".
- **Inclusivo:** usa `<` e `>`, não `<=`/`>=`, então a própria data-limite
  passa.
- **Data inválida com limite presente é EXCLUÍDA**; sem limite nenhum, é
  **incluída** (as duas condições são puladas e a função devolve `true`).
- **`ymd` exige exatamente 3 partes**; `ym` aceita 2 **ou** 3 — ou seja,
  `monthInRange` aceita receber uma data completa e usa só mês e ano.
- **Não há validação de calendário.** `"02/31/2026"` vira `20260231` e
  compara normalmente; `"13/01/2026"` vira `20260113`, fora de ordem em
  relação ao que a string sugere.

**Sobre "são o único recorte de período de toda a tela":** confirma-se para as
consultas — não há `BETWEEN`, `gte` ou `lte` em nenhuma delas (item 6f do
corpo principal). Os pontos de uso no Dashboard são quatro:

| Arquivo:linha | Chamada | Sobre o quê |
|---|---|---|
| `dashboard/page.tsx:58` | `monthInRange(mm, de, ate)` | chaves `"MM/YYYY"` de `getMonthlyRevenue` |
| `dashboard/page.tsx:64` | `dateInRange(c.data, de, ate)` | `cash_entry.data` |
| `dashboard/page.tsx:138` | `dateInRange(r.dia, de, ate)` | dia do recebível |
| `dashboard/page.tsx:148` | `dateInRange(c.vencimento, de, ate)` | `despesa.vencimento` |

Com a ressalva já registrada: **`getStatusProjeto` e `getIndicadoresObra` não
recebem `de`/`ate`** — os 24 cartões dos dois painéis inferiores ficam fora de
qualquer recorte de período.

### A6b. `getReembolsos` filtra status?

**Não. Traz todos os lançamentos da versão.**

```ts
export async function getReembolsos(
  versionId: string,
): Promise<ReembolsoRow[]> {
  return db
    .select()
    .from(schema.reembolsos)
    .where(eq(schema.reembolsos.versionId, versionId));
}
```

(`queries.ts:134–141`.) O `where` tem uma condição só — `version_id`. Não há
filtro de status, de cancelamento, de data nem de tenant. Também não há
`ORDER BY` nem `LIMIT`.

Nem o consumidor filtra: `reembToCalc` (`queries.ts:161–163`) é um `map` de
três linhas que só extrai `data` e `valor` — **descarta todos os demais
campos da linha**, inclusive qualquer status que exista na tabela. Depois,
`reembursementsByMonth` agrega por mês sem condição.

Ou seja: **todo reembolso lançado na versão entra na receita projetada**,
qualquer que seja seu estado.

### `src/lib/queries.ts` · linhas 134–141

A consulta, repetida aqui para referência.

```ts
export async function getReembolsos(
  versionId: string,
): Promise<ReembolsoRow[]> {
  return db
    .select()
    .from(schema.reembolsos)
    .where(eq(schema.reembolsos.versionId, versionId));
}
```

### `src/lib/queries.ts` · linhas 159–163

`reembToCalc` — o que sobrevive da linha.

```ts
// helpers de conversão para agregados

export function reembToCalc(rows: ReembolsoRow[]): CalcReembolso[] {
  return rows.map((r) => ({ data: r.data ?? "", valor: Number(r.valor ?? 0) }));
}
```


### A6c. `PaymentPlan` declara as flags `usar*` como obrigatórias?

**Sim, todas as onze são `boolean` obrigatório** — nenhuma tem `?`:

| Campo | Flag que ele carrega |
|---|---|
| `usarAS` (raiz) | `boolean` |
| `AS` | `& { usarS1: boolean }` |
| `S1` | `& { usarS2: boolean }` |
| `S2` | `& { usarS3: boolean }` |
| `S3` | `& { usarMens: boolean }` |
| `Mensais` | `& { usarSem: boolean }` |
| `Semestrais` | `& { usarAnu: boolean }` |
| `Anuais` | `& { usarFGTS: boolean }` |
| `FGTS` | `& { usarSub: boolean }` |
| `Subsidio` | `& { usarPer: boolean }` |
| `Permuta` | `& { usarFinanc: boolean }` |

(`types.ts:56–69`.) As onze seções também são obrigatórias, e `CalcUnit`
estende `PaymentPlan` inteiro (`types.ts:72`).

**Por que `expandUnitReceivables` lê como `Record<string, unknown>`?** O
próprio código responde, no comentário das linhas 26–27 de
`calc/receivables.ts`:

> *"Planos antigos/parciais podem não conter todas as seções — leia de forma
> tolerante (seção ausente = campos vazios/zero) para nunca quebrar o
> cálculo."*

O mecanismo é a linha 28:

```ts
const p = plan as unknown as Record<string, unknown>;
const sec = (k: string) => (p[k] ?? {}) as Record<string, unknown>;
```

A razão estrutural está no schema: `payment_plan` é
`jsonb("payment_plan").$type<PaymentPlan>()` (`schema.ts:426`). O `$type` do
Drizzle é **asserção em tempo de compilação** — o Postgres aceita qualquer
JSON, e nada valida o formato na escrita. Um registro gravado antes de a
seção existir continua no banco sem ela; ler pelo tipo faria `plan.S2.venc`
estourar em runtime com `Cannot read properties of undefined`.

Dois fatos adicionais que fecham a pergunta:

- **`expandUnitReceivables` não lê nenhuma flag `usar*`.** Busca por `usar` no
  arquivo devolve **zero** ocorrências. Ela lê apenas `venc`, `val`, `n`,
  `dataPrev`, `dataPrimParc` e `valFinanc`, e decide pelo valor
  (`if (!d || val <= 0) continue`, linhas 46 e 73). O comentário de
  `getMonthlyRevenue` registra isso como escolha: *"leitura tolerante do
  plano, sem depender das flags usar*"* (`queries.ts:1139–1140`).
- **A defesa tem duas camadas.** `toCalcUnit` (`queries.ts:35–61`) já faz a
  mesma proteção por outro caminho: mescla o plano salvo sobre um plano padrão
  COMPLETO, seção a seção, para que campos ausentes virem defaults. As duas
  convivem — `toCalcUnit` serve `calcProjection`, e a leitura tolerante serve
  `expandUnitReceivables`.

### `src/lib/calc/receivables.ts` · linhas 12–32

O comentário e o cast que respondem a pergunta.

```ts
/**
 * Expande o plano de pagamento de uma unidade vendida em recebíveis datados
 * (uma linha por vencimento). Base do painel "Receitas a Receber do Dia".
 * Só gera recebíveis para unidades com status "Vendido".
 */
export function expandUnitReceivables(
  plan: PaymentPlan | null | undefined,
  status: UnitStatus,
): Receivable[] {
  if (status !== "Vendido" || !plan) return [];
  const out: Receivable[] = [];
  const fmt = (mo: number, d: number, yr: number) =>
    `${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}/${yr}`;

  // Planos antigos/parciais podem não conter todas as seções — leia de forma
  // tolerante (seção ausente = campos vazios/zero) para nunca quebrar o cálculo.
  const p = plan as unknown as Record<string, unknown>;
  const sec = (k: string) => (p[k] ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => Number(v) || 0;
```

### `src/lib/queries.ts` · linhas 1138–1149

O comentário de `getMonthlyRevenue` sobre não depender das flags.

```ts
  // Receita da versão Atual = recebíveis das vendas (MESMA fonte da tela Contas
  // a Receber: expandUnitReceivables — leitura tolerante do plano, sem depender
  // das flags usar*). Assim DRE e Fluxo batem com os recebíveis exibidos.
  // Agrega por mês do vencimento ("MM/DD/YYYY" → "MM/YYYY").
  for (const r of unitRows) {
    for (const rec of expandUnitReceivables(r.paymentPlan, r.status)) {
      const p = rec.dia.split("/");
      if (p.length !== 3) continue;
      const mk = `${p[0]}/${p[2]}`;
      out[mk] = (out[mk] || 0) + rec.valor;
    }
  }
```


### A6d. `INCC_FROM_INSTALLMENT` — a partir de qual parcela, e por quê?

**Vale a partir da 5ª parcela.** A constante é `4` e o teste é `i >= 4`, com
`i` começando em zero — logo `i = 4` é a quinta.

```ts
const INCC_FROM_INSTALLMENT = 4; // correção a partir da 5ª parcela (i >= 4)
```

Usos (`projection.ts:66` e `:180`):

```ts
val * (1 + (i >= INCC_FROM_INSTALLMENT ? getIncc(incc, mk) : 0) / 100) * …
```

Nas quatro primeiras parcelas o fator é `1 + 0/100 = 1` — valor nominal.
Da quinta em diante aplica o **acumulado** do mês (`getIncc` devolve `row.ac`,
`incc.ts:22–25`), não a variação mensal; mês sem linha na tabela devolve `0`,
isto é, sem correção.

**O porquê é regra de negócio, documentada em `docs/SPEC.md`:**

| Linha | Texto |
|---|---|
| `SPEC.md:29` | *"**INCC** — Índice Nacional de Custo da Construção — corrige parcelas a partir da 5ª (ver §6)."* |
| `SPEC.md:182` | *"**Regra de negócio:** parcelas mensais/semestrais/anuais são corrigidas pelo INCC **a partir da 5ª parcela** (`i >= 4`)."* |
| `SPEC.md:201` | *"Correção INCC aplicada a partir da 5ª parcela."* |

O código não justifica a escolha além do comentário de uma linha; a
justificativa documental é a SPEC, que a trata como regra do contrato, não
como derivação de cálculo.

**A constante é declarada duas vezes, em arquivos diferentes, e nenhuma é
exportada:**

| Arquivo:linha | Declaração | Usada em |
|---|---|---|
| `calc/projection.ts:43` | `const INCC_FROM_INSTALLMENT = 4;` | `calcProjection` (`:66`) e `calcProjectionBySource` (`:180`) |
| `calc/simulator.ts:55` | `const INCC_FROM_INSTALLMENT = 4;` | `:102` |

São duas cópias do mesmo número, sem `export` e sem import entre elas — mudar
uma não muda a outra. E as duas aplicam o INCC de forma diferente:
`projection.ts` usa `getIncc(incc, mk)` (acumulado do mês da parcela);
`simulator.ts` usa `inccAc`, um acumulado próprio do simulador.

### `src/lib/calc/projection.ts` · linhas 42–70

A constante e o primeiro uso, em `calcProjection`.

```ts

const INCC_FROM_INSTALLMENT = 4; // correção a partir da 5ª parcela (i >= 4)

// ───────────────────────────── projeção ─────────────────────────────────

/**
 * Projeta os recebíveis de uma unidade vendida mês a mês (matriz "MM/YYYY" →
 * valor). Espelha `calcProj()` do protótipo: percorre a cascata de fontes,
 * cada uma liberada pela flag da anterior, aplicando INCC nas fontes
 * periódicas a partir da 5ª parcela. Retorna {} se a unidade não estiver
 * vendida.
 */
export function calcProjection(
  u: CalcUnit,
  incc: readonly InccRow[] = [],
): MonthlyProjection {
  const proj: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) proj[mm] = (proj[mm] || 0) + v;
  };
  if (u.status !== "Vendido") return proj;

  const periodic = (val: number, i: number, mk: string) =>
    Math.round(
      val * (1 + (i >= INCC_FROM_INSTALLMENT ? getIncc(incc, mk) : 0) / 100) *
        100,
    ) / 100;

  if (u.usarAS && u.AS.val > 0) {
```

### `src/lib/calc/projection.ts` · linhas 176–184

O segundo uso, em `calcProjectionBySource`.

```ts
    if (v > 0) out[key][mm] = (out[key][mm] || 0) + v;
  };
  const periodic = (val: number, i: number, mk: string) =>
    Math.round(
      val * (1 + (i >= INCC_FROM_INSTALLMENT ? getIncc(incc, mk) : 0) / 100) * 100,
    ) / 100;

  const signals: { use: boolean; val: number; venc: string; n: number }[] = [
    { use: u.usarAS, val: u.AS.val, venc: u.AS.venc, n: u.AS.n },
```

### `src/lib/calc/simulator.ts` · linhas 53–57

A segunda declaração, em `calc/simulator.ts`.

```ts
const MESES_FLUXO = 36; // evolução de obra linear em 36 meses
const TAXA_MENSAL = 0.01; // 1% a.m.
const INCC_FROM_INSTALLMENT = 4; // a partir da 5ª parcela

/**
```

### `src/lib/calc/simulator.ts` · linhas 98–106

O uso no simulador — acumulado próprio, não `getIncc`.

```ts
    const evolucao = Math.min(100, (i + 1) * (100 / MESES_FLUXO));

    const parcBase = parcMensal;
    const parcComIncc =
      i >= INCC_FROM_INSTALLMENT ? parcBase * (1 + inccAc / 100) : parcBase;

    let parcSAC = 0;
    let parcPRICE = 0;
    if (tipo === "SAC") {
```

### `src/lib/calc/incc.ts` · linhas 21–25

`getIncc` — devolve o ACUMULADO, ou 0 quando o mês não está na tabela.

```ts
/** Retorna o acumulado de um mês ("MM/YYYY"), ou 0 se ausente. */
export function getIncc(rows: readonly InccRow[], month: string): number {
  const row = rows.find((r) => r.m === month);
  return row ? row.ac : 0;
}
```
