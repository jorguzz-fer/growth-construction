import { getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { can } from "@/lib/permissions";
import { getBudgetPlanning, getForecastComparison } from "@/lib/queries";
import { getProjectVersions } from "@/lib/context";
import { analisarOrcamento } from "@/lib/orcamento-analise";
import { AccessDenied } from "@/components/app/access-denied";
import { BudgetPlanningScreen } from "@/components/app/budget-planning-screen";
import { AssistenteOrcamento } from "@/components/app/assistente-orcamento";

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
  const [data, daObra] = await Promise.all([
    getBudgetPlanning(ctx.tenant.id, projId, "budget", sp.v ?? null),
    getProjectVersions(ctx.tenant.id, projId),
  ]);
  const projects = alvos.map((p) => ({
    id: p.id,
    label: p.kind === "office" ? `${p.name} · Matriz/Filial` : p.name,
  }));
  // Assistente (seção 6, somente leitura): compara com a Previsão que nasceu
  // deste Orçamento (a mais antiga), se houver. Projeto e versão já vêm
  // validados contra o tenant; nada vem do cliente.
  const previsao = daObra?.versions.find((v) => v.kind === "forecast" && v.sourceVersionId === data.versionId) ?? null;
  const cmp = previsao && data.hasPeriod ? await getForecastComparison(ctx.tenant.id, previsao.id) : null;
  const analise = analisarOrcamento(data, cmp);
  return (
    <>
      <LembrarProjeto projectId={projId} />
      <div className="flex flex-col gap-6 min-[1180px]:flex-row min-[1180px]:items-start">
        <div className="min-w-0 flex-1">
          <BudgetPlanningScreen
            data={data}
            kind="budget"
            projects={projects}
            canEdit={can(ctx.perms, "budget", "editar")}
          />
        </div>
        {data.hasPeriod && <AssistenteOrcamento usuario={ctx.userEmail ?? "anon"} tela="budget" analise={analise} />}
      </div>
    </>
  );
}
