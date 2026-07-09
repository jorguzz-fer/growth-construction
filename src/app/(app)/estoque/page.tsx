import { getActiveContext } from "@/lib/context";
import { getStockItems, getStockMovements } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { EstoqueManager } from "@/components/app/estoque-manager";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "estoque", "ver")) return <AccessDenied />;

  const [items, movements] = await Promise.all([
    getStockItems(ctx.tenant.id),
    getStockMovements(ctx.tenant.id),
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
    quantidade: Number(m.quantidade),
    custoUnit: Number(m.custoUnit),
    data: m.data,
    doc: m.doc,
    obs: m.obs,
    projectName: m.projectName,
    clienteNome: m.clienteNome,
  }));

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Controle de Estoques"
        subtitle="Itens, entradas e saídas, saldo atual e histórico — movimentações associadas às obras."
      />
      <EstoqueManager
        items={itemViews}
        movements={movViews}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        canEdit={can(ctx.perms, "estoque", "criar")}
        canExcluir={can(ctx.perms, "estoque", "excluir")}
      />
    </>
  );
}
