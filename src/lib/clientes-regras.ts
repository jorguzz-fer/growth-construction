/**
 * Regras do cadastro de clientes (Prompt M, 6) — puras, testáveis e usadas
 * pelo servidor. Nada aqui altera valor já gravado.
 */

/** Status de contrato que liberam a unidade para outro comprador. */
export const STATUS_LIBERA = ["Distratado", "Distrato", "Cancelado", "Cancelada"];

const normalizar = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * O status LIBERA a unidade? Comparação sem diferenciar maiúsculas, acentos
 * e espaços (6.2): "distratado" libera como "Distratado". Status em branco
 * NÃO libera — a unidade segue reservada ao comprador (a tela avisa).
 */
export function statusLiberaUnidade(status: string | null | undefined): boolean {
  const s = normalizar(status);
  return !!s && STATUS_LIBERA.some((x) => normalizar(x) === s);
}

/** Limite real de upload (6.9.4): o corpo da Server Action é 12 MB; o arquivo fica em 10 MB. */
export const LIMITE_UPLOAD_MB = 10;
export const LIMITE_UPLOAD_BYTES = LIMITE_UPLOAD_MB * 1024 * 1024;

/** A confirmação digitada corresponde ao nome do cliente (6.1)? */
export function confirmacaoConfere(digitado: string | null | undefined, nome: string): boolean {
  return normalizar(digitado) !== "" && normalizar(digitado) === normalizar(nome);
}

export interface VinculosDoCliente {
  unidadeComContratoAtivo: string | null;
  contasReceber: number;
  documentos: number;
  obrasComoCliente: number;
  recebimentosTerceiros: number;
}

/**
 * Motivos que BLOQUEIAM a exclusão (6.1). Lista vazia = pode excluir. Os dois
 * últimos não estão no texto do prompt: a exclusão os desvincularia em
 * silêncio (FK `set null`), perdendo a relação — mesma natureza das travas
 * pedidas.
 */
export function bloqueiosDeExclusao(v: VinculosDoCliente): string[] {
  const m: string[] = [];
  if (v.unidadeComContratoAtivo)
    m.push(`unidade ${v.unidadeComContratoAtivo} com contrato ativo (distrate ou cancele antes)`);
  if (v.contasReceber > 0) m.push(`${v.contasReceber} conta(s) a receber`);
  if (v.documentos > 0) m.push(`${v.documentos} documento(s) anexado(s)`);
  if (v.obrasComoCliente > 0) m.push(`cliente de ${v.obrasComoCliente} obra(s) em Projetos`);
  if (v.recebimentosTerceiros > 0) m.push(`${v.recebimentosTerceiros} recebimento(s) por terceiro`);
  return m;
}
