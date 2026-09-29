import { getActiveContext } from "@/lib/context";
import { getInccRows } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { SimulatorForm } from "@/components/app/simulator-form";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function SimuladorPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "simulador", "ver")) return <AccessDenied />;
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
