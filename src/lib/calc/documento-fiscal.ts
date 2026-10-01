/**
 * Documento fiscal — item 1.2 / RG-06.
 *
 * O número da nota é do EMITENTE; o PED é da empresa. São coisas diferentes e
 * ambas existem. Este módulo concentra o que é regra (tipos aceitos, quando o
 * número passa a ser exigido, formato da chave de acesso, chave de duplicidade)
 * para que a tela e o servidor apliquem exatamente o mesmo critério.
 *
 * Princípio que atravessa tudo aqui: **a nota chega depois**. Nada neste módulo
 * impede lançar uma despesa sem documento; o que ele faz é dizer quando a
 * ausência vira pendência e quando um número repetido merece um aviso.
 */

export const TIPOS_DOCUMENTO = [
  { id: "SEM_DOC", label: "Sem documento" },
  { id: "NFE", label: "NF-e" },
  { id: "NFSE", label: "NFS-e" },
  { id: "NFCE", label: "NFC-e" },
  { id: "RECIBO", label: "Recibo" },
  { id: "CUPOM", label: "Cupom fiscal" },
  { id: "CONTRATO", label: "Contrato" },
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]["id"];

const IDS = new Set<string>(TIPOS_DOCUMENTO.map((t) => t.id));

export function ehTipoDocumento(v: string | null | undefined): v is TipoDocumento {
  return !!v && IDS.has(v);
}

export function rotuloTipoDocumento(id: string | null | undefined): string {
  return TIPOS_DOCUMENTO.find((t) => t.id === id)?.label ?? "Sem documento";
}

/** O tipo escolhido implica que existe um número de documento a informar? */
export function exigeNumero(tipo: string | null | undefined): boolean {
  return ehTipoDocumento(tipo) && tipo !== "SEM_DOC";
}

/**
 * Chave de acesso da NF-e: exatamente 44 dígitos.
 *
 * Vazio é válido — o campo é opcional. Só o que está preenchido é conferido.
 * Pontos e espaços são ignorados: quem copia da DANFE costuma trazer separadores.
 */
export function chaveAcessoValida(chave: string | null | undefined): boolean {
  if (!chave || !chave.trim()) return true;
  return /^\d{44}$/.test(chave.replace(/[\s.\-]/g, ""));
}

/** Normaliza a chave para gravação (só dígitos), ou `null` quando vazia. */
export function normalizarChaveAcesso(chave: string | null | undefined): string | null {
  if (!chave || !chave.trim()) return null;
  const d = chave.replace(/[\s.\-]/g, "");
  return d || null;
}

export interface DocumentoFiscalEntrada {
  tipo?: string | null;
  numero?: string | null;
  serie?: string | null;
  chaveAcesso?: string | null;
  dataEmissao?: string | null;
}

/**
 * Valida o bloco de documento fiscal NO MOMENTO DO LANÇAMENTO.
 *
 * Aqui o número nunca é exigido: a nota chega depois e travar isso impediria o
 * uso real do sistema. Só recusa o que está claramente errado — chave de acesso
 * com formato inválido.
 */
export function validarDocumentoFiscal(
  doc: DocumentoFiscalEntrada,
): string | null {
  if (doc.tipo && !ehTipoDocumento(doc.tipo)) return "Tipo de documento inválido.";
  if (!chaveAcessoValida(doc.chaveAcesso)) {
    return "A chave de acesso deve ter 44 dígitos.";
  }
  return null;
}

/**
 * Valida no momento em que a despesa passa a **Pago** (item 1.2).
 *
 * É aqui que a ausência do número vira problema: uma despesa liquidada sem
 * documento fiscal não fecha com a contabilidade. Ainda assim, a regra só se
 * aplica quando o usuário declarou que existe documento — escolher
 * "Sem documento" é uma resposta legítima (RPA, acerto informal).
 */
export function validarDocumentoAoPagar(
  doc: DocumentoFiscalEntrada,
): string | null {
  const base = validarDocumentoFiscal(doc);
  if (base) return base;
  if (exigeNumero(doc.tipo) && !doc.numero?.trim()) {
    return `Informe o número do documento (${rotuloTipoDocumento(doc.tipo)}) para marcar a despesa como paga.`;
  }
  return null;
}

/**
 * Chave lógica de duplicidade: tenant + fornecedor + tipo + série + número.
 *
 * Serve a um ALERTA, nunca a um bloqueio (decisão D2): numeração de NF é
 * sequencial por emitente e por série, então dois fornecedores podem
 * legitimamente ter a mesma NF 1234. Bloquear geraria falso positivo.
 *
 * Devolve `null` quando não há número — sem número não há duplicidade a apontar.
 */
export function chaveDuplicidade(
  fornecedorId: string | null | undefined,
  doc: DocumentoFiscalEntrada,
): string | null {
  const numero = doc.numero?.trim();
  if (!numero || !exigeNumero(doc.tipo)) return null;
  return [
    fornecedorId ?? "sem-fornecedor",
    doc.tipo,
    doc.serie?.trim() || "sem-serie",
    numero.toUpperCase(),
  ].join("|");
}

/** A despesa está pendente de documento fiscal? Base do filtro e do selo `⚠ Sem NF`. */
export function pendenteDeDocumento(
  docs: { tipo: string | null; numero: string | null }[],
): boolean {
  if (docs.length === 0) return true;
  // Basta um documento com número — ou uma declaração explícita de que não há.
  return !docs.some((d) => d.tipo === "SEM_DOC" || (exigeNumero(d.tipo) && !!d.numero?.trim()));
}

/**
 * Prompt S, 4.1 — o selo "Sem NF" cobria quatro situações com o mesmo texto.
 * Esta função diz QUAL é: nenhum registro; tipo escolhido sem número; tipo
 * que não exige número e não é a declaração "sem documento"; tipo inválido.
 * `null` quando não há pendência. Mesma base de `pendenteDeDocumento`.
 */
export function pendenciaFiscal(docs: { tipo: string | null; numero: string | null }[]): string | null {
  if (!pendenteDeDocumento(docs)) return null;
  if (docs.length === 0) return "Nenhum documento fiscal registrado: informe a nota ou declare \"sem documento\".";
  const invalido = docs.find((d) => !ehTipoDocumento(d.tipo));
  if (invalido) return `Tipo de documento inválido: "${invalido.tipo ?? "vazio"}". Escolha um tipo da lista.`;
  const semNumero = docs.find((d) => exigeNumero(d.tipo) && !d.numero?.trim());
  if (semNumero) return `${rotuloTipoDocumento(semNumero.tipo)} escolhido, sem o número: falta informar o número.`;
  return `${docs.map((d) => rotuloTipoDocumento(d.tipo)).join(", ")} sem declaração de documento: informe a nota ou declare "sem documento".`;
}
