import { getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getClientesParaSimulador, getInccTabela } from "@/lib/queries";
import { mesDaData } from "@/lib/incc-analise";
import { PageHeader } from "@/components/app/page-header";
import { SimulatorForm } from "@/components/app/simulator-form";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function SimuladorPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "simulador", "ver")) return <AccessDenied />;
  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a do cookie.
  const selecao = lerSelecaoDeProjeto(ctx.projects, await searchParams);
  if (selecao.tipo !== "projeto") {
    return <PedirProjeto titulo="Simulador de Unidade" projetos={ctx.projects} oQue="simular com o INCC da obra" />;
  }
  const project = selecao.projeto;
  const { linhas, variante } = await getInccTabela(ctx.tenant.id, project.id);
  const incc = linhas.map((l) => ({ m: l.m, mo: l.mo, ac: l.ac, projected: l.projected }));
  // 2.8 — janela da obra (início/fim) para a evolução; sem ela, premissa rotulada.
  const inicio = mesDaData(project.startDate);
  const fim = mesDaData(project.endDate);
  const janelaObra = inicio && fim ? { inicio, fim } : null;
  // BN-3 — a renda do cadastro só sai do servidor para quem tem a permissão de
  // dados sensíveis; para os demais a lista vem sem renda (digitam).
  const podeVerRenda = can(ctx.perms, "clientesdados", "ver");
  const clientes = await getClientesParaSimulador(ctx.tenant.id, podeVerRenda);

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Simulador de Unidade"
        subtitle="SAC / PRICE / SBPE · fluxo com tantas linhas quanto parcelas, correção INCC a partir da 5ª · calculadora: nada é gravado"
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={project.id}
          />
        }
      />
      <LembrarProjeto projectId={project.id} />
      <SimulatorForm incc={incc} obra={{ nome: project.name, variante }} janelaObra={janelaObra} clientes={clientes} podeVerRenda={podeVerRenda} usuario={ctx.userEmail ?? "anon"} />
    </>
  );
}
