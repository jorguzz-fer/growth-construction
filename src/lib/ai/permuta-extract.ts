import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiClient, createMessageWithFallback, isAiConfigured } from "@/lib/ai/client";
import type { DadosAtivoLidos } from "@/lib/ai/permuta-doc";

/**
 * Descrição em texto (digitada ou ditada) → dados do ativo de permuta
 * (Prompt P, 7.3). Só a conversa com a IA mora aqui; o contrato e a regra de
 * preenchimento estão em `permuta-doc.ts` (puro). O texto é do próprio
 * usuário; nenhum dado do banco vai junto além da data de hoje e da lista de
 * tipos aceitos. Leitura de documento (7.4) não está aqui: espera a resposta
 * sobre enviar documentos ao provedor.
 */

export const MAX_TEXTO_ATIVO = 2000;

export async function extractAtivoFromText(texto: string, hojeISO: string, tipos: readonly string[]): Promise<DadosAtivoLidos> {
  if (!isAiConfigured()) throw new Error("Assistente por IA não configurado (defina ANTHROPIC_API_KEY).");
  const client = aiClient();
  const tool: Anthropic.ToolUnion = {
    name: "preencher_ativo_permuta",
    description:
      "Preenche o cadastro de um bem recebido em permuta (ativo) num sistema de gestão de obras, a partir da descrição em português do usuário.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        unitCode: { type: "string", description: "Identificação da unidade vendida de onde veio o bem (ex.: '12', 'Casa 12', 'Apto 101'). \"\" se não dita." },
        cliente: { type: "string", description: "Nome do cliente que entregou o bem. \"\" se não dito." },
        dataRecebimento: { type: "string", description: "Data em que o bem foi recebido, em ISO YYYY-MM-DD, ou \"\" se não dita." },
        tipo: { type: "string", description: `Tipo do bem, de preferência um de: ${tipos.join(", ")}. Se o texto disser 'carro', 'apartamento' etc., devolva a palavra do texto. "" se não dito.` },
        descricao: { type: "string", description: "Descrição curta do bem (modelo, endereço, quantidade). \"\" se não houver." },
        estimado: { type: "number", description: "Valor estimado do bem em reais ('50 mil' = 50000). 0 se não dito." },
        baixaConfianca: { type: "array", description: "Nomes dos campos preenchidos com BAIXA confiança (unitCode, cliente, dataRecebimento, tipo, descricao, estimado). Vazio se todos claros.", items: { type: "string" } },
        observacoes: { type: "array", description: "Até 3 frases curtas sobre o que ficou ambíguo ou não coube nos campos.", items: { type: "string" } },
      },
      required: ["unitCode", "cliente", "dataRecebimento", "tipo", "descricao", "estimado", "baixaConfianca", "observacoes"],
    },
  };
  const message = await createMessageWithFallback(client, {
    max_tokens: 512,
    tools: [tool],
    tool_choice: { type: "tool", name: "preencher_ativo_permuta" },
    system:
      "Você preenche o cadastro de um bem recebido em permuta (um ATIVO que entra no inventário da construtora) a partir da descrição do usuário, em português do Brasil. " +
      `Hoje é ${hojeISO}; datas relativas resolvem-se a partir daí, sempre em ISO. ` +
      "Valores em reais numéricos ('50 mil' = 50000; '1.234,56' = 1234.56). " +
      "NÃO invente: tudo que a descrição não diz fica vazio ou 0. Nunca trate o bem como receita nem como venda: é um ativo recebido.",
    messages: [{ role: "user", content: [{ type: "text", text: `Descrição do bem recebido:\n\n${texto}\n\nChame a ferramenta preencher_ativo_permuta.` }] }],
  });
  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("O assistente não conseguiu entender a descrição.");
  return normalizarAtivo(block.input);
}

/** Parse defensivo: campo ausente ou de tipo errado vira o vazio do contrato. */
export function normalizarAtivo(bruto: unknown): DadosAtivoLidos {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const n = typeof o.estimado === "number" ? o.estimado : Number(o.estimado);
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : []);
  return {
    unitCode: str(o.unitCode),
    cliente: str(o.cliente),
    dataRecebimento: str(o.dataRecebimento),
    tipo: str(o.tipo),
    descricao: str(o.descricao),
    estimado: Number.isFinite(n) && n > 0 ? n : null,
    baixaConfianca: lista(o.baixaConfianca),
    observacoes: lista(o.observacoes).slice(0, 3),
  };
}
