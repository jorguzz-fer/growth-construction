"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InccRow } from "@/lib/calc";
import { updateInccMonth, projectFutureIncc } from "@/lib/actions/incc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

const CONFIRM_MSG =
  "Confirma a alteração deste índice? Esta alteração impactará os cálculos futuros.";

const ordOf = (mes: string) => {
  const [m, y] = mes.split("/").map(Number);
  return y * 12 + (m - 1);
};

export function InccEditor({
  projectId,
  initial,
  canEdit,
}: {
  projectId: string;
  initial: InccRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const autoRan = useRef(false);

  // Projeção automática: se existem meses futuros ainda não projetados, gera a
  // projeção por média móvel automaticamente ao abrir a tela (item 2).
  const needsProjection = useMemo(() => {
    const now = new Date();
    const curOrd = now.getFullYear() * 12 + now.getMonth();
    return initial.some((r) => ordOf(r.m) > curOrd && !r.projected);
  }, [initial]);

  useEffect(() => {
    if (!canEdit || !needsProjection || autoRan.current) return;
    autoRan.current = true;
    start(async () => {
      await projectFutureIncc(projectId);
      router.refresh();
    });
  }, [canEdit, needsProjection, projectId, router]);

  const commit = (row: InccRow, raw: string, input: HTMLInputElement) => {
    const value = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value === row.mo) {
      input.value = String(row.mo); // sem mudança real → restaura
      return;
    }
    if (!window.confirm(CONFIRM_MSG)) {
      input.value = String(row.mo); // cancelado → restaura
      return;
    }
    start(async () => {
      await updateInccMonth(projectId, row.m, value);
      router.refresh();
    });
  };

  const projetados = initial.filter((r) => r.projected).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await projectFutureIncc(projectId);
                router.refresh();
              })
            }
          >
            {pending ? "Processando…" : "Recalcular projeção (média 12m)"}
          </Button>
        )}
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink3)]">
          <Badge tone="neutral">Oficial</Badge> índice real informado
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink3)]">
          <Badge tone="warning">Projeção</Badge> média móvel de 12 meses ·{" "}
          {projetados} {projetados === 1 ? "mês" : "meses"}
        </span>
      </div>

      <p className="mb-4 rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-ink3)]">
        Edite qualquer índice diretamente na tabela — a alteração pede
        confirmação e recalcula os meses projetados automaticamente. Meses
        oficiais nunca são sobrescritos pela projeção.
      </p>

      <Table>
        <THead>
          <tr>
            <TH>Mês</TH>
            <TH>Tipo</TH>
            <TH className="text-right">Variação mensal %</TH>
            <TH className="text-right">Acumulado %</TH>
          </tr>
        </THead>
        <tbody>
          {initial.map((r) => (
            <TR
              key={r.m}
              className={r.projected ? "bg-[var(--color-warning)]/[0.06]" : undefined}
            >
              <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {r.m}
              </TD>
              <TD>
                <Badge tone={r.projected ? "warning" : "neutral"}>
                  {r.projected ? "Projeção" : "Oficial"}
                </Badge>
              </TD>
              <TD className="text-right">
                <input
                  type="number"
                  step="0.001"
                  defaultValue={String(r.mo)}
                  key={`${r.m}-${r.mo}-${r.projected ? "p" : "o"}`}
                  disabled={!canEdit || pending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  onBlur={(e) => commit(r, e.target.value, e.currentTarget)}
                  className={`ml-auto h-8 w-28 rounded-[8px] border px-2 text-right font-[family-name:var(--font-mono)] text-sm ${
                    r.projected
                      ? "border-[var(--color-warning)]/40 bg-white text-[var(--color-ink2)]"
                      : "border-[var(--color-accent2)]/20 bg-white"
                  } disabled:opacity-60`}
                />
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.ac.toFixed(3)}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}
