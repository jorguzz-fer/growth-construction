/**
 * Prompt G2 (Fase 3 · revisão V5, confirmado em 18/10; revoga o 8.2.1 do
 * Prompt G): o chat do Plano de Contas propõe contas novas. Módulo PURO.
 *
 * BG2-1 em aberto: a Cris só propõe CONTA dentro de GRUPO que já existe —
 * criar grupo, inativar, excluir e reordenar continuam com os botões da tela.
 * A proposta vira uma lista para conferir; quem cria é o botão "Criar as
 * contas marcadas", e o servidor valida tudo de novo.
 */
import type { FormularioDaTela } from "@/lib/cris";
import { categoriaPadraoDaConta, ehCategoria, recusaDeCategoriaDaConta } from "@/lib/categoria-do-plano";

/** Quantas contas a Cris propõe de uma vez (5 campos cada; o teto do formulário é 60). */
export const MAX_CONTAS_PROPOSTAS = 10;

export interface GrupoDoPlanoCris {
  code: string;
  name: string;
  kind: "cef" | "complementar";
}

export interface ContaProposta {
  groupCode: string;
  code: string;
  name: string;
  natureza: "receita" | "despesa";
  /** null = o padrão de boa prática. */
  dreCategory: string | null;
}

const rotuloDoGrupo = (g: GrupoDoPlanoCris) => `${g.code} · ${g.name}`;

export function formularioDoPlano(grupos: readonly GrupoDoPlanoCris[]): FormularioDaTela {
  const opcoesGrupo = grupos.map(rotuloDoGrupo);
  const campos = Array.from({ length: MAX_CONTAS_PROPOSTAS }, (_, i) => {
    const n = i + 1;
    return [
      { nome: `conta${n}_grupo`, rotulo: `Conta ${n}: grupo`, tipo: "opcao" as const, opcoes: opcoesGrupo },
      { nome: `conta${n}_codigo`, rotulo: `Conta ${n}: código`, tipo: "texto" as const, dica: 'no padrão do grupo, ex.: "1.11" ou "A.6"' },
      { nome: `conta${n}_nome`, rotulo: `Conta ${n}: nome`, tipo: "texto" as const },
      { nome: `conta${n}_natureza`, rotulo: `Conta ${n}: natureza`, tipo: "opcao" as const, opcoes: ["despesa", "receita"] },
      { nome: `conta${n}_categoria`, rotulo: `Conta ${n}: categoria da DRE`, tipo: "texto" as const, dica: 'vazio = padrão; ex.: "Custo Variável"' },
    ];
  }).flat();
  return { id: "planocontas-novas", titulo: "Novas contas do Plano de Contas (só em grupo que já existe)", campos };
}

/** Os valores da proposta viram a lista de contas (as incompletas caem). */
export function contasDaProposta(valores: Record<string, string>, grupos: readonly GrupoDoPlanoCris[]): ContaProposta[] {
  const porRotulo = new Map(grupos.map((g) => [rotuloDoGrupo(g), g]));
  const out: ContaProposta[] = [];
  for (let n = 1; n <= MAX_CONTAS_PROPOSTAS; n++) {
    const g = porRotulo.get(valores[`conta${n}_grupo`] ?? "");
    const code = (valores[`conta${n}_codigo`] ?? "").trim();
    const name = (valores[`conta${n}_nome`] ?? "").trim();
    if (!g || !code || !name) continue;
    const natureza = valores[`conta${n}_natureza`] === "receita" ? "receita" : "despesa";
    const cat = (valores[`conta${n}_categoria`] ?? "").trim();
    out.push({ groupCode: g.code, code: code.slice(0, 20), name: name.slice(0, 120), natureza, dreCategory: cat || null });
  }
  return out;
}

/**
 * A recusa de uma conta (no servidor e na conferência da tela); null = pode.
 * O código não pode existir e precisa ser do grupo (prefixo do grupo + ".").
 */
export function recusaDaContaProposta(c: ContaProposta, grupos: readonly GrupoDoPlanoCris[], codigosExistentes: ReadonlySet<string>): string | null {
  const g = grupos.find((x) => x.code === c.groupCode);
  if (!g) return "O grupo não existe: crie o grupo pela tela antes.";
  if (!c.code.trim() || !c.name.trim()) return "Informe o código e o nome.";
  if (codigosExistentes.has(c.code)) return `O código "${c.code}" já existe.`;
  if (!c.code.startsWith(`${g.code}.`)) return `O código precisa começar por "${g.code}." (o grupo).`;
  if (c.dreCategory != null) {
    if (!ehCategoria(c.dreCategory)) return `"${c.dreCategory}" não é uma categoria da DRE.`;
    const r = recusaDeCategoriaDaConta(c.natureza, c.dreCategory);
    if (r) return r;
  }
  return null;
}

/** A categoria que a conta vai ter: a escolhida, ou o padrão que o sistema daria. */
export function categoriaDaContaProposta(c: ContaProposta, grupos: readonly GrupoDoPlanoCris[]): string {
  if (c.dreCategory) return c.dreCategory;
  const g = grupos.find((x) => x.code === c.groupCode);
  return categoriaPadraoDaConta({ code: c.code, groupCode: c.groupCode, kind: g?.kind ?? "complementar", natureza: c.natureza });
}
