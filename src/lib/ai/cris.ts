import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiClient, createMessageWithFallback } from "@/lib/ai/client";
import { BASE_DE_CONHECIMENTO } from "@/lib/assistente-base";
import { CATALOGO } from "@/lib/assistente-chat";
import {
  MAX_VOLTAS,
  blocoDaTela,
  propostaValida,
  regrasDaCris,
  type ContextoDeTela,
  type FalaDaCris,
  type PropostaDePreenchimento,
  type TipoDeAnexo,
} from "@/lib/cris";

/**
 * Prompt E2 — uma resposta da Cris. Vai ao modelo:
 *  - no `system`, com cache: as regras e a base de conhecimento (texto fixo);
 *  - a conversa desta aba (nada é gravado);
 *  - na última fala: o bloco <tela> (resumo agregado que a tela montou, sem
 *    dado pessoal — `sanitizarDados`) e, se houver, o documento anexado;
 *  - o resultado das consultas que o modelo pedir por `consultar_numero`,
 *    calculadas no servidor com o acesso da pessoa.
 * NÃO vai: cadastro, histórico, dado pessoal, nada que a tela não mostre.
 */

export interface PedidoDaCris {
  conversa: readonly FalaDaCris[];
  tela: ContextoDeTela | null;
  /** A pessoa pode ver a tela do contexto? Sem isso, os números da tela não vão. */
  dadosPermitidos: boolean;
  anexo: { tipo: TipoDeAnexo; base64: string; nome: string } | null;
  /** Executa `consultar_numero` no servidor (o contexto vem de quem chama). */
  consultar: (entrada: unknown) => Promise<string>;
}

export interface RespostaDaCris {
  texto: string;
  proposta: PropostaDePreenchimento | null;
  consultas: number;
}

const FERRAMENTA_CONSULTA: Anthropic.Tool = {
  name: "consultar_numero",
  description:
    "Calcula, com os dados da empresa e o acesso da pessoa, um número do catálogo: " +
    CATALOGO.map((m) => `${m.id} (${m.definicao})`).join("; ") +
    ". Use para números que não estão no bloco <tela> ou de outras obras e cenários.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      metrica: { type: "string", enum: CATALOGO.map((m) => m.id) },
      cenario: { type: "string", enum: ["", "atual", "budget", "forecast"], description: '"" = Atual (o movimento real).' },
      obra: { type: "string", description: 'Nome da obra como a pessoa escreveu; "" para a obra da tela ou todas.' },
      todas: { type: "boolean", description: "true para todas as obras / a empresa toda." },
      de: { type: "string", description: 'Competência inicial MM/AAAA, ou "".' },
      ate: { type: "string", description: 'Competência final MM/AAAA, ou "".' },
    },
    required: ["metrica", "cenario", "obra", "todas", "de", "ate"],
  },
};

function ferramentaDeProposta(tela: ContextoDeTela): Anthropic.Tool {
  const form = tela.formulario!;
  return {
    name: "propor_preenchimento",
    description:
      `Preenche o formulário "${form.titulo}" da tela para a pessoa conferir e salvar. Não grava nada. ` +
      "Use os nomes de campo do <formulario>. Em `conferir`, diga o que você deduziu ou não tem certeza, por campo.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        valores: {
          type: "object",
          description: "campo → valor (texto). Só campos do formulário.",
          additionalProperties: { type: "string" },
        },
        conferir: {
          type: "object",
          description: "campo → motivo da conferência.",
          additionalProperties: { type: "string" },
        },
        observacao: { type: "string", description: "Uma frase para a pessoa (ex.: o que faltou no documento)." },
      },
      required: ["valores"],
    },
  };
}

function textoDe(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function responderComoCris(p: PedidoDaCris): Promise<RespostaDaCris> {
  const tools: Anthropic.Tool[] = [FERRAMENTA_CONSULTA];
  if (p.tela?.formulario) tools.push(ferramentaDeProposta(p.tela));

  // Conversa: falas anteriores como texto; a última leva a tela e o anexo.
  const messages: Anthropic.MessageParam[] = p.conversa.slice(0, -1).map((f) => ({
    role: f.de === "usuario" ? "user" : "assistant",
    content: f.texto,
  }));
  const ultima = p.conversa[p.conversa.length - 1];
  const conteudo: Anthropic.ContentBlockParam[] = [];
  if (p.anexo) {
    conteudo.push(
      p.anexo.tipo === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.anexo.base64 }, title: p.anexo.nome }
        : { type: "image", source: { type: "base64", media_type: p.anexo.tipo as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: p.anexo.base64 } },
    );
  }
  conteudo.push({ type: "text", text: blocoDaTela(p.tela, p.dadosPermitidos) });
  conteudo.push({ type: "text", text: ultima.texto });
  messages.push({ role: "user", content: conteudo });

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: `${regrasDaCris()}\n\n=== BASE DE CONHECIMENTO (sistema de hoje) ===\n\n${BASE_DE_CONHECIMENTO}`, cache_control: { type: "ephemeral" } },
  ];
  const client = aiClient();
  let proposta: PropostaDePreenchimento | null = null;
  let consultas = 0;

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const msg = await createMessageWithFallback(client, { max_tokens: 2000, system, tools, messages });
    if (msg.stop_reason === "refusal") return { texto: "Não posso ajudar com esse pedido.", proposta, consultas };
    const usos = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || usos.length === 0) {
      const texto = textoDe(msg.content);
      return { texto: texto || (proposta ? "Preenchi a tela para você conferir." : "Não consegui responder. Tente de novo."), proposta, consultas };
    }
    messages.push({ role: "assistant", content: msg.content });
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const uso of usos) {
      if (uso.name === "consultar_numero") {
        consultas++;
        try {
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: await p.consultar(uso.input) });
        } catch (e) {
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: e instanceof Error ? e.message : "falha na consulta", is_error: true });
        }
      } else if (uso.name === "propor_preenchimento") {
        const v = propostaValida(uso.input, p.tela?.formulario);
        if (v) proposta = v;
        resultados.push({
          type: "tool_result",
          tool_use_id: uso.id,
          content: v
            ? `Proposta entregue à tela com ${Object.keys(v.valores).length} campo(s). A pessoa confere e salva. Responda em uma ou duas frases o que foi preenchido e o que conferir.`
            : "Nenhum campo válido: use os nomes e as opções do <formulario>.",
          is_error: !v,
        });
      } else {
        resultados.push({ type: "tool_result", tool_use_id: uso.id, content: "Ferramenta desconhecida.", is_error: true });
      }
    }
    messages.push({ role: "user", content: resultados });
  }
  return { texto: proposta ? "Preenchi a tela para você conferir." : "A consulta ficou longa demais. Refaça a pergunta mais direta.", proposta, consultas };
}
