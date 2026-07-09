import { getActiveContext } from "@/lib/context";
import {
  getContasPagar,
  getReceivables,
  getCashByTenant,
  getBankAccounts,
} from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { FechamentoPanel } from "@/components/app/fechamento-panel";

export const dynamic = "force-dynamic";

export default async function FechamentoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "fechamento", "ver")) return <AccessDenied />;

  const [contasPagar, receivables, cash, contas] = await Promise.all([
    getContasPagar(ctx.tenant.id),
    getReceivables(ctx.tenant.id),
    getCashByTenant(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
  ]);
  const saldoContas = contas.reduce((a, c) => a + Number(c.saldo), 0);

  const now = new Date();
  const hojeInternal = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(
    now.getDate(),
  ).padStart(2, "0")}/${now.getFullYear()}`;

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Fechamento de Caixa"
        subtitle="Contas a pagar do dia × receitas a receber do dia — pendências não liquidadas passam para o dia seguinte."
      />
      <FechamentoPanel
        contasPagar={contasPagar}
        receivables={receivables}
        cash={cash.map((c) => ({ data: c.data, valor: Number(c.valor) }))}
        saldoContas={saldoContas}
        hojeInternal={hojeInternal}
        canClose={can(ctx.perms, "fechamento", "criar")}
      />
    </>
  );
}
