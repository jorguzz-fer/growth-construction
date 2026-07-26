"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Aviso global (dispensável) exibido quando um semestre-calendário se encerrou
 * e há dados para arquivar. A dispensa é por navegador (localStorage) e por
 * semestre — some após dispensar e reaparece no próximo semestre encerrado.
 */
export function BackupReminder({
  semesterKey,
  label,
}: {
  semesterKey: string;
  label: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(`growth.backup.dismissed.${semesterKey}`);
      setShow(dismissed !== "1");
    } catch {
      setShow(true);
    }
  }, [semesterKey]);

  if (!show) return null;

  const dispensar = () => {
    try {
      localStorage.setItem(`growth.backup.dismissed.${semesterKey}`, "1");
    } catch {
      /* ignora */
    }
    setShow(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-warning)]/30 bg-[var(--color-warning)]/12 px-4 py-2 text-[12.5px] sm:px-6">
      <span className="text-[var(--color-ink)]">
        O <strong>{label}</strong> se encerrou. Faça o backup (planilha +
        documentos do período) — nada é apagado.
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/backup"
          onClick={dispensar}
          className="rounded-[6px] bg-[var(--color-accent2)] px-3 py-1 font-medium text-white hover:opacity-90"
        >
          Ir para Backup
        </Link>
        <button
          onClick={dispensar}
          className="rounded-[6px] px-2 py-1 text-[var(--color-ink3)] hover:bg-black/5 hover:text-[var(--color-ink)]"
        >
          Dispensar
        </button>
      </div>
    </div>
  );
}
