import { notFound } from "next/navigation";
import { getActiveContext } from "@/lib/context";
import { getUnitWithProject } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { UnitForm } from "@/components/app/unit-form";
import { emptyPlan } from "@/lib/calc";

export const dynamic = "force-dynamic";

export default async function EditarUnidadePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const { id } = await params;
  const row = await getUnitWithProject(ctx.tenant.id, id);
  if (!row) notFound();
  const project = ctx.projects.find((p) => p.id === row.projectId) ?? ctx.projects[0];

  return (
    <>
      <PageHeader eyebrow={`${project.name} · Atual`} title={`Editar ${row.code}`} />
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
