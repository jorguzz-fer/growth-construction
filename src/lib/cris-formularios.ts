/**
 * Prompt D2 — vários formulários na mesma tela (Receitas e Despesas do
 * Orçamento, por exemplo). A Cris recebe um só, com o nome de cada campo
 * prefixado pelo id do formulário; a proposta volta repartida. Módulo PURO.
 */
import type { FormularioDaTela, PropostaDePreenchimento } from "@/lib/cris";

export const SEPARADOR = "|";
export const ID_UNIDO = "tela";

export function unirFormularios(lista: readonly FormularioDaTela[]): FormularioDaTela | null {
  if (!lista.length) return null;
  if (lista.length === 1) return lista[0];
  return {
    id: ID_UNIDO,
    titulo: lista.map((f) => f.titulo).join(" + "),
    campos: lista.flatMap((f) => f.campos.map((c) => ({ ...c, nome: `${f.id}${SEPARADOR}${c.nome}` }))),
  };
}

export function repartirProposta(p: PropostaDePreenchimento, lista: readonly FormularioDaTela[]): PropostaDePreenchimento[] {
  return lista
    .map((f) => {
      const prefixo = `${f.id}${SEPARADOR}`;
      const so = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([k]) => k.startsWith(prefixo)).map(([k, v]) => [k.slice(prefixo.length), v]));
      return { formulario: f.id, valores: so(p.valores), conferir: so(p.conferir), observacao: p.observacao };
    })
    .filter((x) => Object.keys(x.valores).length || Object.keys(x.conferir).length);
}
