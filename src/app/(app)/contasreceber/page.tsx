import { getActiveContext } from "@/lib/context";
import {
  getContasReceber,
  getReceivables,
  getClientes,
  getBankAccounts,
  getUnitCodesByTenant,
} from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ContasReceberManager } from "@/components/app/contas-receber-manager";

export const dynamic = "force-dynamic";

export default async function ContasReceberPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "contasreceber", "ver")) return <AccessDenied />;

  const [contas, receivables, clientes, bancos, unidades] = await Promise.all([
    getContasReceber(ctx.tenant.id),
    getReceivables(ctx.tenant.id),
    getClientes(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getUnitCodesByTenant(ctx.tenant.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Contas a Receber"
        subtitle="Recebíveis das vendas (Unidades) e contas a receber lançadas manualmente — vinculadas a um projeto."
      />
      <ContasReceberManager
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        unidades={unidades}
        contas={contas}
        unitReceb={receivables.map((r) => ({
          unitCode: r.unitCode,
          projectName: r.projectName,
          clienteNome: r.clienteNome,
          descricao: r.descricao,
          dia: r.dia,
          valor: r.valor,
        }))}
        canCriar={can(ctx.perms, "contasreceber", "criar")}
        canEditar={can(ctx.perms, "contasreceber", "editar")}
        canExcluir={can(ctx.perms, "contasreceber", "excluir")}
      />
    </>
  );
}
