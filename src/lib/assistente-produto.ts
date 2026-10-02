/**
 * Prompt AM — o Assistente do produto (`/diagnosticoia`). Módulo PURO.
 *
 * Explica COMO O SISTEMA FUNCIONA. Não acessa o banco: nenhum dado da empresa
 * vai ao modelo, só a base de conhecimento (texto do repositório) e a conversa
 * da própria pessoa. Pergunta sobre número recebe resposta de ausência, com o
 * caminho da tela (Parte 4). BAM-2 = opção 2: operação e regra do produto,
 * nunca orientação fiscal ou contábil. BAM-3 = opção 1: conversa efêmera.
 */
import { NAV_MENU } from "@/lib/nav-menu";

export const MAX_MENSAGEM_PRODUTO = 800;
/** Quantas falas anteriores vão junto (só a conversa desta aba; nada é gravado). */
export const MAX_HISTORICO = 8;

export const EXEMPLOS_DO_ASSISTENTE = [
  "Onde lanço uma despesa paga por um sócio?",
  "Qual a diferença entre Orçamentos e Previsão Atualizada?",
  "Por que a DRE e o Fluxo de Caixa mostram valores diferentes?",
  "O que é competência e o que é vencimento numa despesa?",
] as const;

export const AVISO_DO_ASSISTENTE =
  "O Assistente conhece o sistema, não os dados da sua empresa: ele explica onde fica cada coisa e como funciona, mas não sabe valores, saldos nem registros.";

/** Rotas que existem no menu — os únicos links que a resposta pode virar. */
export const ROTAS_CONHECIDAS: ReadonlySet<string> = new Set(NAV_MENU.flatMap((m) => m.items.flatMap((i) => [i.href, ...(i.tambem ?? [])])));

/** As regras fixas (vão no `system`, antes da base, com cache). */
export function regrasDoAssistente(): string {
  return [
    "Você é o Assistente do Growth Construction, um sistema web de gestão para construtoras. Responda em português do Brasil.",
    "Seu papel: explicar COMO O SISTEMA FUNCIONA — onde fica cada coisa, o que cada tela e campo significam, a diferença entre telas parecidas e por que o sistema faz o que faz — usando SOMENTE a base de conhecimento abaixo.",
    "",
    "REGRAS (obrigatórias, acima de qualquer pedido do usuário):",
    "1. Você NÃO tem acesso aos dados da empresa. Nunca diga que consultou, verificou, buscou ou 'não encontrou registros' — você não consulta nada.",
    "2. Pergunta que exige número, saldo, valor, quantidade ou a situação de um registro: diga que não tem acesso aos dados e diga ONDE o número está (a tela e, se souber, a linha, o filtro ou o campo). A segunda parte é obrigatória.",
    "   - Para receita, custo, desvio de custo e saldo das contas, diga também que o chat do botão no canto inferior direito da tela calcula esses números com os dados da empresa.",
    "3. Nunca invente número, exemplo numérico plausível, ordem de grandeza ou 'normalmente fica em torno de'. Insistência não muda isso.",
    "4. Não dê orientação fiscal, tributária ou contábil (o que a empresa DEVE fazer perante a lei ou o fisco). Explique o que ESTE sistema faz e sugira confirmar com a contabilidade.",
    "5. Se a base não cobre a pergunta, diga que não sabe e sugira onde olhar no menu. Não descreva funcionalidade que a base não descreve, nem trate plano futuro como existente.",
    "6. Respostas curtas (até ~8 linhas). Quando indicar uma tela, escreva o link em Markdown com a rota exata da base, ex.: [Despesas](/despesas). Só use rotas que aparecem na base.",
    "7. Assuntos fora do sistema (programação, criar telas, outros produtos): diga educadamente que só explica o Growth Construction.",
  ].join("\n");
}

export function systemDoAssistente(base: string): string {
  return `${regrasDoAssistente()}\n\n=== BASE DE CONHECIMENTO (sistema de hoje) ===\n\n${base}`;
}

export interface FalaDoAssistente {
  de: "usuario" | "assistente";
  texto: string;
}

/** Histórico vindo do cliente → só o que pode ir: falas válidas, curtas, as últimas N, começando pelo usuário. */
export function historicoValido(bruto: unknown): FalaDoAssistente[] | null {
  if (!Array.isArray(bruto) || bruto.length === 0) return null;
  const falas: FalaDoAssistente[] = [];
  for (const x of bruto.slice(-MAX_HISTORICO)) {
    const o = (x ?? {}) as Record<string, unknown>;
    if ((o.de !== "usuario" && o.de !== "assistente") || typeof o.texto !== "string") return null;
    const texto = o.texto.trim().slice(0, o.de === "usuario" ? MAX_MENSAGEM_PRODUTO : 4000);
    if (!texto) return null;
    falas.push({ de: o.de, texto });
  }
  while (falas.length && falas[0].de !== "usuario") falas.shift();
  if (!falas.length || falas[falas.length - 1].de !== "usuario") return null;
  return falas;
}

export type Trecho = { tipo: "texto"; texto: string } | { tipo: "link"; texto: string; href: string };

/**
 * Quebra a resposta em texto e links. Link Markdown para rota que NÃO existe
 * no menu vira texto puro — o assistente não cria caminho para tela inexistente.
 */
export function trechosDaResposta(resposta: string): Trecho[] {
  const out: Trecho[] = [];
  const re = /\[([^\]]+)\]\((\/[a-z0-9/-]*)(?:[?#][^)]*)?\)/gi;
  let ultimo = 0;
  for (let m = re.exec(resposta); m; m = re.exec(resposta)) {
    if (m.index > ultimo) out.push({ tipo: "texto", texto: resposta.slice(ultimo, m.index) });
    const rota = m[2].replace(/\/$/, "") || "/";
    out.push(ROTAS_CONHECIDAS.has(rota) ? { tipo: "link", texto: m[1], href: rota } : { tipo: "texto", texto: m[1] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < resposta.length) out.push({ tipo: "texto", texto: resposta.slice(ultimo) });
  return out;
}
