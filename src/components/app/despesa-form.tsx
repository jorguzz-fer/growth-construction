"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDespesa, extractDespesaFromDoc } from "@/lib/actions/despesas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField, MonthField } from "@/components/ui/date-field";

interface Fornecedor {
  id: string;
  nome: string;
  doc: string | null;
}
interface Conta {
  code: string;
  name: string;
}
interface Banco {
  id: string;
  banco: string;
  tipo: string;
}

const STRIP_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(STRIP_MARKS, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const digits = (s: string) => s.replace(/\D+/g, "");

export function DespesaForm({
  fornecedores,
  contas,
  bancos,
  categorias,
  aiConfigured,
  r2Configured,
}: {
  fornecedores: Fornecedor[];
  contas: Conta[];
  bancos: Banco[];
  categorias: readonly string[];
  aiConfigured: boolean;
  r2Configured: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [fornecedorId, setFornecedorId] = useState("");
  const [contaCef, setContaCef] = useState("");
  const [categoriaDre, setCategoriaDre] = useState(categorias[0] ?? "Custo Variável");
  const [bancoId, setBancoId] = useState("");
  const [numDoc, setNumDoc] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [valor, setValor] = useState("");
  const [status, setStatus] = useState("A pagar");
  const [file, setFile] = useState<File | null>(null);

  const contaCodes = useMemo(() => new Set(contas.map((c) => c.code)), [contas]);

  function matchFornecedor(nome: string, doc: string): string | null {
    const d = digits(doc);
    if (d) {
      const byDoc = fornecedores.find((f) => f.doc && digits(f.doc) === d);
      if (byDoc) return byDoc.id;
    }
    const n = norm(nome);
    if (!n) return null;
    const exact = fornecedores.find((f) => norm(f.nome) === n);
    if (exact) return exact.id;
    const partial = fornecedores.find(
      (f) => norm(f.nome).includes(n) || n.includes(norm(f.nome)),
    );
    return partial?.id ?? null;
  }

  function ler() {
    const f = file;
    if (!f) {
      setError("Selecione um documento (PDF ou imagem) primeiro.");
      return;
    }
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("file", f);
    startReading(async () => {
      try {
        const x = await extractDespesaFromDoc(fd);
        const filled: string[] = [];
        const fid = matchFornecedor(x.fornecedorNome, x.fornecedorDoc);
        if (fid) {
          setFornecedorId(fid);
          filled.push("fornecedor");
        }
        if (x.contaCef && contaCodes.has(x.contaCef)) {
          setContaCef(x.contaCef);
          filled.push("conta");
        }
        if (x.categoriaDre && categorias.includes(x.categoriaDre)) {
          setCategoriaDre(x.categoriaDre);
          filled.push("categoria DRE");
        }
        if (x.valor > 0) {
          setValor(String(x.valor));
          filled.push("valor");
        }
        if (x.competencia) {
          setCompetencia(x.competencia);
          filled.push("competência");
        }
        if (x.vencimento) {
          setVencimento(x.vencimento);
          filled.push("vencimento");
        }
        if (x.numDoc) {
          setNumDoc(x.numDoc);
          filled.push("nº doc");
        }
        setNotice(
          filled.length
            ? `Campos preenchidos pela IA: ${filled.join(", ")}. Revise e ajuste antes de lançar.`
            : "A IA não conseguiu identificar campos com confiança — preencha manualmente.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao ler o documento.");
      }
    });
  }

  function salvar() {
    setError(null);
    const fd = new FormData();
    fd.set("fornecedorId", fornecedorId);
    fd.set("contaCef", contaCef);
    fd.set("categoriaDre", categoriaDre);
    fd.set("bancoId", bancoId);
    fd.set("numDoc", numDoc);
    fd.set("competencia", competencia);
    fd.set("vencimento", vencimento);
    fd.set("valor", valor || "0");
    fd.set("status", status);
    if (file) fd.set("file", file);
    startSaving(async () => {
      try {
        await addDespesa(fd);
        // limpa o formulário
        setFornecedorId("");
        setContaCef("");
        setCategoriaDre(categorias[0] ?? "Custo Variável");
        setBancoId("");
        setNumDoc("");
        setCompetencia("");
        setVencimento("");
        setValor("");
        setStatus("A pagar");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        setNotice(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao lançar a despesa.");
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
              <Label>Documento (PDF ou imagem — NF, boleto, contrato)</Label>
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
              ? "A IA lê o documento e preenche os campos abaixo — revise antes de lançar."
              : "Leitura automática por IA desativada (defina ANTHROPIC_API_KEY para habilitar)."}
            {r2Configured
              ? " O arquivo é anexado e vinculado à despesa ao lançar."
              : " Configure as variáveis R2_* para armazenar o arquivo."}
          </p>
        </div>

        {/* Campos da despesa */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Fornecedor</Label>
            <Select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
              <option value="">Selecione...</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Conta CEF / Plano de Contas</Label>
            <Select value={contaCef} onChange={(e) => setContaCef(e.target.value)}>
              <option value="">Selecione...</option>
              {contas.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Categoria DRE</Label>
            <Select value={categoriaDre} onChange={(e) => setCategoriaDre(e.target.value)}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Banco</Label>
            <Select value={bancoId} onChange={(e) => setBancoId(e.target.value)}>
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.banco} · {b.tipo}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Nº Documento</Label>
            <Input
              value={numDoc}
              onChange={(e) => setNumDoc(e.target.value)}
              placeholder="auto (BMV-…)"
            />
          </div>
          <div>
            <Label>Competência</Label>
            <MonthField value={competencia} onChange={setCompetencia} />
          </div>
          <div>
            <Label>Vencimento</Label>
            <DateField value={vencimento} onChange={setVencimento} />
          </div>
          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>A pagar</option>
              <option>Pago</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" className="w-full" disabled={busy} onClick={salvar}>
              {saving ? "Lançando…" : "Lançar despesa"}
            </Button>
          </div>
        </div>

        {notice && (
          <p className="text-xs text-[var(--color-accent)]">{notice}</p>
        )}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
