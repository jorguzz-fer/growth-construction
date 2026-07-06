import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext, type Project } from "@/lib/context";
import {
  getDespesas,
  getInccRows,
  getMedicoes,
  getMonthlyRevenue,
  getPermutas,
  permToResale,
} from "@/lib/queries";
import { permutaRevenueByMonth } from "@/lib/calc";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { DreControls } from "@/components/app/dre-controls";

export const dynamic = "force-dynamic";

interface Inputs {
  receita: number;
  custoVar: number;
  byCat: Record<string, number>;
}

async function defaultVersionId(projectId: string): Promise<string | null> {
  const vs = await db
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.projectId, projectId))
    .orderBy(asc(schema.versions.createdAt));
  return (vs.find((v) => v.isDefault) ?? vs[0])?.id ?? null;
}

async function projectInputs(
  project: Project,
  periodMonths: Set<string> | null,
): Promise<Inputs> {
  const vid = await defaultVersionId(project.id);
  if (!vid) return { receita: 0, custoVar: 0, byCat: {} };
  const [revenue, medicoes, despesas, permutas] = await Promise.all([
    getMonthlyRevenue(vid, project.id),
    getMedicoes(vid),
    getDespesas(vid),
    getPermutas(vid),
  ]);
  const inP = (mm: string | null) => !periodMonths || (mm != null && periodMonths.has(mm));

  const receitaProj = Object.entries(revenue)
    .filter(([mm]) => inP(mm))
    .reduce((a, [, v]) => a + v, 0);
  // Receita da revenda de bens de permuta (inclui escambo), item 10.
  const permRev = permutaRevenueByMonth(permToResale(permutas));
  const receitaPermuta = Object.entries(permRev)
    .filter(([mm]) => inP(mm))
    .reduce((a, [, v]) => a + v, 0);
  const custoVar = medicoes
    .filter((m) => inP(m.competencia))
    .reduce((a, m) => a + Number(m.valor), 0);
  const byCat: Record<string, number> = {};
  for (const d of despesas) {
    if (!d.categoriaDre || !inP(d.competencia)) continue;
    byCat[d.categoriaDre] = (byCat[d.categoriaDre] || 0) + Number(d.valor);
  }
  return {
    receita: receitaProj + receitaPermuta + (byCat["Receita"] || 0),
    custoVar,
    byCat,
  };
}

export default async function DREPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; periodo?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const sp = await searchParams;

  const projParam = sp.proj ?? ctx.project.id;
  const isAll = projParam === "all";
  const selectedProjects = isAll
    ? ctx.projects
    : [ctx.projects.find((p) => p.id === projParam) ?? ctx.project];

  // Janelas de ano a partir da tabela INCC. Para "empresa toda", usa a união
  // dos meses de todos os projetos selecionados, de modo que o filtro de
  // período continua editável em qualquer combinação de filtros.
  const inccAll = await Promise.all(
    selectedProjects.map((p) => getInccRows(p.id)),
  );
  const axis = [
    ...new Set(inccAll.flat().map((r) => r.m)),
  ].sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return ya - yb || ma - mb;
  });
  const years: { value: string; months: string[]; label: string }[] = [];
  for (let i = 0; i < axis.length; i += 12) {
    const months = axis.slice(i, i + 12);
    if (months.length)
      years.push({
        value: String(years.length + 1),
        months,
        label: `Ano ${years.length + 1} (${months[0]}–${months[months.length - 1]})`,
      });
  }
  const periodo = sp.periodo ?? "acum";
  const periodMonths =
    periodo !== "acum"
      ? new Set(years.find((y) => y.value === periodo)?.months ?? [])
      : null;

  // Agrega os inputs dos projetos selecionados.
  const all = await Promise.all(selectedProjects.map((p) => projectInputs(p, periodMonths)));
  const R = all.reduce((a, x) => a + x.receita, 0);
  const CV = all.reduce((a, x) => a + x.custoVar, 0);
  const cat = (k: string) => all.reduce((a, x) => a + (x.byCat[k] || 0), 0);
  const CF = cat("Custo Fixo");
  const DV = cat("Despesa Variável");
  const DF = cat("Despesa Fixa");
  const RET = cat("Retiradas");
  const INV = cat("Investimento");
  const EMP = cat("Empréstimos");

  const MC = R - CV - CF; // Margem de Contribuição
  const EBITDA = MC - (DF + DV + RET);
  const RF = EBITDA - INV - EMP; // Resultado Final

  const pct = (v: number) => (R > 0 ? (v / R) * 100 : 0);
  const rows: { label: string; value: number; kind: "item" | "sub" | "final" }[] = [
    { label: "Receita", value: R, kind: "item" },
    { label: "(−) Custo Variável (medição de obra)", value: CV, kind: "item" },
    { label: "(−) Custo Fixo", value: CF, kind: "item" },
    { label: "= Margem de Contribuição", value: MC, kind: "sub" },
    { label: "(−) Despesa Variável", value: DV, kind: "item" },
    { label: "(−) Despesa Fixa", value: DF, kind: "item" },
    { label: "(−) Retiradas", value: RET, kind: "item" },
    { label: "= EBITDA", value: EBITDA, kind: "sub" },
    { label: "(−) Investimentos", value: INV, kind: "item" },
    { label: "(−) Empréstimos", value: EMP, kind: "item" },
    { label: "= Resultado Final", value: RF, kind: "final" },
  ];

  const scopeLabel = isAll
    ? "Empresa toda (matriz + filiais + projetos)"
    : selectedProjects[0].name;
  const periodLabel = periodMonths
    ? years.find((y) => y.value === periodo)?.label
    : "Acumulado (todo o horizonte)";

  return (
    <>
      <PageHeader
        eyebrow={scopeLabel}
        title="DRE — Demonstração de Resultado"
        subtitle={`${periodLabel} · análise vertical (% da receita)`}
        actions={
          <DreControls
            projects={ctx.projects.map((p) => ({
              id: p.id,
              label: p.kind === "office" ? `${p.name} · Unidade/Escritório` : p.name,
            }))}
            proj={projParam}
            periods={[
              { value: "acum", label: "Acumulado (todos os anos)" },
              ...years.map((y) => ({ value: y.value, label: y.label })),
            ]}
            periodo={periodo}
            periodDisabled={false}
          />
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Receita" value={brl0(R)} />
        <Kpi label="Margem de Contribuição" value={brl0(MC)} tone={MC >= 0 ? "pos" : "neg"} />
        <Kpi label="EBITDA" value={brl0(EBITDA)} tone={EBITDA >= 0 ? "pos" : "neg"} />
        <Kpi
          label="Resultado Final"
          value={brl0(RF)}
          tone={RF >= 0 ? "pos" : "neg"}
          sub={`${pct(RF).toFixed(1)}% da receita`}
        />
      </div>

      <Card>
        <CardContent className="p-5">
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                <TH className="text-right">Valor</TH>
                <TH className="text-right">% Receita (vertical)</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const isSub = r.kind !== "item";
                return (
                  <TR
                    key={r.label}
                    className={isSub ? "bg-[var(--color-surface2)]" : undefined}
                  >
                    <TD
                      className={
                        r.kind === "final"
                          ? "font-semibold text-[var(--color-accent)]"
                          : isSub
                            ? "font-semibold text-[var(--color-ink)]"
                            : "text-[var(--color-ink2)]"
                      }
                    >
                      {r.label}
                    </TD>
                    <TD
                      className={`text-right font-[family-name:var(--font-mono)] ${
                        isSub ? "font-semibold" : ""
                      } ${
                        r.value < 0
                          ? "text-[var(--color-danger)]"
                          : r.kind === "final" || r.kind === "sub"
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-ink)]"
                      }`}
                    >
                      {brl0(r.value)}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {pct(r.value).toFixed(1)}%
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  sub?: string;
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
        {sub && <p className="mt-0.5 text-[11px] text-[var(--color-ink3)]">{sub}</p>}
      </CardContent>
    </Card>
  );
}
