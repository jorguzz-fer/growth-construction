"use client";

import { useRef, useState, useTransition } from "react";
import { addMedicao } from "@/lib/actions/medicao";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";
import { useCrisFormulario } from "@/components/app/cris-contexto";
import { formularioDaMedicao, valoresDaMedicao } from "@/lib/medicao-cris";

/**
 * Formulário de nova medição (Prompt V, 4.4): a action devolve `{ ok, error,
 * aviso }` e a tela mostra os três — erro de validação, sucesso e o aviso de
 * duplicidade (4.6), que não impede o lançamento.
 *
 * Prompt V2b — o engenheiro dita a medição para a Cris (pela voz do chat).
 * Ela só preenche; quem lança é o botão "Lançar medição".
 */
export function MedicaoForm({ projectId, grupos }: { projectId: string; grupos: { code: string; name: string }[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tom: "ok" | "erro" | "aviso"; texto: string; daCris?: boolean } | null>(null);
  const vazio = { competencia: "", grupo: "", valor: "", obs: "" };
  const [f, setF] = useState(vazio);
  useCrisFormulario(formularioDaMedicao(grupos), (p) => {
    const r = valoresDaMedicao(p.valores, grupos);
    setF((x) => ({ ...x, ...r.valores }));
    setMsg({ tom: r.avisos.length ? "aviso" : "ok", texto: ["A Cris preencheu a medição. Confira e clique em Lançar medição.", ...r.avisos].join(" "), daCris: true });
  });

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
          setF(vazio);
          setMsg(r.aviso ? { tom: "aviso", texto: `Medição lançada. ${r.aviso}` } : { tom: "ok", texto: "Medição lançada." });
          window.location.reload();
        });
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <Label>Competência *</Label>
        <MonthField name="competencia" value={f.competencia} onChange={(v) => setF((x) => ({ ...x, competencia: v }))} required />
      </div>
      <div className="sm:col-span-2">
        <Label>Grupo de obra (CEF) *</Label>
        <Select name="grupo" value={f.grupo} onChange={(e) => setF((x) => ({ ...x, grupo: e.target.value }))} required>
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
        <Input name="valor" type="number" step="0.01" min="0.01" placeholder="0,00" value={f.valor} onChange={(e) => setF((x) => ({ ...x, valor: e.target.value }))} required />
      </div>
      <div className="sm:col-span-4">
        <Label>Observação</Label>
        <Input name="obs" placeholder="" value={f.obs} onChange={(e) => setF((x) => ({ ...x, obs: e.target.value }))} />
      </div>
      <div className="flex items-end sm:col-span-2">
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Lançando…" : "Lançar medição"}
        </Button>
      </div>
      {msg && (
        <p
          role={msg.tom === "erro" ? "alert" : "status"}
          data-cris-preencheu={msg.daCris ? "" : undefined}
          className={`col-span-2 text-sm sm:col-span-6 ${msg.tom === "erro" ? "text-[var(--color-danger)]" : msg.tom === "aviso" ? "text-[#92400e]" : "text-[var(--color-success)]"}`}
        >
          {msg.texto}
        </p>
      )}
    </form>
  );
}
