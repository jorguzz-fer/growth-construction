import { getTenantContext } from "@/lib/context";
import {
  getContasReceber,
  getReceivables,
  getClientes,
  getBankAccounts,
  getUnidadesAtuaisPorObra,
} from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ContasReceberManager } from "@/components/app/contas-receber-manager";
import { ReceitaSearch, type ReceitaBuscavel } from "@/components/app/receita-search";
import { ProjectPicker } from "@/components/app/project-picker";

export const dynamic = "force-dynamic";

export default async function ContasReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "contasreceber", "ver")) return <AccessDenied />;

  const sp = await searchParams;

  // Filtro por projeto (?proj=): "all" mostra todos. CR-06 — a obra filtra na
  // consulta; a página não carrega a empresa inteira para descartar depois.
  const isAll = !sp.proj || sp.proj === "all";
  const projSel = isAll ? null : (ctx.projects.find((p) => p.id === sp.proj) ?? null);
  const filtroObra = projSel?.id;

  const [contas, receivables, clientes, bancos, unidadesPorObra] = await Promise.all([
    getContasReceber(ctx.tenant.id, filtroObra),
    getReceivables(ctx.tenant.id, filtroObra),
    getClientes(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    // CR-07 — o seletor de unidade só oferece as unidades da obra escolhida.
    getUnidadesAtuaisPorObra(ctx.tenant.id),
  ]);

  // Lista unificada para a busca (contas lançadas + recebíveis das vendas),
  // já só da obra escolhida.
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
        eyebrow={projSel ? `${projSel.name} · ${ctx.tenant.name}` : `Todos os projetos · ${ctx.tenant.name}`}
        title="Contas a Receber"
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={projSel ? projSel.id : "all"}
            allOption
          />
        }
        subtitle="Recebíveis das vendas (Unidades) e contas a receber lançadas manualmente — vinculadas a um projeto."
      />
      <div className="mb-3">
        <ReceitaSearch rows={receitasBuscaveis} />
      </div>

      <ContasReceberManager
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        projetoSelecionado={projSel?.id ?? null}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        unidadesPorObra={unidadesPorObra}
        contas={contas}
        unitReceb={receivables.map((r) => ({
          // CR-08 — o identificador do recebível (unidade:índice da parcela)
          // chega à tabela; é a chave de qualquer vínculo futuro.
          refId: r.refId,
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
