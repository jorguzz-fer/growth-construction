/**
 * Regras da Previsão Atualizada (Prompt F). Módulo PURO.
 *
 * - identificação da revisão (2): nome obrigatório, origem e data;
 * - limite de revisões por projeto (3, 8.3): 12, com aviso perto do teto;
 * - totais herdados (6): origem declarada e divergência não bloqueante;
 * - comparação (5): cor pelo significado do bloco, ausente ≠ zero, regime.
 */
import { brl0, dateBR } from "@/lib/utils";

export const LIMITE_PREVISOES = 12;
export const REGIME_DA_COMPARACAO = "competência";

export function recusaDoNome(nome: string | null | undefined): string | null {
  if (!(nome ?? "").trim()) return "Dê um nome à previsão (ex.: Revisão 01 · maio). Previsão sem nome é impossível de achar depois.";
  return null;
}

/** Quantas revisões ainda cabem; `aviso` quando restam 2 ou menos (8.3). */
export function vagasRestantes(existentes: number, limite = LIMITE_PREVISOES): { vagas: number; aviso: string | null } {
  const vagas = Math.max(0, limite - existentes);
  if (vagas === 0) return { vagas, aviso: `Limite de ${limite} previsões por projeto atingido. Exclua uma antiga em Configuração da Versão para criar outra.` };
  if (vagas <= 2) return { vagas, aviso: `Atenção: restam ${vagas} vaga(s) das ${limite} previsões deste projeto.` };
  return { vagas, aviso: null };
}

export function recusaDoLimite(existentes: number, limite = LIMITE_PREVISOES): string | null {
  return existentes >= limite ? `Limite de ${limite} versões de Previsão por projeto atingido.` : null;
}

/** "Base: Orçamento X · criada em DD/MM/AAAA" (2.2). */
export function rotuloDaOrigem(v: { sourceLabel: string | null; sourceKind: string | null; createdAt: string | null }): string {
  const base = v.sourceLabel ? `Base: ${v.sourceKind === "forecast" ? "Previsão" : "Orçamento"} “${v.sourceLabel}”` : "Sem Orçamento de origem registrado";
  const quando = v.createdAt ? ` · criada em ${dateBR(isoParaInterna(v.createdAt))}` : "";
  return base + quando;
}

/** "2026-05-10T..." → "05/10/2026" (formato interno MM/DD/YYYY). */
export function isoParaInterna(iso: string): string {
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[1]}/${d[2]}/${d[0]}` : "";
}

/** 6.2 — total herdado × total atual do Orçamento, sem bloquear. */
export function avisoDeDivergencia(totalPrevisao: number, totalOrcamentoHoje: number | null | undefined): string | null {
  if (totalOrcamentoHoje == null) return null;
  if (Math.abs(totalPrevisao - totalOrcamentoHoje) < 0.005) return null;
  return `Orçamento hoje: ${brl0(totalOrcamentoHoje)} (previsão herdou ${brl0(totalPrevisao)})`;
}

/* ─── comparação (5) ─────────────────────────────────────────────────── */

export type TomDaVariacao = "bom" | "alerta" | "neutro";

/** FC-08: no bloco de despesas, variação positiva é alerta; nas receitas, é bom. */
export function tomDaVariacao(bloco: "receita" | "despesa", diff: number): TomDaVariacao {
  if (Math.abs(diff) < 0.005) return "neutro";
  if (bloco === "despesa") return diff > 0 ? "alerta" : "bom";
  return diff > 0 ? "bom" : "alerta";
}

/** Variação em %: "—" sem base, "novo" quando só a previsão tem. */
export function variacaoPct(budget: number | null, forecast: number | null): string {
  if (budget == null || forecast == null) return "—";
  if (budget === 0) return forecast === 0 ? "—" : "novo";
  return `${(((forecast - budget) / budget) * 100).toFixed(1)}%`;
}

/** 5.3: ausente não é zero. */
export function valorOuAusente(v: number | null, brl: (n: number) => string): string {
  return v == null ? "ausente" : brl(v);
}

/** Variação em R$ só quando os dois lados existem. */
export function diferenca(budget: number | null, forecast: number | null): number | null {
  if (budget == null || forecast == null) return null;
  return Math.round((forecast - budget) * 100) / 100;
}
