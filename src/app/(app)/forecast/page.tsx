import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import {
  getBudgetPlanning,
  getProjectVersionsByKind,
  getForecastComparison,
} from "@/lib/queries";
import { AccessDenied } from "@/components/app/access-denied";
import { BudgetPlanningScreen } from "@/components/app/budget-planning-screen";
import { BudgetForecastCompare } from "@/components/app/budget-forecast-compare";

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; v?: string; cmp?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "forecast", "ver")) return <AccessDenied />;
  const sp = await searchParams;

  const obras = ctx.projects.filter((p) => p.kind !== "office");
  const projId =
    obras.find((p) => p.id === sp.proj)?.id ??
    obras.find((p) => p.id === ctx.project.id)?.id ??
    obras[0]?.id ??
    ctx.project.id;
  const [data, budgetVersions] = await Promise.all([
    getBudgetPlanning(ctx.tenant.id, projId, "forecast", sp.v ?? null),
    getProjectVersionsByKind(ctx.tenant.id, projId, "budget"),
  ]);

  // Modo comparação (spec §16): Forecast selecionado × Budget de origem.
  if (sp.cmp === "1" && data.versionId) {
    const cmp = await getForecastComparison(ctx.tenant.id, data.versionId);
    const back = `/forecast?proj=${projId}&v=${data.versionId}`;
    return <BudgetForecastCompare data={cmp} backHref={back} />;
  }

  const projects = obras.map((p) => ({ id: p.id, label: p.name }));
  return (
    <BudgetPlanningScreen
      data={data}
      kind="forecast"
      projects={projects}
      canEdit={can(ctx.perms, "forecast", "editar")}
      budgetVersions={budgetVersions.map((v) => ({ id: v.id, label: v.label }))}
      canCreateForecast={can(ctx.perms, "forecast", "criar")}
    />
  );
}
