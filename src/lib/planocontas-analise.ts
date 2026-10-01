/**
 * Análises do assistente do Plano de Contas (Prompt G, Parte 2). Tudo PURO,
 * sobre o que a página carregou. O painel mostra o USO do plano — o que a
 * tela nunca mostrou — e nada mais: não sugere categoria (8.2.2), não afirma
 * que conta está errada (8.2.3), não propõe fusão (8.2.4), não cria, edita,
 * inativa nem reordena (8.2.1). Não antecipa as quatro decisões pendentes da
 * tela (8.7).
 */

export interface ContaDoPlano {
  id: string;
  code: string;
  name: string;
  kind: "cef" | "complementar";
  natureza: "receita" | "despesa";
  ativo: boolean;
  groupCode: string;
  groupName: string;
}

/** contagem por (conta, categoria, competência) — nunca valor. */
export interface LancamentoAgregado {
  code: string;
  categoria: string | null;
  /** "MM/YYYY" do lançamento, quando informada. */
  competencia: string | null;
  /** data (ISO) da criação mais recente do grupo. */
  ultimaCriacao: string;
  n: number;
}

export interface LinhaDeOrcamento {
  code: string;
  kind: string;
  categoria: string | null;
  projeto: string;
}

/** 8.4.1 — o recorte declarado. */
export interface Periodo {
  /** "MM/YYYY" inclusive */
  de: string;
  ate: string;
}

export interface ContaSemUso {
  code: string;
  name: string;
  grupo: string;
  kind: ContaDoPlano["kind"];
  /** nunca teve lançamento (em nenhum período) — criada e esquecida, ou etapa que ainda não começou. */
  nunca: boolean;
  /** último lançamento fora do período, quando houve. */
  ultimo: string | null;
}

export interface UsoDivergente {
  code: string;
  name: string;
  grupo: string;
  kind: ContaDoPlano["kind"];
  natureza: ContaDoPlano["natureza"];
  /** categorias usadas no período que não combinam com o grupo/natureza, com a contagem. */
  categorias: { categoria: string; n: number }[];
  /** categorias que combinam, para contraste. */
  combinam: { categoria: string; n: number }[];
}

export interface ParParecido {
  a: { code: string; name: string; grupo: string };
  b: { code: string; name: string; grupo: string };
  motivo: "mesmo nome" | "um contém o outro" | "palavras em comum";
}

export interface OndeAparece {
  code: string;
  name: string;
  /** telas que oferecem a conta no seletor (fixo, pelo código) */
  seletores: string[];
  /** obras com linha de Orçamento/Previsão para a conta */
  orcamentoEm: string[];
  /** categorias DRE pelas quais os lançamentos da conta entram no relatório, com contagem no período */
  dre: { categoria: string; n: number }[];
}

export interface AnaliseDoPlano {
  periodo: Periodo;
  projetos: string[];
  /** false quando o usuário não vê Despesas: contagens de lançamento ausentes (8.5). */
  comLancamentos: boolean;
  /** false quando o usuário não vê Orçamentos. */
  comOrcamento: boolean;
  semUso: ContaSemUso[];
  divergentes: UsoDivergente[];
  parecidas: ParParecido[];
  onde: OndeAparece[];
  totalContas: number;
}

/** Telas que lêem o plano pelo seletor de conta (callers de `getChartAccounts`). */
export const SELETORES_DO_PLANO = ["Despesas", "Restituições", "Acerto", "Medição (lançamento)", "Exportação de lançamentos"];

const ord = (mmYYYY: string) => {
  const [m, y] = mmYYYY.split("/").map(Number);
  return y * 12 + (m - 1);
};
const mesDeIso = (iso: string) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);

/** Período padrão: os últimos `meses` meses até o mês de `hoje`, inclusive. */
export function periodoPadrao(hoje: Date, meses = 12): Periodo {
  const ate = hoje.getUTCFullYear() * 12 + hoje.getUTCMonth();
  const de = ate - (meses - 1);
  const fmt = (o: number) => `${String((o % 12) + 1).padStart(2, "0")}/${Math.floor(o / 12)}`;
  return { de: fmt(de), ate: fmt(ate) };
}

/** mês do lançamento: competência quando válida; senão o mês da criação. */
function mesDoLancamento(l: LancamentoAgregado): string | null {
  if (l.competencia && /^\d{2}\/\d{4}$/.test(l.competencia)) return l.competencia;
  return mesDeIso(l.ultimaCriacao);
}

function noPeriodo(l: LancamentoAgregado, p: Periodo): boolean {
  const m = mesDoLancamento(l);
  if (!m) return false;
  const o = ord(m);
  return o >= ord(p.de) && o <= ord(p.ate);
}

/**
 * O que "combina" com o grupo e a natureza — leitura, não regra: conta de
 * receita → "Receita"; grupo CEF/Obra (custo de obra) → Custo Variável ou
 * Custo Fixo; grupo complementar → o restante (despesas, retiradas,
 * investimento, empréstimos, financeiras). O painel mostra o que foge disso e
 * NÃO diz que está errado (8.2.3); quem lê o contrato e a obra decide.
 */
export function combina(conta: Pick<ContaDoPlano, "kind" | "natureza">, categoria: string): boolean {
  if (conta.natureza === "receita") return categoria === "Receita";
  if (categoria === "Receita") return false;
  const custo = categoria === "Custo Variável" || categoria === "Custo Fixo";
  return conta.kind === "cef" ? custo : !custo;
}

/** 8.3.1 */
export function contasSemUso(contas: readonly ContaDoPlano[], lanc: readonly LancamentoAgregado[], p: Periodo): ContaSemUso[] {
  const porConta = new Map<string, LancamentoAgregado[]>();
  for (const l of lanc) porConta.set(l.code, [...(porConta.get(l.code) ?? []), l]);
  return contas
    .filter((c) => c.ativo)
    .filter((c) => !(porConta.get(c.code) ?? []).some((l) => noPeriodo(l, p)))
    .map((c) => {
      const todos = porConta.get(c.code) ?? [];
      const ultimo = todos.map((l) => l.ultimaCriacao).filter(Boolean).sort().at(-1) ?? null;
      return { code: c.code, name: c.name, grupo: `${c.groupCode} ${c.groupName}`, kind: c.kind, nunca: todos.length === 0, ultimo };
    })
    .sort((a, b) => (a.nunca === b.nunca ? a.code.localeCompare(b.code, undefined, { numeric: true }) : a.nunca ? 1 : -1));
}

/** 8.3.2 */
export function usoDivergente(contas: readonly ContaDoPlano[], lanc: readonly LancamentoAgregado[], p: Periodo): UsoDivergente[] {
  const out: UsoDivergente[] = [];
  for (const c of contas) {
    const porCat = new Map<string, number>();
    for (const l of lanc) if (l.code === c.code && l.categoria && noPeriodo(l, p)) porCat.set(l.categoria, (porCat.get(l.categoria) ?? 0) + l.n);
    const categorias = [...porCat].filter(([cat]) => !combina(c, cat)).map(([categoria, n]) => ({ categoria, n }));
    if (categorias.length === 0) continue;
    const combinam = [...porCat].filter(([cat]) => combina(c, cat)).map(([categoria, n]) => ({ categoria, n }));
    out.push({ code: c.code, name: c.name, grupo: `${c.groupCode} ${c.groupName}`, kind: c.kind, natureza: c.natureza, categorias, combinam });
  }
  return out.sort((a, b) => b.categorias.reduce((s, x) => s + x.n, 0) - a.categorias.reduce((s, x) => s + x.n, 0));
}

const PARADAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "por", "com"]);
export function palavrasDoNome(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !PARADAS.has(w));
}

/** 8.3.3 — observação, nunca proposta de fusão (8.2.4). Só dentro do mesmo tipo de grupo. */
export function contasParecidas(contas: readonly ContaDoPlano[], limite = 40): ParParecido[] {
  const out: ParParecido[] = [];
  const ativas = contas.filter((c) => c.ativo);
  for (let i = 0; i < ativas.length; i++) {
    for (let j = i + 1; j < ativas.length; j++) {
      const a = ativas[i], b = ativas[j];
      if (a.kind !== b.kind) continue;
      const na = a.name.trim().toLowerCase(), nb = b.name.trim().toLowerCase();
      let motivo: ParParecido["motivo"] | null = null;
      if (na === nb) motivo = "mesmo nome";
      else if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) motivo = "um contém o outro";
      else {
        const pa = new Set(palavrasDoNome(a.name)), pb = new Set(palavrasDoNome(b.name));
        if (pa.size && pb.size) {
          const inter = [...pa].filter((w) => pb.has(w)).length;
          const uniao = new Set([...pa, ...pb]).size;
          if (inter >= 2 && inter / uniao >= 0.5) motivo = "palavras em comum";
        }
      }
      if (motivo) out.push({ a: { code: a.code, name: a.name, grupo: a.groupCode }, b: { code: b.code, name: b.name, grupo: b.groupCode }, motivo });
      if (out.length >= limite) return out;
    }
  }
  return out;
}

/** 8.3.4 */
export function ondeAparece(contas: readonly ContaDoPlano[], lanc: readonly LancamentoAgregado[], orc: readonly LinhaDeOrcamento[], p: Periodo): OndeAparece[] {
  return contas.map((c) => {
    const porCat = new Map<string, number>();
    for (const l of lanc) if (l.code === c.code && l.categoria && noPeriodo(l, p)) porCat.set(l.categoria, (porCat.get(l.categoria) ?? 0) + l.n);
    const orcamentoEm = [...new Set(orc.filter((o) => o.code === c.code).map((o) => o.projeto))].sort();
    return {
      code: c.code,
      name: c.name,
      seletores: c.ativo ? SELETORES_DO_PLANO : [],
      orcamentoEm,
      dre: [...porCat].map(([categoria, n]) => ({ categoria, n })).sort((a, b) => b.n - a.n),
    };
  });
}

export function analisarPlano(
  contas: readonly ContaDoPlano[],
  uso: { lancamentos: readonly LancamentoAgregado[]; orcamento: readonly LinhaDeOrcamento[] } | null,
  opts: { projetos: string[]; comLancamentos: boolean; comOrcamento: boolean; hoje?: Date; meses?: number },
): AnaliseDoPlano {
  const periodo = periodoPadrao(opts.hoje ?? new Date(), opts.meses ?? 12);
  const lanc = opts.comLancamentos && uso ? uso.lancamentos : [];
  const orc = opts.comOrcamento && uso ? uso.orcamento : [];
  return {
    periodo,
    projetos: opts.projetos,
    comLancamentos: opts.comLancamentos,
    comOrcamento: opts.comOrcamento,
    semUso: opts.comLancamentos ? contasSemUso(contas, lanc, periodo) : [],
    divergentes: opts.comLancamentos ? usoDivergente(contas, lanc, periodo) : [],
    parecidas: contasParecidas(contas),
    onde: ondeAparece(contas, lanc, orc, periodo),
    totalContas: contas.length,
  };
}
