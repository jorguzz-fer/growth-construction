import { getActiveContext } from "@/lib/context";
import { getDespesas, getMonthlyRevenue, sortMonthKey } from "@/lib/queries";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** "MM/DD/YYYY" → "MM/YYYY" (mês do vencimento). */
function vencMonth(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[0]}/${p[2]}`;
  if (p.length === 2) return d; // já em "MM/YYYY"
  return null;
}

export default async function FluxoCaixaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [entradas, despesas] = await Promise.all([
    getMonthlyRevenue(ctx.version.id, ctx.project.id),
    getDespesas(ctx.version.id),
  ]);

  const saidas: Record<string, number> = {};
  for (const d of despesas) {
    const mm = vencMonth(d.vencimento) ?? vencMonth(d.competencia);
    if (mm) saidas[mm] = (saidas[mm] || 0) + Number(d.valor);
  }

  const axis = [
    ...new Set([...Object.keys(entradas), ...Object.keys(saidas)]),
  ].sort(sortMonthKey);

  let saldo = 0;
  const linhas = axis.map((mm) => {
    const e = entradas[mm] || 0;
    const s = saidas[mm] || 0;
    saldo += e - s;
    return { mm, e, s, liquido: e - s, saldo };
  });
  const totE = linhas.reduce((a, l) => a + l.e, 0);
  const totS = linhas.reduce((a, l) => a + l.s, 0);

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Fluxo de Caixa Mensal"
        subtitle={`Entradas ${brl0(totE)} · Saídas ${brl0(totS)} · Saldo ${brl0(totE - totS)}`}
      />

      <Table>
        <THead>
          <tr>
            <TH>Mês</TH>
            <TH className="text-right">Entradas</TH>
            <TH className="text-right">Saídas</TH>
            <TH className="text-right">Líquido</TH>
            <TH className="text-right">Saldo acumulado</TH>
          </tr>
        </THead>
        <tbody>
          {linhas.map((l) => (
            <TR key={l.mm}>
              <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {l.mm}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                {l.e > 0 ? brl0(l.e) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-danger)]">
                {l.s > 0 ? brl0(l.s) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {brl0(l.liquido)}
              </TD>
              <TD
                className={`text-right font-[family-name:var(--font-mono)] font-medium ${
                  l.saldo >= 0
                    ? "text-[var(--color-ink)]"
                    : "text-[var(--color-danger)]"
                }`}
              >
                {brl0(l.saldo)}
              </TD>
            </TR>
          ))}
          {linhas.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-[var(--color-ink3)]">
                Sem movimentação nesta versão.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
