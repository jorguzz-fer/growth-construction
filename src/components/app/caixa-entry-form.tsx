"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCash } from "@/lib/actions/caixa";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";

interface Conta {
  id: string;
  banco: string;
  cc: string | null;
}

type Tipo = "receita" | "despesa" | "ajuste";

const TIPOS: { key: Tipo; label: string; hint: string }[] = [
  {
    key: "receita",
    label: "Receita",
    hint: "Entrada de caixa. Use “Avulsa (extrato)” quando não há contraparte no módulo de Receitas.",
  },
  {
    key: "despesa",
    label: "Despesa (extrato)",
    hint: "Saída que consta no extrato mas não foi encontrada/conciliada no módulo de Despesas.",
  },
  {
    key: "ajuste",
    label: "Ajuste de Caixa",
    hint: "Ajuste manual do saldo, para mais ou para menos (sem contraparte nos módulos).",
  },
];

export function CaixaEntryForm({ contas }: { contas: Conta[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState<Tipo>("receita");
  const [sinal, setSinal] = useState<"mais" | "menos">("mais");
  const [catReceita, setCatReceita] = useState("mensais");
  const [data, setData] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");

  const hint = TIPOS.find((t) => t.key === tipo)?.hint ?? "";

  const salvar = () => {
    setError(null);
    const mag = Math.abs(Number(valor) || 0);
    if (mag <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    const fd = new FormData();
    fd.set("tipo", tipo);
    fd.set("data", data);
    fd.set("descricao", descricao);
    fd.set("valor", String(mag));
    fd.set("bankAccountId", bankAccountId);
    if (tipo === "receita") fd.set("cat", catReceita);
    if (tipo === "ajuste") fd.set("sinal", sinal);
    start(async () => {
      try {
        await addCash(fd);
        setData("");
        setDescricao("");
        setValor("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao lançar.");
      }
    });
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        {/* Seletor de tipo */}
        <div className="mb-4 flex flex-wrap gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
          {TIPOS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTipo(t.key)}
              className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
                tipo === t.key
                  ? "bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <div>
            <Label>Data</Label>
            <DateField value={data} onChange={setData} />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={
                tipo === "ajuste"
                  ? "Ex.: Ajuste de saldo / diferença de extrato"
                  : "Ex.: Tarifa bancária / TED recebida"
              }
            />
          </div>

          {tipo === "ajuste" && (
            <div>
              <Label>Sentido</Label>
              <Select value={sinal} onChange={(e) => setSinal(e.target.value as "mais" | "menos")}>
                <option value="mais">Para mais (+)</option>
                <option value="menos">Para menos (−)</option>
              </Select>
            </div>
          )}

          {tipo === "receita" && (
            <div>
              <Label>Categoria</Label>
              <Select value={catReceita} onChange={(e) => setCatReceita(e.target.value)}>
                <option value="mensais">Mensais</option>
                <option value="AS">Ato/Sinal</option>
                <option value="reembolso">Reembolso</option>
                <option value="extrato">Avulsa (extrato)</option>
                <option value="outro">Outro</option>
              </Select>
            </div>
          )}

          <div>
            <Label>Valor {tipo === "despesa" ? "(saída)" : tipo === "ajuste" ? "(módulo)" : "(entrada)"}</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <Label>Conta (opcional)</Label>
            <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">—</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} · {c.cc || "s/ conta"}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end sm:col-span-6">
            <Button type="button" disabled={pending} onClick={salvar}>
              {pending
                ? "Lançando…"
                : tipo === "ajuste"
                  ? "Lançar ajuste"
                  : "Adicionar lançamento"}
            </Button>
          </div>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          {hint}
          {tipo !== "receita" || catReceita === "extrato"
            ? " O lançamento já entra como conciliado (não há contraparte nos módulos para casar)."
            : ""}
        </p>
        {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
