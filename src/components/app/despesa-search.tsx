"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DespesaDTO } from "@/components/app/despesas-table";
import { brl0, dateBR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { registroCasa } from "@/lib/busca";

/**
 * Busca de despesas (lupa): filtra por palavra-chave (observação), código
 * (nº do documento), valor ou fornecedor, e abre uma tela auxiliar com as
 * opções que batem. Clicar em um resultado abre a edição da despesa.
 */
export function DespesaSearch({
  rows,
  fornecedores,
}: {
  rows: DespesaDTO[];
  fornecedores: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fornById = useMemo(
    () => new Map(fornecedores.map((f) => [f.id, f.nome])),
    [fornecedores],
  );

  const resultados = useMemo(() => {
    if (!q.trim()) return [];
    // Busca por similaridade em vários campos ao mesmo tempo; vários termos são
    // combinados (todos precisam casar), em qualquer ordem. Roda a cada tecla.
    return rows
      .filter((d) =>
        registroCasa(
          q,
          [
            d.numDoc,
            d.fornecedorId ? fornById.get(d.fornecedorId) : null,
            d.obs,
            d.categoriaDre,
            d.contaCef,
            d.competencia,
            d.status,
          ],
          [Number(d.valor)],
        ),
      )
      .slice(0, 60);
  }, [q, rows, fornById]);

  const abrir = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const fechar = () => {
    setOpen(false);
    setQ("");
  };
  const editar = (d: DespesaDTO) => {
    fechar();
    router.push(
      `/despesas?tab=lancamentos&proj=${d.projectId}&edit=${d.id}`,
    );
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      {/* Campo de busca VISÍVEL (não um botão discreto): ao focar/digitar abre a
          tela auxiliar com os resultados, de onde se edita ou exclui a despesa. */}
      <div className="relative w-full">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink3)]"
        >
          🔍
        </span>
        <input
          readOnly
          onFocus={abrir}
          onClick={abrir}
          placeholder="Buscar despesa por palavra-chave, nº do pedido, valor ou fornecedor…"
          className="w-full cursor-pointer rounded-[8px] border border-[var(--color-accent2)]/25 bg-white py-2 pl-9 pr-3 text-[13px] text-[var(--color-ink2)] placeholder:text-[var(--color-ink4)] hover:bg-[var(--color-surface2)] focus:border-[var(--color-accent2)] focus:outline-none"
        />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
          onClick={fechar}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[12px] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-accent2)]/12 px-4 py-3">
              <span aria-hidden className="text-[var(--color-ink3)]">🔍</span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && fechar()}
                placeholder="Palavra-chave, código (nº doc), valor ou fornecedor…"
                className="w-full bg-transparent text-[14px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink4)]"
              />
              <button
                onClick={fechar}
                className="text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              {q.trim().length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[var(--color-ink3)]">
                  Digite para buscar entre {rows.length} despesas.
                </p>
              ) : resultados.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[var(--color-ink3)]">
                  Nenhuma despesa encontrada para “{q}”.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-accent2)]/8">
                  {resultados.map((d) => {
                    const forn = d.fornecedorId ? fornById.get(d.fornecedorId) ?? "—" : "—";
                    return (
                      <li key={d.id}>
                        <button
                          onClick={() => editar(d)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-surface2)]"
                        >
                          <span className="w-16 shrink-0 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
                            {d.numDoc ?? "—"}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink)]">
                            {forn}
                            {d.obs ? (
                              <span className="text-[var(--color-ink3)]"> · {d.obs}</span>
                            ) : null}
                          </span>
                          {d.categoriaDre && (
                            <Badge tone="neutral">{d.categoriaDre}</Badge>
                          )}
                          <span className="w-24 shrink-0 text-right font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--color-ink2)]">
                            {brl0(Number(d.valor))}
                          </span>
                          <span className="w-20 shrink-0 text-right font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink4)]">
                            {dateBR(d.competencia)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {resultados.length > 0 && (
              <div className="border-t border-[var(--color-accent2)]/12 px-4 py-2 text-[11px] text-[var(--color-ink3)]">
                {resultados.length} resultado(s) · clique para abrir a despesa, onde é
                possível editar, cancelar ou excluir
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
