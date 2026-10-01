/**
 * Regras da tela de Projetos (Prompt B). Módulo PURO: sem banco, sem React.
 *
 * O que vive aqui é o que a tela e as actions precisam decidir juntas —
 * duração derivada das datas (seção 9 / Prompt I, 55), validação de datas só
 * para gravação nova, aviso de funding (12), município sem IBGE (17), CEP, e a
 * proteção do Excluir (37). Nada aqui altera dado: são leituras e avisos.
 */
import { projectPeriodMonthsFromDates } from "@/lib/planning";
import { codigoMunicipioValido } from "@/lib/calc/emitente-fiscal";
import { brl } from "@/lib/utils";
import { ymd } from "@/lib/utils";

export const TELA_PROJETO = "projeto";

/* ─── duração e datas (seção 9; Prompt I, 55.4) ─────────────────────── */

/**
 * Contagem de competências entre a data de início e a de fim, ambas
 * inclusive — a única fonte da janela do projeto. `null` quando falta data
 * (não há janela; nunca zero).
 */
export function duracaoDerivada(startDate: string | null | undefined, endDate: string | null | undefined): number | null {
  if (!startDate || !endDate) return null;
  const n = projectPeriodMonthsFromDates(startDate, endDate).length;
  return n > 0 ? n : null;
}

/**
 * Aviso discreto quando o `duration_months` gravado difere da janela das
 * datas. Informativo: não bloqueia, não corrige, não grava. `null` = nada a
 * dizer (sem valor gravado, sem janela, ou os dois batem).
 */
export function avisoDeDuracao(durationMonths: number | null | undefined, startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  if (durationMonths == null) return null;
  const janela = duracaoDerivada(startDate, endDate);
  if (janela == null) return `O cadastro diz ${durationMonths} meses, mas sem as duas datas não há janela para conferir.`;
  if (janela === durationMonths) return null;
  return `O cadastro diz ${durationMonths} meses; a janela entre as datas tem ${janela} competências. Quem decide é você, ajustando as datas.`;
}

/**
 * Data de fim anterior à de início — recusada SÓ em gravação nova (criação,
 * ou edição que mexe nas datas). Cadastro antigo que viole a regra continua
 * editável nos outros campos. Datas vazias ou ilegíveis não são recusadas
 * aqui: o formato interno é "MM/DD/YYYY".
 */
export function recusaDasDatas(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  const a = ymd(startDate);
  const b = ymd(endDate);
  if (a == null || b == null) return null;
  if (b < a) return "A data de fim não pode ser anterior à data de início.";
  return null;
}

/* ─── valores (seções 10–12) ────────────────────────────────────────── */

export interface ValoresDoProjeto {
  valorConstrucao?: string | number | null;
  valorTerreno?: string | number | null;
  financiamentoConstrucao?: string | number | null;
  financiamentoTerreno?: string | number | null;
  recursosProprios?: string | number | null;
  terrenoForaCaixa?: boolean | null;
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const informado = (v: string | number | null | undefined) => !(v === null || v === undefined || v === "");

/** Regra existente, preservada (seção 12): valor global = construção + terreno. */
export function valorGlobal(p: ValoresDoProjeto): number {
  return Math.round((num(p.valorConstrucao) + num(p.valorTerreno)) * 100) / 100;
}

/** Regra existente, preservada: o que entra no caixa da construtora. */
export function entradaFinanceira(p: ValoresDoProjeto): number {
  return p.terrenoForaCaixa === false ? valorGlobal(p) : Math.round(num(p.valorConstrucao) * 100) / 100;
}

/**
 * Alerta de funding (seção 12): a soma de financiamento da construção +
 * financiamento do terreno + recursos próprios não alcança o valor global.
 * Não bloqueia, não preenche. `null` = cobre, ou não há valor global para
 * comparar. Funding nunca informado é dito como tal, e não como "zero".
 */
export function avisoDeFunding(p: ValoresDoProjeto): string | null {
  const global = valorGlobal(p);
  if (global <= 0) return null;
  const nenhum = !informado(p.financiamentoConstrucao) && !informado(p.financiamentoTerreno) && !informado(p.recursosProprios);
  if (nenhum) return `Fontes de recursos não informadas para uma operação de ${brl(global)}.`;
  const soma = Math.round((num(p.financiamentoConstrucao) + num(p.financiamentoTerreno) + num(p.recursosProprios)) * 100) / 100;
  if (soma + 0.005 >= global) return null;
  return `As fontes somam ${brl(soma)}; faltam ${brl(Math.round((global - soma) * 100) / 100)} para o valor global de ${brl(global)}.`;
}

/* ─── localização (seção 17) ────────────────────────────────────────── */

/**
 * Município/UF preenchidos sem código IBGE válido: a nota fiscal usa o código,
 * não o nome. Aviso, não recusa — cadastro antigo continua íntegro.
 */
export function avisoDeMunicipio(municipio: string | null | undefined, uf: string | null | undefined, codigoIbge: string | null | undefined): string | null {
  const temNome = !!(municipio ?? "").trim() || !!(uf ?? "").trim();
  const codigo = (codigoIbge ?? "").trim();
  if (!temNome && !codigo) return null;
  if (temNome && !codigo) return "Município informado sem código IBGE: a NFS-e identifica o município pelo código de 7 dígitos, não pelo nome.";
  if (codigo && !codigoMunicipioValido(codigo)) return "Código IBGE inválido: são 7 dígitos.";
  return null;
}

/** "01310-100" | "01310100" → "01310-100"; vazio → null; tamanho errado → undefined (recusa). */
export function normalizarCep(v: string | null | undefined): string | null | undefined {
  const d = (v ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length !== 8) return undefined;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function recusaDoCep(v: string | null | undefined): string | null {
  return normalizarCep(v) === undefined ? "CEP deve ter 8 dígitos." : null;
}

/** Latitude −90..90, longitude −180..180; vazio = null; fora disso recusa. */
export function normalizarCoordenada(v: string | number | null | undefined, limite: 90 | 180): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  if (!Number.isFinite(n) || Math.abs(n) > limite) return undefined;
  return Math.round(n * 1e7) / 1e7;
}

export function recusaDasCoordenadas(latitude: string | number | null | undefined, longitude: string | number | null | undefined): string | null {
  if (normalizarCoordenada(latitude, 90) === undefined) return "Latitude inválida (entre −90 e 90).";
  if (normalizarCoordenada(longitude, 180) === undefined) return "Longitude inválida (entre −180 e 180).";
  return null;
}

/**
 * Aviso ao salvar coordenada em obra que já tem ponto registrado (17): o raio
 * passa a valer daqui para a frente; nenhum registro passado é reavaliado.
 */
export function avisoDeCoordenada(registrosDePonto: number): string | null {
  if (registrosDePonto <= 0) return null;
  return `Esta obra tem ${registrosDePonto} registro(s) de ponto. A nova coordenada vale daqui para a frente; nenhum registro passado é reavaliado.`;
}

/* ─── exclusão (seção 37) ───────────────────────────────────────────── */

export interface InventarioDoProjeto {
  unidades: number;
  despesas: number;
  lancamentosCaixa: number;
  medicoes: number;
  contasReceber: number;
  documentos: number;
  linhasOrcamento: number;
  registrosDePonto: number;
  versoes: number;
}

export const INVENTARIO_VAZIO: InventarioDoProjeto = { unidades: 0, despesas: 0, lancamentosCaixa: 0, medicoes: 0, contasReceber: 0, documentos: 0, linhasOrcamento: 0, registrosDePonto: 0, versoes: 0 };

const ROTULOS: [keyof InventarioDoProjeto, string][] = [
  ["unidades", "unidade(s)"],
  ["despesas", "despesa(s)"],
  ["lancamentosCaixa", "lançamento(s) de caixa"],
  ["medicoes", "medição(ões)"],
  ["contasReceber", "conta(s) a receber"],
  ["documentos", "documento(s)"],
  ["linhasOrcamento", "linha(s) de orçamento/previsão"],
  ["registrosDePonto", "registro(s) de ponto"],
];

/** Texto do diálogo: o que vai junto na exclusão física. */
export function descreverInventario(inv: InventarioDoProjeto): string[] {
  return ROTULOS.filter(([k]) => inv[k] > 0).map(([k, r]) => `${inv[k]} ${r}`);
}

export function totalDoInventario(inv: InventarioDoProjeto): number {
  return ROTULOS.reduce((a, [k]) => a + inv[k], 0);
}

/**
 * Proteção do Excluir: nome digitado igual ao cadastro (sem distinguir
 * maiúsculas), e nunca o último projeto do tenant. As regras de exclusão em
 * si (física, em cascata) não mudam.
 */
export function recusaDaExclusao(p: { name: string }, nomeDigitado: string, totalDeProjetos: number): string | null {
  if (totalDeProjetos <= 1) return "É preciso manter ao menos um projeto ou unidade na empresa.";
  if (nomeDigitado.trim().toLowerCase() !== p.name.trim().toLowerCase()) return "Para excluir, digite o nome do projeto exatamente como está no cadastro.";
  return null;
}

/* ─── cabeçalho compacto (seção 8) ──────────────────────────────────── */

/** Rótulo da situação: Ativo / Finalizado / "—" quando ainda não classificado. */
export function rotuloDaSituacao(s: "Ativo" | "Finalizado" | null | undefined): string {
  return s ?? "—";
}
