/**
 * Prompt AO, Parte 6 — o histórico de backups (pelo registro de download na
 * Auditoria) e o que ele muda no aviso. Módulo PURO.
 *
 * "Encerrado" continua sendo calendário puro (7.3): semestre encerrado ainda
 * recebe lançamento. Por isso só conta como salvo o backup baixado DEPOIS do
 * fim do semestre — um pacote baixado durante o semestre estava incompleto.
 */
export interface BackupFeito {
  em: Date;
  por: string;
}

/** O semestre (de fim `fim`) já tem backup baixado depois de encerrado? */
export function semestreSalvo(fim: Date, ultimo: BackupFeito | null | undefined): boolean {
  return !!ultimo && ultimo.em.getTime() > fim.getTime();
}

/** O semestre pendente do aviso: o mais recente encerrado, com dados, ainda não salvo depois de encerrado. */
export function semestrePendente<S extends { key: string; closed: boolean; total: number; fim: Date }>(
  semestres: readonly S[],
  backups: ReadonlyMap<string, BackupFeito>,
): string | null {
  return semestres.find((s) => s.closed && s.total > 0 && !semestreSalvo(s.fim, backups.get(s.key)))?.key ?? null;
}
