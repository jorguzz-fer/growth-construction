/**
 * Cliente da API Focus NFe (v2) — a ÚNICA parte do app que conhece o provedor.
 *
 * O que a documentação define e este arquivo respeita:
 *
 *  - **Ambientes**: `https://homologacao.focusnfe.com.br` e
 *    `https://api.focusnfe.com.br`, ambos com prefixo `/v2`. Homologação não
 *    tem validade fiscal — é o padrão do cadastro por isso.
 *  - **Autenticação**: HTTP Basic com o TOKEN como usuário e senha VAZIA
 *    (`Basic base64("token:")`). Não há header de API key.
 *  - **Referência (`ref`)**: obrigatória na query string, única por token,
 *    só letras e números. Reenviar a mesma `ref` depois de um erro é o caminho
 *    de correção; depois de autorizada, aquela `ref` fica presa àquele
 *    documento para sempre.
 *  - **Fluxo assíncrono**: o POST devolve `processando_autorizacao`. A
 *    autorização chega por consulta ou por webhook — nunca na mesma requisição.
 *
 * O token vem de variável de ambiente, um por ambiente. Nada de credencial em
 * coluna de banco, e nada de token em log: mensagem de erro é montada sem ele.
 */

import {
  ehAmbienteFiscal,
  refValida,
  type AmbienteFiscal,
  type ErroNota,
  type ResultadoNota,
  type StatusNota,
} from "./tipos";
import type { PayloadNfse } from "./nfse-payload";

const BASES: Record<AmbienteFiscal, string> = {
  homologacao: "https://homologacao.focusnfe.com.br/v2",
  producao: "https://api.focusnfe.com.br/v2",
};

/** 20s: a pré-validação é síncrona, mas a fila do provedor pode demorar. */
const TIMEOUT_MS = 20_000;

export function tokenFocus(ambiente: AmbienteFiscal): string | null {
  const especifico =
    ambiente === "producao"
      ? process.env.FOCUS_NFE_TOKEN_PRODUCAO
      : process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO;
  return especifico?.trim() || process.env.FOCUS_NFE_TOKEN?.trim() || null;
}

/** Dá para emitir neste ambiente? A tela usa isto para não oferecer o botão. */
export function focusConfigurado(ambiente: AmbienteFiscal = "homologacao"): boolean {
  return !!tokenFocus(ambiente);
}

export function resolverAmbiente(v: string | null | undefined): AmbienteFiscal {
  return ehAmbienteFiscal(v) ? v : "homologacao";
}

/** `Basic base64(token:)` — os dois-pontos com nada depois são intencionais. */
function cabecalhoAuth(token: string): string {
  return `Basic ${Buffer.from(`${token}:`, "utf8").toString("base64")}`;
}

/**
 * Traduz o vocabulário do provedor para o nosso.
 *
 * Status desconhecido cai em "processando" de propósito: tratar como erro uma
 * situação que só não sabemos ler faria o app declarar falha numa nota que
 * pode estar a caminho da autorização. Esperar e reconsultar é reversível;
 * declarar erro, não.
 */
export function traduzirStatus(status: string | undefined | null): StatusNota {
  switch ((status ?? "").toLowerCase()) {
    case "autorizado":
      return "autorizado";
    case "cancelado":
      return "cancelado";
    case "erro_autorizacao":
    case "erro":
      return "erro";
    case "nao_encontrada":
    case "nao_encontrado":
      return "nao_encontrada";
    default:
      return "processando";
  }
}

interface RespostaFocus {
  status?: string;
  ref?: string;
  numero?: string;
  numero_rps?: string;
  serie_rps?: string;
  codigo_verificacao?: string;
  data_emissao?: string;
  url?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_xml_cancelamento?: string;
  url_danfse?: string;
  erros?: ErroNota[];
  codigo?: string;
  mensagem?: string;
  correcao?: string;
}

function mapear(ref: string, corpo: RespostaFocus, httpOk: boolean): ResultadoNota {
  // Erro de pré-validação (4xx) vem como {codigo, mensagem} — sem `status`.
  const erros: ErroNota[] =
    corpo.erros ??
    (!httpOk && corpo.mensagem
      ? [{ codigo: corpo.codigo, mensagem: corpo.mensagem, correcao: corpo.correcao }]
      : []);

  const status: StatusNota =
    !httpOk && !corpo.status ? "erro" : traduzirStatus(corpo.status);

  return {
    status,
    ref: corpo.ref || ref,
    numero: corpo.numero ?? null,
    codigoVerificacao: corpo.codigo_verificacao ?? null,
    numeroRps: corpo.numero_rps ?? null,
    serieRps: corpo.serie_rps ?? null,
    dataEmissao: corpo.data_emissao ?? null,
    urlEspelho: corpo.url ?? null,
    caminhoXml: corpo.caminho_xml_nota_fiscal ?? null,
    caminhoXmlCancelamento: corpo.caminho_xml_cancelamento ?? null,
    urlDanfse: corpo.url_danfse ?? null,
    erros: erros.length > 0 ? erros : undefined,
    bruto: corpo,
  };
}

async function chamar(
  ambiente: AmbienteFiscal,
  metodo: "POST" | "GET" | "DELETE",
  caminho: string,
  corpo?: unknown,
): Promise<{ ok: boolean; json: RespostaFocus; http: number }> {
  const token = tokenFocus(ambiente);
  if (!token) {
    throw new Error(
      `Token do provedor fiscal não configurado para ${ambiente} — defina FOCUS_NFE_TOKEN.`,
    );
  }
  const resp = await fetch(`${BASES[ambiente]}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: cabecalhoAuth(token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  const bruto = await resp.text();
  let json: RespostaFocus = {};
  if (bruto) {
    try {
      json = JSON.parse(bruto) as RespostaFocus;
    } catch {
      // 401 devolve HTML ("HTTP Basic: Access denied"). Vira erro legível sem
      // ecoar a resposta inteira (que pode conter cabeçalho de autenticação).
      json = {
        codigo: `http_${resp.status}`,
        mensagem:
          resp.status === 401
            ? "Provedor recusou a autenticação — verifique o token do ambiente."
            : `Resposta inesperada do provedor (HTTP ${resp.status}).`,
      };
    }
  }
  return { ok: resp.ok, json, http: resp.status };
}

/**
 * Envia a NFS-e. Resposta 201 significa ACEITA PARA PROCESSAMENTO, não
 * autorizada — quem confirma é o webhook ou a consulta.
 */
export async function emitirNfse(
  ambiente: AmbienteFiscal,
  ref: string,
  payload: PayloadNfse,
): Promise<ResultadoNota> {
  if (!refValida(ref)) {
    throw new Error("Referência inválida: use apenas letras e números.");
  }
  const { ok, json } = await chamar(
    ambiente,
    "POST",
    `/nfse?ref=${encodeURIComponent(ref)}`,
    payload,
  );
  return mapear(ref, json, ok);
}

/** Consulta o estado atual da nota pela referência. */
export async function consultarNfse(
  ambiente: AmbienteFiscal,
  ref: string,
): Promise<ResultadoNota> {
  const { ok, json, http } = await chamar(
    ambiente,
    "GET",
    `/nfse/${encodeURIComponent(ref)}`,
  );
  if (http === 404) {
    return { status: "nao_encontrada", ref, bruto: json };
  }
  return mapear(ref, json, ok);
}

/**
 * Cancela uma NFS-e autorizada.
 *
 * O prazo é da PREFEITURA e varia por município — algumas recusam cancelamento
 * fora do mês de competência. Recusa vem como erro do provedor, não como
 * exceção: quem decide o que fazer é a tela.
 */
export async function cancelarNfse(
  ambiente: AmbienteFiscal,
  ref: string,
  justificativa?: string,
): Promise<ResultadoNota> {
  const { ok, json } = await chamar(
    ambiente,
    "DELETE",
    `/nfse/${encodeURIComponent(ref)}`,
    justificativa?.trim() ? { justificativa: justificativa.trim() } : undefined,
  );
  return mapear(ref, json, ok);
}
