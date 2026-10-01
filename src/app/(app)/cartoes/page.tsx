import { getTenantContext } from "@/lib/context";
import { getBankAccounts, getCartoes, getComprasDaFatura, getFaturasCartao, getVinculosDosCartoes } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { hojeISO } from "@/lib/despesa-status";
import { cicloAberto } from "@/lib/calc/cartao-ciclo";
import { PageHeader } from "@/components/app/page-header";
import { CartaoForm } from "@/components/app/cartao-form";
import { CartoesManager } from "@/components/app/cartoes-manager";
import { FaturasCartao } from "@/components/app/faturas-cartao";
import { ProjecaoCartao } from "@/components/app/projecao-cartao";
import { getPagamentosDaFatura } from "@/lib/actions/faturas";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/**
 * Cartões de Crédito (Prompt U). Esta tela NÃO lança despesa: a compra é
 * lançada em /despesas com a forma "Cartão de crédito" e cai na fatura do
 * ciclo. Aqui: cadastro (seção 1) e faturas (seção 2); pagamento, projeção e
 * conferência nos PRs seguintes.
 */
export default async function CartoesPage({ searchParams }: { searchParams: Promise<{ fatura?: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "cartoes", "ver")) return <AccessDenied />;
  const sp = await searchParams;
  const [cartoes, bancos, faturas, vinculos] = await Promise.all([getCartoes(ctx.tenant.id), getBankAccounts(ctx.tenant.id), getFaturasCartao(ctx.tenant.id), getVinculosDosCartoes(ctx.tenant.id)]);
  const contas = bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }));
  const hoje = hojeISO();
  // 1.3 — "usado no ciclo": o acumulado da fatura ABERTA de cada cartão (as
  // compras e parcelas que caem no ciclo em curso).
  const usado: Record<string, number> = {};
  for (const c of cartoes) {
    const ciclo = cicloAberto(hoje, c);
    const f = ciclo ? faturas.find((x) => x.cartaoId === c.id && x.fechamento === ciclo.fechamento) : null;
    usado[c.id] = f ? Math.max(0, f.valorCompras - f.valorPago) : 0;
  }
  const faturaAberta = sp.fatura && faturas.some((f) => f.id === sp.fatura) ? sp.fatura : null;
  const [compras, pagamentos] = await Promise.all([faturaAberta ? getComprasDaFatura(ctx.tenant.id, faturaAberta) : Promise.resolve([]), getPagamentosDaFatura(ctx.tenant.id, faturas.map((f) => f.id))]);
  const projetos = ctx.projects.map((p) => ({ id: p.id, nome: p.name }));
  const contaDoCartao: Record<string, string | null> = Object.fromEntries(cartoes.map((c) => [c.id, c.bankAccountId]));

  return (
    <>
      <PageHeader title="Cartões de Crédito" subtitle={`${cartoes.filter((c) => c.ativo).length} ativo(s) · ${cartoes.length} cadastrado(s)`} />
      <div className="mb-5 flex items-start gap-2 rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-accent4)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-ink2)]">
        <span aria-hidden className="mt-px">ⓘ</span>
        <p>
          A <strong>compra</strong> é despesa comum, lançada em <strong>Despesas</strong> com a forma &quot;Cartão de crédito&quot;, na competência informada. Nenhuma saída de caixa acontece na compra: ela fica vinculada à <strong>fatura</strong> do ciclo, e o caixa sai só no <strong>pagamento da fatura</strong>, pela conta cadastrada aqui.
        </p>
      </div>
      {can(ctx.perms, "cartoes", "criar") && <CartaoForm contas={contas} />}
      <CartoesManager cartoes={cartoes} contas={contas} usado={usado} vinculos={vinculos} hoje={hoje} canEditar={can(ctx.perms, "cartoes", "editar")} canExcluir={can(ctx.perms, "cartoes", "excluir")} />
      <ProjecaoCartao cartoes={cartoes} faturas={faturas} hoje={hoje} />
      <FaturasCartao faturas={faturas} hoje={hoje} aberta={faturaAberta} compras={compras} pagamentos={pagamentos} contas={contas} projetos={projetos} contaDoCartao={contaDoCartao} canPagar={can(ctx.perms, "cartoes", "editar")} />
    </>
  );
}
