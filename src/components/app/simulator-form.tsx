"use client";

import { useMemo, useState } from "react";
import { simulate, type FinancingType, type InccRow } from "@/lib/calc";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

const num = (v: string) => (v === "" ? 0 : Number(v));

export function SimulatorForm({ incc }: { incc: InccRow[] }) {
  const [tipo, setTipo] = useState<FinancingType>("SAC");
  const [valorImovel, setValorImovel] = useState("537027");
  const [entrada, setEntrada] = useState("30000");
  const [s1, setS1] = useState("3000");
  const [s2, setS2] = useState("3000");
  const [s3, setS3] = useState("3000");
  const [anual1, setAnual1] = useState("13000");
  const [anual2, setAnual2] = useState("91000");
  const [mensais, setMensais] = useState("90");
  const [fgts, setFgts] = useState("0");
  const [subsidio, setSubsidio] = useState("0");
  const [financiamento, setFinanciamento] = useState("0");
  const [renda, setRenda] = useState("16000");
  const [dataInicio, setDataInicio] = useState("2026-06-20");

  const result = useMemo(
    () =>
      simulate(
        {
          tipo,
          valorImovel: num(valorImovel),
          entrada: num(entrada),
          s1: num(s1),
          s2: num(s2),
          s3: num(s3),
          anual1: num(anual1),
          anual2: num(anual2),
          mensais: num(mensais),
          fgts: num(fgts),
          subsidio: num(subsidio),
          financiamento: num(financiamento),
          renda: num(renda),
          dataInicio,
        },
        incc,
      ),
    [
      tipo,
      valorImovel,
      entrada,
      s1,
      s2,
      s3,
      anual1,
      anual2,
      mensais,
      fgts,
      subsidio,
      financiamento,
      renda,
      dataInicio,
      incc,
    ],
  );

  const fields: [string, string, (v: string) => void][] = [
    ["Valor do imóvel", valorImovel, setValorImovel],
    ["Entrada", entrada, setEntrada],
    ["Sinal 1", s1, setS1],
    ["Sinal 2", s2, setS2],
    ["Sinal 3", s3, setS3],
    ["Anual 1 (mês 12)", anual1, setAnual1],
    ["Anual 2 (mês 24)", anual2, setAnual2],
    ["Nº de mensais", mensais, setMensais],
    ["FGTS", fgts, setFgts],
    ["Subsídio", subsidio, setSubsidio],
    ["Financiamento", financiamento, setFinanciamento],
    ["Renda mensal", renda, setRenda],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Entradas */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <Label>Tipo de financiamento</Label>
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as FinancingType)}
            >
              <option value="SAC">SAC</option>
              <option value="PRICE">PRICE</option>
              <option value="SBPE">SBPE</option>
            </Select>
          </div>
          <div>
            <Label>Data de início</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          {fields.map(([label, value, set]) => (
            <div key={label}>
              <Label>{label}</Label>
              <Input
                type="number"
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Resultados */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Total entrada" value={brl0(result.totalEntrada)} />
          <Kpi label="Saldo a financiar" value={brl0(result.saldoMensal)} />
          <Kpi label="Parcela base" value={brl0(result.parcMensal)} />
          <Kpi
            label="% entrada"
            value={`${result.pctEntrada.toFixed(1)}%`}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-ink3)]">
            Comprometimento de renda (limite 30% = {brl0(result.maxParcela)}):
          </span>
          <Badge tone={result.dentroLimite ? "success" : "danger"}>
            {result.dentroLimite ? "dentro do limite" : "acima do limite"}
          </Badge>
        </div>

        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>Mês</TH>
              <TH className="text-right">Obra %</TH>
              <TH className="text-right">INCC %</TH>
              <TH className="text-right">Parcela</TH>
              <TH className="text-right">Especial</TH>
              <TH className="text-right">Total</TH>
            </tr>
          </THead>
          <tbody>
            {result.meses.map((m) => (
              <TR key={m.n}>
                <TD className="font-[family-name:var(--font-mono)]">{m.n}</TD>
                <TD className="font-[family-name:var(--font-mono)]">{m.mm}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {m.evolucao.toFixed(0)}%
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {m.inccAc.toFixed(2)}%
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {brl0(m.parcTotal)}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {m.especial > 0 ? brl0(m.especial) : "—"}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                  {brl0(m.total)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
