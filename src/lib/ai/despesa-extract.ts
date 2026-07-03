import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";

/**
 * Leitura de documentos (NF / boleto / contrato) por IA para pré-preencher um
 * lançamento de despesa. Usa a API da Claude (modelo claude-opus-4-8), com
 * suporte a PDF e imagens. Fica desabilitado quando ANTHROPIC_API_KEY não está
 * definida (mesmo padrão do R2) — nesse caso apenas o upload/vínculo funciona.
 */

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ExtractedDespesa {
  fornecedorNome: string;
  fornecedorDoc: string;
  valor: number;
  competencia: string;
  vencimento: string;
  numDoc: string;
  descricao: string;
  categoriaDre: string;
  contaCef: string;
}

export const AI_ACCEPTED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/**
 * Envia o documento para a Claude e retorna os campos da despesa extraídos.
 * Campos não identificados voltam como string vazia ("") ou 0.
 */
export async function extractDespesaFromDocument(
  bytes: Uint8Array,
  mime: string,
  ctx: {
    fornecedores: { nome: string; doc: string | null }[];
    contas: { code: string; name: string }[];
  },
): Promise<ExtractedDespesa> {
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

  const fornList =
    ctx.fornecedores
      .slice(0, 200)
      .map((f) => `- ${f.nome}${f.doc ? ` (${f.doc})` : ""}`)
      .join("\n") || "(nenhum cadastrado)";
  const contaList =
    ctx.contas
      .slice(0, 400)
      .map((c) => `- ${c.code} — ${c.name}`)
      .join("\n") || "(nenhum cadastrado)";

  const tool: Anthropic.ToolUnion = {
    name: "preencher_despesa",
    description:
      "Preenche os campos de um lançamento de despesa a partir do documento anexado (nota fiscal, boleto ou contrato).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        fornecedorNome: {
          type: "string",
          description:
            "Nome / razão social do fornecedor ou emitente. Vazio se não identificar.",
        },
        fornecedorDoc: {
          type: "string",
          description: "CNPJ ou CPF do fornecedor. Vazio se não houver.",
        },
        valor: {
          type: "number",
          description: "Valor total da despesa em reais (só o número). 0 se não identificar.",
        },
        competencia: {
          type: "string",
          description: "Mês de competência no formato MM/YYYY. Vazio se não houver.",
        },
        vencimento: {
          type: "string",
          description: "Data de vencimento no formato MM/DD/YYYY. Vazio se não houver.",
        },
        numDoc: {
          type: "string",
          description: "Número do documento / nota / boleto. Vazio se não houver.",
        },
        descricao: {
          type: "string",
          description: "Breve descrição do produto ou serviço. Vazio se não houver.",
        },
        categoriaDre: {
          type: "string",
          enum: [...CATEGORIAS_DRE, ""],
          description: "Categoria DRE mais provável, ou vazio se incerto.",
        },
        contaCef: {
          type: "string",
          description:
            "Código do plano de contas mais adequado (ex.: 1.1), dentre os listados. Vazio se incerto.",
        },
      },
      required: [
        "fornecedorNome",
        "fornecedorDoc",
        "valor",
        "competencia",
        "vencimento",
        "numDoc",
        "descricao",
        "categoriaDre",
        "contaCef",
      ],
    },
    strict: true,
  };

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: "tool", name: "preencher_despesa" },
    messages: [
      {
        role: "user",
        content: [
          docBlock,
          {
            type: "text",
            text:
              "Extraia os dados desta despesa e chame a ferramenta preencher_despesa.\n\n" +
              `Fornecedores já cadastrados (use exatamente o nome quando corresponder):\n${fornList}\n\n` +
              `Plano de contas disponível (escolha o código mais adequado):\n${contaList}\n\n` +
              'Regras: datas em MM/DD/YYYY, competência em MM/YYYY, valor numérico em reais (sem "R$" nem separador de milhar). ' +
              'Deixe "" ou 0 tudo que não conseguir identificar com confiança.',
          },
        ],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("A IA não conseguiu extrair os campos do documento.");
  }
  const input = block.input as Partial<ExtractedDespesa>;
  return {
    fornecedorNome: String(input.fornecedorNome ?? ""),
    fornecedorDoc: String(input.fornecedorDoc ?? ""),
    valor: Number(input.valor ?? 0) || 0,
    competencia: String(input.competencia ?? ""),
    vencimento: String(input.vencimento ?? ""),
    numDoc: String(input.numDoc ?? ""),
    descricao: String(input.descricao ?? ""),
    categoriaDre: String(input.categoriaDre ?? ""),
    contaCef: String(input.contaCef ?? ""),
  };
}
