"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStockMovementDocs, deleteStockMovementDoc } from "@/lib/actions/estoque";
import { TIPOS_DOC_ESTOQUE } from "@/lib/estoque-regras";
import { LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";
import { comprimirImagem } from "@/lib/imagem-compressao";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { dateBR } from "@/lib/utils";

export interface DocDoMovimento {
  id: string;
  filename: string;
  tipo: string | null;
  versao: number;
  contentType: string | null;
  uploadedAt: string | null;
  url: string | null;
}

/**
 * Documentos do movimento (Prompt Y, 4-A): nota do fornecedor, romaneio,
 * foto do recebimento, requisição de saída. Várias imagens por vez, com
 * miniatura; versão por tipo; remover desfaz só o vínculo. A nota fiscal já
 * está na despesa — aqui vai o recebimento. Fotos são comprimidas no
 * navegador antes do envio (4-A.5).
 */
export function EstoqueDocs({ movimentoId, tipoMovimento, docs, canEdit, r2 }: { movimentoId: string; tipoMovimento: "entrada" | "saida"; docs: DocDoMovimento[]; canEdit: boolean; r2: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [tipo, setTipo] = useState<string>(tipoMovimento === "saida" ? "Requisição de saída" : TIPOS_DOC_ESTOQUE[0]);
  const fileRef = useRef<HTMLInputElement>(null);

  const anexar = () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return setAviso({ ok: false, texto: "Selecione ao menos um arquivo." });
    setAviso(null);
    start(async () => {
      const fd = new FormData();
      fd.set("movimentoId", movimentoId);
      fd.set("tipo", tipo);
      let comprimidas = 0;
      for (const f of Array.from(files)) {
        const g = await comprimirImagem(f);
        if (g !== f) comprimidas++;
        fd.append("file", g);
      }
      const r = await addStockMovementDocs(fd);
      if (!r.ok) return setAviso({ ok: false, texto: r.error });
      setAviso({ ok: true, texto: `${r.added} arquivo(s) anexado(s)${comprimidas ? ` (${comprimidas} foto(s) comprimida(s))` : ""}.` });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  };
  const remover = (d: DocDoMovimento) => {
    if (!window.confirm(`Remover "${d.filename}" deste movimento? O arquivo continua guardado; só o vínculo sai.`)) return;
    start(async () => {
      const r = await deleteStockMovementDoc(d.id);
      if (!r.ok) setAviso({ ok: false, texto: r.error });
      else router.refresh();
    });
  };
  const imagens = docs.filter((d) => d.contentType?.startsWith("image/"));
  const outros = docs.filter((d) => !d.contentType?.startsWith("image/"));

  return (
    <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface2)] p-3" data-docs-movimento={movimentoId}>
      <div className="mb-2 text-[12px] text-[var(--color-ink2)]">
        <strong className="text-[var(--color-ink)]">Documentos do movimento</strong> · nota, romaneio, foto do recebimento, requisição. A nota fiscal já está na despesa — aqui vai o recebimento: o que chegou, quando e em que estado.
      </div>
      {canEdit && r2 && (
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
          <div>
            <Label>Tipo *</Label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo do documento">
              {TIPOS_DOC_ESTOQUE.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Arquivos ou fotos (até {LIMITE_UPLOAD_MB} MB cada; fotos são comprimidas)</Label>
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="text-xs" aria-label="Arquivos do movimento" />
          </div>
          <div><Button type="button" size="sm" className="w-full" onClick={anexar} disabled={pending}>{pending ? "Enviando…" : "Anexar"}</Button></div>
        </div>
      )}
      {!r2 && <p className="mb-2 text-[12px] text-[var(--color-warning)]">Configure as variáveis R2_* para habilitar o anexo de documentos.</p>}
      {aviso && <p role="status" className={`mb-2 text-[12px] ${aviso.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>{aviso.texto}</p>}
      {docs.length === 0 ? (
        <p className="text-[12px] text-[var(--color-ink4)]">Nenhum documento anexado.</p>
      ) : (
        <>
          {imagens.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {imagens.map((d) => (
                <li key={d.id} className="w-28 text-[10.5px] text-[var(--color-ink3)]">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener" title={`${d.filename} · ${d.tipo ?? ""} v${d.versao}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.url} alt={d.filename} className="h-20 w-28 rounded-[8px] border border-[var(--color-line)] object-cover" />
                    </a>
                  ) : (
                    <div className="flex h-20 w-28 items-center justify-center rounded-[8px] border border-[var(--color-line)] bg-white">foto</div>
                  )}
                  <div className="truncate">{d.tipo ?? "Foto"} · v{d.versao}</div>
                  {canEdit && <button type="button" disabled={pending} onClick={() => remover(d)} className="text-[var(--color-danger)] hover:underline">Remover</button>}
                </li>
              ))}
            </ul>
          )}
          {outros.length > 0 && (
            <ul className="divide-y divide-[var(--color-accent2)]/8 rounded-[8px] border border-[var(--color-accent2)]/12 bg-white">
              {outros.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[12.5px]">
                  <span className="font-medium text-[var(--color-ink)]">{d.filename}</span>
                  {d.tipo && <span className="rounded-full bg-[var(--color-surface3)] px-2 py-0.5 text-[10px] text-[var(--color-ink3)]">{d.tipo} · v{d.versao}</span>}
                  {d.uploadedAt && <span className="text-[11px] text-[var(--color-ink4)]">{dateBR(d.uploadedAt)}</span>}
                  <span className="ml-auto flex items-center gap-3">
                    {d.url && <a href={d.url} target="_blank" rel="noopener" className="text-[12px] text-[var(--color-accent2)] hover:underline">Abrir</a>}
                    {canEdit && <button type="button" disabled={pending} onClick={() => remover(d)} className="text-[12px] text-[var(--color-danger)] hover:underline disabled:opacity-50">Remover</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-2 text-[11px] text-[var(--color-ink4)]">Mesmo tipo anexado de novo vira a versão seguinte e preserva a anterior. Remover desfaz só o vínculo; o arquivo não é apagado. Estornar o movimento não remove os documentos.</p>
    </div>
  );
}
