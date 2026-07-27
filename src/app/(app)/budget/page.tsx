import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getBudgetPlanning } from "@/lib/queries";
import { AccessDenied } from "@/components/app/access-denied";
import { BudgetPlanningScreen } from "@/components/app/budget-planning-screen";

export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; v?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "budget", "ver")) return <AccessDenied />;
  const sp = await searchParams;

  // Inclui obras e matriz/filiais (office). Offices não têm cronograma → o
  // período do Budget/Forecast é o ano atual + 5 anos (definido no servidor).
  const alvos = ctx.projects;
  const projId =
    alvos.find((p) => p.id === sp.proj)?.id ??
    alvos.find((p) => p.id === ctx.project.id)?.id ??
    alvos[0]?.id ??
    ctx.project.id;
  const data = await getBudgetPlanning(ctx.tenant.id, projId, "budget", sp.v ?? null);
  const projects = alvos.map((p) => ({
    id: p.id,
    label: p.kind === "office" ? `${p.name} · Matriz/Filial` : p.name,
  }));
  return (
    <BudgetPlanningScreen
      data={data}
      kind="budget"
      projects={projects}
      canEdit={can(ctx.perms, "budget", "editar")}
    />
  );
}
