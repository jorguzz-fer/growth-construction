/**
 * Documentos do funcionário (Prompt Z, 2.2-A) e folha por competência (2.2-B).
 * PURO. O ASO é dado de SAÚDE (2.2-A.3 / 7.3-A): permissão própria
 * (`funcionariosaso`), nunca ao assistente, nunca com conteúdo em log, e
 * cada abertura registrada. Fotos de documento são imagem de identidade
 * (7.3-B): nunca ao assistente.
 */

export interface TipoDocFuncionario {
  nome: string;
  /** exigido na admissão (checklist 2.2-A.5). */
  admissao: boolean;
  /** atestado de saúde ocupacional — tratamento mais restrito. */
  aso: boolean;
  /** tem validade (2.2-A.7). */
  comValidade: boolean;
  /** prazo de guarda usual — CONFIRMAR COM O CONTADOR (7.3-C); nada é apagado automaticamente. */
  guarda: string;
}

export const TIPOS_DOC_FUNCIONARIO: readonly TipoDocFuncionario[] = [
  { nome: "Documento de identidade", admissao: true, aso: false, comValidade: false, guarda: "Enquanto durar o contrato + 5 anos (prescrição trabalhista) — confirmar com o contador" },
  { nome: "CPF", admissao: true, aso: false, comValidade: false, guarda: "Enquanto durar o contrato + 5 anos — confirmar com o contador" },
  { nome: "CTPS", admissao: true, aso: false, comValidade: false, guarda: "Permanente (registro do empregado) — confirmar com o contador" },
  { nome: "Comprovante de PIS/PASEP", admissao: true, aso: false, comValidade: false, guarda: "Enquanto durar o contrato + 5 anos — confirmar com o contador" },
  { nome: "Título de eleitor", admissao: false, aso: false, comValidade: false, guarda: "Enquanto durar o contrato — confirmar com o contador" },
  { nome: "Certificado de reservista", admissao: false, aso: false, comValidade: false, guarda: "Enquanto durar o contrato — confirmar com o contador" },
  { nome: "Comprovante de endereço", admissao: true, aso: false, comValidade: false, guarda: "Enquanto durar o contrato + 5 anos — confirmar com o contador" },
  { nome: "Comprovante de escolaridade", admissao: false, aso: false, comValidade: false, guarda: "Enquanto durar o contrato — confirmar com o contador" },
  { nome: "Foto 3×4", admissao: false, aso: false, comValidade: false, guarda: "Enquanto durar o contrato — confirmar com o contador" },
  { nome: "ASO — exame admissional", admissao: true, aso: true, comValidade: true, guarda: "20 anos após o desligamento (NR-7) — confirmar com o contador" },
  { nome: "Contrato individual de trabalho", admissao: true, aso: false, comValidade: false, guarda: "Permanente — confirmar com o contador" },
  { nome: "Declaração de dependentes para IR", admissao: false, aso: false, comValidade: false, guarda: "5 anos após o exercício — confirmar com o contador" },
  { nome: "Declaração de vale-transporte", admissao: true, aso: false, comValidade: false, guarda: "Enquanto durar o contrato + 5 anos — confirmar com o contador" },
  { nome: "Certidão de casamento", admissao: false, aso: false, comValidade: false, guarda: "Enquanto durar o contrato — confirmar com o contador" },
  { nome: "Certidão de nascimento de filhos", admissao: false, aso: false, comValidade: false, guarda: "Enquanto durar o contrato + 5 anos (salário-família) — confirmar com o contador" },
  { nome: "ASO periódico, de retorno ou demissional", admissao: false, aso: true, comValidade: true, guarda: "20 anos após o desligamento (NR-7) — confirmar com o contador" },
  { nome: "CNH", admissao: false, aso: false, comValidade: true, guarda: "Enquanto durar o contrato — confirmar com o contador" },
  { nome: "Outros", admissao: false, aso: false, comValidade: false, guarda: "Definir com o contador" },
];
export const NOMES_DOC_FUNCIONARIO = TIPOS_DOC_FUNCIONARIO.map((t) => t.nome);
export const TIPOS_ASO = new Set(TIPOS_DOC_FUNCIONARIO.filter((t) => t.aso).map((t) => t.nome));
export const tipoEhAso = (tipo: string | null | undefined) => !!tipo && TIPOS_ASO.has(tipo);
export const TIPO_ASO_ADMISSIONAL = "ASO — exame admissional";

/** 2.2-A.5 — o que falta para a admissão; o ASO vem destacado (precisa existir ANTES do início). Conferência, não bloqueio. */
export function checklistDeAdmissao(tiposPresentes: readonly string[]): { faltantes: string[]; faltaAso: boolean; completo: boolean } {
  const tem = new Set(tiposPresentes);
  const faltantes = TIPOS_DOC_FUNCIONARIO.filter((t) => t.admissao && !tem.has(t.nome)).map((t) => t.nome);
  return { faltantes, faltaAso: !tem.has(TIPO_ASO_ADMISSIONAL), completo: faltantes.length === 0 };
}

export const AVISO_VALIDADE_DIAS = 30;
/** 2.2-A.7 / 16e — aviso quando a validade estiver perto de vencer (30 dias) ou vencida. */
export function avisoDeValidade(validadeISO: string | null | undefined, hojeISO: string): { estado: "ok" | "vencendo" | "vencido"; dias: number } | null {
  if (!validadeISO) return null;
  const dias = Math.round((Date.parse(validadeISO) - Date.parse(hojeISO)) / 86_400_000);
  if (!Number.isFinite(dias)) return null;
  return { estado: dias < 0 ? "vencido" : dias <= AVISO_VALIDADE_DIAS ? "vencendo" : "ok", dias };
}

/** 2.2-B.3 — tipos da folha. O holerite individual é o único que se vincula ao funcionário (2.2-B.2). */
export const TIPOS_DOC_FOLHA = ["Folha de pagamento", "Holerite individual", "Comprovante de pagamento da folha", "Guia e comprovante de INSS", "Guia e comprovante de FGTS", "Guia e comprovante de IRRF", "Outros encargos"] as const;
export const TIPO_HOLERITE = "Holerite individual";

export function competenciaValida(c: string | null | undefined): boolean {
  return /^(0[1-9]|1[0-2])\/\d{4}$/.test((c ?? "").trim());
}

/** Despesa que parece folha/encargo (heurística de texto) — para a conferência 2.2-B.5. */
export const PARECE_FOLHA = /folha|sal[aá]rio|holerite|fgts|inss|irrf|rescis|13º|décimo terceiro|f[eé]rias/i;

export interface FolhaParaConferir {
  competencia: string;
  despesaId: string | null;
  documentos: number;
}
export interface DespesaDeFolhaCandidata {
  id: string;
  numDoc: string | null;
  competencia: string | null;
  valor: number;
  texto: string;
}
/** 2.2-B.5 — folha arquivada sem despesa vinculada, e despesa que parece folha sem registro na competência. */
export function conferenciaDaFolha(folhas: readonly FolhaParaConferir[], despesas: readonly DespesaDeFolhaCandidata[]): { folhaSemDespesa: string[]; despesaSemFolha: DespesaDeFolhaCandidata[]; folhaSemDocumento: string[] } {
  const comps = new Set(folhas.map((f) => f.competencia));
  const vinculadas = new Set(folhas.map((f) => f.despesaId).filter((x): x is string => !!x));
  return {
    folhaSemDespesa: folhas.filter((f) => !f.despesaId).map((f) => f.competencia).sort(),
    despesaSemFolha: despesas.filter((d) => PARECE_FOLHA.test(d.texto) && !vinculadas.has(d.id) && (!d.competencia || !comps.has(d.competencia))),
    folhaSemDocumento: folhas.filter((f) => f.documentos === 0).map((f) => f.competencia).sort(),
  };
}
