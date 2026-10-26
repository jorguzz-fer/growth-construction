/**
 * Prompt AO, Parte 8 — o que o assistente da tela de Backup mostra. Módulo
 * PURO e determinístico: lê o resumo do pacote (contagens) e o histórico de
 * downloads. Nunca gera nem baixa pacote (8.2) e nunca mostra conteúdo de
 * linha — fala de tabelas e quantidades, não de pessoas.
 */
import { semestreSalvo, type BackupFeito } from "@/lib/backup-historico";

export interface ResumoGuardado {
  geradoEm?: string;
  totalDeLinhas?: number;
  tabelas?: { tabela: string; familia: string; camada: string; linhas: number; semData: number; erro?: boolean }[];
  documentos?: { noPeriodo: number; incluidos: number; falhos: number; asoOmitidos: number };
  referenciasFora?: { tabela: string; coluna: string; aponta: string; quantas: number }[];
  tabelasComFalha?: string[];
}

/** 8.1 — "O que este pacote contém", em frases. */
export function lerResumoDoPacote(r: ResumoGuardado): string[] {
  const L: string[] = [];
  const tabelas = r.tabelas ?? [];
  const comLinhas = tabelas.filter((t) => t.linhas > 0);
  L.push(`${r.totalDeLinhas ?? 0} linhas em ${tabelas.length} tabelas (${comLinhas.length} com dados).`);
  const cad = tabelas.filter((t) => t.camada === "cadastro").reduce((s, t) => s + t.linhas, 0);
  const mov = tabelas.filter((t) => t.camada === "movimento").reduce((s, t) => s + t.linhas, 0);
  L.push(`Cadastro inteiro: ${cad} linhas. Movimento do semestre: ${mov} linhas.`);
  const maiores = [...comLinhas].sort((a, b) => b.linhas - a.linhas).slice(0, 5);
  if (maiores.length) L.push(`Maiores: ${maiores.map((t) => `${t.tabela} (${t.linhas})`).join(", ")}.`);
  const d = r.documentos;
  if (d) {
    L.push(`Documentos: ${d.incluidos} de ${d.noPeriodo}${d.falhos ? `; ${d.falhos} não puderam ser baixados (a lista está no leia-me)` : ""}.`);
    if (d.asoOmitidos) L.push(`${d.asoOmitidos} documento(s) de ASO ficaram fora por ser dado de saúde.`);
  }
  const semData = tabelas.filter((t) => t.semData > 0);
  if (semData.length) L.push(`Linhas sem data reconhecível (entram em todo pacote): ${semData.map((t) => `${t.tabela} (${t.semData})`).join(", ")}.`);
  const fora = r.referenciasFora ?? [];
  if (fora.length) L.push(`Apontam para outro semestre: ${fora.map((x) => `${x.tabela} → ${x.aponta} (${x.quantas})`).join(", ")}. Esses registros estão no pacote do semestre deles.`);
  const falha = r.tabelasComFalha ?? [];
  L.push(falha.length ? `Tabelas que falharam na leitura: ${falha.join(", ")} — o pacote está incompleto.` : "Nenhuma tabela falhou na leitura.");
  return L;
}

/** 8.1 — "Períodos sem backup": semestres encerrados nunca salvos depois de encerrados. */
export function periodosSemBackup(
  semestres: readonly { key: string; label: string; closed: boolean; total: number; fim: Date; ultimoBackup: BackupFeito | null }[],
): { key: string; label: string; motivo: string }[] {
  return semestres
    .filter((s) => s.closed && s.total > 0 && !semestreSalvo(s.fim, s.ultimoBackup))
    .map((s) => ({ key: s.key, label: s.label, motivo: s.ultimoBackup ? "baixado antes do fim do semestre — incompleto" : "nunca baixado" }));
}

/** 8.1 — "O que mudou desde o último backup", em frases. */
export function lerMudancas(m: readonly { tabela: string; criadas: number; alteradas: number }[]): string[] {
  if (!m.length) return [];
  return m.map((x) => `${x.tabela}: ${[x.criadas ? `${x.criadas} nova(s)` : "", x.alteradas ? `${x.alteradas} alterada(s)` : ""].filter(Boolean).join(", ")}`);
}
