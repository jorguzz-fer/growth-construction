import Link from "next/link";
import type { IndicadoresObra } from "@/lib/queries";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const pct = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Um indicador. `hint` explica a origem do número quando ela não é óbvia. */
function KPI({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "good" | "warn" | "muted";
}) {
  const cor =
    tone === "good"
      ? "text-[var(--color-success)]"
      : tone === "warn"
        ? "text-[var(--color-warning)]"
        : tone === "muted"
          ? "text-[var(--color-ink4)]"
          : "text-[var(--color-ink)]";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className={`mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold ${cor}`}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-[11px] text-[var(--color-ink4)]">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Painel de indicadores físico-financeiros da obra: aquisição/financiamento,
 * custo com BDI, evolução física e liberação do financiamento.
 *
 * Os números saem do cadastro do projeto (CUB, metragem, valores financiados,
 * %BDI) e das medições por serviço. Quando esses dados ainda não existem, o
 * painel diz o que falta em vez de exibir valor inventado.
 */
export function IndicadoresObraPanel({ ind }: { ind: IndicadoresObra }) {
  const semDados = !ind.temParametros && !ind.temMedicao;

  if (semDados) {
    return (
      <Card className="mt-6">
        <CardContent className="p-6 text-center">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Indicadores da obra
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[13px] text-[var(--color-ink3)]">
            Para calcular evolução física, BDI e liberação do financiamento, informe no
            cadastro do projeto o valor financiado da construção e do terreno, o CUB, a
            metragem e o percentual de BDI — e cadastre os serviços da obra com seus
            custos propostos.
          </p>
          <Link
            href="/projeto"
            className="mt-3 inline-block rounded-[6px] border border-[var(--color-accent2)]/40 px-3 py-1.5 text-[12px] font-medium text-[var(--color-accent2)] hover:bg-[var(--color-accent4)]"
          >
            Abrir cadastro do projeto
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Aquisição e financiamento */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Aquisição e financiamento
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI label="Financiado — construção" value={brl0(ind.financiamentoConstrucao)} />
          <KPI label="Financiado — terreno" value={brl0(ind.financiamentoTerreno)} />
          <KPI label="Total da aquisição" value={brl0(ind.totalAquisicao)} />
          <KPI
            label="Saldo de financiamento"
            value={brl0(ind.saldoFinanciamento)}
            hint="ainda não liberado"
            tone={ind.saldoFinanciamento > 0 ? "normal" : "muted"}
          />
        </div>
      </div>

      {/* Custo da obra e BDI */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Custo da obra e BDI
          {ind.tipoExecutor && (
            <span className="ml-2 font-normal text-[var(--color-ink3)]">
              · executor: {ind.tipoExecutor}
            </span>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Custo total dos serviços"
            value={brl0(ind.custoTotalServicos)}
            hint={`${ind.qtdServicos} serviço(s)`}
          />
          <KPI
            label="BDI"
            value={ind.pctBdi > 0 ? pct(ind.pctBdi) : "—"}
            hint={ind.pctBdi > 0 ? undefined : "informe no cadastro do projeto"}
            tone={ind.pctBdi > 0 ? "normal" : "muted"}
          />
          <KPI label="Valor do BDI" value={brl0(ind.valorBdi)} />
          <KPI label="Custo total com BDI" value={brl0(ind.custoTotalComBdi)} />
        </div>
      </div>

      {/* Evolução física e liberação */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
          Evolução da obra e liberação
          {!ind.temMedicao && (
            <Badge tone="warning">sem medição lançada</Badge>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Evolução física acumulada"
            value={ind.temMedicao ? pct(ind.evolucaoAcumulada) : "—"}
            tone={ind.temMedicao ? "good" : "muted"}
          />
          <KPI
            label="Evolução do mês"
            value={ind.temMedicao ? pct(ind.evolucaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação do mês"
            value={ind.temMedicao ? brl0(ind.liberacaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação acumulada"
            value={brl0(ind.liberacaoAcumulada)}
            hint={`${pct(ind.pctRecebido * 100)} do financiado`}
          />
          <KPI
            label="Custo estimado do mês"
            value={ind.temMedicao ? brl0(ind.custoEstimadoMes) : "—"}
            hint="CUB × metragem × evolução"
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Geração de caixa do mês"
            value={ind.temMedicao ? brl0(ind.geracaoCaixaMes) : "—"}
            hint="liberação − custo estimado"
            tone={
              !ind.temMedicao ? "muted" : ind.geracaoCaixaMes >= 0 ? "good" : "warn"
            }
          />
          <KPI
            label="Custo referencial"
            value={brl0(ind.custoReferencial)}
            hint={
              ind.cub > 0
                ? `CUB ${brl0(ind.cub)} × ${ind.metragem} m²`
                : "informe CUB e metragem"
            }
            tone={ind.cub > 0 ? "normal" : "muted"}
          />
          <KPI
            label="Serviços fora dos limites"
            value={String(ind.servicosForaDosLimites)}
            hint="incidência fora da faixa aceitável"
            tone={ind.servicosForaDosLimites > 0 ? "warn" : "good"}
          />
        </div>
      </div>
    </div>
  );
}
