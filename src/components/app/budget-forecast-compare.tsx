"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { CompareRowP, ForecastComparisonData } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { brl0, dateBR } from "@/lib/utils";
import { diferenca, isoParaInterna, tomDaVariacao, valorOuAusente, variacaoPct, type TomDaVariacao } from "@/lib/previsao-regras";

/**
 * Comparação Orçamento × Previsão Atualizada (Prompt F, seção 5).
 *
 * - declara o que compara: as duas versões, a data da previsão e o regime
 *   (competência; nunca caixa) — 5.2;
 * - a cor segue o significado do bloco: despesa acima do orçado é alerta
 *   (FC-08);
 * - conta de um lado só aparece como "ausente", não como zero (5.3);
 * - mostra a variação mês a mês, que a consulta já calculava (FC-09);
 * - sem origem registrada, não escolhe um Orçamento sozinha: oferece a
 *   escolha explícita (FC-07);
 * - os dois lados são retrato de `budget_line`; a data da replicação diz de
 *   quando é o índice de cada um (5.0.4). Nada é gravado (5.4).
 */
const COR: Record<TomDaVariacao, string> = { bom: "var(--color-success)", alerta: "var(--color-danger)", neutro: "var(--color-ink3)" };

function CompareBloco({ titulo, bloco, rows }: { titulo: string; bloco: "receita" | "despesa"; rows: CompareRowP[] }) {
  const totB = rows.reduce((a, r) => a + (r.budget ?? 0), 0);
  const totF = rows.reduce((a, r) => a + (r.forecast ?? 0), 0);
  const th = "px-3 py-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]";
  const mono = "px-3 py-1.5 text-right font-[family-name:var(--font-mono)]";
  return (
    <Card>
      <CardContent className="p-0">
        <h2 className="border-b border-[var(--color-accent2)]/12 p-4 text-[15px] font-semibold text-[var(--color-ink)]">{titulo}</h2>
        <div className="tbl-scroll overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--color-surface2)]">
              <tr>
                <th className={`${th} text-left`}>Conta</th>
                <th className={`${th} text-right`}>Orçamento</th>
                <th className={`${th} text-right`}>Previsão</th>
                <th className={`${th} text-right`}>Var. R$</th>
                <th className={`${th} text-right`}>Var. %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dif = diferenca(r.budget, r.forecast);
                const tom = dif == null ? "neutro" : tomDaVariacao(bloco, dif);
                const ausente = r.budget == null || r.forecast == null;
                return (
                  <tr key={r.rowKey} className={`border-b border-[var(--color-accent2)]/8 ${ausente ? "bg-[var(--color-surface2)]/50" : ""}`} data-tom={tom}>
                    <td className="px-3 py-1.5 text-[var(--color-ink)]">
                      {r.label}
                      {ausente && <Badge tone="warning" className="ml-1.5">{r.budget == null ? "só na Previsão" : "só no Orçamento"}</Badge>}
                    </td>
                    <td className={`${mono} ${r.budget == null ? "text-[var(--color-ink4)]" : ""}`}>{valorOuAusente(r.budget, brl0)}</td>
                    <td className={`${mono} ${r.forecast == null ? "text-[var(--color-ink4)]" : ""}`}>{valorOuAusente(r.forecast, brl0)}</td>
                    <td className={mono} style={{ color: COR[tom] }}>{dif == null ? "—" : brl0(dif)}</td>
                    <td className={mono} style={{ color: COR[tom] }}>{variacaoPct(r.budget, r.forecast)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--color-ink3)]">Sem contas.</td></tr>
              )}
              <tr className="border-t-2 border-[var(--color-accent2)]/20 bg-[var(--color-surface2)] font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className={mono}>{brl0(totB)}</td>
                <td className={mono}>{brl0(totF)}</td>
                <td className={mono} style={{ color: COR[tomDaVariacao(bloco, totF - totB)] }}>{brl0(totF - totB)}</td>
                <td className={mono} style={{ color: COR[tomDaVariacao(bloco, totF - totB)] }}>{variacaoPct(totB, totF)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** FC-09: a variação mês a mês (resultado = receitas − despesas, por competência). */
function CompareMensal({ data }: { data: ForecastComparisonData }) {
  const th = "px-3 py-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]";
  const mono = "px-3 py-1.5 text-right font-[family-name:var(--font-mono)]";
  return (
    <Card>
      <CardContent className="p-0">
        <h2 className="border-b border-[var(--color-accent2)]/12 p-4 text-[15px] font-semibold text-[var(--color-ink)]">
          Mês a mês — resultado (receitas − despesas) por competência
        </h2>
        <div className="tbl-scroll overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label="Comparação mensal">
            <thead className="bg-[var(--color-surface2)]">
              <tr>
                <th className={`${th} text-left`}>Competência</th>
                <th className={`${th} text-right`}>Orçamento</th>
                <th className={`${th} text-right`}>Previsão</th>
                <th className={`${th} text-right`}>Var. R$</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => {
                const b = data.budgetByMonth[m] || 0;
                const f = data.forecastByMonth[m] || 0;
                const dif = f - b;
                // Resultado: acima do orçado é bom.
                const tom = tomDaVariacao("receita", dif);
                return (
                  <tr key={m} className="border-b border-[var(--color-accent2)]/8">
                    <td className="px-3 py-1.5 text-[var(--color-ink)]">{m}</td>
                    <td className={mono}>{brl0(b)}</td>
                    <td className={mono}>{brl0(f)}</td>
                    <td className={mono} style={{ color: COR[tom] }}>{brl0(dif)}</td>
                  </tr>
                );
              })}
              {data.months.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-[var(--color-ink3)]">Sem competências no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function BudgetForecastCompare({ data, backHref }: { data: ForecastComparisonData; backHref: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const escolherBase = (id: string) => {
    const params = new URLSearchParams(sp.toString());
    if (id) params.set("base", id);
    else params.delete("base");
    router.push(`/forecast?${params.toString()}`);
  };

  if (!data.ok) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-[var(--color-ink3)]">
          <p className="text-[13.5px] text-[var(--color-ink)]">{data.message ?? "Comparação indisponível."}</p>
          {data.semOrigem && data.orcamentos && data.orcamentos.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[12.5px]">
              <span>Comparar com:</span>
              <Select defaultValue="" onChange={(e) => escolherBase(e.target.value)} aria-label="Orçamento para comparar" className="h-9 w-auto">
                <option value="" disabled>— escolha o Orçamento —</option>
                {data.orcamentos.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="mt-3">
            <Link href={backHref} className="text-[13px] text-[var(--color-accent2)] hover:underline">← Voltar à Previsão Atualizada</Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const resB = data.receitas.reduce((a, r) => a + (r.budget ?? 0), 0) - data.despesas.reduce((a, r) => a + (r.budget ?? 0), 0);
  const resF = data.receitas.reduce((a, r) => a + (r.forecast ?? 0), 0) - data.despesas.reduce((a, r) => a + (r.forecast ?? 0), 0);
  const quando = (iso: string | null | undefined) => (iso ? dateBR(isoParaInterna(iso)) : null);

  return (
    <div className="space-y-5" data-comparacao>
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Comparação Orçamento × Previsão Atualizada</h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-ink2)]">
              Orçamento <strong>{data.budgetLabel}</strong>{data.baseEscolhida && <Badge tone="warning" className="ml-1">escolhido por você — não é a origem registrada</Badge>} × Previsão <strong>{data.forecastLabel}</strong>
              {data.forecastCriadaEm && <> (criada em {quando(data.forecastCriadaEm)})</>} · regime: <strong>{data.regime ?? "competência"}</strong>, nunca caixa.
            </p>
            <p className="mt-1 text-[11.5px] text-[var(--color-ink3)]">
              Os dois lados leem <code>budget_line</code> das próprias versões (retrato; nada é recalculado nem gravado).
              {data.replicacao?.budget && <> Orçamento replicado do Atual em {quando(data.replicacao.budget)} — carrega o INCC daquela data.</>}
              {data.replicacao?.forecast && <> Previsão replicada em {quando(data.replicacao.forecast)}.</>}
              {!data.replicacao?.budget && !data.replicacao?.forecast && <> Nenhum dos lados foi replicado do Atual; diferença aqui é de cenário, não de data do índice.</>}
            </p>
          </div>
          <Link href={backHref} className="text-[13px] text-[var(--color-accent2)] hover:underline">← Voltar à grade</Link>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-[12px] text-[var(--color-ink3)]">Resultado — Orçamento</div><div className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold">{brl0(resB)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[12px] text-[var(--color-ink3)]">Resultado — Previsão</div><div className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold">{brl0(resF)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[12px] text-[var(--color-ink3)]">Variação do resultado</div><div className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold" style={{ color: COR[tomDaVariacao("receita", resF - resB)] }}>{brl0(resF - resB)}</div></CardContent></Card>
      </div>
      <CompareBloco titulo="Receitas — variação por conta" bloco="receita" rows={data.receitas} />
      <CompareBloco titulo="Despesas — variação por conta (acima do orçado é alerta)" bloco="despesa" rows={data.despesas} />
      <CompareMensal data={data} />
    </div>
  );
}
