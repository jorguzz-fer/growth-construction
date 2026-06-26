import { getActiveContext } from "@/lib/context";
import { getDespesas } from "@/lib/queries";
import {
  PLANO_CONTAS,
  PCT_REF_CEF,
  CUSTO_EDIFICACOES_REF,
} from "@/lib/calc/constants";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function MedicaoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const despesas = await getDespesas(ctx.version.id);

  // Realizado por grupo de obra (prefixo antes do primeiro ponto da conta CEF).
  const realizadoPorGrupo = new Map<string, number>();
  for (const d of despesas) {
    if (!d.contaCef) continue;
    const grp = d.contaCef.split(".")[0];
    realizadoPorGrupo.set(
      grp,
      (realizadoPorGrupo.get(grp) || 0) + Number(d.valor),
    );
  }

  const rows = PLANO_CONTAS.obra.map((g, i) => {
    const orcado = (CUSTO_EDIFICACOES_REF * PCT_REF_CEF[i]) / 100;
    const realizado = realizadoPorGrupo.get(g.id) || 0;
    const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
    return { g, pctRef: PCT_REF_CEF[i], orcado, realizado, pctFisico };
  });
  const totOrc = rows.reduce((a, r) => a + r.orcado, 0);
  const totReal = rows.reduce((a, r) => a + r.realizado, 0);
  const totPct = totOrc > 0 ? (totReal / totOrc) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · ${ctx.version.label}`}
        title="Medição de Obra — Relatório CEF"
        subtitle={`Evolução físico-financeira por grupo · custo de edificações ${brl0(CUSTO_EDIFICACOES_REF)}`}
        actions={<PrintButton label="Imprimir Relatório" />}
      />

      <Table>
        <THead>
          <tr>
            <TH>Grupo de Despesa (CEF)</TH>
            <TH className="text-right">% Ref. CEF</TH>
            <TH className="text-right">Orçado</TH>
            <TH className="text-right">Realizado</TH>
            <TH className="text-right">% Físico</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.g.id}>
              <TD className="font-medium text-[var(--color-ink)]">
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
                  {r.g.id}
                </span>{" "}
                {r.g.nome}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.pctRef.toFixed(2)}%
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {brl0(r.orcado)}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {r.realizado > 0 ? brl0(r.realizado) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {r.pctFisico.toFixed(1)}%
              </TD>
            </TR>
          ))}
          <TR>
            <TD className="font-semibold text-[var(--color-ink)]">Total</TD>
            <TD className="text-right font-[family-name:var(--font-mono)]">
              100%
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totOrc)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totReal)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {totPct.toFixed(1)}%
            </TD>
          </TR>
        </tbody>
      </Table>

      <p className="mt-4 text-xs text-[var(--color-ink3)]">
        Valores orçados calculados pelos percentuais de referência CEF sobre o
        custo total de edificações. Use <strong>Imprimir Relatório</strong> para
        gerar a versão formatada (FRE / Cronograma CEF).
      </p>
    </>
  );
}
