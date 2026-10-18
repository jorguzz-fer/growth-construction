"use client";

import { Fragment, useMemo, useState } from "react";
import type { LinhaAnalitica } from "@/lib/dre-analitica";
import { brl0, pct1 } from "@/lib/utils";

/**
 * Prompts AC3 e AD3 — a tabela dos relatórios analíticos: cada linha com
 * detalhe abre nos filhos (categoria → grupo → conta, ou bloco → grupo →
 * conta). Começa aberta até `abertoAte` (o nível 0 aberto, por padrão).
 */
export function TabelaAnalitica({
  linhas,
  rotuloPct = "% Receita",
  abertoAte = 0,
  rotulo = "Relatório analítico",
}: {
  linhas: LinhaAnalitica[];
  rotuloPct?: string;
  abertoAte?: number;
  rotulo?: string;
}) {
  const comFilhos = useMemo(() => new Set(linhas.map((l) => l.pai).filter((p): p is string => !!p)), [linhas]);
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(linhas.filter((l) => l.nivel <= abertoAte && comFilhos.has(l.id)).map((l) => l.id)));
  const porId = useMemo(() => new Map(linhas.map((l) => [l.id, l])), [linhas]);
  const visivel = (l: LinhaAnalitica): boolean => {
    let p = l.pai;
    while (p) {
      if (!abertas.has(p)) return false;
      p = porId.get(p)?.pai ?? null;
    }
    return true;
  };
  const alternar = (id: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todas = () => setAbertas(new Set(comFilhos));
  const nenhuma = () => setAbertas(new Set());

  return (
    <div>
      <div className="mb-2 flex gap-3 text-[12px]">
        <button type="button" onClick={todas} className="text-[var(--color-accent2)] hover:underline" data-abrir-tudo>
          Abrir até a conta
        </button>
        <button type="button" onClick={nenhuma} className="text-[var(--color-accent2)] hover:underline">
          Recolher
        </button>
      </div>
      <div className="tbl-scroll overflow-x-auto">
        <table className="w-full border-collapse text-sm" data-tabela-analitica aria-label={rotulo}>
          <thead>
            <tr className="border-b border-[var(--color-line)]">
              <th className="px-2 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Item</th>
              <th className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Valor</th>
              <th className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">{rotuloPct}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.filter(visivel).map((l) => {
              const destaque = l.tipo === "sub" || l.tipo === "final";
              const abre = comFilhos.has(l.id);
              return (
                <Fragment key={l.id}>
                  <tr className={`border-b border-[var(--color-line)] ${destaque ? "bg-[var(--color-surface2)]" : ""}`} data-nivel={l.nivel} data-tipo={l.tipo}>
                    <td className="whitespace-nowrap px-2 py-1.5" style={{ paddingLeft: `${0.5 + l.nivel * 1.25}rem` }}>
                      {abre ? (
                        <button type="button" onClick={() => alternar(l.id)} aria-expanded={abertas.has(l.id)} className="inline-flex items-center gap-1.5 text-left">
                          <span aria-hidden className="w-3 text-[10px] text-[var(--color-ink3)]">{abertas.has(l.id) ? "▾" : "▸"}</span>
                          <span className={l.nivel === 0 ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink2)]"}>{l.label}</span>
                        </button>
                      ) : (
                        <span
                          className={`pl-[1.125rem] ${
                            l.tipo === "final" ? "font-semibold text-[var(--color-accent)]" : destaque ? "font-semibold text-[var(--color-ink)]" : l.nivel === 0 ? "text-[var(--color-ink2)]" : "text-[var(--color-ink3)]"
                          }`}
                        >
                          {l.label}
                        </span>
                      )}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-1.5 text-right font-[family-name:var(--font-mono)] ${destaque ? "font-semibold" : ""} ${
                        l.valor < 0 ? "text-[var(--color-danger)]" : destaque ? "text-[var(--color-success)]" : l.nivel === 0 ? "text-[var(--color-ink)]" : "text-[var(--color-ink2)]"
                      }`}
                    >
                      {brl0(l.valor)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{l.pct == null ? "—" : pct1(l.pct)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
