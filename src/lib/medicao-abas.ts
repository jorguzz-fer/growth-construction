/**
 * Abas da tela única de Medição de Obra (Prompt V, seção 0). Módulo PURO.
 *
 * Três abas, duas rotas: "Nova medição" e "Medições lançadas" vivem em
 * `/medicaolanc` (`?aba=`); "Relatório CEF" em `/medicao`. Cada aba tem a
 * SUA permissão, conferida no servidor; aba sem permissão não é renderizada.
 */
import { can, type PermMatrix } from "@/lib/permissions";
import { TELA_LANCAMENTO, TELA_RELATORIO } from "@/lib/medicao-regras";

export type AbaMedicao = "nova" | "lancadas" | "relatorio";

export interface DefinicaoDeAba {
  id: AbaMedicao;
  rotulo: string;
  href: string;
}

export const ABAS: readonly DefinicaoDeAba[] = [
  { id: "nova", rotulo: "Nova medição", href: "/medicaolanc?aba=nova" },
  { id: "lancadas", rotulo: "Medições lançadas", href: "/medicaolanc?aba=lancadas" },
  { id: "relatorio", rotulo: "Relatório CEF", href: "/medicao" },
];

/** 0.3 — a permissão de cada aba. */
export function podeVerAba(perms: PermMatrix, aba: AbaMedicao): boolean {
  switch (aba) {
    case "nova":
      return can(perms, TELA_LANCAMENTO, "ver") && can(perms, TELA_LANCAMENTO, "criar");
    case "lancadas":
      return can(perms, TELA_LANCAMENTO, "ver");
    case "relatorio":
      return can(perms, TELA_RELATORIO, "ver");
  }
}

export function abasPermitidas(perms: PermMatrix): DefinicaoDeAba[] {
  return ABAS.filter((a) => podeVerAba(perms, a.id));
}

/**
 * 0.2 — a rota de origem define a aba inicial: `/medicao` abre no Relatório;
 * `/medicaolanc` em Nova medição (ou em Lançadas, se pedida ou se não pode
 * criar). Nunca devolve aba sem permissão: nesse caso, null.
 */
export function abaInicial(rota: "/medicao" | "/medicaolanc", perms: PermMatrix, pedida: string | null | undefined): AbaMedicao | null {
  if (rota === "/medicao") return podeVerAba(perms, "relatorio") ? "relatorio" : null;
  const quer: AbaMedicao = pedida === "lancadas" ? "lancadas" : "nova";
  if (podeVerAba(perms, quer)) return quer;
  if (quer === "nova" && podeVerAba(perms, "lancadas")) return "lancadas";
  return null;
}

/** href da aba com o projeto da tela preservado. */
export function hrefDaAba(aba: DefinicaoDeAba, projectId: string): string {
  const sep = aba.href.includes("?") ? "&" : "?";
  return `${aba.href}${sep}project=${encodeURIComponent(projectId)}`;
}

export interface FiltrosDaLista {
  competencia?: string | null;
  grupo?: string | null;
  /** id do autor, ou "sem" para as sem autor. */
  autor?: string | null;
}

export interface MedicaoFiltravel {
  competencia: string;
  grupoCode: string;
  createdBy: string | null;
}

/** 0.4.2 — filtros da aba Lançadas (sobre o que a consulta já recortou por autoria). */
export function filtrarMedicoes<M extends MedicaoFiltravel>(rows: readonly M[], f: FiltrosDaLista): M[] {
  return rows.filter((m) => {
    if (f.competencia && m.competencia !== f.competencia) return false;
    if (f.grupo && m.grupoCode !== f.grupo) return false;
    if (f.autor === "sem" && m.createdBy !== null) return false;
    if (f.autor && f.autor !== "sem" && m.createdBy !== f.autor) return false;
    return true;
  });
}

export function filtroAtivo(f: FiltrosDaLista): boolean {
  return !!(f.competencia || f.grupo || f.autor);
}

/** 0.4.1 — competência decrescente; dentro dela, grupo crescente. */
export function ordenarPorCompetenciaDesc<M extends { competencia: string; grupoCode: string }>(rows: readonly M[]): M[] {
  const chave = (c: string) => {
    const [m, y] = c.split("/");
    return `${(y ?? "").padStart(4, "0")}${(m ?? "").padStart(2, "0")}`;
  };
  return [...rows].sort((a, b) => chave(b.competencia).localeCompare(chave(a.competencia)) || a.grupoCode.localeCompare(b.grupoCode, undefined, { numeric: true }));
}
