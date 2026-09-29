import { getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { can } from "@/lib/permissions";
import { getBudgetPlanning } from "@/lib/queries";
import { AccessDenied } from "@/components/app/access-denied";
import { BudgetPlanningScreen } from "@/components/app/budget-planning-screen";

export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string; v?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "budget", "ver")) return <AccessDenied />;
  const sp = await searchParams;

  // Inclui obras e matriz/filiais (office). Offices não têm cronograma → o
  // período do Budget/Forecast é o ano atual + 5 anos (definido no servidor).
  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a do cookie nem a primeira.
  const alvos = ctx.projects;
  const selecao = lerSelecaoDeProjeto(alvos, sp);
  if (selecao.tipo !== "projeto") {
    return <PedirProjeto titulo="Orçamentos" projetos={alvos} oQue="lançar o orçamento" />;
  }
  const projId = selecao.projeto.id;
  const data = await getBudgetPlanning(ctx.tenant.id, projId, "budget", sp.v ?? null);
  const projects = alvos.map((p) => ({
    id: p.id,
    label: p.kind === "office" ? `${p.name} · Matriz/Filial` : p.name,
  }));
  return (
    <>
      <LembrarProjeto projectId={projId} />
      <BudgetPlanningScreen
        data={data}
        kind="budget"
        projects={projects}
        canEdit={can(ctx.perms, "budget", "editar")}
      />
    </>
  );
}
