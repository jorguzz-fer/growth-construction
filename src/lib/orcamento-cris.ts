/**
 * Prompt D2 (Fase 3 · revisão V5): escrita assistida em Orçamentos — a Cris
 * preenche a grade a partir do que a pessoa diz, dita ou anexa. Módulo PURO.
 *
 * Por linha, dois campos: o total (R$) e os meses ("03/2026 a 08/2026", que
 * distribui igual, ou "03/2026=40; 04/2026=60"). A proposta só PREENCHE a
 * grade; quem grava é o botão Salvar da tela (regra 4.2.1). BD2-1 em aberto:
 * a proposta vem em bloco — várias linhas de uma vez — e a pessoa confere
 * linha a linha antes de salvar.
 */
import type { FormularioDaTela } from "@/lib/cris";

export interface LinhaDaGrade {
  rowKey: string;
  label: string;
  total: string;
  pct: Record<string, string>;
  /** Total que vem do cadastro (Receitas do Projeto): a Cris não mexe no total. */
  fixa?: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** O formulário que a grade oferece à Cris. */
export function formularioDoOrcamento(
  bloco: "receita" | "despesa",
  linhas: readonly LinhaDaGrade[],
  meses: readonly string[],
  opts: { totalSoLeitura?: boolean; versao?: string } = {},
): FormularioDaTela {
  const intervalo = meses.length ? `${meses[0]} a ${meses[meses.length - 1]}` : "";
  return {
    id: `orcamento-${bloco}`,
    titulo: `${bloco === "receita" ? "Receitas" : "Despesas"} do ${opts.versao ?? "Orçamento"} (meses da grade: ${intervalo})`,
    campos: linhas.flatMap((l) => [
      ...(opts.totalSoLeitura || l.fixa ? [] : [{ nome: `total:${l.rowKey}`, rotulo: `${l.label} — total`, tipo: "numero" as const, dica: "em reais" }]),
      {
        nome: `meses:${l.rowKey}`,
        rotulo: `${l.label} — distribuição nos meses`,
        tipo: "texto" as const,
        dica: '"MM/AAAA a MM/AAAA" (igual) ou "MM/AAAA=40; MM/AAAA=60" (%)',
      },
    ]),
  };
}

const MES = /(\d{1,2})\/(\d{4})/g;
const norm = (m: string, a: string) => `${m.padStart(2, "0")}/${a}`;

/**
 * Lê a distribuição: intervalo (igual entre os meses da grade no intervalo)
 * ou lista explícita de "mês=%". Devolve o % de cada mês da grade (os outros
 * ficam em 0) ou a recusa.
 */
export function distribuicaoDosMeses(texto: string, meses: readonly string[]): { pct: Record<string, number> } | { erro: string } {
  const t = texto.trim();
  const pares = [...t.matchAll(/(\d{1,2})\/(\d{4})\s*=\s*(-?[\d.,]+)\s*%?/g)];
  const pct: Record<string, number> = Object.fromEntries(meses.map((m) => [m, 0]));
  if (pares.length) {
    for (const p of pares) {
      const mes = norm(p[1], p[2]);
      const v = Number(p[3].replace(",", "."));
      if (!meses.includes(mes)) return { erro: `${mes} não está nos meses da grade.` };
      if (!Number.isFinite(v) || v < 0) return { erro: `Percentual inválido em ${mes}.` };
      pct[mes] = r2(v);
    }
    return { pct };
  }
  const ms = [...t.matchAll(MES)].map((m) => norm(m[1], m[2]));
  if (!ms.length) return { erro: "Diga os meses (MM/AAAA)." };
  const idx = (m: string) => meses.indexOf(m);
  const a = idx(ms[0]);
  const b = idx(ms[ms.length - 1]);
  if (a < 0 || b < 0) return { erro: `${a < 0 ? ms[0] : ms[ms.length - 1]} não está nos meses da grade.` };
  const escolhidos = meses.slice(Math.min(a, b), Math.max(a, b) + 1);
  const cada = Math.floor((100 / escolhidos.length) * 100) / 100;
  escolhidos.forEach((m, i) => (pct[m] = i === escolhidos.length - 1 ? r2(100 - cada * (escolhidos.length - 1)) : cada));
  return { pct };
}

/**
 * Aplica a proposta na grade (só no estado da tela). Devolve as linhas novas,
 * as que mudaram e os avisos de campo que não deu para aplicar.
 */
export function aplicarNaGrade<T extends LinhaDaGrade>(
  linhas: readonly T[],
  meses: readonly string[],
  valores: Record<string, string>,
): { linhas: T[]; alteradas: string[]; avisos: string[] } {
  const alteradas = new Set<string>();
  const avisos: string[] = [];
  const nova = linhas.map((l) => {
    let x = l;
    const total = valores[`total:${l.rowKey}`];
    if (total != null && !l.fixa) {
      const n = Number(total);
      if (Number.isFinite(n) && n >= 0) {
        x = { ...x, total: String(r2(n)) };
        alteradas.add(l.label);
      } else avisos.push(`${l.label}: total inválido.`);
    }
    const dist = valores[`meses:${l.rowKey}`];
    if (dist != null) {
      const d = distribuicaoDosMeses(dist, meses);
      if ("erro" in d) avisos.push(`${l.label}: ${d.erro}`);
      else {
        x = { ...x, pct: Object.fromEntries(meses.map((m) => [m, d.pct[m] ? String(d.pct[m]) : ""])) };
        alteradas.add(l.label);
      }
    }
    return x;
  });
  return { linhas: nova, alteradas: [...alteradas], avisos };
}

/** Assinatura da grade, para saber se há alteração não salva. */
export function assinaturaDaGrade(linhas: readonly LinhaDaGrade[]): string {
  return JSON.stringify(linhas.map((l) => [l.rowKey, l.total, l.pct]));
}
