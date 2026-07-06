import { getActiveContext } from "@/lib/context";
import { getInccRows } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { InccEditor } from "@/components/app/incc-editor";

export const dynamic = "force-dynamic";

export default async function ParametrosPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const incc = await getInccRows(ctx.project.id);
  const canEdit = can(ctx.perms, "parametros", "editar");

  return (
    <>
      <PageHeader
        eyebrow={ctx.project.name}
        title="Parâmetros / INCC"
        subtitle="Índice Nacional de Custo da Construção · correção a partir da 5ª parcela"
      />
      <InccEditor projectId={ctx.project.id} initial={incc} canEdit={canEdit} />
    </>
  );
}
