import { getTenantContext } from "@/lib/context";
import { getDailyClosings } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { BalancoDiaTable } from "@/components/app/balanco-dia-table";

export const dynamic = "force-dynamic";

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function BalancoDiaPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "balancodia", "ver")) return <AccessDenied />;

  const closings = await getDailyClosings(ctx.tenant.id);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Balanço do Dia"
        subtitle="Histórico dos fechamentos do dia (o dia é fechado no cartão do Caixa) — filtre por período; imprima ou exporte."
      />
      <BalancoDiaTable
        rows={closings.map((c) => ({
          id: c.id,
          dia: c.dia,
          saldoInicial: Number(c.saldoInicial),
          totalEntradas: Number(c.totalEntradas),
          totalSaidas: Number(c.totalSaidas),
          saldoFinal: Number(c.saldoFinal),
          divergencias: Number(c.divergencias),
          responsavelNome: c.responsavelNome,
          projectName: c.projectName,
          clienteNome: c.clienteNome,
          fechadoEm: fmtDateTime(c.closedAt),
          saldoEmConta: c.saldoEmConta == null ? null : Number(c.saldoEmConta),
          reabertoEm: c.reabertoEm ? fmtDateTime(c.reabertoEm) : null,
          reabertoPor: c.reabertoPor,
          motivoReabertura: c.motivoReabertura,
        }))}
      />
    </>
  );
}
