"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadMedicaoDoc, unlinkMedicaoDoc } from "@/lib/actions/medicao-docs";
import { TIPOS_DOC_MEDICAO, rotuloDoDoc, type DocDaMedicao } from "@/lib/medicao-docs-regras";
import { LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";

/**
 * Anexos de UMA medição (Prompt V, seção 5): laudo, relatório fotográfico,
 * PLS, ART/RRT. Versão por tipo (5.4); remover desfaz só o vínculo (5.5).
 * As actions devolvem `{ ok, error }` e a mensagem aparece aqui.
 */
export function MedicaoDocs({ medicaoId, docs, canEdit, r2 }: { medicaoId: string; docs: DocDaMedicao[]; canEdit: boolean; r2: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const anexar = (fd: FormData) =>
    start(async () => {
      const r = await uploadMedicaoDoc(fd);
      setMsg(r.ok ? { ok: true, texto: `Documento anexado (v${r.versao}).` } : { ok: false, texto: r.error });
      if (r.ok) {
        form.current?.reset();
        router.refresh();
      }
    });
  const remover = (d: DocDaMedicao) =>
    start(async () => {
      if (!window.confirm(`Remover "${d.filename}" desta medição? O arquivo continua guardado; só o vínculo sai.`)) return;
      const r = await unlinkMedicaoDoc(d.id);
      setMsg(r.ok ? { ok: true, texto: `"${d.filename}" removido da medição.` } : { ok: false, texto: r.error });
      if (r.ok) router.refresh();
    });

  return (
    <div data-medicao-docs className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-3">
      <h4 className="mb-2 text-[12.5px] font-semibold text-[var(--color-ink)]">
        Documentos da medição <span className="font-normal text-[var(--color-ink3)]">laudo, relatório fotográfico, PLS, ART/RRT</span>
      </h4>
      {canEdit && r2 && (
        <form ref={form} action={anexar} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
          <input type="hidden" name="medicaoId" value={medicaoId} />
          <div>
            <Label>Tipo</Label>
            <Select name="tipo" defaultValue={TIPOS_DOC_MEDICAO[0]} disabled={pending} className="h-8 text-xs">
              {TIPOS_DOC_MEDICAO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Arquivo (até {LIMITE_UPLOAD_MB} MB)</Label>
            <input type="file" name="file" required className="text-xs" disabled={pending} />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Enviando…" : "Anexar"}
          </Button>
        </form>
      )}
      {!r2 && <p className="mb-2 text-[12px] text-[var(--color-warning)]">Configure as variáveis R2_* para habilitar o anexo de documentos.</p>}
      {msg && (
        <p role="status" className={`mb-2 text-[12px] ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
          {msg.texto}
        </p>
      )}
      {docs.length === 0 ? (
        <p className="text-[12px] text-[var(--color-ink4)]">Nenhum documento anexado a esta medição.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-accent2)]/8 rounded-[8px] border border-[var(--color-accent2)]/12 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[12.5px]">
              <span className="rounded-full bg-[var(--color-surface3)] px-2 py-0.5 text-[10px] text-[var(--color-ink3)]">{rotuloDoDoc(d)}</span>
              <span className="font-medium text-[var(--color-ink)]">{d.filename}</span>
              {d.uploadedAt && <span className="text-[11px] text-[var(--color-ink4)]">{d.uploadedAt}</span>}
              <span className="ml-auto flex items-center gap-3">
                {d.url && (
                  <a href={d.url} target="_blank" rel="noopener" className="text-[12px] text-[var(--color-accent2)] hover:underline">
                    Abrir
                  </a>
                )}
                {canEdit && (
                  <button type="button" disabled={pending} onClick={() => remover(d)} className="text-[12px] text-[var(--color-danger)] hover:underline disabled:opacity-50">
                    Remover
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
