import { getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getInccRows } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { InccEditor } from "@/components/app/incc-editor";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function ParametrosPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "parametros", "ver")) return <AccessDenied />;
  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a do cookie.
  const selecao = lerSelecaoDeProjeto(ctx.projects, await searchParams);
  if (selecao.tipo !== "projeto") {
    return <PedirProjeto titulo="Parâmetros / INCC" projetos={ctx.projects} oQue="editar o INCC" />;
  }
  const project = selecao.projeto;
  const incc = await getInccRows(ctx.tenant.id, project.id);
  const canEdit = can(ctx.perms, "parametros", "editar");

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Parâmetros / INCC"
        subtitle="Índice Nacional de Custo da Construção · correção a partir da 5ª parcela"
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={project.id}
          />
        }
      />
      <LembrarProjeto projectId={project.id} />
      <InccEditor projectId={project.id} initial={incc} canEdit={canEdit} />
    </>
  );
}
