/**
 * Prompt AH2/AK2/AF2 — a proposta da Cris nos campos de um formulário de
 * página (por `name`). Módulo PURO. Campo de opção chega pelo RÓTULO (é o que
 * a Cris vê) e vira o `value` do <option>; rótulo desconhecido cai.
 */
export type OpcoesPorCampo = Record<string, { rotulo: string; valor: string }[]>;

export function valoresParaOFormulario(valores: Record<string, string>, opcoes: OpcoesPorCampo): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [nome, v] of Object.entries(valores)) {
    const lista = opcoes[nome];
    if (!lista) {
      out[nome] = v;
      continue;
    }
    const achada = lista.find((o) => o.rotulo.toLowerCase() === v.toLowerCase());
    if (achada) out[nome] = achada.valor;
  }
  return out;
}

/** Os rótulos de um campo de opção, para o formulário da Cris. */
export const rotulos = (lista: { rotulo: string }[]) => lista.map((o) => o.rotulo);
