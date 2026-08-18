"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { baixarXlsx } from "@/lib/download";
import {
  saveBudgetPlanning,
  setVersionStatus,
  createForecastFromBudget,
  duplicateForecast,
  type PlanningAccountInput,
} from "@/lib/actions/planning";
import type { BudgetPlanningData, PlanningAccountRow } from "@/lib/planning";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { brl0 } from "@/lib/utils";

interface RowState {
  rowKey: string;
  label: string;
  dreCategory: string | null;
  total: string;
  pct: Record<string, string>;
  ativo: boolean;
  fromChart: boolean;
}

function toRowState(r: PlanningAccountRow, months: string[]): RowState {
  const pct: Record<string, string> = {};
  for (const m of months) pct[m] = r.pct[m] != null ? String(r.pct[m]) : "";
  return {
    rowKey: r.rowKey,
    label: r.label,
    dreCategory: r.dreCategory,
    total: r.total ? String(r.total) : "",
    pct,
    ativo: r.ativo,
    fromChart: r.fromChart,
  };
}

const num = (s: string) => Number(s) || 0;
const monthLabel = (mk: string) => mk; // "MM/YYYY" já é o formato de exibição

export function BudgetPlanningScreen({
  data,
  kind,
  projects,
  canEdit,
  budgetVersions = [],
  canCreateForecast = false,
}: {
  data: BudgetPlanningData;
  kind: "budget" | "forecast";
  projects: { id: string; label: string }[];
  canEdit: boolean;
  budgetVersions?: { id: string; label: string }[];
  canCreateForecast?: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const months = data.months;
  const titulo = kind === "budget" ? "Lançamento Budget" : "Lançamento Forecast";
  // No Forecast, o total de cada conta é herdado do Budget (somente leitura);
  // só a redistribuição mensal (%) é editável.
  const totalReadOnly = kind === "forecast";

  const go = (patch: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`/${kind}?${params.toString()}`);
  };

  if (!data.hasPeriod) {
    return (
      <>
        <TopBar
          titulo={titulo}
          data={data}
          projects={projects}
          onProj={(id) => go({ proj: id, v: "" })}
          onVersion={(id) => go({ v: id })}
          canEdit={canEdit}
        />
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-[14px] text-[var(--color-ink)]">
              O período de planejamento deste projeto não está definido.
            </p>
            <p className="mt-1 text-[12.5px] text-[var(--color-ink3)]">
              Informe o <strong>Mês inicial</strong> e o <strong>Mês final</strong> no
              cadastro do projeto para habilitar o Budget e o Forecast.
            </p>
            <Link
              // Leva direto ao projeto em questão, já filtrado no seletor —
              // sem isso o usuário caía na lista inteira e tinha de procurar.
              href={`/projeto?proj=${data.project.id}`}
              className="mt-3 inline-block rounded-[8px] bg-[var(--color-accent2)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
            >
              Ir para o cadastro do projeto
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <TopBar
        titulo={titulo}
        data={data}
        projects={projects}
        onProj={(id) => go({ proj: id, v: "" })}
        onVersion={(id) => go({ v: id })}
        canEdit={canEdit}
      />
      {kind === "forecast" && (
        <ForecastToolbar
          projectId={data.project.id}
          budgetVersions={budgetVersions}
          canCreate={canCreateForecast}
          currentForecastId={data.versionId}
          onCreated={(id) => go({ v: id })}
          onCompare={() => go({ cmp: "1" })}
        />
      )}
      {kind === "forecast" && !data.versionId ? null : (
        <>
          <Bloco
            key={`rec-${data.versionId}`}
            titulo="Receitas por projeto"
            primeiraCol="Receita total do projeto"
            rows={data.receitas}
            months={months}
            versionId={data.versionId}
            bloco="receita"
            canEdit={canEdit && !isLocked(data)}
            totalReadOnly={totalReadOnly}
          />
          <div className="h-5" />
          <Bloco
            key={`desp-${data.versionId}`}
            titulo="Despesas por grupo · projeto/filial"
            primeiraCol="Orçamento total do projeto"
            rows={data.despesas}
            months={months}
            versionId={data.versionId}
            bloco="despesa"
            canEdit={canEdit && !isLocked(data)}
            totalReadOnly={totalReadOnly}
          />
        </>
      )}
    </>
  );
}

function ForecastToolbar({
  projectId,
  budgetVersions,
  canCreate,
  currentForecastId,
  onCreated,
  onCompare,
}: {
  projectId: string;
  budgetVersions: { id: string; label: string }[];
  canCreate: boolean;
  currentForecastId: string | null;
  onCreated: (id: string) => void;
  onCompare: () => void;
}) {
  const [baseId, setBaseId] = useState(budgetVersions[0]?.id ?? "");
  const [nome, setNome] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (budgetVersions.length === 0) {
    return (
      <Card className="mb-5">
        <CardContent className="p-4 text-[13px] text-[var(--color-ink3)]">
          Este projeto ainda não possui um Budget disponível para criação do Forecast.
        </CardContent>
      </Card>
    );
  }

  const criar = () => {
    if (!canCreate || !baseId) return;
    setError(null);
    start(async () => {
      try {
        const id = await createForecastFromBudget(projectId, baseId, nome);
        setNome("");
        onCreated(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao criar Forecast.");
      }
    });
  };
  const duplicar = () => {
    if (!canCreate || !currentForecastId) return;
    setError(null);
    start(async () => {
      try {
        const id = await duplicateForecast(currentForecastId, nome);
        setNome("");
        onCreated(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao duplicar Forecast.");
      }
    });
  };

  return (
    <Card className="mb-5">
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            Novo Forecast a partir do Budget
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              className="h-9 w-auto"
              disabled={!canCreate || pending}
            >
              {budgetVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  Base: {v.label}
                </option>
              ))}
            </Select>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do Forecast (ex.: Revisão 01)"
              className="h-9 w-56"
              disabled={!canCreate || pending}
            />
            <Button type="button" disabled={!canCreate || pending || !baseId} onClick={criar}>
              Criar Forecast
            </Button>
            {currentForecastId && (
              <Button
                type="button"
                variant="outline"
                disabled={!canCreate || pending}
                onClick={duplicar}
              >
                Duplicar atual
              </Button>
            )}
            {currentForecastId && (
              <Button type="button" variant="outline" disabled={pending} onClick={onCompare}>
                Comparar com Budget
              </Button>
            )}
          </div>
        </div>
        {error && <span className="text-[12px] text-[var(--color-danger)]">{error}</span>}
      </CardContent>
    </Card>
  );
}

function isLocked(data: BudgetPlanningData): boolean {
  return data.versions.find((v) => v.id === data.versionId)?.locked ?? false;
}

function TopBar({
  titulo,
  data,
  projects,
  onProj,
  onVersion,
  canEdit,
}: {
  titulo: string;
  data: BudgetPlanningData;
  projects: { id: string; label: string }[];
  onProj: (id: string) => void;
  onVersion: (id: string) => void;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const version = data.versions.find((v) => v.id === data.versionId) ?? null;
  const periodo =
    data.project.mesInicial && data.project.mesFinal
      ? `${data.project.mesInicial} a ${data.project.mesFinal}`
      : "não definido";

  // Indicadores (usam os totais por conta).
  const somaTotais = (rows: PlanningAccountRow[]) => rows.reduce((a, r) => a + r.total, 0);
  const receitas = somaTotais(data.receitas);
  const despesas = somaTotais(data.despesas);
  const resultado = receitas - despesas;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
          {titulo}
        </h1>
        <Select
          value={data.project.id}
          onChange={(e) => onProj(e.target.value)}
          className="h-9 w-auto"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select
          value={data.versionId ?? ""}
          onChange={(e) => onVersion(e.target.value)}
          className="h-9 w-auto"
          disabled={data.versions.length === 0}
        >
          {data.versions.length === 0 && <option value="">— sem versão —</option>}
          {data.versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </Select>
        <span
          className="rounded-[6px] bg-[var(--color-surface3)] px-2.5 py-1 text-[12px] text-[var(--color-ink2)]"
          title="Período definido no cadastro do projeto"
        >
          Período do projeto: {periodo}
        </span>
        <span className="rounded-[6px] bg-[var(--color-accent2)]/15 px-2.5 py-1 text-[12px] text-[var(--color-accent2)]">
          {data.months.length} meses
        </span>
        {version && (
          <Select
            value={version.status}
            onChange={(e) =>
              start(async () => {
                try {
                  await setVersionStatus(version.id, e.target.value);
                  window.location.reload();
                } catch {
                  /* ignora */
                }
              })
            }
            disabled={!canEdit || pending}
            className="h-9 w-auto"
            title="Status da versão"
          >
            <option>Rascunho</option>
            <option>Concluído</option>
            <option>Aprovado</option>
          </Select>
        )}
      </div>
      <p className="mb-4 text-[11px] text-[var(--color-ink3)]">
        Período definido no cadastro do projeto (somente leitura aqui).
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador titulo="Receitas" valor={receitas} tom="var(--color-accent2)" />
        <Indicador titulo="Despesas" valor={despesas} tom="var(--color-danger)" />
        <Indicador
          titulo="Resultado"
          valor={resultado}
          tom={resultado >= 0 ? "var(--color-success)" : "var(--color-danger)"}
        />
        <Indicador titulo="Recursos próprios" valor={data.project.recursosProprios} tom="var(--color-accent)" />
      </div>
    </>
  );
}

function Indicador({ titulo, valor, tom }: { titulo: string; valor: number; tom: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[12px] text-[var(--color-ink3)]">{titulo}</div>
        <div className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold" style={{ color: tom }}>
          {brl0(valor)}
        </div>
      </CardContent>
    </Card>
  );
}

function Bloco({
  titulo,
  primeiraCol,
  rows: initialRows,
  months,
  versionId,
  bloco,
  canEdit,
  totalReadOnly = false,
}: {
  titulo: string;
  primeiraCol: string;
  rows: PlanningAccountRow[];
  months: string[];
  versionId: string | null;
  bloco: "receita" | "despesa";
  canEdit: boolean;
  totalReadOnly?: boolean;
}) {
  const [rows, setRows] = useState<RowState[]>(() =>
    initialRows.map((r) => toRowState(r, months)),
  );
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setTotal = (i: number, v: string) =>
    setRows((s) => s.map((r, j) => (j === i ? { ...r, total: v } : r)));
  const setPct = (i: number, mes: string, v: string) =>
    setRows((s) =>
      s.map((r, j) => (j === i ? { ...r, pct: { ...r.pct, [mes]: v } } : r)),
    );

  // Cálculos por linha e totais do bloco.
  const calc = useMemo(() => {
    const perRow = rows.map((r) => {
      const total = num(r.total);
      let somaPct = 0;
      const valorMes: Record<string, number> = {};
      for (const m of months) {
        const p = num(r.pct[m]);
        somaPct += p;
        valorMes[m] = Math.round(total * p) / 100;
      }
      const somaValor = months.reduce((a, m) => a + valorMes[m], 0);
      return { total, somaPct, valorMes, saldo: total - somaValor };
    });
    const totalGeral = perRow.reduce((a, r) => a + r.total, 0);
    const valorMesTotal: Record<string, number> = {};
    for (const m of months)
      valorMesTotal[m] = perRow.reduce((a, r) => a + r.valorMes[m], 0);
    const distribuido = months.reduce((a, m) => a + valorMesTotal[m], 0);
    return {
      perRow,
      totalGeral,
      valorMesTotal,
      pctDistribuido: totalGeral > 0 ? (distribuido / totalGeral) * 100 : 0,
      saldoGeral: totalGeral - distribuido,
    };
  }, [rows, months]);

  const salvar = () => {
    if (!versionId) return;
    setError(null);
    setOk(false);
    const payload: PlanningAccountInput[] = rows.map((r) => ({
      rowKey: r.rowKey,
      dreCategory: r.dreCategory,
      total: num(r.total),
      months: months.map((m) => ({ mes: m, pct: num(r.pct[m]) })),
    }));
    start(async () => {
      try {
        await saveBudgetPlanning(versionId, bloco, payload);
        setOk(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao salvar.");
      }
    });
  };

  const exportar = () => {
    const header = [
      "Conta",
      "Nome",
      "Total",
      ...months.flatMap((m) => [`${m} %`, `${m} R$`]),
      "Total %",
      "Saldo",
    ];
    const aoa: (string | number)[][] = [header];
    rows.forEach((r, i) => {
      const rc = calc.perRow[i];
      aoa.push([
        r.rowKey,
        r.label,
        num(r.total),
        ...months.flatMap((m) => [num(r.pct[m]), rc.valorMes[m]]),
        rc.somaPct,
        rc.saldo,
      ]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(aoa),
      bloco === "receita" ? "Receitas" : "Despesas",
    );
    baixarXlsx(wb, `${bloco}_${versionId ?? "versao"}.xlsx`);
  };

  const importar = async (file: File) => {
    setImportMsg(null);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      if (aoa.length < 2) {
        setImportMsg("Planilha vazia ou sem linhas de dados.");
        return;
      }
      const header = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
      const idxConta = header.findIndex((h) => /^conta$/i.test(h));
      const idxTotal = header.findIndex((h) => /^total$/i.test(h));
      if (idxConta < 0) {
        setImportMsg('Coluna "Conta" não encontrada no cabeçalho.');
        return;
      }
      const monthCols: { mes: string; col: number }[] = [];
      header.forEach((h, c) => {
        const m = h.match(/^(\d{1,2}\/\d{4})\s*%$/);
        if (m) monthCols.push({ mes: m[1].padStart(7, "0"), col: c });
      });
      const monthSet = new Set(months);
      const byKey = new Map(rows.map((r, i) => [r.rowKey, i] as const));
      const next = rows.map((r) => ({ ...r, pct: { ...r.pct } }));
      let matched = 0;
      let ignored = 0;
      const fora = new Set<string>();
      for (let i = 1; i < aoa.length; i++) {
        const row = aoa[i];
        if (!row) continue;
        const code = String(row[idxConta] ?? "").trim();
        if (!code) continue;
        const ri = byKey.get(code);
        if (ri == null) {
          ignored++;
          continue;
        }
        if (idxTotal >= 0 && row[idxTotal] != null && row[idxTotal] !== "") {
          next[ri].total = String(Number(row[idxTotal]) || 0);
        }
        for (const mc of monthCols) {
          if (!monthSet.has(mc.mes)) {
            fora.add(mc.mes);
            continue;
          }
          const v = row[mc.col];
          next[ri].pct[mc.mes] = v == null || v === "" ? "" : String(Number(v) || 0);
        }
        matched++;
      }
      setRows(next);
      const parts = [`${matched} conta(s) atualizada(s)`];
      if (ignored) parts.push(`${ignored} ignorada(s) (código não está no Plano de Contas)`);
      if (fora.size) parts.push(`meses fora do período ignorados: ${[...fora].join(", ")}`);
      setImportMsg(parts.join(" · ") + ". Revise a prévia e clique em Salvar.");
    } catch {
      setImportMsg("Não foi possível ler a planilha.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const pctTone = (soma: number) =>
    Math.abs(soma - 100) < 0.01
      ? "var(--color-success)"
      : soma > 100
        ? "var(--color-danger)"
        : "var(--color-warning)";
  const algumAcima = calc.perRow.some((r) => r.somaPct > 100.01);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-accent2)]/12 p-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">{titulo}</h2>
            <p className="mt-0.5 text-[11.5px] text-[var(--color-ink3)]">
              Informe o total e o percentual de cada mês. O valor mensal é calculado
              automaticamente; a soma por conta não pode ultrapassar 100%.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {error && <span className="text-[12px] text-[var(--color-danger)]">{error}</span>}
            {ok && !error && <span className="text-[12px] text-[var(--color-success)]">Salvo ✓</span>}
            <Button type="button" variant="outline" onClick={exportar}>
              Exportar planilha
            </Button>
            {canEdit && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importar(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                >
                  Importar planilha
                </Button>
                <Button
                  type="button"
                  disabled={saving || algumAcima || !versionId}
                  onClick={salvar}
                >
                  {saving ? "Salvando…" : bloco === "receita" ? "Salvar receitas" : "Salvar despesas"}
                </Button>
              </>
            )}
          </div>
        </div>
        {importMsg && (
          <p className="border-b border-[var(--color-accent2)]/12 bg-[var(--color-accent)]/8 px-4 py-2 text-[12px] text-[var(--color-ink2)]">
            {importMsg}
          </p>
        )}

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-[var(--color-surface2)]">
              <tr>
                <th className="sticky left-0 z-30 min-w-[220px] bg-[var(--color-surface2)] px-3 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Plano de Contas
                </th>
                <th className="sticky left-[220px] z-30 min-w-[130px] bg-[var(--color-surface2)] px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  {primeiraCol}
                </th>
                {months.map((m) => (
                  <th
                    key={m}
                    colSpan={2}
                    className="border-l border-[var(--color-accent2)]/10 px-3 py-2 text-center font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]"
                  >
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="border-l border-[var(--color-accent2)]/10 px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Total %
                </th>
                <th className="px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Saldo
                </th>
              </tr>
              <tr>
                <th className="sticky left-0 z-30 bg-[var(--color-surface2)]" />
                <th className="sticky left-[220px] z-30 bg-[var(--color-surface2)]" />
                {months.map((m) => (
                  <Fragment key={m}>
                    <th className="border-l border-[var(--color-accent2)]/10 px-2 py-1 text-center text-[9px] text-[var(--color-ink4)]">%</th>
                    <th className="px-2 py-1 text-right text-[9px] text-[var(--color-ink4)]">Valor (R$)</th>
                  </Fragment>
                ))}
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rc = calc.perRow[i];
                return (
                  <tr key={r.rowKey} className={`border-b border-[var(--color-accent2)]/8 ${r.ativo ? "" : "opacity-70"}`}>
                    <td className="sticky left-0 z-10 min-w-[220px] bg-white px-3 py-1.5 text-[var(--color-ink)]">
                      {r.label}
                      {!r.fromChart && (
                        <span className="ml-1 rounded bg-[var(--color-ink4)]/15 px-1 text-[9px] text-[var(--color-ink3)]">legado</span>
                      )}
                    </td>
                    <td className="sticky left-[220px] z-10 bg-white px-2 py-1">
                      {canEdit && !totalReadOnly ? (
                        <MoneyInput value={r.total} onChange={(v) => setTotal(i, v)} className="h-8 w-[120px] text-right text-xs" />
                      ) : (
                        <div
                          className="text-right font-[family-name:var(--font-mono)] text-xs"
                          title={totalReadOnly ? "Total herdado do Budget (somente leitura)" : undefined}
                        >
                          {brl0(rc.total)}
                        </div>
                      )}
                    </td>
                    {months.map((m) => (
                      <Fragment key={m}>
                        <td className="border-l border-[var(--color-accent2)]/10 px-1 py-1">
                          {canEdit ? (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={r.pct[m] ?? ""}
                              onChange={(e) => setPct(i, m, e.target.value)}
                              className="h-8 w-[62px] text-right text-xs"
                            />
                          ) : (
                            <div className="text-right text-xs text-[var(--color-ink2)]">{r.pct[m] || "0"}%</div>
                          )}
                        </td>
                        <td className="bg-[var(--color-surface2)]/40 px-2 py-1 text-right font-[family-name:var(--font-mono)] text-xs text-[var(--color-ink2)]">
                          {brl0(rc.valorMes[m])}
                        </td>
                      </Fragment>
                    ))}
                    <td className="border-l border-[var(--color-accent2)]/10 px-2 py-1 text-right">
                      <span
                        className="rounded px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px]"
                        style={{ color: pctTone(rc.somaPct), background: `${pctTone(rc.somaPct)}18` }}
                      >
                        {rc.somaPct.toFixed(rc.somaPct % 1 ? 2 : 0)}%
                      </span>
                    </td>
                    <td className={`px-3 py-1 text-right font-[family-name:var(--font-mono)] text-xs ${Math.abs(rc.saldo) < 0.005 ? "text-[var(--color-ink3)]" : "text-[var(--color-warning)]"}`}>
                      {brl0(rc.saldo)}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4 + months.length * 2} className="px-3 py-6 text-center">
                    {/* Estado vazio ACIONÁVEL: sem isto a tela virava um beco sem
                        saída — nenhuma linha para lançar e nenhuma indicação do
                        que fazer para destravar. */}
                    <p className="text-[var(--color-ink2)]">
                      Nenhuma conta de {bloco === "receita" ? "receita" : "despesa"} ativa
                      no Plano de Contas.
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--color-ink3)]">
                      As linhas desta tabela vêm dos grupos do Plano de Contas. Para
                      destravar o lançamento, marque ao menos uma conta como{" "}
                      <strong>{bloco === "receita" ? "receita" : "despesa"}</strong> e{" "}
                      <strong>ativa</strong>.
                    </p>
                    <Link
                      href="/planocontas"
                      className="mt-2 inline-block rounded-[6px] border border-[var(--color-accent2)]/40 px-3 py-1.5 text-[12px] font-medium text-[var(--color-accent2)] hover:bg-[var(--color-accent4)]"
                    >
                      Abrir Plano de Contas
                    </Link>
                  </td>
                </tr>
              )}
              {/* Totais do bloco */}
              <tr className="border-t-2 border-[var(--color-accent2)]/20 bg-[var(--color-surface2)] font-semibold">
                <td className="sticky left-0 z-10 bg-[var(--color-surface2)] px-3 py-2 text-[var(--color-ink)]">
                  {bloco === "receita" ? "Total receitas" : "Total despesas"}
                </td>
                <td className="sticky left-[220px] z-10 bg-[var(--color-surface2)] px-3 py-2 text-right font-[family-name:var(--font-mono)]">
                  {brl0(calc.totalGeral)}
                </td>
                {months.map((m) => (
                  <Fragment key={m}>
                    <td className="border-l border-[var(--color-accent2)]/10 px-2 py-2 text-center text-[var(--color-ink4)]">–</td>
                    <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)]">{brl0(calc.valorMesTotal[m])}</td>
                  </Fragment>
                ))}
                <td className="border-l border-[var(--color-accent2)]/10 px-2 py-2 text-right font-[family-name:var(--font-mono)]">
                  {calc.pctDistribuido.toFixed(0)}%
                </td>
                <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{brl0(calc.saldoGeral)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
