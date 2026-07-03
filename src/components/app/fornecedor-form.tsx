"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStakeholder,
  extractFornecedorFromDoc,
} from "@/lib/actions/despesas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export function FornecedorForm({
  papeis,
  aiConfigured,
}: {
  papeis: readonly string[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("PJ");
  const [doc, setDoc] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);

  const toggle = (p: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  function ler() {
    if (!file) {
      setError("Selecione um documento (PDF ou imagem) primeiro.");
      return;
    }
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("file", file);
    startReading(async () => {
      try {
        const x = await extractFornecedorFromDoc(fd);
        const filled: string[] = [];
        if (x.nome) {
          setNome(x.nome);
          filled.push("nome");
        }
        if (x.tipo) {
          setTipo(x.tipo);
          filled.push("tipo");
        }
        if (x.doc) {
          setDoc(x.doc);
          filled.push("documento");
        }
        if (x.email) {
          setEmail(x.email);
          filled.push("e-mail");
        }
        if (x.tel) {
          setTel(x.tel);
          filled.push("telefone");
        }
        if (x.papeis.length) {
          setSelected(new Set(x.papeis));
          filled.push("papéis");
        }
        setNotice(
          filled.length
            ? `Campos preenchidos pela IA: ${filled.join(", ")}. Revise e ajuste antes de cadastrar.`
            : "A IA não conseguiu identificar campos com confiança — preencha manualmente.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao ler o documento.");
      }
    });
  }

  function salvar() {
    setError(null);
    if (!nome.trim()) {
      setError("Informe o nome do fornecedor.");
      return;
    }
    const fd = new FormData();
    fd.set("nome", nome);
    fd.set("tipo", tipo);
    fd.set("doc", doc);
    fd.set("email", email);
    fd.set("tel", tel);
    for (const p of selected) fd.append("papeis", p);
    startSaving(async () => {
      try {
        await addStakeholder(fd);
        setNome("");
        setTipo("PJ");
        setDoc("");
        setEmail("");
        setTel("");
        setSelected(new Set());
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        setNotice(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao cadastrar o fornecedor.");
      }
    });
  }

  const busy = reading || saving;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-4 p-5">
        {/* Documento + leitura por IA */}
        <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label>
                Documento (PDF ou imagem — cartão CNPJ, contrato, cartão de visita)
              </Label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                className="text-xs"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setNotice(null);
                }}
              />
            </div>
            {aiConfigured && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || !file}
                onClick={ler}
              >
                {reading ? "Lendo documento…" : "Ler com IA"}
              </Button>
            )}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
            {aiConfigured
              ? "A IA lê o documento e preenche os campos abaixo — revise antes de cadastrar."
              : "Leitura automática por IA desativada (defina ANTHROPIC_API_KEY para habilitar)."}
          </p>
        </div>

        {/* Campos do fornecedor */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Razão social / nome"
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option>PJ</option>
              <option>PF</option>
            </Select>
          </div>
          <div>
            <Label>CNPJ / CPF</Label>
            <Input value={doc} onChange={(e) => setDoc(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Telefone</Label>
            <Input value={tel} onChange={(e) => setTel(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Papéis</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {papeis.map((p) => (
              <label
                key={p}
                className="flex items-center gap-1.5 text-[13px] text-[var(--color-ink2)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p)}
                  onChange={() => toggle(p)}
                />
                {p}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" disabled={busy} onClick={salvar}>
            {saving ? "Cadastrando…" : "Cadastrar fornecedor"}
          </Button>
          {notice && <span className="text-xs text-[var(--color-accent)]">{notice}</span>}
        </div>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
