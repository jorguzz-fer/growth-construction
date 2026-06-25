import { getActiveContext } from "@/lib/context";
import { getInccRows } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { SimulatorForm } from "@/components/app/simulator-form";

export const dynamic = "force-dynamic";

export default async function SimuladorPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const incc = await getInccRows(ctx.project.id);

  return (
    <>
      <PageHeader
        eyebrow={ctx.project.name}
        title="Simulador de Unidade"
        subtitle="SAC / PRICE / SBPE · fluxo de 36 meses com correção INCC"
      />
      <SimulatorForm incc={incc} />
    </>
  );
}
