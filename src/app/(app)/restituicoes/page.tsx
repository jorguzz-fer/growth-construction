import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getBankAccounts, getChartAccounts, getStakeholders } from "@/lib/queries";
import { getDespesaTerceiros, getSaldosPorTerceiro } from "@/lib/actions/restituicoes";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { ymd, brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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

  const [stakeholders, contas, bancos, lista, saldos] = await Promise.all([
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getDespesaTerceiros(ctx.tenant.id, ctx.version.id),
    getSaldosPorTerceiro(ctx.tenant.id, ctx.version.id),
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
        subtitle="Restituição de valores pagos para fornecedores anteriormente. A despesa é reconhecida 1× na DRE; a saída de caixa ocorre só na restituição."
      />

      {/* Extrato consolidado: quanto a empresa ainda deve a cada terceiro.
          NÃO é saldo bancário disponível — é obrigação com terceiros. */}
      {saldos.length > 0 && (
        <Card className="mb-5">
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
              Saldo devido por terceiro
            </h2>
            <div className="tbl-scroll overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-accent2)]/12 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    <th className="px-2 py-2">Terceiro / sócio</th>
                    <th className="px-2 py-2 text-right">Obrigações</th>
                    <th className="px-2 py-2 text-right">Total pago por ele</th>
                    <th className="px-2 py-2 text-right">Já restituído</th>
                    <th className="px-2 py-2 text-right">Saldo devido</th>
                  </tr>
                </thead>
                <tbody>
                  {saldos.map((s) => (
                    <tr
                      key={s.pagadorId ?? s.pagador}
                      className="border-b border-[var(--color-accent2)]/8"
                    >
                      <td className="px-2 py-2 font-medium text-[var(--color-ink)]">
                        {s.pagador}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {s.obrigacoes}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)]">
                        {brl0(s.valorTotal)}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                        {brl0(s.valorRestituido)}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-warning)]">
                        {brl0(s.saldoDevido)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
