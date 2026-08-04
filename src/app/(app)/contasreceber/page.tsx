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
import { ReceitaSearch, type ReceitaBuscavel } from "@/components/app/receita-search";

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

  // Lista unificada para a busca (contas lançadas + recebíveis das vendas).
  const receitasBuscaveis: ReceitaBuscavel[] = [
    ...contas.map((c) => ({
      id: c.id,
      origem: "conta" as const,
      descricao: c.descricao,
      clienteNome: c.clienteNome,
      projectName: c.projectName,
      unitCode: c.unitCode,
      tipo: c.tipo,
      valor: Number(c.valor),
      vencimento: c.vencimento,
      status: c.status,
    })),
    ...receivables.map((r) => ({
      id: r.refId,
      origem: "recebivel" as const,
      descricao: r.descricao,
      clienteNome: r.clienteNome,
      projectName: r.projectName,
      unitCode: r.unitCode,
      tipo: null,
      valor: r.valor,
      vencimento: r.dia,
      status: r.status,
    })),
  ];

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Contas a Receber"
        subtitle="Recebíveis das vendas (Unidades) e contas a receber lançadas manualmente — vinculadas a um projeto."
      />
      {/* Busca de receitas: cobre as duas origens da tela — contas a receber
          lançadas e recebíveis derivados dos planos de venda. */}
      <div className="mb-3">
        <ReceitaSearch rows={receitasBuscaveis} />
      </div>

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
