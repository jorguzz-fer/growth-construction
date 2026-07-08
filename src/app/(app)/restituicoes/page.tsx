import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getBankAccounts, getChartAccounts, getStakeholders } from "@/lib/queries";
import { getDespesaTerceiros } from "@/lib/actions/restituicoes";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { ymd } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { RestituicoesManager } from "@/components/app/restituicoes-manager";

export const dynamic = "force-dynamic";

/** Dias em aberto entre a data-base e hoje. */
function diasEmAberto(base: string | null): number {
  const b = ymd(base);
  if (b == null) return 0;
  const now = new Date();
  const hoje = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  // diferença aproximada em dias via datas UTC
  const toDate = (n: number) =>
    Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100);
  return Math.max(0, Math.round((toDate(hoje) - toDate(b)) / 86_400_000));
}

export default async function RestituicoesPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "restituicoes", "ver")) return <AccessDenied />;

  const [stakeholders, contas, bancos, lista] = await Promise.all([
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getDespesaTerceiros(ctx.tenant.id, ctx.version.id),
  ]);
  const rows = lista.map((r) => ({
    ...r,
    diasEmAberto: diasEmAberto(r.dataPrevistaRestituicao ?? r.dataPagamentoOriginal),
  }));

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Restituições — pago por terceiro"
        subtitle="Despesa reconhecida 1× na DRE; saída de caixa só na restituição."
      />
      <RestituicoesManager
        rows={rows}
        stakeholders={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        contas={[...contas]
          .filter((c) => c.kind === "cef")
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map((c) => ({ code: c.code, name: c.name }))}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        bancos={bancos.map((b) => ({ id: b.id, banco: b.banco, tipo: b.tipo }))}
        categorias={CATEGORIAS_DRE}
        canCriar={can(ctx.perms, "restituicoes", "criar")}
        canEditar={can(ctx.perms, "restituicoes", "editar")}
      />
    </>
  );
}
