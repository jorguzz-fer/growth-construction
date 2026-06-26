import { getActiveContext } from "@/lib/context";
import {
  getDespesas,
  getMonthlyRevenue,
  getPermutas,
  getReembolsos,
  getUnits,
  permToCalc,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import { calcTotals } from "@/lib/calc";
import { brl0, brlk } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ResumoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [unitRows, permRows, reembRows, despesas, revenue] = await Promise.all([
    getUnits(ctx.version.id),
    getPermutas(ctx.version.id),
    getReembolsos(ctx.version.id),
    getDespesas(ctx.version.id),
    getMonthlyRevenue(ctx.version.id, ctx.project.id),
  ]);

  const totals = calcTotals(
    unitRows.map(toCalcUnit),
    permToCalc(permRows),
    reembToCalc(reembRows),
  );
  const totalUnidades = totals.vend + totals.res + totals.disp;
  const receitaProjetada = Object.values(revenue).reduce((a, b) => a + b, 0);
  const totalDespesas = despesas.reduce((a, d) => a + Number(d.valor), 0);
  const resultado = receitaProjetada - totalDespesas;
  const pctVendido =
    totalUnidades > 0 ? (totals.vend / totalUnidades) * 100 : 0;

  const blocos = [
    {
      titulo: "Comercial",
      itens: [
        ["VGV total", brl0(totals.vgv)],
        ["Unidades", String(totalUnidades)],
        ["Vendidas", `${totals.vend} (${pctVendido.toFixed(0)}%)`],
        ["Reservadas", String(totals.res)],
        ["Disponíveis", String(totals.disp)],
      ],
    },
    {
      titulo: "Receitas",
      itens: [
        ["Receita projetada", brl0(receitaProjetada)],
        ["Sinais / Atos", brl0(totals.sinais)],
        ["Mensais", brl0(totals.mens)],
        ["Financiamento", brl0(totals.banco)],
        ["Reembolsos", brl0(totals.reemb)],
      ],
    },
    {
      titulo: "Resultado",
      itens: [
        ["Receita projetada", brl0(receitaProjetada)],
        ["Despesas lançadas", brl0(totalDespesas)],
        ["Resultado", brl0(resultado)],
        [
          "Permuta (estimada)",
          brl0(totals.permRec),
        ],
        ["Permuta (vendida)", brl0(totals.permVend)],
      ],
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · ${ctx.tenant.name}`}
        title="Resumo Executivo"
        subtitle={`Versão ${ctx.version.label} · síntese para gestão e sócios`}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Big label="VGV" value={brlk(totals.vgv)} />
        <Big label="Vendido" value={`${pctVendido.toFixed(0)}%`} />
        <Big label="Receita proj." value={brlk(receitaProjetada)} />
        <Big
          label="Resultado"
          value={brlk(resultado)}
          tone={resultado >= 0 ? "pos" : "neg"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {blocos.map((b) => (
          <Card key={b.titulo}>
            <CardContent className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
                {b.titulo}
              </h2>
              <dl className="space-y-2">
                {b.itens.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between border-b border-[var(--color-accent2)]/8 pb-1.5"
                  >
                    <dt className="text-[13px] text-[var(--color-ink2)]">{k}</dt>
                    <dd className="font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)]">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function Big({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p
          className={`mt-2 text-2xl font-semibold ${
            tone === "pos"
              ? "text-[var(--color-success)]"
              : tone === "neg"
                ? "text-[var(--color-danger)]"
                : "text-[var(--color-ink)]"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
