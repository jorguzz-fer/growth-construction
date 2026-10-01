"use client";

import { useRef, useState, useTransition } from "react";
import { addMedicao } from "@/lib/actions/medicao";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";

/**
 * Formulário de nova medição (Prompt V, 4.4): a action devolve `{ ok, error,
 * aviso }` e a tela mostra os três — erro de validação, sucesso e o aviso de
 * duplicidade (4.6), que não impede o lançamento.
 */
export function MedicaoForm({ projectId, grupos }: { projectId: string; grupos: { code: string; name: string }[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tom: "ok" | "erro" | "aviso"; texto: string } | null>(null);

  return (
    <form
      ref={ref}
      className="grid grid-cols-2 gap-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setMsg(null);
        start(async () => {
          const r = await addMedicao(fd);
          if (!r.ok) return setMsg({ tom: "erro", texto: r.error });
          ref.current?.reset();
          setMsg(r.aviso ? { tom: "aviso", texto: `Medição lançada. ${r.aviso}` } : { tom: "ok", texto: "Medição lançada." });
          window.location.reload();
        });
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <Label>Competência *</Label>
        <MonthField name="competencia" required />
      </div>
      <div className="sm:col-span-2">
        <Label>Grupo de obra (CEF) *</Label>
        <Select name="grupo" defaultValue="" required>
          <option value="">Selecione...</option>
          {grupos.map((g) => (
            <option key={g.code} value={`${g.code}|${g.name}`}>
              {g.code} — {g.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Valor medido *</Label>
        <Input name="valor" type="number" step="0.01" min="0.01" placeholder="0,00" required />
      </div>
      <div className="sm:col-span-4">
        <Label>Observação</Label>
        <Input name="obs" placeholder="" />
      </div>
      <div className="flex items-end sm:col-span-2">
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Lançando…" : "Lançar medição"}
        </Button>
      </div>
      {msg && (
        <p
          role={msg.tom === "erro" ? "alert" : "status"}
          className={`col-span-2 text-sm sm:col-span-6 ${msg.tom === "erro" ? "text-[var(--color-danger)]" : msg.tom === "aviso" ? "text-[#92400e]" : "text-[var(--color-success)]"}`}
        >
          {msg.texto}
        </p>
      )}
    </form>
  );
}
