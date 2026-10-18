"use client";

import { BarChart, CHART_COLORS, LineChart } from "@/components/app/charts";
import { Card, CardContent } from "@/components/ui/card";
import { PARTES_DA_DRE, type SeriesDaDre, type SeriesDoFluxo } from "@/lib/dashboard-graficos";

const COR_DA_PARTE: Record<(typeof PARTES_DA_DRE)[number], string> = {
  "Custo Variável": CHART_COLORS.red,
  "Despesa Variável": CHART_COLORS.amber,
  "Custo Fixo": CHART_COLORS.pink,
  "Despesa Fixa": CHART_COLORS.violet,
  "Demais itens": "#94a3b8",
  Resultado: CHART_COLORS.green,
};

/**
 * Prompt AA2 — os dois gráficos centrais do Dashboard: o fluxo de caixa em
 * linhas e a DRE em barras empilhadas. Os números vêm prontos do servidor.
 */
export function GraficosDashboard({ fluxo, dre, temFluxo, temDre }: { fluxo: SeriesDoFluxo; dre: SeriesDaDre; temFluxo: boolean; temDre: boolean }) {
  return (
    <section className="mt-6 grid gap-4 min-[1400px]:grid-cols-2" data-graficos-dashboard>
      <Card data-pdf-bloco>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Fluxo de caixa</h2>
          <p className="mb-3 text-[11.5px] text-[var(--color-ink3)]">Entradas e saídas previstas por mês, pelo vencimento, na versão Atual.</p>
          {temFluxo ? (
            <div data-grafico="fluxo">
              <LineChart
                currency
                data={{
                  labels: fluxo.meses,
                  datasets: [
                    { label: "Entradas", data: fluxo.entradas, borderColor: CHART_COLORS.green, backgroundColor: CHART_COLORS.green, tension: 0 },
                    { label: "Saídas", data: fluxo.saidas, borderColor: CHART_COLORS.red, backgroundColor: CHART_COLORS.red, tension: 0 },
                  ],
                }}
              />
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-[var(--color-ink3)]">Nenhuma entrada ou saída prevista nestes meses.</p>
          )}
        </CardContent>
      </Card>
      <Card data-pdf-bloco>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">DRE por mês</h2>
          <p className="mb-3 text-[11.5px] text-[var(--color-ink3)]">
            Cada barra é a receita do mês dividida em custos, despesas e resultado (versão Atual, por competência). Prejuízo fica abaixo do zero.
          </p>
          {temDre ? (
            <div data-grafico="dre">
              <BarChart
                currency
                stacked
                data={{
                  labels: dre.meses,
                  datasets: PARTES_DA_DRE.map((p) => ({ label: p, data: dre.partes[p], backgroundColor: COR_DA_PARTE[p], stack: "dre" })),
                }}
              />
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-[var(--color-ink3)]">Nenhum lançamento de receita ou despesa nestes meses.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
