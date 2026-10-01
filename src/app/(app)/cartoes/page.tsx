import { getTenantContext } from "@/lib/context";
import { getBankAccounts, getCartoes } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { hojeISO } from "@/lib/despesa-status";
import { PageHeader } from "@/components/app/page-header";
import { CartaoForm } from "@/components/app/cartao-form";
import { CartoesManager } from "@/components/app/cartoes-manager";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/**
 * Cartões de Crédito (Prompt U). Esta tela NÃO lança despesa: a compra é
 * lançada em /despesas com a forma "Cartão de crédito" e cai na fatura do
 * ciclo. Aqui: cadastro (seção 1), faturas, projeção e conferência (PRs
 * seguintes).
 */
export default async function CartoesPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "cartoes", "ver")) return <AccessDenied />;
  const [cartoes, bancos] = await Promise.all([getCartoes(ctx.tenant.id), getBankAccounts(ctx.tenant.id)]);
  const contas = bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }));
  // "Usado no ciclo" soma as compras e parcelas vinculadas à fatura aberta;
  // o vínculo compra→fatura nasce no PR seguinte (seção 2). Até lá, zero.
  const usado: Record<string, number> = {};

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
      <CartoesManager cartoes={cartoes} contas={contas} usado={usado} hoje={hojeISO()} canEditar={can(ctx.perms, "cartoes", "editar")} />
    </>
  );
}
