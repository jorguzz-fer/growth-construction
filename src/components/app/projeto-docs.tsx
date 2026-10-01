"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadProjetoDoc, deleteProjetoDoc } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";

export interface ProjetoDoc {
  id: string;
  filename: string;
  tipo: string | null;
  url: string | null;
  uploadedAt: string | null;
}

const TIPOS = [
  "Contrato",
  "Proposta",
  "Documento jurídico",
  "Estrutura societária",
  "Outros",
];

/**
 * Área de documentos do projeto (Prompt B, 13): anexar múltiplos arquivos
 * (contratos, propostas, documentos jurídicos), listar, abrir e remover. Reusa
 * a tabela `documents` (project_id) e o R2. Preservados em edições do projeto.
 * As actions devolvem `{ ok, error }` e a mensagem aparece aqui (38).
 */
export function ProjetoDocs({
  projectId,
  docs,
  canEdit,
  r2,
}: {
  projectId: string;
  docs: ProjetoDoc[];
  canEdit: boolean;
  r2: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const anexar = (fd: FormData) =>
    start(async () => {
      const r = await uploadProjetoDoc(fd);
      setMsg(r.ok ? { ok: true, texto: "Documento anexado." } : { ok: false, texto: r.error });
      if (r.ok) {
        form.current?.reset();
        router.refresh();
      }
    });
  const remover = (id: string, filename: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const r = await deleteProjetoDoc(fd);
      setMsg(r.ok ? { ok: true, texto: `"${filename}" removido.` } : { ok: false, texto: r.error });
      if (r.ok) router.refresh();
    });

  return (
    <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4 sm:col-span-3">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--color-ink)]">
        Documentos do projeto
        <span className="ml-2 font-normal text-[var(--color-ink3)]">
          contratos, propostas, jurídico e outros
        </span>
      </h3>

      {canEdit && r2 && (
        <form
          ref={form}
          action={anexar}
          className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <div className="sm:col-span-1">
            <Label>Tipo</Label>
            <Select name="tipo" defaultValue="Contrato" disabled={pending}>
              {TIPOS.map((t) => (
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
          <div>
            <Button type="submit" size="sm" className="w-full" disabled={pending}>
              {pending ? "Enviando…" : "Anexar"}
            </Button>
          </div>
        </form>
      )}
      {!r2 && (
        <p className="mb-2 text-[12px] text-[var(--color-warning)]">
          Configure as variáveis R2_* para habilitar o anexo de documentos.
        </p>
      )}
      {msg && (
        <p role="status" className={`mb-2 text-[12px] ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
          {msg.texto}
        </p>
      )}

      {docs.length === 0 ? (
        <p className="text-[12px] text-[var(--color-ink4)]">Nenhum documento anexado.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-accent2)]/8 rounded-[8px] border border-[var(--color-accent2)]/12 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
              <span className="font-medium text-[var(--color-ink)]">{d.filename}</span>
              {d.tipo && (
                <span className="rounded-full bg-[var(--color-surface3)] px-2 py-0.5 text-[10px] text-[var(--color-ink3)]">
                  {d.tipo}
                </span>
              )}
              <span className="ml-auto flex items-center gap-3">
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener"
                    className="text-[12px] text-[var(--color-accent2)] hover:underline"
                  >
                    Abrir
                  </a>
                )}
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remover(d.id, d.filename)}
                    className="text-[12px] text-[var(--color-danger)] hover:underline disabled:opacity-50"
                  >
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
