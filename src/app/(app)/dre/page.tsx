import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext, type Project } from "@/lib/context";
import {
  getExpenseRows,
  getInccRows,
  getMedicoes,
  getMonthlyRevenue,
  getPermutas,
  permToResale,
} from "@/lib/queries";
import { permutaRevenueByMonth } from "@/lib/calc";
import { getEncargosByVersion } from "@/lib/actions/pagamentos";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { DreControls } from "@/components/app/dre-controls";
import { VersionMultiSelect } from "@/components/app/version-multiselect";

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
  return versionInputs(vid, project.id, periodMonths);
}

async function versionInputs(
  vid: string,
  projectId: string,
  periodMonths: Set<string> | null,
): Promise<Inputs> {
  const [revenue, medicoes, despesas, permutas, encargosMes] = await Promise.all([
    getMonthlyRevenue(vid, projectId),
    getMedicoes(vid),
    getExpenseRows(vid),
    getPermutas(vid),
    getEncargosByVersion(vid),
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
  const byCat: Record<string, number> = {};
  for (const d of despesas) {
    if (!d.categoriaDre || !inP(d.competencia)) continue;
    byCat[d.categoriaDre] = (byCat[d.categoriaDre] || 0) + Number(d.valor);
  }
  // Custo Variável: medição (detalhada) + linhas de "Custo Variável" do
  // lançamento simplificado (Budget/Forecast).
  const custoVar =
    medicoes.filter((m) => inP(m.competencia)).reduce((a, m) => a + Number(m.valor), 0) +
    (byCat["Custo Variável"] || 0);
  // Encargos financeiros (multa/juros/outros − desconto) por data de pagamento.
  const encargos = Object.entries(encargosMes)
    .filter(([mm]) => inP(mm))
    .reduce((a, [, v]) => a + v, 0);
  byCat["Despesas Financeiras"] = (byCat["Despesas Financeiras"] || 0) + encargos;
  return {
    receita: receitaProj + receitaPermuta + (byCat["Receita"] || 0),
    custoVar,
    byCat,
  };
}

interface DreRow {
  label: string;
  value: number;
  kind: "item" | "sub" | "final";
}

/** Calcula a cascata da DRE (linhas) a partir dos inputs agregados. */
function waterfall(all: Inputs[]): { rows: DreRow[]; R: number } {
  const R = all.reduce((a, x) => a + x.receita, 0);
  const CV = all.reduce((a, x) => a + x.custoVar, 0);
  const cat = (k: string) => all.reduce((a, x) => a + (x.byCat[k] || 0), 0);
  const CF = cat("Custo Fixo");
  const DV = cat("Despesa Variável");
  const DF = cat("Despesa Fixa");
  const RET = cat("Retiradas");
  const INV = cat("Investimento");
  const EMP = cat("Empréstimos");
  const DFIN = cat("Despesas Financeiras");
  const MC = R - CV - CF;
  const EBITDA = MC - (DF + DV + RET);
  const RF = EBITDA - INV - EMP - DFIN;
  return {
    R,
    rows: [
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
      { label: "(−) Despesas Financeiras (juros/multas)", value: DFIN, kind: "item" },
      { label: "= Resultado Final", value: RF, kind: "final" },
    ],
  };
}

export default async function DREPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; periodo?: string; vs?: string }>;
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

  const scopeLabel = isAll
    ? "Empresa toda (matriz + filiais + projetos)"
    : selectedProjects[0].name;

  // Comparação de 1–3 versões: só quando o projeto selecionado é o ativo
  // (cujas versões estão no contexto). Caso contrário, coluna única agregada.
  const canCompareVersions = !isAll && selectedProjects[0].id === ctx.project.id;
  const vsIds = (sp.vs ?? "").split(",").filter(Boolean);
  const compareVersions = canCompareVersions
    ? (vsIds.length
        ? ctx.versions.filter((v) => vsIds.includes(v.id))
        : [ctx.version]
      ).slice(0, 3)
    : [];

  let columns: { label: string; color?: string; wf: ReturnType<typeof waterfall> }[];
  if (compareVersions.length >= 1) {
    const perV = await Promise.all(
      compareVersions.map((v) => versionInputs(v.id, ctx.project.id, periodMonths)),
    );
    columns = compareVersions.map((v, i) => ({
      label: v.label,
      color: v.color,
      wf: waterfall([perV[i]]),
    }));
  } else {
    const all = await Promise.all(selectedProjects.map((p) => projectInputs(p, periodMonths)));
    columns = [{ label: scopeLabel, wf: waterfall(all) }];
  }
  const multi = columns.length > 1;

  const periodLabel = periodMonths
    ? years.find((y) => y.value === periodo)?.label
    : "Acumulado (todo o horizonte)";
  const labels = columns[0].wf.rows;

  return (
    <>
      <PageHeader
        eyebrow={scopeLabel}
        title="DRE — Demonstração de Resultado"
        subtitle={`${periodLabel}${multi ? " · comparativo de versões" : " · análise vertical (% da receita)"}`}
        actions={
          <div className="flex flex-wrap items-end gap-3">
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
            {canCompareVersions && (
              <VersionMultiSelect
                versions={ctx.versions.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
                selected={compareVersions.map((v) => v.id)}
              />
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="p-5">
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                {columns.map((c) => (
                  <TH key={c.label} className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {c.color && (
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      )}
                      {c.label}
                    </span>
                  </TH>
                ))}
                {!multi && <TH className="text-right">% Receita</TH>}
              </tr>
            </THead>
            <tbody>
              {labels.map((lbl, ri) => {
                const isSub = lbl.kind !== "item";
                return (
                  <TR key={lbl.label} className={isSub ? "bg-[var(--color-surface2)]" : undefined}>
                    <TD
                      className={
                        lbl.kind === "final"
                          ? "font-semibold text-[var(--color-accent)]"
                          : isSub
                            ? "font-semibold text-[var(--color-ink)]"
                            : "text-[var(--color-ink2)]"
                      }
                    >
                      {lbl.label}
                    </TD>
                    {columns.map((c) => {
                      const v = c.wf.rows[ri].value;
                      return (
                        <TD
                          key={c.label}
                          className={`text-right font-[family-name:var(--font-mono)] ${
                            isSub ? "font-semibold" : ""
                          } ${
                            v < 0
                              ? "text-[var(--color-danger)]"
                              : lbl.kind === "final" || lbl.kind === "sub"
                                ? "text-[var(--color-success)]"
                                : "text-[var(--color-ink)]"
                          }`}
                        >
                          {brl0(v)}
                        </TD>
                      );
                    })}
                    {!multi && (
                      <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {(columns[0].wf.R > 0 ? (columns[0].wf.rows[ri].value / columns[0].wf.R) * 100 : 0).toFixed(1)}%
                      </TD>
                    )}
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
