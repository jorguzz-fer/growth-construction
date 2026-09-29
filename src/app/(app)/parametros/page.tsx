import { getActiveContext } from "@/lib/context";
import { getInccRows } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { InccEditor } from "@/components/app/incc-editor";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function ParametrosPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "parametros", "ver")) return <AccessDenied />;
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
