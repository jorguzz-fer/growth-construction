"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { INDICADORES_DE_NEGOCIO, type Formato, type ValorDeIndicador } from "@/lib/indicadores-negocio";
import { Card, CardContent } from "@/components/ui/card";
import { brl0, pct1 } from "@/lib/utils";

const fmt = (f: Formato, v: ValorDeIndicador) =>
  v.texto ?? (v.valor == null ? "—" : f === "pct" ? pct1(v.valor) : f === "brlm2" ? `${brl0(v.valor)}/m²` : f === "contagem" ? String(v.valor) : brl0(v.valor));

/**
 * Prompt AE2 — indicadores de negócio selecionáveis. Os valores de todos vêm
 * calculados do servidor; a escolha fica no endereço (`?ind=`) para o PDF e
 * o link levarem os mesmos indicadores.
 */
export function IndicadoresNegocio({
  disponiveis,
  escolhidos,
  colunas,
  valores,
}: {
  disponiveis: string[];
  escolhidos: string[];
  colunas: string[];
  /** id → um valor por coluna. */
  valores: Record<string, ValorDeIndicador[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [sel, setSel] = useState<string[]>(escolhidos);
  const catalogo = useMemo(() => INDICADORES_DE_NEGOCIO.filter((i) => disponiveis.includes(i.id)), [disponiveis]);
  const alternar = (id: string) => {
    const novo = catalogo.map((i) => i.id).filter((x) => (x === id ? !sel.includes(id) : sel.includes(x)));
    setSel(novo);
    const p = new URLSearchParams(sp.toString());
    if (novo.length) p.set("ind", novo.join(","));
    else p.delete("ind");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const mostrados = catalogo.filter((i) => sel.includes(i.id));
  return (
    <Card className="mb-6" data-indicadores-negocio data-pdf-bloco>
      <CardContent className="p-5">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Indicadores de negócio</h2>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 print:hidden" role="group" aria-label="Escolha os indicadores">
          {catalogo.map((i) => (
            <label key={i.id} className="flex items-center gap-1.5 text-[12.5px] text-[var(--color-ink2)]" title={i.definicao}>
              <input type="checkbox" checked={sel.includes(i.id)} onChange={() => alternar(i.id)} data-indicador={i.id} />
              {i.nome}
            </label>
          ))}
        </div>
        {mostrados.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--color-ink3)]">Marque ao menos um indicador.</p>
        ) : (
          <div className="tbl-scroll mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line)]">
                  <th className="px-2 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Indicador</th>
                  {colunas.map((c) => (
                    <th key={c} className="whitespace-nowrap px-2 py-2 text-right text-[12px] font-semibold text-[var(--color-ink)]">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mostrados.map((i) => (
                  <tr key={i.id} className="border-b border-[var(--color-line)]" data-linha-indicador={i.id}>
                    <td className="px-2 py-1.5">
                      <div className="text-[var(--color-ink)]">{i.nome}</div>
                      <div className="text-[11px] text-[var(--color-ink3)]">{i.definicao}</div>
                    </td>
                    {(valores[i.id] ?? []).map((v, k) => (
                      <td key={k} className="whitespace-nowrap px-2 py-1.5 text-right font-[family-name:var(--font-mono)]" title={v.motivo}>
                        {fmt(i.formato, v)}
                        {v.valor == null && v.motivo && <div className="font-sans text-[10.5px] text-[var(--color-ink4)]">{v.motivo}</div>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
