import { getActiveContext } from "@/lib/context";
import {
  getStockItems,
  getStockMovements,
  getDespesaOptions,
  getPermutaOptions,
} from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { EstoqueManager } from "@/components/app/estoque-manager";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "estoque", "ver")) return <AccessDenied />;

  const [items, movements, despesas, permutas] = await Promise.all([
    getStockItems(ctx.tenant.id),
    getStockMovements(ctx.tenant.id),
    getDespesaOptions(ctx.tenant.id),
    getPermutaOptions(ctx.tenant.id),
  ]);

  // Saldo por item = entradas - saídas.
  const saldo = new Map<string, number>();
  for (const m of movements) {
    const q = Number(m.quantidade);
    saldo.set(m.itemId, (saldo.get(m.itemId) ?? 0) + (m.tipo === "saida" ? -q : q));
  }

  const itemViews = items.map((i) => {
    const s = saldo.get(i.id) ?? 0;
    return {
      id: i.id,
      sku: i.sku,
      nome: i.nome,
      unidade: i.unidade,
      categoria: i.categoria,
      custoUnit: Number(i.custoUnit),
      minimo: Number(i.minimo),
      saldo: s,
      valorEstoque: s * Number(i.custoUnit),
    };
  });

  const movViews = movements.map((m) => ({
    id: m.id,
    itemNome: m.itemNome,
    unidade: m.unidade,
    tipo: m.tipo as "entrada" | "saida",
    origem: m.origem,
    quantidade: Number(m.quantidade),
    custoUnit: Number(m.custoUnit),
    data: m.data,
    doc: m.doc,
    obs: m.obs,
    projectName: m.projectName,
    clienteNome: m.clienteNome,
    responsavel: m.responsavel,
    despesaNumDoc: m.despesaNumDoc,
    permutaDescricao: m.permutaDescricao,
  }));

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Controle de Estoques"
        subtitle="Almoxarifado da obra: dê entrada e baixa em poucos cliques, com saldo, mínimo e vínculo à despesa ou permuta de origem."
      />
      <EstoqueManager
        items={itemViews}
        movements={movViews}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        despesas={despesas.map((d) => ({
          id: d.id,
          label: `${d.numDoc}${d.fornecedorNome ? ` · ${d.fornecedorNome}` : ""}`,
        }))}
        permutas={permutas.map((p) => ({
          id: p.id,
          label: `${p.descricao ?? "Permuta"}${p.cliente ? ` · ${p.cliente}` : ""}`,
        }))}
        canEdit={can(ctx.perms, "estoque", "criar")}
        canExcluir={can(ctx.perms, "estoque", "excluir")}
      />
    </>
  );
}
