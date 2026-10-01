/**
 * Regras da tela DRE fora da página (Prompt AC, Partes 1 e 8). Módulo PURO.
 *
 * A cascata e os inputs já moram em `calc/dre-cascata.ts` e `dre-inputs.ts`
 * (Prompt B). Aqui fica o que ainda estava na página: o recorte de período, a
 * seleção de versões, a resolução de CENÁRIO por projeto (Empresa toda) e a
 * declaração do recorte. Nada aqui lê banco nem muda número.
 */

/** Índice absoluto de mês a partir de "MM/YYYY" (ou null se inválido). */
export function monthIndex(mm: string): number | null {
  const p = mm.split("/");
  if (p.length !== 2) return null;
  const m = Number(p[0]);
  const y = Number(p[1]);
  if (!m || !y) return null;
  return y * 12 + (m - 1);
}

/** Competências "MM/YYYY" entre `de` e `ate` (inclusive; aceita ordem trocada). */
export function enumMonths(de: string, ate: string): string[] {
  const a = monthIndex(de);
  const b = monthIndex(ate);
  if (a == null || b == null) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let i = lo; i <= hi; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    out.push(`${String(m).padStart(2, "0")}/${y}`);
  }
  return out;
}

export function ordenarMeses(ms: Iterable<string>): string[] {
  return [...ms].sort((a, b) => (monthIndex(a) ?? 0) - (monthIndex(b) ?? 0));
}

export interface Recorte {
  /** null = acumulado (todo o horizonte). */
  periodMonths: Set<string> | null;
  label: string;
}

/**
 * O período é UM SÓ para todas as colunas (1.6). Mesma lógica de antes:
 * acumulado, ano-calendário, personalizado com De/Até, e limite aberto.
 */
export function resolverPeriodo(
  periodo: string,
  de: string,
  ate: string,
  axis: readonly string[],
  years: readonly { value: string; label: string; months: string[] }[],
): Recorte {
  if (periodo === "custom") {
    if (de && ate) return { periodMonths: new Set(enumMonths(de, ate)), label: `Personalizado (${de} – ${ate})` };
    if (de || ate) {
      const a = de ? monthIndex(de) : null;
      const b = ate ? monthIndex(ate) : null;
      const ms = axis.filter((m) => {
        const idx = monthIndex(m);
        if (idx == null) return false;
        if (a != null && idx < a) return false;
        if (b != null && idx > b) return false;
        return true;
      });
      return { periodMonths: new Set(ms), label: de ? `Personalizado (a partir de ${de})` : `Personalizado (até ${ate})` };
    }
    return { periodMonths: null, label: "Personalizado (informe De / Até)" };
  }
  if (periodo !== "acum") {
    const y = years.find((x) => x.value === periodo);
    return { periodMonths: new Set(y?.months ?? []), label: y?.label ?? periodo };
  }
  return { periodMonths: null, label: "Acumulado (todo o horizonte)" };
}

// ── Cenários e versões ────────────────────────────────────────────────────

/** Os três cenários (Prompt I, seção 33): o `kind` não muda no banco. */
export type Cenario = "budget" | "forecast" | "atual";
export const CENARIOS: Cenario[] = ["budget", "forecast", "atual"];
export const ROTULO_CENARIO: Record<string, string> = {
  budget: "Orçamento",
  forecast: "Previsão Atualizada",
  atual: "Realizado",
  custom: "Cópia",
};

export interface VersaoLeve {
  id: string;
  kind: string;
  label: string;
  color: string;
  isDefault: boolean;
  sourceVersionId: string | null;
  createdAt: Date;
}

const ORDEM_KIND: Record<string, number> = { budget: 0, forecast: 1, atual: 2, custom: 3 };

/** Ordem das colunas: Orçamento, Previsão, Realizado, cópias; dentro do tipo, a mais antiga primeiro. */
export function ordenarVersoes<V extends VersaoLeve>(vs: readonly V[]): V[] {
  return [...vs].sort((a, b) => (ORDEM_KIND[a.kind] ?? 9) - (ORDEM_KIND[b.kind] ?? 9) || +a.createdAt - +b.createdAt);
}

/** Versão é cópia? (1.4) — tem origem, ou é do tipo customizado. */
export function ehCopia(v: VersaoLeve): boolean {
  return v.sourceVersionId != null || v.kind === "custom";
}

/**
 * Seleção padrão (1.4, igual ao Dashboard): Atual + o Orçamento e a Previsão
 * MAIS RECENTES que não são cópia. Nunca ordem de criação pura, nunca cópia.
 */
export function selecaoPadrao<V extends VersaoLeve>(vs: readonly V[]): V[] {
  const maisRecente = (kind: string) =>
    [...vs].filter((v) => v.kind === kind && !ehCopia(v)).sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null;
  return ordenarVersoes([maisRecente("budget"), maisRecente("forecast"), maisRecente("atual")].filter((v): v is V => !!v));
}

/** Ids de `?vs=` validados contra as versões DESTE projeto (1.1): id estranho é descartado. */
export function selecaoDaUrl<V extends VersaoLeve>(vs: readonly V[], ids: readonly string[]): V[] {
  const set = new Set(ids);
  return ordenarVersoes(vs.filter((v) => set.has(v.id)));
}

/** Teto de colunas de versão (BAC-2). Acima disso a tela avisa e não descarta nada em silêncio. */
export const TETO_VERSOES = 12;
/** Teto da matriz mês × versão (1.5). */
export const TETO_CELULAS_MENSAL = 72;

/** Cenários de `?cen=` (Empresa toda); compatível com o antigo `?vkind=`. */
export function cenariosDaUrl(cen: string | undefined, vkind: string | undefined): Cenario[] {
  const pedidos = (cen ?? "").split(",").filter((c): c is Cenario => (CENARIOS as string[]).includes(c));
  if (pedidos.length) return CENARIOS.filter((c) => pedidos.includes(c));
  if (vkind && (CENARIOS as string[]).includes(vkind)) return [vkind as Cenario];
  return ["atual"];
}

export interface ResolucaoDoProjeto<V> {
  projetoId: string;
  projetoNome: string;
  /** A versão usada; null = o projeto não entra nesta coluna. */
  versao: V | null;
  /** Usou outra versão no lugar do cenário pedido (só com a regra antiga). */
  substituta: boolean;
}

/**
 * Resolve, para UM cenário, a versão de CADA projeto (1.2 — nunca uma versão
 * aplicada a vários projetos).
 *
 * `comFallback` = comportamento de antes (chave da DRE desligada): pedido →
 * Atual → padrão → primeira criada, exatamente como `versionIdOfKind`. Assim o
 * número não muda; a diferença é que a tela passa a DIZER quando trocou.
 * Sem fallback (chave ligada): projeto sem o cenário fica fora e é contado.
 */
export function resolverCenario<V extends VersaoLeve>(
  cenario: Cenario,
  projetos: readonly { id: string; name: string; versoes: readonly V[] }[],
  comFallback: boolean,
): ResolucaoDoProjeto<V>[] {
  return projetos.map((p) => {
    const vs = [...p.versoes].sort((a, b) => +a.createdAt - +b.createdAt);
    const doCenario = vs.find((v) => v.kind === cenario) ?? null;
    if (doCenario || !comFallback) return { projetoId: p.id, projetoNome: p.name, versao: doCenario, substituta: false };
    const sub = vs.find((v) => v.kind === "atual") ?? vs.find((v) => v.isDefault) ?? vs[0] ?? null;
    return { projetoId: p.id, projetoNome: p.name, versao: sub, substituta: !!sub };
  });
}

/** Cobertura de um cenário (Prompt I, seção 36): "Orçamento: 8 de 10 projetos". */
export function textoDaCobertura(cenario: Cenario, r: readonly ResolucaoDoProjeto<unknown>[]): string | null {
  const total = r.length;
  const proprios = r.filter((x) => x.versao && !x.substituta).length;
  const substitutos = r.filter((x) => x.substituta).length;
  const fora = r.filter((x) => !x.versao).length;
  if (proprios === total) return null;
  const nome = ROTULO_CENARIO[cenario];
  const partes = [`${nome}: ${proprios} de ${total} projeto(s) têm`];
  if (substitutos) partes.push(`${substitutos} sem ${nome} entram com outra versão (regra de antes: Realizado, senão a padrão, senão a primeira)`);
  if (fora) partes.push(`${fora} sem ${nome} ficam fora desta coluna`);
  return partes.join("; ") + ".";
}

/** Rótulo da coluna (1.8): o cenário vem do `kind`; o nome digitado é complemento. */
export function rotuloDaColuna(v: Pick<VersaoLeve, "kind" | "label" | "sourceVersionId">): { titulo: string; complemento: string } {
  const titulo = ehCopia(v as VersaoLeve) ? `${ROTULO_CENARIO[v.kind] ?? v.kind} (cópia)` : ROTULO_CENARIO[v.kind] ?? v.kind;
  return { titulo, complemento: v.label };
}

/** % sobre a PRÓPRIA receita da coluna (1.7); null quando a receita é zero ou negativa. */
export function pctDaReceita(valor: number, receita: number): number | null {
  return receita > 0 ? (valor / receita) * 100 : null;
}
