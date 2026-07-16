"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { dateBR } from "@/lib/utils";

/**
 * Filtro de período (Data inicial / Data final) padrão para todos os reports
 * (exceto DRE). Persiste em `de`/`ate` na URL (formato interno MM/DD/YYYY),
 * preservando os demais parâmetros da tela.
 *
 * O período escolhido NÃO é aplicado automaticamente: o usuário ajusta as datas
 * e confirma numa janela ("Confirmar período"); só após a confirmação o
 * dashboard é recarregado com o intervalo selecionado.
 */
export function DateRangeFilter({ de, ate }: { de: string; ate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  // Rascunho local: só vira filtro aplicado após confirmação.
  const [localDe, setLocalDe] = useState(de);
  const [localAte, setLocalAte] = useState(ate);
  const [confirming, setConfirming] = useState(false);

  const dirty = localDe !== de || localAte !== ate;

  const apply = (nd: string, na: string) => {
    const params = new URLSearchParams(sp.toString());
    if (nd) params.set("de", nd);
    else params.delete("de");
    if (na) params.set("ate", na);
    else params.delete("ate");
    start(() => router.push(`${pathname}?${params.toString()}`));
  };

  const confirmar = () => {
    setConfirming(false);
    apply(localDe, localAte);
  };

  const limpar = () => {
    setLocalDe("");
    setLocalAte("");
    apply("", "");
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          Data inicial
        </label>
        <DateField value={localDe} onChange={setLocalDe} className="h-9 w-40" />
      </div>
      <div>
        <label className="mb-1 block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          Data final
        </label>
        <DateField value={localAte} onChange={setLocalAte} className="h-9 w-40" />
      </div>

      <Button
        size="sm"
        disabled={pending || !dirty}
        onClick={() => setConfirming(true)}
      >
        Confirmar período
      </Button>

      {(de || ate || localDe || localAte) && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={limpar}>
          Limpar período
        </Button>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">
              Confirmar período
            </h3>
            <p className="mt-2 text-[13px] text-[var(--color-ink2)]">
              O dashboard será atualizado com o intervalo:
            </p>
            <p className="mt-2 font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)]">
              {localDe ? dateBR(localDe) : "início"} — {localAte ? dateBR(localAte) : "fim"}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={pending} onClick={confirmar}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
