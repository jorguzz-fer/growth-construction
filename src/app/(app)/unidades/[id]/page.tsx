import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/context";
import { getUnitWithProject } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { UnitForm } from "@/components/app/unit-form";
import { emptyPlan } from "@/lib/calc";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function EditarUnidadePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "unidades", "ver")) return <AccessDenied />;
  const { id } = await params;
  const row = await getUnitWithProject(ctx.tenant.id, id);
  if (!row) notFound();
  // A unidade já traz a obra dela (consulta filtrada pelo tenant).
  const nomeDaObra = ctx.projects.find((p) => p.id === row.projectId)?.name ?? "";

  return (
    <>
      <PageHeader eyebrow={`${nomeDaObra} · Atual`} title={`Editar ${row.code}`} />
      <UnitForm
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        initial={{
          id: row.id,
          projetoId: row.projectId,
          itemType: row.itemType,
          code: row.code,
          bloco: row.bloco ?? "",
          tipo: row.tipo ?? "",
          m2: row.m2 ?? "",
          andar: row.andar != null ? String(row.andar) : "",
          valor: row.valor ?? "",
          status: row.status,
          mesVenda: row.mesVenda ?? "",
          plan: row.paymentPlan ?? emptyPlan(),
        }}
      />
    </>
  );
}
