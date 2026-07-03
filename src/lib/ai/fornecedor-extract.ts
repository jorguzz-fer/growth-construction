import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { PAPEIS_STAKEHOLDER } from "@/lib/calc/constants";
import { isAiConfigured } from "@/lib/ai/despesa-extract";

/**
 * Leitura de documentos (cartão CNPJ, contrato social, cabeçalho de NF, cartão
 * de visita) por IA para pré-preencher o cadastro de um fornecedor/stakeholder.
 * Usa a API da Claude (claude-opus-4-8). Reaproveita a mesma configuração
 * (ANTHROPIC_API_KEY) da leitura de despesas.
 */

export interface ExtractedFornecedor {
  nome: string;
  tipo: "PJ" | "PF" | "";
  doc: string;
  email: string;
  tel: string;
  papeis: string[];
}

type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export async function extractFornecedorFromDocument(
  bytes: Uint8Array,
  mime: string,
): Promise<ExtractedFornecedor> {
  if (!isAiConfigured()) {
    throw new Error("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const client = new Anthropic();
  const data = Buffer.from(bytes).toString("base64");

  const docBlock: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mime as ImageMime, data },
        };

  const tool: Anthropic.ToolUnion = {
    name: "preencher_fornecedor",
    description:
      "Preenche o cadastro de um fornecedor/stakeholder a partir do documento anexado (cartão CNPJ, contrato, NF, cartão de visita).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        nome: {
          type: "string",
          description: "Razão social ou nome do fornecedor. Vazio se não identificar.",
        },
        tipo: {
          type: "string",
          enum: ["PJ", "PF", ""],
          description: "PJ se houver CNPJ, PF se houver apenas CPF. Vazio se incerto.",
        },
        doc: {
          type: "string",
          description: "CNPJ ou CPF (com pontuação). Vazio se não houver.",
        },
        email: { type: "string", description: "E-mail de contato. Vazio se não houver." },
        tel: { type: "string", description: "Telefone de contato. Vazio se não houver." },
        papeis: {
          type: "array",
          description:
            "Papéis mais prováveis do fornecedor, dentre os listados. Vazio se incerto.",
          items: { type: "string", enum: [...PAPEIS_STAKEHOLDER] },
        },
      },
      required: ["nome", "tipo", "doc", "email", "tel", "papeis"],
    },
    strict: true,
  };

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: "tool", name: "preencher_fornecedor" },
    messages: [
      {
        role: "user",
        content: [
          docBlock,
          {
            type: "text",
            text:
              "Extraia os dados do fornecedor deste documento e chame a ferramenta preencher_fornecedor. " +
              'Deixe "" ou lista vazia tudo que não conseguir identificar com confiança.',
          },
        ],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("A IA não conseguiu extrair os dados do documento.");
  }
  const input = block.input as Partial<ExtractedFornecedor>;
  const tipo = input.tipo === "PJ" || input.tipo === "PF" ? input.tipo : "";
  const papeisSet = new Set<string>(PAPEIS_STAKEHOLDER);
  return {
    nome: String(input.nome ?? ""),
    tipo,
    doc: String(input.doc ?? ""),
    email: String(input.email ?? ""),
    tel: String(input.tel ?? ""),
    papeis: Array.isArray(input.papeis)
      ? input.papeis.map(String).filter((p) => papeisSet.has(p))
      : [],
  };
}
