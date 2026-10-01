"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPermutaDocs, deletePermutaDoc } from "@/lib/actions/receitas";
import { TIPOS_DOC_PERMUTA } from "@/lib/permuta-regras";
import { LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { dateBR } from "@/lib/utils";

export interface PermutaDoc {
  id: string;
  filename: string;
  tipo: string | null;
  versao: number;
  url: string | null;
  uploadedAt: string | null;
  uploadedBy: string | null;
}

/**
 * Documentos do ativo de permuta (Prompt P, seção 6): matrícula, laudo,
 * contrato, recibo. Fica DENTRO do formulário do ativo (6.2), por isso não é
 * um <form> próprio: o arquivo e o tipo ficam fora do envio do formulário
 * (sem `name`) e vão à action por um FormData montado aqui. Versão por tipo;
 * remover tira o vínculo e o arquivo continua guardado (6.5) — e a tela diz isso.
 */
export function PermutaDocs({ permutaId, docs, canEdit, r2 }: { permutaId: string; docs: PermutaDoc[]; canEdit: boolean; r2: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [tipo, setTipo] = useState<string>(TIPOS_DOC_PERMUTA[0]);
  const fileRef = useRef<HTMLInputElement>(null);

  const anexar = () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) {
      setAviso({ ok: false, texto: "Selecione ao menos um arquivo." });
      return;
    }
    const fd = new FormData();
    fd.set("permutaId", permutaId);
    fd.set("tipo", tipo);
    for (const f of Array.from(files)) fd.append("file", f);
    setAviso(null);
    start(async () => {
      const r = await addPermutaDocs(fd);
      if (!r.ok) {
        setAviso({ ok: false, texto: r.error });
        return;
      }
      setAviso({ ok: true, texto: `${r.added} arquivo(s) anexado(s).` });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  };
  const remover = (id: string, nome: string) => {
    if (!window.confirm(`Remover "${nome}" deste ativo? O arquivo continua guardado no storage; só o vínculo sai.`)) return;
    setAviso(null);
    start(async () => {
      const r = await deletePermutaDoc(id);
      if (!r.ok) setAviso({ ok: false, texto: r.error });
      else router.refresh();
    });
  };

  return (
    <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-3 sm:col-span-2 lg:col-span-3">
      <h4 className="mb-2 text-[12px] font-semibold text-[var(--color-ink)]">
        Documentos do ativo <span className="font-normal text-[var(--color-ink3)]">matrícula, laudo, contrato, recibo · versão por tipo</span>
      </h4>
      {canEdit && r2 && (
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
          <div>
            <Label>Tipo *</Label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_DOC_PERMUTA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Arquivos (até {LIMITE_UPLOAD_MB} MB cada)</Label>
            <input ref={fileRef} type="file" multiple className="text-xs" aria-label="Arquivos do ativo" />
          </div>
          <div>
            <Button type="button" size="sm" className="w-full" onClick={anexar} disabled={pending}>
              {pending ? "Enviando…" : "Anexar"}
            </Button>
          </div>
        </div>
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
              {d.tipo && (
                <span className="rounded-full bg-[var(--color-surface3)] px-2 py-0.5 text-[10px] text-[var(--color-ink3)]">
                  {d.tipo} · v{d.versao}
                </span>
              )}
              {d.uploadedAt && <span className="text-[11px] text-[var(--color-ink4)]">{dateBR(d.uploadedAt)}</span>}
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
      <p className="mt-2 text-[11px] text-[var(--color-ink4)]">Remover desfaz só o vínculo com o ativo; o arquivo não é apagado. Anexar um documento do mesmo tipo cria a versão seguinte e preserva a anterior.</p>
    </div>
  );
}
