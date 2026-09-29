import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { UnitForm } from "@/components/app/unit-form";
import { emptyPlan } from "@/lib/calc";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function NovaUnidadePage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "unidades", "ver")) return <AccessDenied />;
  if (!can(ctx.perms, "unidades", "criar")) {
    return <p className="text-sm text-[var(--color-warning)]">Sem permissão para criar unidades.</p>;
  }
  const sp = await searchParams;
  const project = ctx.projects.find((p) => p.id === sp.proj) ?? ctx.projects[0];

  return (
    <>
      <PageHeader eyebrow="Nova venda · versão Atual" title="Nova Unidade" />
      <UnitForm
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        initial={{
          projetoId: project.id,
          itemType: "unidade",
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
