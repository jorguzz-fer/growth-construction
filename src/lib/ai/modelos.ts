/**
 * Qual modelo da Claude o app usa — e como interpretar o que veio no ambiente.
 *
 * A variável `ANTHROPIC_MODEL` existe para trocar de modelo sem mexer em
 * código. O problema é que quem configura o servidor lê o nome comercial
 * ("Sonnet 5", "Opus 5") e é isso que digita — mas a API só aceita o
 * IDENTIFICADOR (`claude-sonnet-5`). Com um valor inválido a chamada falha com
 * erro de modelo, ou (pior) cai silenciosamente no fallback e ninguém percebe
 * que a configuração não está valendo.
 *
 * Este módulo resolve isso em um lugar só: aceita o nome comercial, devolve o
 * ID correto e, quando não dá para entender o valor, diz exatamente o que
 * está errado — texto que a tela de Diagnóstico de IA mostra.
 *
 * Módulo PURO: sem rede, sem `server-only`. Testado em `modelos.test.ts`.
 */

/**
 * Modelos conhecidos, do mais capaz ao mais econômico. Serve para validar o
 * que vem do ambiente e para montar a cadeia de fallback; NÃO é uma lista
 * fechada — um modelo novo, lançado depois desta versão, passa direto (ver
 * `pareceIdDeModelo`).
 */
export const MODELOS_CLAUDE = [
  { id: "claude-opus-5", rotulo: "Claude Opus 5" },
  { id: "claude-opus-4-8", rotulo: "Claude Opus 4.8" },
  { id: "claude-opus-4-7", rotulo: "Claude Opus 4.7" },
  { id: "claude-opus-4-6", rotulo: "Claude Opus 4.6" },
  { id: "claude-sonnet-5", rotulo: "Claude Sonnet 5" },
  { id: "claude-sonnet-4-6", rotulo: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5", rotulo: "Claude Haiku 4.5" },
] as const;

export type IdModelo = (typeof MODELOS_CLAUDE)[number]["id"];

/** Padrão do app quando `ANTHROPIC_MODEL` não está definida. */
export const MODELO_PADRAO: IdModelo = "claude-opus-5";

/**
 * Alternativos, em ordem, quando o modelo escolhido não está liberado para a
 * conta. Documentos de obra são fotos tortas e cupons desbotados: vale ter um
 * degrau capaz (Opus 4.8) antes de cair para o mais barato.
 */
export const MODELOS_FALLBACK: IdModelo[] = [
  "claude-opus-4-8",
  "claude-sonnet-5",
];

const IDS = new Set<string>(MODELOS_CLAUDE.map((m) => m.id));

const MARCAS_ACENTO = new RegExp("[\\u0300-\\u036f]", "g");

/** "Claude Sonnet 5" / "sonnet-5" / "SONNET5" → "sonnet5". */
function chave(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(MARCAS_ACENTO, "")
    .replace(/claude/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Nome comercial → id. Montado a partir do próprio catálogo. */
const POR_NOME = new Map<string, IdModelo>();
for (const m of MODELOS_CLAUDE) {
  POR_NOME.set(chave(m.rotulo), m.id);
  POR_NOME.set(chave(m.id), m.id);
}
// Apelidos que aparecem no dia a dia (versão sem o número, escrita "4.5"...).
POR_NOME.set("opus", "claude-opus-5");
POR_NOME.set("sonnet", "claude-sonnet-5");
POR_NOME.set("haiku", "claude-haiku-4-5");

/**
 * Parece um identificador de modelo da Anthropic? Serve para deixar passar um
 * modelo lançado depois desta versão do app: travar em uma lista fixa
 * significaria ter que alterar código a cada lançamento — exatamente o que a
 * variável de ambiente existe para evitar.
 */
export function pareceIdDeModelo(v: string): boolean {
  return /^claude-[a-z0-9]+(-[a-z0-9]+)+$/.test(v.trim().toLowerCase());
}

export interface ModeloResolvido {
  /** ID que será enviado à API. */
  id: string;
  /**
   * `padrao`     — a variável não está definida;
   * `id`         — veio um ID válido;
   * `desconhecido` — veio um ID plausível, fora do catálogo desta versão;
   * `nome`       — veio o nome comercial e foi traduzido para o ID;
   * `invalido`   — não deu para entender: usa o padrão.
   */
  origem: "padrao" | "id" | "desconhecido" | "nome" | "invalido";
  /** Texto para a tela quando há algo a corrigir/saber. Vazio = tudo certo. */
  aviso: string;
}

/**
 * Traduz o valor de `ANTHROPIC_MODEL` no ID que vai para a API.
 *
 * Nunca lança: um valor errado no ambiente não pode derrubar a leitura — cai
 * no padrão e explica o problema para quem cuida do servidor.
 */
export function resolverModelo(valorEnv: string | undefined | null): ModeloResolvido {
  const bruto = (valorEnv ?? "").trim();
  if (!bruto) {
    return { id: MODELO_PADRAO, origem: "padrao", aviso: "" };
  }
  if (IDS.has(bruto)) {
    return { id: bruto, origem: "id", aviso: "" };
  }
  const porNome = POR_NOME.get(chave(bruto));
  if (porNome) {
    return {
      id: porNome,
      origem: "nome",
      aviso:
        `ANTHROPIC_MODEL está como "${bruto}", que é o nome comercial. ` +
        `Foi usado o identificador "${porNome}" — grave esse valor na variável para não depender desta tradução.`,
    };
  }
  if (pareceIdDeModelo(bruto)) {
    return {
      id: bruto.toLowerCase(),
      origem: "desconhecido",
      aviso:
        `ANTHROPIC_MODEL está como "${bruto}", que não está na lista conhecida desta versão do app. ` +
        "Se for um modelo novo, tudo bem; se for erro de digitação, a chamada vai falhar.",
    };
  }
  return {
    id: MODELO_PADRAO,
    origem: "invalido",
    aviso:
      `ANTHROPIC_MODEL está como "${bruto}", que não é um identificador de modelo válido. ` +
      `Usando "${MODELO_PADRAO}". Valores aceitos: ${MODELOS_CLAUDE.map((m) => m.id).join(", ")}.`,
  };
}

/** Nome comercial de um ID, para exibir junto do identificador na tela. */
export function rotuloModelo(id: string): string {
  return MODELOS_CLAUDE.find((m) => m.id === id)?.rotulo ?? id;
}

/** Cadeia de tentativas: o escolhido primeiro, depois os alternativos. */
export function cadeiaDeModelos(id: string): string[] {
  return [id, ...MODELOS_FALLBACK.filter((m) => m !== id)];
}
