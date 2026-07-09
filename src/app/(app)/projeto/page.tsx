import { getActiveContext } from "@/lib/context";
import { getClientes } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ProjectManager } from "@/components/app/project-manager";

export const dynamic = "force-dynamic";

export default async function ProjetoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "projeto", "ver")) return <AccessDenied />;

  const clientes = await getClientes(ctx.tenant.id);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Projetos & Unidades"
        subtitle="Cadastre empreendimentos (nome, datas, cliente e duração) e unidades/escritórios (matriz e filiais)."
      />

      <ProjectManager
        projects={ctx.projects}
        activeId={ctx.project.id}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        tenantName={ctx.tenant.name}
        perms={{
          criar: can(ctx.perms, "projeto", "criar"),
          editar: can(ctx.perms, "projeto", "editar"),
          excluir: can(ctx.perms, "projeto", "excluir"),
        }}
      />
    </>
  );
}
