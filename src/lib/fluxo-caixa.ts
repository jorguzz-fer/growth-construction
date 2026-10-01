import {
  getDespesas,
  getExpenseRows,
  getMonthlyRevenue,
  getParcelasByVersion,
  getPermutas,
  getCash,
  getInccRows,
  getVersionsDoProjeto,
  permToResale,
} from "@/lib/queries";
import { eixoDoFluxo, linhasDoFluxo, mesCorrente, partidaDaObra, type Mapas } from "@/lib/fluxo-tela";
import type { LadoDoCenario } from "@/lib/fluxo-analise";
import { ROTULO_CENARIO, resolverCenario } from "@/lib/dre";
import { permutaCashByMonth } from "@/lib/calc";
import { isBudgetVersion } from "@/lib/budget/config";
import { getRestituicoesPendentesByVersion } from "@/lib/actions/restituicoes";
import type { Version } from "@/lib/context";
// `vencMonth` vive em módulo puro para poder ser testada sem puxar banco/sessão.
import { vencMonth } from "@/lib/calc/mes-caixa";

export { vencMonth };

/**
 * Montagem do Fluxo de Caixa mensal.
 *
 * Extraído da página para poder ser VERIFICADO de forma automatizada — é a
 * função que decide o que entra e o que sai em cada mês, por versão.
 *
 * Regras:
 *  - cada versão traz o que foi lançado NELA;
 *  - Budget/Forecast → planejamento (budget_line), por competência;
 *  - Atual → parcelas e despesas lançadas, pelo mês do VENCIMENTO;
 *  - despesas canceladas não geram saída;
 *  - despesas pagas por terceiro não geram saída na competência (a saída
 *    ocorre na restituição).
 */


/** Mapas de entradas e saídas mensais de uma versão (budget-aware). */
export async function flowMaps(
  version: Version,
  projectId: string,
  /**
   * Prompt AD — chave "fluxo_definicao_nova" (nasce desligada). Ligada, a
   * permuta (fato) NÃO entra na coluna de planejamento (1.2): Orçamento e
   * Previsão ficam só com `budget_line`. Desligada: exatamente o de antes.
   */
  opts: { definicaoNova?: boolean } = {},
): Promise<{ entradas: Record<string, number>; saidas: Record<string, number> }> {
  const [entradas, despesas, permutas, parcelas] = await Promise.all([
    getMonthlyRevenue(version.id, projectId),
    getDespesas(version.id),
    getPermutas(version.tenantId, version.id),
    getParcelasByVersion(version.id),
  ]);

  // Recebimentos da revenda de bens recebidos em permuta (item 10).
  if (!(opts.definicaoNova && isBudgetVersion(version.kind))) {
    const permCash = permutaCashByMonth(permToResale(permutas));
    for (const [mm, v] of Object.entries(permCash)) {
      entradas[mm] = (entradas[mm] || 0) + v;
    }
  }

  const saidas: Record<string, number> = {};
  if (isBudgetVersion(version.kind)) {
    // Budget/Forecast: saídas do lançamento simplificado (por competência).
    const expenses = await getExpenseRows(version.id);
    for (const e of expenses) {
      const mm = vencMonth(e.competencia);
      if (mm) saidas[mm] = (saidas[mm] || 0) + e.valor;
    }
  } else {
    // Versão detalhada: despesas pagas por terceiro NÃO geram saída na
    // competência — a saída ocorre só na restituição (Fase 4).
    const { despesaIds: terceiroIds, saidasPrevistas: restPrevistas } =
      await getRestituicoesPendentesByVersion(version.id);
    const excluir = new Set(terceiroIds);
    const comParcela = new Set(parcelas.map((p) => p.despesaId));
    // Despesas CANCELADAS não geram saída. Antes só as parcelas canceladas eram
    // puladas, então uma despesa cancelada seguia inflando o fluxo — enquanto
    // sumia de Contas a Pagar, que filtra cancelado.
    const canceladas = new Set(despesas.filter((d) => d.cancelado).map((d) => d.id));
    for (const p of parcelas) {
      if (
        p.status === "Cancelado" ||
        excluir.has(p.despesaId) ||
        canceladas.has(p.despesaId)
      )
        continue;
      const mm = vencMonth(p.vencimento);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(p.valorOriginal);
    }
    for (const d of despesas) {
      if (comParcela.has(d.id) || excluir.has(d.id) || d.cancelado) continue;
      const mm = vencMonth(d.vencimento) ?? vencMonth(d.competencia);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(d.valor);
    }
    for (const [mm, v] of Object.entries(restPrevistas)) {
      saidas[mm] = (saidas[mm] || 0) + v;
    }
  }
  return { entradas, saidas };
}


/**
 * Fluxo REALIZADO — RG-01.
 *
 * O `flowMaps` acima monta o fluxo PREVISTO: ele projeta pelo VENCIMENTO das
 * parcelas e das despesas, ou seja, mostra o que se espera pagar e receber.
 * Isso é uma previsão, e continua valendo — é o que a empresa usa para se
 * programar.
 *
 * O que faltava era o outro lado da RG-01: o fluxo montado pela **data de
 * liquidação**, isto é, o dinheiro que de fato passou pela conta. É o que esta
 * função devolve, lendo `cash_entry` (os lançamentos do extrato e as baixas
 * conciliadas) pela data em que ocorreram.
 *
 * As duas visões convivem lado a lado e NENHUM número do previsto muda por
 * causa desta função: ela lê uma fonte diferente e não toca em `flowMaps`.
 *
 * Convenção de sinal de `cash_entry`: positivo entra, negativo sai. Aqui as
 * saídas são devolvidas em módulo, para somar na mesma escala do previsto.
 */
export async function flowMapsRealizado(
  versionId: string,
): Promise<{ entradas: Record<string, number>; saidas: Record<string, number>; semData: { qtd: number; valor: number } }> {
  const entradas: Record<string, number> = {};
  const saidas: Record<string, number> = {};
  // Prompt AD, 3.3: o que fica fora dos meses é CONTADO, para a tela mostrar.
  const semData = { qtd: 0, valor: 0 };
  const lancamentos = await getCash(versionId);
  for (const c of lancamentos) {
    // Sem data não há competência de caixa a atribuir — o lançamento existe,
    // mas não entra em nenhum mês (e some-lo do total seria pior do que
    // reportá-lo em mês errado).
    const mm = vencMonth(c.data);
    if (!mm) {
      const v = Number(c.valor);
      if (Number.isFinite(v) && v !== 0) {
        semData.qtd++;
        semData.valor += v;
      }
      continue;
    }
    const v = Number(c.valor);
    if (!Number.isFinite(v) || v === 0) continue;
    if (v > 0) entradas[mm] = (entradas[mm] || 0) + v;
    else saidas[mm] = (saidas[mm] || 0) + Math.abs(v);
  }
  return { entradas, saidas, semData };
}

export interface PreviaFluxoObra {
  projeto: string;
  temAtual: boolean;
  /** Saldo inicial e acumulado final, hoje e pela definição nova. */
  partidaHoje: number;
  partidaNova: number;
  acumuladoHoje: number;
  acumuladoNovo: number;
  /** Permuta que sai das colunas de Orçamento/Previsão. */
  permutaNoPlanejamento: number;
  /** Caixa gravado em versões que não são a Atual (deixa de aparecer como realizado). */
  caixaForaDaAtual: number;
}

/**
 * Prompt AD, 8.1 — prévia da chave "fluxo_definicao_nova", por obra.
 * SOMENTE LEITURA: usa as mesmas funções da tela (flowMaps, flowMapsRealizado
 * e o módulo puro fluxo-tela), com a chave desligada e ligada.
 */
export async function previaFluxoDefinicaoNova(
  tenantId: string,
  projetos: readonly { id: string; name: string }[],
  saldoDasContas: number,
): Promise<PreviaFluxoObra[]> {
  const out: PreviaFluxoObra[] = [];
  for (const p of projetos) {
    const vs = await getVersionsDoProjeto(tenantId, p.id);
    const atual = vs.find((v) => v.kind === "atual") ?? null;
    const planejamento = vs.filter((v) => isBudgetVersion(v.kind));
    let permutaNoPlanejamento = 0;
    for (const v of planejamento) {
      const comPermuta = await flowMaps(v, p.id);
      const semPermuta = await flowMaps(v, p.id, { definicaoNova: true });
      permutaNoPlanejamento += Object.values(comPermuta.entradas).reduce((a, x) => a + x, 0) - Object.values(semPermuta.entradas).reduce((a, x) => a + x, 0);
    }
    let caixaForaDaAtual = 0;
    for (const v of vs.filter((x) => x.kind !== "atual")) for (const c of await getCash(v.id)) caixaForaDaAtual += Number(c.valor) || 0;
    if (!atual) {
      out.push({ projeto: p.name, temAtual: false, partidaHoje: saldoDasContas, partidaNova: 0, acumuladoHoje: 0, acumuladoNovo: 0, permutaNoPlanejamento, caixaForaDaAtual });
      continue;
    }
    const [previsto, realizado, incc] = await Promise.all([flowMaps(atual, p.id), flowMapsRealizado(atual.id), getInccRows(tenantId, p.id)]);
    const eixo = eixoDoFluxo(incc.map((r) => r.m), [previsto], realizado);
    const partidaNova = partidaDaObra(eixo, realizado);
    const ultimo = (ls: { saldo: number }[]) => (ls.length ? ls[ls.length - 1].saldo : 0);
    out.push({
      projeto: p.name,
      temAtual: true,
      partidaHoje: saldoDasContas,
      partidaNova,
      acumuladoHoje: ultimo(linhasDoFluxo(eixo, eixo, previsto, realizado, saldoDasContas)),
      acumuladoNovo: ultimo(linhasDoFluxo(eixo, eixo, previsto, realizado, partidaNova, { mesAtual: mesCorrente() })),
      permutaNoPlanejamento,
      caixaForaDaAtual,
    });
  }
  return out;
}

/**
 * Prompt AD, Parte 4 — os dois lados de cada cenário para o assistente.
 * SOMENTE LEITURA, pelas MESMAS funções da tabela (`flowMaps`,
 * `flowMapsRealizado`). Os projetos vêm do contexto do servidor (já do
 * tenant); as versões, de `getVersionsDoProjeto` com o tenant explícito.
 *
 * Projeto sem o cenário NÃO entra com zero (4.5.3): fica fora dos DOIS lados
 * e entra na contagem de ausência. O realizado é sempre da Atual (4.6).
 * Projeto com dois do mesmo cenário: o mais antigo, como na DRE.
 */
export async function ladosDoFluxo(
  tenantId: string,
  projetos: readonly { id: string; name: string }[],
  definicaoNova: boolean,
): Promise<LadoDoCenario[]> {
  const versoes = await Promise.all(projetos.map(async (p) => ({ ...p, versoes: await getVersionsDoProjeto(tenantId, p.id) })));
  const somar = (alvo: Mapas, m: Mapas) => {
    for (const [mm, v] of Object.entries(m.entradas)) alvo.entradas[mm] = (alvo.entradas[mm] || 0) + v;
    for (const [mm, v] of Object.entries(m.saidas)) alvo.saidas[mm] = (alvo.saidas[mm] || 0) + v;
  };
  const umProjeto = projetos.length === 1;
  const out: LadoDoCenario[] = [];
  for (const cenario of ["budget", "forecast"] as const) {
    const nome = ROTULO_CENARIO[cenario];
    const resolvidos = resolverCenario(cenario, versoes, false);
    const plano: Mapas = { entradas: {}, saidas: {} };
    const realizado: Mapas = { entradas: {}, saidas: {} };
    const previstoAtual: Mapas = { entradas: {}, saidas: {} };
    let entram = 0;
    let semCenario = 0;
    let semAtual = 0;
    for (const r of resolvidos) {
      const p = versoes.find((x) => x.id === r.projetoId)!;
      const atual = p.versoes.find((v) => v.kind === "atual") ?? null;
      if (!r.versao) {
        semCenario++;
        continue;
      }
      if (!atual) {
        semAtual++;
        continue;
      }
      const [pl, re, pa] = await Promise.all([
        flowMaps(r.versao, p.id, { definicaoNova }),
        flowMapsRealizado(atual.id),
        flowMaps(atual, p.id, { definicaoNova }),
      ]);
      somar(plano, pl);
      somar(realizado, re);
      somar(previstoAtual, pa);
      entram++;
    }
    const total = projetos.length;
    let ausente: string | null = null;
    if (entram === 0) {
      ausente = umProjeto
        ? semCenario
          ? `${projetos[0].name} não tem ${nome}.`
          : `${projetos[0].name} não tem versão Atual — sem ela não há caixa realizado.`
        : `nenhum dos ${total} projeto(s) tem ${nome} e Atual ao mesmo tempo.`;
    }
    const partes: string[] = [];
    if (!umProjeto && entram > 0 && entram < total) {
      partes.push(`${nome}: ${entram} de ${total} projeto(s) entram`);
      if (semCenario) partes.push(`${semCenario} sem ${nome} ficam fora dos dois lados`);
      if (semAtual) partes.push(`${semAtual} sem versão Atual ficam fora dos dois lados`);
    }
    const versao = umProjeto
      ? (resolvidos[0]?.versao ? `“${resolvidos[0].versao.label}”` : null)
      : entram > 0
        ? `de cada projeto, ${entram} de ${total}`
        : null;
    out.push({
      cenario,
      nome,
      versao,
      cobertura: partes.length ? partes.join("; ") + "." : null,
      ausente,
      plano: ausente ? null : plano,
      realizado: ausente ? null : realizado,
      previstoAtual: ausente ? null : previstoAtual,
    });
  }
  return out;
}
