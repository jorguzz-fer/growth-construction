import { getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { can } from "@/lib/permissions";
import {
  getBudgetPlanning,
  getProjectVersionsByKind,
  getForecastComparison,
} from "@/lib/queries";
import { analisarOrcamento } from "@/lib/orcamento-analise";
import { AccessDenied } from "@/components/app/access-denied";
import { BudgetPlanningScreen } from "@/components/app/budget-planning-screen";
import { BudgetForecastCompare } from "@/components/app/budget-forecast-compare";
import { AssistenteOrcamento } from "@/components/app/assistente-orcamento";

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string; v?: string; cmp?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "forecast", "ver")) return <AccessDenied />;
  const sp = await searchParams;

  // Inclui obras e matriz/filiais (office). Offices usam ano atual + 5 anos.
  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a do cookie nem a primeira.
  const alvos = ctx.projects;
  const selecao = lerSelecaoDeProjeto(alvos, sp);
  if (selecao.tipo !== "projeto") {
    return <PedirProjeto titulo="Previsão Atualizada" projetos={alvos} oQue="lançar a previsão" />;
  }
  const projId = selecao.projeto.id;
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

  const projects = alvos.map((p) => ({
    id: p.id,
    label: p.kind === "office" ? `${p.name} · Matriz/Filial` : p.name,
  }));
  // Assistente (seção 6, somente leitura): compara esta Previsão com o seu
  // Orçamento de origem. Versão já validada contra o tenant pela consulta.
  const cmp = data.versionId && data.hasPeriod ? await getForecastComparison(ctx.tenant.id, data.versionId) : null;
  const analise = analisarOrcamento(data, cmp);
  return (
    <>
      <LembrarProjeto projectId={projId} />
      <div className="flex flex-col gap-6 min-[1180px]:flex-row min-[1180px]:items-start">
        <div className="min-w-0 flex-1">
          <BudgetPlanningScreen
            data={data}
            kind="forecast"
            projects={projects}
            canEdit={can(ctx.perms, "forecast", "editar")}
            budgetVersions={budgetVersions.map((v) => ({ id: v.id, label: v.label }))}
            canCreateForecast={can(ctx.perms, "forecast", "criar")}
          />
        </div>
        {data.hasPeriod && data.versionId && <AssistenteOrcamento usuario={ctx.userEmail ?? "anon"} tela="forecast" analise={analise} />}
      </div>
    </>
  );
}
