import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ProjectManager } from "@/components/app/project-manager";

export const dynamic = "force-dynamic";

export default async function ProjetoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "projeto", "ver")) return <AccessDenied />;

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Projetos & Unidades"
        subtitle="Cadastre empreendimentos (nome e duração) e unidades/escritórios (matriz e filiais). Todas as demais telas ficam vinculadas ao item selecionado."
      />

      <ProjectManager
        projects={ctx.projects}
        activeId={ctx.project.id}
        perms={{
          criar: can(ctx.perms, "projeto", "criar"),
          editar: can(ctx.perms, "projeto", "editar"),
          excluir: can(ctx.perms, "projeto", "excluir"),
        }}
      />
    </>
  );
}
