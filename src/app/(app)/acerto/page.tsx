import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getAcertos, getDespesasAbativeis } from "@/lib/actions/acerto";
import { getBankAccounts, getStakeholders, getChartAccounts } from "@/lib/queries";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { categoriasDeDespesa } from "@/lib/calc/natureza-dre";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { AcertoManager } from "@/components/app/acerto-manager";

export const dynamic = "force-dynamic";

/**
 * ACERTO CONTÁBIL — Módulo 5.
 *
 * Resolve os dois casos que não tinham solução: um pagamento único quitando
 * várias despesas de várias obras, e a diferença entre o somatório das despesas
 * e o valor efetivamente transferido (juros de atraso ou desconto negociado).
 */
export default async function AcertoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  // Acerto é operação de nível financeiro (RNF de permissões).
  if (!can(ctx.perms, "despesas", "editar") || !can(ctx.perms, "caixa", "ver")) {
    return <AccessDenied />;
  }

  const [despesas, acertos, bancos, stakeholders, contas] = await Promise.all([
    getDespesasAbativeis(),
    getAcertos(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Acerto Contábil"
        subtitle="Um pagamento único quitando várias despesas, inclusive de obras diferentes. A saída de caixa é uma só; a diferença vai para despesa/receita financeira, nunca para o custo da obra."
      />
      <AcertoManager
        despesas={despesas}
        acertos={acertos}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        favorecidos={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        categorias={categoriasDeDespesa(CATEGORIAS_DRE)}
        contas={[...contas]
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map((c) => ({ code: c.code, name: c.name }))}
        canEstornar={can(ctx.perms, "despesas", "excluir")}
      />
    </>
  );
}
