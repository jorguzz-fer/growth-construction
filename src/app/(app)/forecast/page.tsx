import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getBudgetPlanning } from "@/lib/queries";
import { AccessDenied } from "@/components/app/access-denied";
import { BudgetPlanningScreen } from "@/components/app/budget-planning-screen";

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; v?: string }>;
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
  const data = await getBudgetPlanning(ctx.tenant.id, projId, "forecast", sp.v ?? null);
  const projects = obras.map((p) => ({ id: p.id, label: p.name }));
  return (
    <BudgetPlanningScreen
      data={data}
      kind="forecast"
      projects={projects}
      canEdit={can(ctx.perms, "forecast", "editar")}
    />
  );
}
