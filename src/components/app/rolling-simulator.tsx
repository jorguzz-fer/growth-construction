"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { brl0, brlk } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

export interface DriverItem {
  key: string;
  label: string;
  base: number;
}

export function RollingSimulator({
  receitaSources,
  custoGroups,
  gastosFixos,
  custoVar,
  realizado,
  years,
  periodo,
}: {
  receitaSources: DriverItem[];
  custoGroups: DriverItem[];
  gastosFixos: DriverItem[];
  custoVar: number;
  realizado: number;
  years: { value: string; label: string }[];
  periodo: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dRec, setDRec] = useState<Record<string, number>>({});
  const [dCusto, setDCusto] = useState<Record<string, number>>({});
  const [dGasto, setDGasto] = useState<Record<string, number>>({});

  const receita = receitaSources.reduce(
    (a, s) => a + s.base * (1 + (dRec[s.key] || 0) / 100),
    0,
  );
  const custoObra = custoGroups.reduce(
    (a, g) => a + g.base * (1 + (dCusto[g.key] || 0) / 100),
    0,
  );
  const gastos = gastosFixos.reduce(
    (a, g) => a + g.base * (1 + (dGasto[g.key] || 0) / 100),
    0,
  );
  const margemBruta = receita - custoObra - custoVar;
  const ebitda = margemBruta - gastos;
  const resultado = ebitda;
  const pct = (v: number) => (receita > 0 ? (v / receita) * 100 : 0);

  const reset = () => {
    setDRec({});
    setDCusto({});
    setDGasto({});
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-2">
        <p className="text-[13px] text-[var(--color-ink3)]">
          Os drivers são multiplicadores sobre os valores base da versão ativa —{" "}
          <strong>não alteram os dados reais</strong>. Ex.: +10% no grupo 3 aumenta o
          custo daquele grupo em 10%.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={reset}>
            Zerar drivers
          </Button>
          <Select
            value={periodo}
            disabled={pending}
            onChange={(e) => start(() => router.push(`/rolling?periodo=${e.target.value}`))}
            className="h-9 w-auto"
          >
            {years.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Margem Bruta" value={margemBruta} pct={pct(margemBruta)} color="var(--color-success)" />
        <Kpi label="EBITDA" value={ebitda} pct={pct(ebitda)} color="var(--color-accent)" />
        <Kpi label="Resultado Líquido" value={resultado} pct={pct(resultado)} color="var(--color-warning)" />
      </div>

      {/* Bases */}
      <div className="mb-6 flex flex-wrap gap-x-10 gap-y-2">
        <Base label="Custo de Obra (CEF)" value={brl0(custoObra)} tone="danger" />
        <Base label="Custo Variável (medição)" value={brl0(custoVar)} tone="danger" />
        <Base label="Gastos Fixos / Corporativos" value={brl0(gastos)} tone="danger" />
        <Base label="Receita Total" value={brl0(receita)} />
        <Base label="Realizado" value={brlk(realizado)} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DriverPanel
          title="↑ Drivers — Despesas de Obra (CEF)"
          firstCol="Grupo CEF"
          groupHeader="Grupos CEF — Obra"
          items={custoGroups}
          values={dCusto}
          onChange={(k, v) => setDCusto((s) => ({ ...s, [k]: v }))}
          negative
        />
        <DriverPanel
          title="↑ Drivers — Gastos Fixos / Corporativos"
          firstCol="Categoria"
          groupHeader="Despesas fixas & administrativas"
          items={gastosFixos}
          values={dGasto}
          onChange={(k, v) => setDGasto((s) => ({ ...s, [k]: v }))}
          negative
        />
        <DriverPanel
          title="↓ Drivers — Receitas"
          firstCol="Fonte"
          items={receitaSources}
          values={dRec}
          onChange={(k, v) => setDRec((s) => ({ ...s, [k]: v }))}
        />
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: number;
  pct: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 text-center">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold" style={{ color }}>
          {brl0(value)}
        </p>
        <p className="text-sm font-semibold" style={{ color }}>
          {pct.toFixed(1)}%
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--color-ink3)]">margem sobre receita</p>
      </CardContent>
    </Card>
  );
}

function Base({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  const color =
    tone === "danger"
      ? "var(--color-danger)"
      : tone === "success"
        ? "var(--color-success)"
        : "var(--color-ink)";
  return (
    <div>
      <div className="text-[11px] text-[var(--color-ink3)]">{label}</div>
      <div className="font-[family-name:var(--font-mono)] text-lg font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function DriverPanel({
  title,
  firstCol,
  groupHeader,
  items,
  values,
  onChange,
  negative,
}: {
  title: string;
  firstCol: string;
  groupHeader?: string;
  items: DriverItem[];
  values: Record<string, number>;
  onChange: (key: string, v: number) => void;
  negative?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-1">
          <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            {firstCol}
          </div>
          <div className="text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            Base R$
          </div>
          <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            Variação %
          </div>
          <div className="text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            Impacto R$
          </div>
          {groupHeader && (
            <div className="col-span-4 mt-1 border-b border-[var(--color-accent2)]/12 pb-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-accent)]">
              {groupHeader}
            </div>
          )}
          {items.map((it) => {
            const v = values[it.key] || 0;
            const impacto = (it.base * v) / 100 * (negative ? -1 : 1);
            return (
              <div key={it.key} className="contents">
                <div className="border-b border-[var(--color-accent2)]/8 py-2 text-[13px] text-[var(--color-ink2)]">
                  {it.label}
                </div>
                <div
                  className={`border-b border-[var(--color-accent2)]/8 py-2 text-right font-[family-name:var(--font-mono)] text-[12px] ${
                    it.base > 0 ? "text-[var(--color-ink3)]" : "text-[var(--color-ink4)]"
                  }`}
                >
                  {it.base > 0 ? brl0(it.base) : "—"}
                </div>
                <div className="border-b border-[var(--color-accent2)]/8 py-2">
                  <input
                    type="number"
                    value={v}
                    onChange={(e) => onChange(it.key, Number(e.target.value) || 0)}
                    className="h-8 w-16 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2 text-right text-xs"
                  />
                  <span className="ml-1 text-[12px] text-[var(--color-ink3)]">%</span>
                </div>
                <div
                  className={`border-b border-[var(--color-accent2)]/8 py-2 text-right font-[family-name:var(--font-mono)] text-[13px] ${
                    v === 0 || impacto === 0
                      ? "text-[var(--color-ink4)]"
                      : impacto > 0
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-danger)]"
                  }`}
                >
                  {v === 0 || impacto === 0
                    ? "—"
                    : `${impacto > 0 ? "+" : "−"}${brl0(Math.abs(impacto))}`}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
