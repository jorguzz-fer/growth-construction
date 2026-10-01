/**
 * Regras da Medição de Obra (Prompt V). Módulo PURO: nada aqui lê banco.
 *
 * A medição é informação AUXILIAR: alimenta o Relatório CEF e não a DRE.
 * Quem grava é `actions/medicao.ts`; aqui ficam as validações (4.5), o aviso
 * de duplicidade (4.6: avisar, não bloquear) e a regra de autoria (0.5).
 */
export const TELA_LANCAMENTO = "medicaolanc" as const;
export const TELA_RELATORIO = "medicao" as const;

export const ROTULO_SEM_AUTOR = "autor não registrado";

/** "MM/YYYY" estrito (mês 01–12, ano de 4 dígitos). */
export function competenciaValida(c: string | null | undefined): boolean {
  return /^(0[1-9]|1[0-2])\/\d{4}$/.test((c ?? "").trim());
}

/** 4.5 — valor numérico, finito e maior que zero; vazio/zero/negativo recusam. */
export function recusaDoValor(valor: string | number | null | undefined): string | null {
  const texto = String(valor ?? "").trim();
  if (texto === "") return "Informe o valor medido.";
  const n = Number(texto);
  if (!Number.isFinite(n)) return "Informe um valor válido.";
  if (n <= 0) return "O valor medido precisa ser maior que zero.";
  return null;
}

export interface EntradaDeMedicao {
  competencia: string;
  grupoCode: string;
  valor: string;
}

/** 4.5 — o que impede gravar (primeira recusa encontrada). */
export function recusaDaMedicao(e: EntradaDeMedicao): string | null {
  if (!competenciaValida(e.competencia)) return "Informe a competência no formato MM/AAAA.";
  if (!e.grupoCode.trim()) return "Selecione o grupo de obra.";
  return recusaDoValor(e.valor);
}

export interface MedicaoExistente {
  id: string;
  competencia: string;
  grupoCode: string;
  valor: number;
}

/**
 * 4.6 / 0.4.4 — duplicidade como ALERTA, no padrão do documento fiscal:
 * mesmo grupo e mesma competência já lançados. Pode ser medição complementar,
 * por isso nunca bloqueia; o aviso diz o motivo e quanto já existe.
 */
export function avisoDeDuplicidade(existentes: readonly MedicaoExistente[], nova: { competencia: string; grupoCode: string }, brl: (n: number) => string, ignorarId?: string): string | null {
  const iguais = existentes.filter((m) => m.id !== ignorarId && m.competencia === nova.competencia && m.grupoCode === nova.grupoCode);
  if (iguais.length === 0) return null;
  const soma = iguais.reduce((a, m) => a + m.valor, 0);
  return `Já existe ${iguais.length} medição do grupo ${nova.grupoCode} em ${nova.competencia} (${brl(soma)}). Pode ser medição complementar — confira antes de somar duas vezes.`;
}

/** Ids das medições que repetem grupo + competência (para marcar na lista). */
export function idsDuplicados(medicoes: readonly MedicaoExistente[]): Set<string> {
  const porChave = new Map<string, MedicaoExistente[]>();
  for (const m of medicoes) {
    const k = `${m.competencia}|${m.grupoCode}`;
    (porChave.get(k) ?? porChave.set(k, []).get(k)!).push(m);
  }
  const out = new Set<string>();
  for (const grupo of porChave.values()) if (grupo.length > 1) for (const m of grupo) out.add(m.id);
  return out;
}

/**
 * 0.3 / 0.5 — quem vê só as próprias medições: o engenheiro. Controller,
 * admin, owner e membro veem todas; o contador não tem a aba de lançamento.
 */
export function veSoAsProprias(role: string): boolean {
  return role === "engenheiro";
}

/**
 * 0.5.5 — pode editar/excluir esta medição? Quem vê todas, sim. Quem vê só as
 * próprias: só a que lançou — e a sem autor (0.5.3), que é de todos.
 */
export function podeTocarMedicao(m: { createdBy: string | null }, usuario: { userId: string | null; role: string }): boolean {
  if (!veSoAsProprias(usuario.role)) return true;
  if (m.createdBy == null) return true;
  return !!usuario.userId && m.createdBy === usuario.userId;
}

/** Rótulo do autor na lista: nome, senão e-mail, senão "autor não registrado". */
export function rotuloDoAutor(m: { createdBy: string | null; autorNome?: string | null; autorEmail?: string | null }): string {
  if (!m.createdBy) return ROTULO_SEM_AUTOR;
  return m.autorNome || m.autorEmail || "usuário removido";
}

/** 0.4.5 — estado vazio que diz o motivo. */
export function textoDoVazio(args: { soAsProprias: boolean; filtrado: boolean }): string {
  if (args.filtrado) return "Nenhuma medição com os filtros escolhidos.";
  return args.soAsProprias ? "Nenhuma medição sua nesta obra (as de outros autores não aparecem aqui)." : "Nenhuma medição lançada nesta obra.";
}
