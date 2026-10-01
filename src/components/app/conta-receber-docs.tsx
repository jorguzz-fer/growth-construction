"use client";

import { useRef, useState, useTransition } from "react";
import { addContaReceberDocs, deleteContaReceberDoc } from "@/lib/actions/contas-receber";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";

export interface ContaReceberDoc {
  id: string;
  filename: string;
  tipo: string | null;
  url: string | null;
  uploadedAt: string | null;
}

const TIPOS = ["Boleto", "Comprovante", "Contrato", "Outros"];

/**
 * Anexos de uma conta a receber (Prompt K, 6.2): subir boleto, comprovante ou
 * contrato, listar, abrir e remover — o mesmo desenho dos documentos do
 * projeto e da despesa. As actions devolvem { ok, error }; a mensagem aparece
 * aqui. Remover tira só o vínculo; o arquivo fica no storage (6.3).
 */
export function ContaReceberDocs({
  contaId,
  docs,
  canEdit,
  r2,
}: {
  contaId: string;
  docs: ContaReceberDoc[];
  canEdit: boolean;
  r2: boolean;
}) {
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const anexar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setAviso(null);
    start(async () => {
      const r = await addContaReceberDocs(fd);
      if (!r.ok) {
        setAviso({ ok: false, texto: r.error });
        return;
      }
      setAviso({ ok: true, texto: `${r.added} arquivo(s) anexado(s).` });
      formRef.current?.reset();
    });
  };
  const remover = (id: string, nome: string) => {
    if (!window.confirm(`Remover o anexo "${nome}" desta conta? O arquivo continua guardado; só o vínculo sai.`)) return;
    setAviso(null);
    start(async () => {
      const r = await deleteContaReceberDoc(id);
      if (!r.ok) setAviso({ ok: false, texto: r.error });
    });
  };
  return (
    <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-3">
      <h4 className="mb-2 text-[12px] font-semibold text-[var(--color-ink)]">
        Anexos <span className="font-normal text-[var(--color-ink3)]">boleto, comprovante, contrato</span>
      </h4>
      {canEdit && r2 && (
        <form ref={formRef} onSubmit={anexar} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
          <input type="hidden" name="contaReceberId" value={contaId} />
          <div>
            <Label>Tipo</Label>
            <Select name="tipo" defaultValue="Boleto">
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Arquivos (até {LIMITE_UPLOAD_MB} MB cada)</Label>
            <input type="file" name="file" multiple required className="text-xs" />
          </div>
          <div>
            <Button type="submit" size="sm" className="w-full" disabled={pending}>
              {pending ? "Enviando…" : "Anexar"}
            </Button>
          </div>
        </form>
      )}
      {!r2 && <p className="mb-2 text-[12px] text-[var(--color-warning)]">Configure as variáveis R2_* para habilitar o anexo de documentos.</p>}
      {aviso && (
        <p role="status" className={`mb-2 text-[12px] ${aviso.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
          {aviso.texto}
        </p>
      )}
      {docs.length === 0 ? (
        <p className="text-[12px] text-[var(--color-ink4)]">Nenhum documento anexado.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-accent2)]/8 rounded-[8px] border border-[var(--color-accent2)]/12 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[12.5px]">
              <span className="font-medium text-[var(--color-ink)]">{d.filename}</span>
              {d.tipo && <span className="rounded-full bg-[var(--color-surface3)] px-2 py-0.5 text-[10px] text-[var(--color-ink3)]">{d.tipo}</span>}
              <span className="ml-auto flex items-center gap-3">
                {d.url && (
                  <a href={d.url} target="_blank" rel="noopener" className="text-[12px] text-[var(--color-accent2)] hover:underline">
                    Abrir
                  </a>
                )}
                {canEdit && (
                  <button type="button" disabled={pending} onClick={() => remover(d.id, d.filename)} className="text-[12px] text-[var(--color-danger)] hover:underline disabled:opacity-50">
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
