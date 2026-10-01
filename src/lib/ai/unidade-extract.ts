import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiClient, createMessageWithFallback, isAiConfigured } from "@/lib/ai/client";
import type { DadosVendaLidos, FonteLida } from "@/lib/ai/unidade-doc";

/**
 * Descrição em texto (digitada ou ditada) → dados da venda (Prompt J, 6.3).
 * Só a conversa com a IA mora aqui; o contrato e a regra de preenchimento
 * estão em `unidade-doc.ts` (puro). O texto é do próprio usuário; nenhum dado
 * do banco vai junto além da data de hoje.
 */

export const MAX_TEXTO_VENDA = 2000;

const FONTE: Anthropic.Tool.InputSchema["properties"] = {
  valor: { type: "number", description: "Valor de CADA parcela, em reais. 0 se não houver." },
  parcelas: { type: "integer", description: "Quantidade de parcelas. 1 para pagamento único." },
  primeiroVencimento: { type: "string", description: "Primeiro vencimento em ISO YYYY-MM-DD, ou \"\" se não dito." },
};
const fonte = (descricao: string): Anthropic.Tool.InputSchema => ({
  type: "object",
  description: descricao + " null se não houver.",
  properties: FONTE,
  required: ["valor", "parcelas", "primeiroVencimento"],
});
const dataOuVazio = (descricao: string) => ({ type: "string" as const, description: `${descricao} em ISO YYYY-MM-DD, ou "" se não dito.` });

export async function extractVendaFromText(texto: string, hojeISO: string): Promise<DadosVendaLidos> {
  if (!isAiConfigured()) {
    throw new Error("Assistente por IA não configurado (defina ANTHROPIC_API_KEY).");
  }
  const client = aiClient();
  const tool: Anthropic.ToolUnion = {
    name: "preencher_unidade",
    description:
      "Preenche o formulário de uma unidade (imóvel) e da sua venda num sistema de gestão de obras, a partir da descrição em português do usuário.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        code: { type: "string", description: "Código/identificação da unidade (ex.: '12', 'Casa 12', 'Apto 101', 'Lote 7'). \"\" se não dito." },
        itemType: { type: "string", enum: ["unidade", "condominio", ""], description: "'condominio' só se for o empreendimento inteiro." },
        tipo: { type: "string", description: "Tipo do imóvel (Casa, Apartamento, Lote, Sala…). \"\" se não dito." },
        bloco: { type: "string", description: "Bloco/torre/quadra. \"\" se não dito." },
        m2: { type: "number", description: "Área em m². 0 se não dita." },
        andar: { type: "integer", description: "Andar. -1 se não dito." },
        valor: { type: "number", description: "Valor total da venda / VGV em reais ('380 mil' = 380000). 0 se não dito." },
        status: { type: "string", enum: ["Disponivel", "Reservado", "Vendido", "Permutado", ""], description: "'Vendido' quando o texto descreve uma venda feita. \"\" se incerto." },
        dataVenda: dataOuVazio("Data da venda"),
        AS: fonte("Ato de assinatura / entrada / sinal inicial."),
        S1: fonte("Sinal 1 (reforço)."),
        S2: fonte("Sinal 2."),
        S3: fonte("Sinal 3."),
        Mensais: fonte("Parcelas mensais."),
        Semestrais: fonte("Parcelas semestrais (balões)."),
        Anuais: fonte("Parcelas anuais."),
        FGTS: {
          type: "object",
          description: "FGTS. null se não houver.",
          properties: { valor: { type: "number" }, dataPrevista: dataOuVazio("Data prevista") },
          required: ["valor", "dataPrevista"],
        },
        Subsidio: {
          type: "object",
          description: "Subsídio (ex.: Minha Casa Minha Vida). null se não houver.",
          properties: { valor: { type: "number" }, dataPrevista: dataOuVazio("Data prevista") },
          required: ["valor", "dataPrevista"],
        },
        Permuta: {
          type: "object",
          description: "Permuta (bem dado como parte do pagamento). null se não houver.",
          properties: { valor: { type: "number" }, descricao: { type: "string" }, dataPrevista: dataOuVazio("Data prevista") },
          required: ["valor", "descricao", "dataPrevista"],
        },
        Banco: {
          type: "object",
          description: "Financiamento bancário. null se não houver.",
          properties: {
            valorFinanciado: { type: "number", description: "Valor financiado em reais; 0 se o texto só disser 'o restante'." },
            dataEntrada: dataOuVazio("Data de entrada do financiamento"),
            dataPrimeiraParcela: dataOuVazio("Primeira parcela do financiamento"),
            restante: { type: "boolean", description: "true quando o texto diz que o banco financia 'o restante'/'o resto'." },
          },
          required: ["valorFinanciado", "dataEntrada", "dataPrimeiraParcela", "restante"],
        },
        baixaConfianca: {
          type: "array",
          description: "Nomes dos campos ou fontes preenchidos com BAIXA confiança (ex.: 'valor', 'Mensais'). Vazio se todos claros.",
          items: { type: "string" },
        },
        observacoes: {
          type: "array",
          description: "Até 3 frases curtas sobre o que ficou ambíguo ou não coube nos campos.",
          items: { type: "string" },
        },
      },
      required: [
        "code", "itemType", "tipo", "bloco", "m2", "andar", "valor", "status", "dataVenda",
        "AS", "S1", "S2", "S3", "Mensais", "Semestrais", "Anuais", "FGTS", "Subsidio", "Permuta", "Banco",
        "baixaConfianca", "observacoes",
      ],
    },
  };

  const message = await createMessageWithFallback(client, {
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: "tool", name: "preencher_unidade" },
    system:
      "Você preenche o cadastro de uma unidade imobiliária e da sua venda a partir da descrição do usuário, em português do Brasil. " +
      `Hoje é ${hojeISO}; datas relativas ('dia 05', 'mês que vem') resolvem-se a partir daí, sempre em ISO. ` +
      "Valores em reais numéricos ('380 mil' = 380000; '4.500' = 4500). " +
      "NÃO invente: tudo que a descrição não diz fica vazio, 0, -1 ou null, conforme o campo. " +
      "Quando o texto diz que o banco financia 'o restante', use Banco.restante = true e valorFinanciado = 0. " +
      "'Sinal' ou 'entrada' inicial é AS; reforços seguintes são S1, S2, S3.",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `Descrição da venda:\n\n${texto}\n\nChame a ferramenta preencher_unidade.` }],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("O assistente não conseguiu entender a descrição.");
  }
  return normalizar(block.input);
}

/** Parse defensivo: campo ausente ou de tipo errado vira o vazio do contrato. */
export function normalizar(bruto: unknown): DadosVendaLidos {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const numOuNull = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const fonteLida = (v: unknown): FonteLida | null => {
    if (!v || typeof v !== "object") return null;
    const f = v as Record<string, unknown>;
    const valor = numOuNull(f.valor);
    if (!valor) return null;
    const parcelas = Math.trunc(Number(f.parcelas));
    return { valor, parcelas: Number.isFinite(parcelas) && parcelas > 0 ? parcelas : 1, primeiroVencimento: str(f.primeiroVencimento) };
  };
  const valorData = (v: unknown) => {
    if (!v || typeof v !== "object") return null;
    const f = v as Record<string, unknown>;
    const valor = numOuNull(f.valor);
    return valor ? { valor, dataPrevista: str(f.dataPrevista) } : null;
  };
  const permuta = (() => {
    const b = valorData(o.Permuta);
    return b ? { ...b, descricao: str((o.Permuta as Record<string, unknown>).descricao) } : null;
  })();
  const banco = (() => {
    if (!o.Banco || typeof o.Banco !== "object") return null;
    const b = o.Banco as Record<string, unknown>;
    const valorFinanciado = numOuNull(b.valorFinanciado);
    const restante = b.restante === true;
    if (!valorFinanciado && !restante) return null;
    return { valorFinanciado, dataEntrada: str(b.dataEntrada), dataPrimeiraParcela: str(b.dataPrimeiraParcela), restante };
  })();
  const status = str(o.status);
  const andar = Math.trunc(Number(o.andar));
  const lista = (v: unknown) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);
  return {
    code: str(o.code),
    itemType: o.itemType === "condominio" ? "condominio" : o.itemType === "unidade" ? "unidade" : "",
    tipo: str(o.tipo),
    bloco: str(o.bloco),
    m2: numOuNull(o.m2),
    andar: Number.isFinite(andar) && andar >= 0 ? andar : null,
    valor: numOuNull(o.valor),
    status: status === "Disponivel" || status === "Reservado" || status === "Vendido" || status === "Permutado" ? status : "",
    dataVenda: str(o.dataVenda),
    AS: fonteLida(o.AS),
    S1: fonteLida(o.S1),
    S2: fonteLida(o.S2),
    S3: fonteLida(o.S3),
    Mensais: fonteLida(o.Mensais),
    Semestrais: fonteLida(o.Semestrais),
    Anuais: fonteLida(o.Anuais),
    FGTS: valorData(o.FGTS),
    Subsidio: valorData(o.Subsidio),
    Permuta: permuta,
    Banco: banco,
    baixaConfianca: lista(o.baixaConfianca),
    observacoes: lista(o.observacoes).slice(0, 3),
  };
}
