/**
 * Indicadores do Resumo Executivo (Prompt AE, Parte 2 e 4.4). Módulo PURO.
 *
 * Os VALORES são os de sempre (`calcTotals` + a permuta por tipo) — este
 * módulo só nomeia cada linha com o critério que ela usa e marca quando a
 * linha não tem de onde somar (ausência ≠ zero). Nenhum número muda aqui.
 */
import type { VersionTotals } from "@/lib/calc/types";

export type BaseDoIndicador = "todas_unidades" | "vendidas" | "permutas" | "liberacoes";

export interface IndicadorDoResumo {
  label: string;
  value: number;
  base: BaseDoIndicador;
  /** Sem nenhum registro na base: a célula mostra "—", não R$ 0 (4.4). */
  vazio: boolean;
}

export const TEXTO_DA_BASE: Record<BaseDoIndicador, string> = {
  todas_unidades: "todas as unidades da versão, em qualquer status",
  vendidas: "só as unidades com status Vendido",
  permutas: "todas as permutas da versão, em qualquer status",
  liberacoes: "todas as liberações da versão, em qualquer status",
};

export function indicadoresDoResumo(o: {
  totals: VersionTotals;
  unidades: readonly { status: string }[];
  permutas: readonly { tipoPermuta: string | null; estimado: string | number | null; status?: string | null }[];
  liberacoes: number;
  /**
   * Chave "resumo_definicao_nova" (2.6): o tipo é comparado com os valores
   * do cadastro ("Materiais", "Serviços"), e o que sobra vira "outros tipos"
   * — a soma sempre fecha com "Permuta Recebido". Permuta cancelada fica fora
   * (2.7), como em `calcTotals`.
   */
  definicaoNova?: boolean;
}): IndicadorDoResumo[] {
  const { totals: t } = o;
  const semUnidade = o.unidades.length === 0;
  const semVendida = !o.unidades.some((u) => u.status === "Vendido");
  const semPermuta = o.permutas.length === 0;
  const nova = !!o.definicaoNova;
  const permutas = nova ? o.permutas.filter((p) => !/cancel/i.test(p.status ?? "")) : o.permutas;
  // Desligada: a busca por trecho de sempre. Ligada: o valor exato do cadastro.
  const porTipo = (match: string, exato: string) =>
    permutas
      .filter((p) => (nova ? (p.tipoPermuta ?? "").trim() === exato : (p.tipoPermuta ?? "").toLowerCase().includes(match)))
      .reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  const materiais = porTipo("material", "Materiais");
  const servicos = porTipo("servi", "Serviços");
  const vend = (label: string, value: number): IndicadorDoResumo => ({ label, value, base: "vendidas", vazio: semVendida });
  const perm = (label: string, value: number): IndicadorDoResumo => ({ label, value, base: "permutas", vazio: semPermuta });
  return [
    // 2.1 — o VGV conta TODAS; as linhas seguintes, só as vendidas. A tela diz.
    { label: "VGV total (tabela de preços, todas as unidades)", value: t.vgv, base: "todas_unidades", vazio: semUnidade },
    vend("AS + S1 + S2 + S3 (Sinais)", t.sinais),
    // 2.2, opção 2 — o valor é nominal: o INCC não é aplicado aqui.
    vend("Mensais (nominal, sem INCC)", t.mens),
    vend("Semestrais (nominal, sem INCC)", t.sem),
    vend("Anuais (nominal, sem INCC)", t.anu),
    vend("FGTS", t.fgts),
    vend("Subsídio estimado", t.sub),
    perm("Permuta Recebido (estimado)", t.permRec),
    perm("Permuta Vendidos (rec. projetada)", t.permVend),
    perm("Permuta por Materiais", materiais),
    perm("Permuta por Serviços de Terceiros", servicos),
    ...(nova ? [perm("Permuta de outros tipos", t.permRec - materiais - servicos)] : []),
    { label: "Liberações de Obra", value: t.reemb, base: "liberacoes", vazio: o.liberacoes === 0 },
  ];
}
