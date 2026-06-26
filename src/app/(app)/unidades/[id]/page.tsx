import { notFound } from "next/navigation";
import { getActiveContext } from "@/lib/context";
import { getUnit } from "@/lib/queries";
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
  const row = await getUnit(ctx.version.id, id);
  if (!row) notFound();

  return (
    <>
      <PageHeader eyebrow={ctx.version.label} title={`Editar ${row.code}`} />
      <UnitForm
        initial={{
          id: row.id,
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
