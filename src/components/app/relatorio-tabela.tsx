"use client";

import { brl0, pct1 } from "@/lib/utils";
import { csvDaTabela, type TabelaDeRelatorio } from "@/lib/relatorio-custom";
import { Button } from "@/components/ui/button";

/** Prompt RC — a tabela do relatório, com o CSV para baixar. */
export function RelatorioTabela({ tabela, arquivo }: { tabela: TabelaDeRelatorio; arquivo: string }) {
  const comPct = tabela.linhas.some((l) => l.pcts);
  const baixar = () => {
    const blob = new Blob(["﻿" + csvDaTabela(tabela)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${arquivo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div>
      <div className="mb-2 flex justify-end print:hidden">
        <Button type="button" size="sm" variant="outline" onClick={baixar} data-baixar-csv>
          Baixar CSV
        </Button>
      </div>
      <div className="tbl-scroll overflow-x-auto">
        <table className="w-full border-collapse text-sm" data-relatorio-tabela>
          <thead>
            <tr className="border-b border-[var(--color-line)]">
              <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Item</th>
              {tabela.colunas.map((c) => [
                <th key={c} className="whitespace-nowrap px-2 py-2 text-right text-[12px] font-semibold text-[var(--color-ink)]">
                  {c}
                </th>,
                comPct ? (
                  <th key={`${c}-pct`} className="whitespace-nowrap px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase text-[var(--color-ink3)]">
                    {tabela.rotuloPct}
                  </th>
                ) : null,
              ])}
            </tr>
          </thead>
          <tbody>
            {tabela.linhas.map((l) => (
              <tr key={l.id} className={`border-b border-[var(--color-line)] ${l.destaque ? "bg-[var(--color-surface2)] font-semibold" : ""}`}>
                <td
                  className={`sticky left-0 z-10 whitespace-nowrap px-2 py-1.5 ${l.destaque ? "bg-[var(--color-surface2)]" : "bg-white"} ${l.nivel ? "text-[var(--color-ink3)]" : "text-[var(--color-ink)]"}`}
                  style={{ paddingLeft: `${0.5 + l.nivel * 1.25}rem` }}
                >
                  {l.label}
                </td>
                {l.valores.map((v, i) => [
                  <td key={i} className={`whitespace-nowrap px-2 py-1.5 text-right font-[family-name:var(--font-mono)] ${v < 0 ? "text-[var(--color-danger)]" : ""}`}>
                    {brl0(v)}
                  </td>,
                  comPct ? (
                    <td key={`${i}-p`} className="whitespace-nowrap px-2 py-1.5 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {l.pcts?.[i] == null ? "—" : pct1(l.pcts[i]!)}
                    </td>
                  ) : null,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
