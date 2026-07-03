import { getActiveContext } from "@/lib/context";
import { getDespesas, getMedicoes, getMonthlyRevenue } from "@/lib/queries";
import { CATEGORIAS_DRE, type CategoriaDRE } from "@/lib/calc/constants";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Sinal de cada categoria DRE no resultado (Receita soma; demais subtraem). */
const SINAL: Record<CategoriaDRE, 1 | -1> = {
  Receita: 1,
  "Custo Variável": -1,
  "Custo Fixo": -1,
  "Despesa Variável": -1,
  "Despesa Fixa": -1,
  Retiradas: -1,
  Investimento: -1,
};

export default async function DREPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [despesas, revenue, medicoes] = await Promise.all([
    getDespesas(ctx.version.id),
    getMonthlyRevenue(ctx.version.id, ctx.project.id),
    getMedicoes(ctx.version.id),
  ]);

  // Soma despesas por categoria DRE.
  const porCategoria = new Map<CategoriaDRE, number>();
  for (const c of CATEGORIAS_DRE) porCategoria.set(c, 0);
  for (const d of despesas) {
    if (d.categoriaDre) {
      porCategoria.set(
        d.categoriaDre,
        (porCategoria.get(d.categoriaDre) || 0) + Number(d.valor),
      );
    }
  }
  // Custo Variável = somatória das medições de obra (lançadas pelo engenheiro),
  // por competência. Substitui o valor vindo de despesas.
  porCategoria.set(
    "Custo Variável",
    medicoes.reduce((a, m) => a + Number(m.valor), 0),
  );
  // Receita: receita projetada da versão (além de despesas marcadas Receita).
  const receitaProjetada = Object.values(revenue).reduce((a, b) => a + b, 0);
  porCategoria.set(
    "Receita",
    (porCategoria.get("Receita") || 0) + receitaProjetada,
  );

  const resultado = CATEGORIAS_DRE.reduce(
    (acc, c) => acc + SINAL[c] * (porCategoria.get(c) || 0),
    0,
  );
  const margem =
    receitaProjetada > 0 ? (resultado / receitaProjetada) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="DRE — Demonstração de Resultado"
        subtitle="Por categoria DRE · receita projetada vs. despesas lançadas"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi label="Receita" value={brl0(porCategoria.get("Receita") || 0)} />
        <Kpi
          label="Resultado"
          value={brl0(resultado)}
          tone={resultado >= 0 ? "pos" : "neg"}
        />
        <Kpi label="Margem" value={`${margem.toFixed(1)}%`} />
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Categoria DRE</TH>
            <TH className="text-right">Valor</TH>
            <TH className="text-right">Efeito</TH>
          </tr>
        </THead>
        <tbody>
          {CATEGORIAS_DRE.map((c) => {
            const v = porCategoria.get(c) || 0;
            return (
              <TR key={c}>
                <TD className="font-medium text-[var(--color-ink)]">{c}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {brl0(v)}
                </TD>
                <TD
                  className={`text-right font-[family-name:var(--font-mono)] ${
                    SINAL[c] > 0
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-danger)]"
                  }`}
                >
                  {SINAL[c] > 0 ? "+" : "−"}
                  {brl0(v)}
                </TD>
              </TR>
            );
          })}
          <TR>
            <TD className="font-semibold text-[var(--color-ink)]">Resultado</TD>
            <TD />
            <TD
              className={`text-right font-[family-name:var(--font-mono)] font-semibold ${
                resultado >= 0
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]"
              }`}
            >
              {brl0(resultado)}
            </TD>
          </TR>
        </tbody>
      </Table>
    </>
  );
}

function Kpi({
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
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p
          className={`mt-1 text-xl font-semibold ${
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
