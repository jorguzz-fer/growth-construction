import { getActiveContext } from "@/lib/context";
import { hasLevel } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { UnitForm } from "@/components/app/unit-form";
import { emptyPlan } from "@/lib/calc";

export const dynamic = "force-dynamic";

export default async function NovaUnidadePage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!hasLevel(ctx.perms, "receitas", "edit")) {
    return <p className="text-sm text-[var(--color-warning)]">Sem permissão para criar unidades.</p>;
  }

  return (
    <>
      <PageHeader eyebrow={ctx.version.label} title="Nova Unidade" />
      <UnitForm
        initial={{
          code: "",
          bloco: "",
          tipo: "",
          m2: "",
          andar: "",
          valor: "",
          status: "Disponivel",
          mesVenda: "",
          plan: emptyPlan(),
        }}
      />
    </>
  );
}
