"use client";

import { uploadProjetoDoc, deleteProjetoDoc } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";

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
 * Área de documentos do projeto (item 4): anexar múltiplos arquivos (contratos,
 * propostas, documentos jurídicos), listar, abrir e remover. Reusa a tabela
 * `documents` (project_id) e o R2. Preservados em edições do projeto.
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
          action={uploadProjetoDoc}
          className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <div className="sm:col-span-1">
            <Label>Tipo</Label>
            <Select name="tipo" defaultValue="Contrato">
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Arquivo (até 20 MB)</Label>
            <input type="file" name="file" required className="text-xs" />
          </div>
          <div>
            <Button type="submit" size="sm" className="w-full">
              Anexar
            </Button>
          </div>
        </form>
      )}
      {!r2 && (
        <p className="mb-2 text-[12px] text-[var(--color-warning)]">
          Configure as variáveis R2_* para habilitar o anexo de documentos.
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
                  <form action={deleteProjetoDoc}>
                    <input type="hidden" name="id" value={d.id} />
                    <button
                      type="submit"
                      className="text-[12px] text-[var(--color-danger)] hover:underline"
                    >
                      Remover
                    </button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
