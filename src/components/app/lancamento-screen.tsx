import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ActiveContext } from "@/lib/context";
import {
  getChartAccounts,
  getBudgetLines,
  getInccRows,
  getReceitaByProject,
} from "@/lib/queries";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { defaultDreCategory } from "@/lib/budget/config";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectPicker } from "@/components/app/project-picker";
import { BudgetMatrix, type MatrixRow } from "@/components/app/budget-matrix";
import { ReceitaProjetosMatrix } from "@/components/app/receita-projetos-matrix";

/**
 * Tela de lançamento simplificado (Budget ou Forecast) por projeto. Não usa
 * "projeto/versão ativos": o projeto é escolhido no seletor (?proj=) e a
 * versão é a do tipo `kind` daquele projeto.
 */
export async function LancamentoScreen({
  ctx,
  kind,
  proj,
}: {
  ctx: ActiveContext;
  kind: "budget" | "forecast";
  proj?: string;
}) {
  const title =
    kind === "budget" ? "Lançamento Budget" : "Lançamento Forecast";

  const project = ctx.projects.find((p) => p.id === proj) ?? ctx.projects[0];
  const projectPicker = (
    <ProjectPicker
      projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
      selected={project.id}
    />
  );

  // Versão do tipo pedido, no projeto selecionado.
  const [version] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.projectId, project.id),
        eq(schema.versions.kind, kind),
      ),
    )
    .orderBy(asc(schema.versions.createdAt))
    .limit(1);

  if (!version) {
    return (
      <>
        <PageHeader
          eyebrow={project.name}
          title={title}
          subtitle="Lançamento simplificado mensal (receitas e despesas)."
          actions={projectPicker}
        />
        <Card>
          <CardContent className="p-6 text-[13px] text-[var(--color-ink2)]">
            Este projeto não possui versão{" "}
            <strong>{kind === "budget" ? "Budget" : "Forecast"}</strong>.
          </CardContent>
        </Card>
      </>
    );
  }

  const [chart, lines, incc, receitaProjetos] = await Promise.all([
    getChartAccounts(ctx.tenant.id),
    getBudgetLines(version.id),
    getInccRows(project.id),
    getReceitaByProject(ctx.tenant.id, kind),
  ]);

  const months = incc.map((r) => r.m);
  const canEditKind = can(ctx.perms, kind, "editar") && !version.locked;

  const grupos = new Map<string, MatrixRow>();
  for (const r of chart) {
    if (!grupos.has(r.groupCode))
      grupos.set(r.groupCode, {
        rowKey: r.groupCode,
        label: `${r.groupCode} · ${r.groupName}`,
        dreCategory: defaultDreCategory(r.kind),
      });
  }
  const despesaRows = [...grupos.values()].sort((a, b) =>
    a.rowKey.localeCompare(b.rowKey, undefined, { numeric: true }),
  );

  // Despesa continua por projeto (versão selecionada): valores atuais por grupo.
  const initial = {
    receita: {} as Record<string, Record<string, number>>,
    despesa: {} as Record<string, Record<string, number>>,
  };
  const initialDespCat: Record<string, string> = {};
  for (const l of lines) {
    if (l.kind === "despesa") {
      (initial.despesa[l.rowKey] ??= {})[l.mes] = Number(l.valor);
      if (l.dreCategory) initialDespCat[l.rowKey] = l.dreCategory;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title={title}
        subtitle="Receita por projeto (consolidada) e despesas por grupo do plano de contas — valores mensais."
        actions={projectPicker}
      />

      {/* Receita consolidada: uma linha por projeto (do cadastro) + Outras Receitas */}
      <section className="mb-8 space-y-2">
        <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
          Receitas por projeto
        </h2>
        <ReceitaProjetosMatrix
          kind={kind}
          months={receitaProjetos.months.length ? receitaProjetos.months : months}
          rows={receitaProjetos.rows.map((r) => ({
            projectId: r.projectId,
            projectName: r.projectName,
            values: r.values,
          }))}
          canEdit={canEditKind}
        />
      </section>

      {/* Despesas do projeto selecionado (por grupo do plano de contas) */}
      <section className="space-y-2">
        <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
          Despesas — {project.name}
        </h2>
        <BudgetMatrix
          versionId={version.id}
          versionLabel={version.label}
          isForecast={kind === "forecast"}
          months={months}
          receitaRows={[]}
          despesaRows={despesaRows}
          dreCategories={CATEGORIAS_DRE.filter((c) => c !== "Receita")}
          initial={initial}
          initialDespCat={initialDespCat}
          canEdit={canEditKind}
          despesaOnly
        />
      </section>
    </>
  );
}
