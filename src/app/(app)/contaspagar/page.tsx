import { getActiveContext } from "@/lib/context";
import { getContasPagar } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ContasPagarTable } from "@/components/app/contas-pagar-table";

export const dynamic = "force-dynamic";

export default async function ContasPagarPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "contaspagar", "ver")) return <AccessDenied />;

  const rows = await getContasPagar(ctx.tenant.id);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Contas a Pagar"
        subtitle="Obrigações de todas as obras — filtre por período, fornecedor, cliente, projeto, categoria e status."
      />
      <ContasPagarTable rows={rows} />
    </>
  );
}
