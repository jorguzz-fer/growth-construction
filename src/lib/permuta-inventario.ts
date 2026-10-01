/**
 * Inventário de permuta (Prompt P, seção 5) — regras puras, sem banco.
 *
 * BP-1 (30/09): a tela de Permuta é o registro do ativo recebido, pelo valor.
 * O inventário é o que ainda está em estoque: recebido, não vendido e não
 * cancelado. "Tempo em estoque" é o número que mostra ativo parado.
 *
 * Importação (5.5), com as regras aprendidas na importação de unidades:
 * linha com Id que existe ATUALIZA; sem Id, insere; ativo vendido não é
 * tocado por planilha; célula numérica ilegível é REPORTADA, nunca vira zero;
 * a trava da versão é conferida pela action.
 */
import { diasEntre, ymdNumero } from "@/lib/conta-receber-estado";
import { dataGravadaValida, lerValorDoAtivo, motivoDeRecusaDoAtivo } from "@/lib/permuta-regras";

export interface AtivoParaInventario {
  id: string;
  tipo: string | null;
  descricao: string | null;
  unitCode: string | null;
  clienteNome: string | null;
  dataRecebimento: string | null;
  estimado: string | number | null;
  status: string | null;
  cancelado: boolean;
  noEstoque?: boolean;
}

export interface LinhaDoInventario {
  id: string;
  tipo: string;
  descricao: string | null;
  unitCode: string | null;
  clienteNome: string | null;
  dataRecebimento: string | null;
  estimado: number;
  /** Dias entre o recebimento e hoje; nulo sem data. */
  diasEmEstoque: number | null;
  noEstoque: boolean;
}

/** 5.2/5.3 · ativos ainda em estoque, do mais antigo ao mais novo. */
export function inventario(rows: readonly AtivoParaInventario[], hojeYmd: number): LinhaDoInventario[] {
  return rows
    .filter((r) => !r.cancelado && (r.status ?? "").trim() !== "Vendido")
    .map((r) => {
      const d = ymdNumero(r.dataRecebimento);
      return {
        id: r.id,
        tipo: (r.tipo ?? "").trim() || "Sem tipo",
        descricao: r.descricao,
        unitCode: r.unitCode,
        clienteNome: r.clienteNome,
        dataRecebimento: r.dataRecebimento,
        estimado: Number(r.estimado ?? 0),
        diasEmEstoque: d == null ? null : diasEntre(d, hojeYmd),
        noEstoque: !!r.noEstoque,
      };
    })
    .sort((a, b) => (b.diasEmEstoque ?? -1) - (a.diasEmEstoque ?? -1) || b.estimado - a.estimado);
}

export interface TotalPorTipo {
  tipo: string;
  quantidade: number;
  estimado: number;
}

/** 5.2 · quantidade e valor estimado em estoque, por tipo de bem. */
export function totaisPorTipo(linhas: readonly LinhaDoInventario[]): TotalPorTipo[] {
  const m = new Map<string, TotalPorTipo>();
  for (const l of linhas) {
    const t = m.get(l.tipo) ?? { tipo: l.tipo, quantidade: 0, estimado: 0 };
    t.quantidade += 1;
    t.estimado = Math.round((t.estimado + l.estimado) * 100) / 100;
    m.set(l.tipo, t);
  }
  return [...m.values()].sort((a, b) => b.estimado - a.estimado || a.tipo.localeCompare(b.tipo, "pt-BR"));
}

// ───────────────────────────── importação ─────────────────────────────

/** Cabeçalho da planilha (exportação, modelo e leitura usam o mesmo). */
export const COLUNAS_DA_PLANILHA = [
  "Id",
  "Unidade",
  "Cliente",
  "Data recebimento",
  "Tipo",
  "Descrição",
  "Valor estimado",
  "Status",
  "Data venda",
  "Valor venda",
  "Forma revenda",
  "Tipo permuta",
  "Obs",
] as const;

export interface LinhaImportacaoPermuta {
  /** Id do ativo (coluna da exportação). Presente = atualiza; ausente = insere. */
  id?: string;
  unitCode: string | null;
  cliente: string | null;
  dataRecebimento: string | null;
  tipo: string | null;
  descricao: string | null;
  estimado: string | null;
  status: string | null;
  dataVenda: string | null;
  valorVenda: string | null;
  formaVenda: string | null;
  tipoPermuta: string | null;
  obs: string | null;
}

export interface LinhaIgnoradaPermuta {
  linha: string;
  motivo: string;
}

export interface LinhaPreparada extends LinhaImportacaoPermuta {
  acao: "inserir" | "atualizar";
}

/**
 * Número de célula: aceita número, "1.234,56", "1234.56" e "R$ 1.234,56".
 * Vazio é null; ilegível é NaN — quem chama REPORTA, nunca grava zero (5.5).
 */
export function numeroDaCelula(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim();
  if (!s) return null;
  return lerValorDoAtivo(s);
}

/**
 * Data de célula → "MM/DD/YYYY" (formato gravado). Aceita "DD/MM/AAAA",
 * "AAAA-MM-DD", o serial do Excel e o próprio formato gravado quando o dia
 * não cabe como mês. Ilegível devolve null; vazio devolve "".
 */
export function dataDaCelula(v: unknown): string | null {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
  }
  const s = String(v).trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}/${m[1]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // Planilha brasileira: DD/MM/AAAA. Se o "dia" não cabe como mês mas o
  // "mês" cabe como dia, já veio no formato gravado (MM/DD/YYYY).
  const [dia, mes] = a > 12 && b <= 12 ? [a, b] : b > 12 && a <= 12 ? [b, a] : [a, b];
  const br = `${String(mes).padStart(2, "0")}/${String(dia).padStart(2, "0")}/${m[3]}`;
  return dataGravadaValida(br) ? br : null;
}

export interface AtivoExistente {
  id: string;
  status: string | null;
  cancelado: boolean;
}

/**
 * Separa o que entra do que fica de fora, com o motivo de cada linha ignorada
 * (5.5). Id que existe → atualiza (nunca ativo vendido nem cancelado); Id que
 * não existe nesta versão → ignorada; sem Id → insere. Cada linha passa pela
 * mesma validação do formulário.
 */
export function prepararImportacaoDePermutas(
  rows: readonly LinhaImportacaoPermuta[],
  existentes: readonly AtivoExistente[],
): { validas: LinhaPreparada[]; ignoradas: LinhaIgnoradaPermuta[] } {
  const validas: LinhaPreparada[] = [];
  const ignoradas: LinhaIgnoradaPermuta[] = [];
  const porId = new Map(existentes.map((e) => [e.id, e]));
  const idsVistos = new Set<string>();
  rows.forEach((r, i) => {
    const rotulo = `linha ${i + 1}${r.unitCode ? ` (${r.unitCode})` : ""}`;
    const id = (r.id ?? "").trim();
    if (id) {
      const atual = porId.get(id);
      if (!atual) return void ignoradas.push({ linha: rotulo, motivo: "Id não encontrado nesta versão" });
      if (atual.cancelado) return void ignoradas.push({ linha: rotulo, motivo: "ativo cancelado não é alterado por planilha" });
      if ((atual.status ?? "").trim() === "Vendido") return void ignoradas.push({ linha: rotulo, motivo: "ativo vendido não é alterado por planilha" });
      if (idsVistos.has(id)) return void ignoradas.push({ linha: rotulo, motivo: "Id repetido na planilha (a primeira linha vale)" });
      idsVistos.add(id);
    }
    const motivo = motivoDeRecusaDoAtivo({ ...r, parcelas: null, periodicidade: null });
    if (motivo) return void ignoradas.push({ linha: rotulo, motivo });
    validas.push({ ...r, id: id || undefined, acao: id ? "atualizar" : "inserir" });
  });
  return { validas, ignoradas };
}

export function resumoDaImportacaoDePermutas(r: { inseridas: number; atualizadas: number; ignoradas: readonly LinhaIgnoradaPermuta[] }): string {
  const partes = [`${r.inseridas} inserida(s)`, `${r.atualizadas} atualizada(s)`];
  if (r.ignoradas.length) partes.push(`${r.ignoradas.length} ignorada(s)`);
  return partes.join(", ") + ".";
}
