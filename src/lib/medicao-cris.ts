/**
 * Prompt V2b (Fase 3 · revisão V5): "Medição de Projeto: o engenheiro lança
 * por voz". Módulo PURO: o formulário que a tela oferece à Cris e a leitura da
 * proposta para os campos da tela. A Cris só preenche; quem lança é o botão.
 */
import type { FormularioDaTela } from "@/lib/cris";

export interface GrupoDaMedicao {
  code: string;
  name: string;
}

const rotulo = (g: GrupoDaMedicao) => `${g.code} — ${g.name}`;

export function formularioDaMedicao(grupos: readonly GrupoDaMedicao[]): FormularioDaTela {
  return {
    id: "medicao-nova",
    titulo: "Nova medição de projeto (uma por vez)",
    campos: [
      { nome: "competencia", rotulo: "Competência", tipo: "texto", dica: "MM/AAAA, ex.: 03/2026" },
      { nome: "grupo", rotulo: "Grupo de obra (CEF)", tipo: "opcao", opcoes: grupos.map(rotulo) },
      { nome: "valor", rotulo: "Valor medido", tipo: "numero", dica: "em reais, maior que zero" },
      { nome: "obs", rotulo: "Observação", tipo: "texto" },
    ],
  };
}

/**
 * Os valores da proposta no formato dos campos da tela (o grupo vai como
 * "código|nome", que é o que a action espera). O que não dá para usar fica
 * de fora, com aviso.
 */
export function valoresDaMedicao(
  valores: Record<string, string>,
  grupos: readonly GrupoDaMedicao[],
): { valores: Partial<Record<"competencia" | "grupo" | "valor" | "obs", string>>; avisos: string[] } {
  const out: Partial<Record<"competencia" | "grupo" | "valor" | "obs", string>> = {};
  const avisos: string[] = [];
  const comp = (valores.competencia ?? "").trim();
  if (comp) {
    const m = comp.match(/^(\d{1,2})\/(\d{4})$/);
    const mes = m ? Number(m[1]) : 0;
    if (m && mes >= 1 && mes <= 12) out.competencia = `${String(mes).padStart(2, "0")}/${m[2]}`;
    else avisos.push(`Competência "${comp}" não entendida (use MM/AAAA).`);
  }
  if (valores.grupo) {
    const g = grupos.find((x) => rotulo(x) === valores.grupo);
    if (g) out.grupo = `${g.code}|${g.name}`;
    else avisos.push(`Grupo "${valores.grupo}" não está na lista.`);
  }
  if (valores.valor != null && valores.valor !== "") {
    const n = Number(valores.valor);
    if (Number.isFinite(n) && n > 0) out.valor = String(Math.round(n * 100) / 100);
    else avisos.push("Valor medido inválido.");
  }
  if (valores.obs) out.obs = valores.obs.slice(0, 500);
  return { valores: out, avisos };
}
