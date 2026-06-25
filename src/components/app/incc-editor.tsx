"use client";

import { useMemo, useState, useTransition } from "react";
import { recalcIncc, type InccRow } from "@/lib/calc";
import { saveIncc } from "@/lib/actions/incc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export function InccEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: InccRow[];
}) {
  const [monthly, setMonthly] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((r) => [r.m, String(r.mo)])),
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Acumulado recalculado ao vivo a partir das variações mensais editadas.
  const recalced = useMemo(
    () =>
      recalcIncc(
        initial.map((r) => ({
          m: r.m,
          mo: monthly[r.m] === "" ? 0 : Number(monthly[r.m]),
          ac: 0,
        })),
      ),
    [monthly, initial],
  );

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveIncc(
        projectId,
        initial.map((r) => ({
          mes: r.m,
          mo: monthly[r.m] === "" ? 0 : Number(monthly[r.m]),
        })),
      );
      setSaved(true);
    });
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Salvando..." : "Salvar INCC"}
        </Button>
        {saved && !pending && (
          <span className="text-sm text-[var(--color-success)]">
            Tabela salva.
          </span>
        )}
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Mês</TH>
            <TH className="text-right">Variação mensal %</TH>
            <TH className="text-right">Acumulado %</TH>
          </tr>
        </THead>
        <tbody>
          {recalced.map((r) => (
            <TR key={r.m}>
              <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {r.m}
              </TD>
              <TD className="text-right">
                <Input
                  type="number"
                  step="0.001"
                  value={monthly[r.m]}
                  onChange={(e) =>
                    setMonthly((m) => ({ ...m, [r.m]: e.target.value }))
                  }
                  className="ml-auto h-8 w-28 text-right font-[family-name:var(--font-mono)]"
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
