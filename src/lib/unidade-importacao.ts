/**
 * Importação de unidades por planilha (Prompt J, seção 4) — regras puras.
 *
 * A action decide por (versão, código): código que já existe é ATUALIZADO,
 * nunca inserido de novo (4.1). A atualização só toca o que a planilha traz
 * preenchido: bloco, tipo, m², andar, valor e status (4.2). Nunca o plano de
 * pagamento, a data da venda ou o tipo de cadastro.
 */
import type { UnitStatus } from "@/lib/calc/types";

export const STATUS_DE_UNIDADE: readonly UnitStatus[] = ["Disponivel", "Reservado", "Vendido", "Permutado"];

export interface LinhaImportacao {
  code: string;
  bloco?: string;
  tipo?: string;
  m2?: number;
  andar?: number;
  valor?: number;
  status?: UnitStatus;
}

export interface LinhaIgnorada {
  code: string;
  motivo: string;
}

/** O código como a trava única do banco o vê: sem espaços nas pontas, caixa preservada. */
export const codigoNormalizado = (code: string | null | undefined) => (code ?? "").trim();

/**
 * Separa o que entra do que fica de fora, com o motivo de cada linha ignorada
 * (4.4). Código repetido na própria planilha: a primeira ocorrência vale, as
 * outras são ignoradas — senão a segunda sobrescreveria a primeira em silêncio.
 */
export function prepararImportacao(rows: readonly LinhaImportacao[]): { validas: LinhaImportacao[]; ignoradas: LinhaIgnorada[] } {
  const validas: LinhaImportacao[] = [];
  const ignoradas: LinhaIgnorada[] = [];
  const vistos = new Set<string>();
  rows.forEach((r, i) => {
    const code = codigoNormalizado(r.code);
    if (!code) {
      ignoradas.push({ code: `linha ${i + 1}`, motivo: "sem código" });
      return;
    }
    if (vistos.has(code)) {
      ignoradas.push({ code, motivo: "código repetido na planilha (a primeira linha vale)" });
      return;
    }
    if (r.status !== undefined && !STATUS_DE_UNIDADE.includes(r.status)) {
      ignoradas.push({ code, motivo: `status inválido "${r.status}"` });
      return;
    }
    if (r.valor !== undefined && (!Number.isFinite(r.valor) || r.valor < 0)) {
      ignoradas.push({ code, motivo: "valor inválido" });
      return;
    }
    if (r.m2 !== undefined && (!Number.isFinite(r.m2) || r.m2 < 0)) {
      ignoradas.push({ code, motivo: "m² inválido" });
      return;
    }
    vistos.add(code);
    validas.push({ ...r, code });
  });
  return { validas, ignoradas };
}

export type CamposAtualizaveis = {
  bloco?: string | null;
  tipo?: string | null;
  m2?: string | null;
  andar?: number | null;
  valor?: string;
  status?: UnitStatus;
};

/**
 * O que a atualização pode tocar (4.2): só os campos que a planilha trouxe
 * preenchidos. Célula vazia não apaga o que já está gravado — uma planilha
 * sem a coluna "Bloco" não pode zerar o bloco de cem unidades.
 */
export function patchDeAtualizacao(r: LinhaImportacao): CamposAtualizaveis {
  const p: CamposAtualizaveis = {};
  if (r.bloco !== undefined && r.bloco.trim() !== "") p.bloco = r.bloco.trim();
  if (r.tipo !== undefined && r.tipo.trim() !== "") p.tipo = r.tipo.trim();
  if (r.m2 !== undefined) p.m2 = String(r.m2);
  if (r.andar !== undefined) p.andar = r.andar;
  if (r.valor !== undefined) p.valor = String(r.valor);
  if (r.status !== undefined) p.status = r.status;
  return p;
}

/** Mensagem do relatório (4.4). */
export function resumoDaImportacao(r: { inseridas: number; atualizadas: number; ignoradas: readonly LinhaIgnorada[] }): string {
  const partes = [`${r.inseridas} inserida(s)`, `${r.atualizadas} atualizada(s)`];
  if (r.ignoradas.length) partes.push(`${r.ignoradas.length} ignorada(s)`);
  return partes.join(", ") + ".";
}
