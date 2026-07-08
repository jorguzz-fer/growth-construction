import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getDespesaSequence } from "@/lib/actions/numeracao";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { NumeracaoForm } from "@/components/app/numeracao-form";

export const dynamic = "force-dynamic";

export default async function NumeracaoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "numeracao", "ver")) return <AccessDenied />;

  const seq = await getDespesaSequence(ctx.tenant.id);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Numeração de Despesas"
        subtitle="Sequência automática dos lançamentos — prefixo, dígitos e próximo número."
      />
      <NumeracaoForm initial={seq} canEdit={can(ctx.perms, "numeracao", "editar")} />
    </>
  );
}
