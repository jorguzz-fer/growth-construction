/**
 * Contrato NEUTRO com o provedor de emissão de nota fiscal.
 *
 * O app fala com estes tipos; quem fala "focusnfe" é só `focus.ts`. A troca de
 * provedor (ou a convivência com dois, durante a migração para a NFS-e
 * Nacional) não deveria vazar para as telas nem para o banco.
 *
 * Os status abaixo são os NOSSOS — o vocabulário do provedor é traduzido na
 * borda. São quatro porque quatro é o que muda o comportamento do sistema:
 * esperar, arquivar, mostrar erro ou registrar cancelamento.
 */

export type StatusNota =
  /** aceita pelo provedor, aguardando a prefeitura. Estado normal logo após o envio. */
  | "processando"
  | "autorizado"
  | "cancelado"
  /** rejeitada pela prefeitura ou pela pré-validação — `erros` explica. */
  | "erro"
  /** o provedor não conhece esta referência. */
  | "nao_encontrada";

export interface ErroNota {
  codigo?: string;
  mensagem: string;
  correcao?: string;
}

export interface ResultadoNota {
  status: StatusNota;
  ref: string;
  /** número da NFS-e (existe só depois de autorizada). */
  numero?: string | null;
  codigoVerificacao?: string | null;
  numeroRps?: string | null;
  serieRps?: string | null;
  dataEmissao?: string | null;
  /** espelho HTML da nota no provedor. */
  urlEspelho?: string | null;
  caminhoXml?: string | null;
  caminhoXmlCancelamento?: string | null;
  urlDanfse?: string | null;
  erros?: ErroNota[];
  /**
   * Resposta crua do provedor, para gravar no log de eventos.
   *
   * Rejeição de prefeitura vem com mensagem obscura e específica do município;
   * sem o corpo original guardado, diagnosticar depois vira adivinhação.
   */
  bruto?: unknown;
}

export type AmbienteFiscal = "homologacao" | "producao";

export function ehAmbienteFiscal(v: string | null | undefined): v is AmbienteFiscal {
  return v === "homologacao" || v === "producao";
}

/**
 * Referência da emissão (`ref`): identificador nosso, único por token.
 *
 * A API aceita apenas letras e números — nada de hífen, ponto ou espaço. Como
 * as chaves do banco são UUID (que tem hífen), a conversão precisa ser explícita
 * e sempre a mesma: o mesmo registro tem que produzir a mesma `ref`, senão uma
 * reemissão viraria nota duplicada em vez de retomar a anterior.
 */
export function refDaNota(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, "");
}

export function refValida(ref: string): boolean {
  return /^[A-Za-z0-9]{1,50}$/.test(ref);
}
