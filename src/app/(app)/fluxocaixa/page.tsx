import { getActiveContext } from "@/lib/context";
import {
  getBankAccounts,
  getDespesas,
  getInccRows,
  getMonthlyRevenue,
  getParcelasByVersion,
  getPermutas,
  permToResale,
  sortMonthKey,
} from "@/lib/queries";
import { permutaCashByMonth } from "@/lib/calc";
import { getRestituicoesPendentesByVersion } from "@/lib/actions/restituicoes";
import { brl0, brlk, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ProjecaoYearSelect } from "@/components/app/projecao-controls";
import { DateRangeFilter } from "@/components/app/date-range-filter";

export const dynamic = "force-dynamic";

/** "MM/DD/YYYY" → "MM/YYYY" (mês do vencimento). */
function vencMonth(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[0]}/${p[2]}`;
  if (p.length === 2) return d;
  return null;
}

export default async function FluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; de?: string; ate?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [entradas, despesas, incc, contas, permutas, parcelas] = await Promise.all([
    getMonthlyRevenue(ctx.version.id, ctx.project.id),
    getDespesas(ctx.version.id),
    getInccRows(ctx.project.id),
    getBankAccounts(ctx.tenant.id),
    getPermutas(ctx.version.id),
    getParcelasByVersion(ctx.version.id),
  ]);

  // Recebimentos da revenda de bens recebidos em permuta (item 10).
  const permCash = permutaCashByMonth(permToResale(permutas));
  for (const [mm, v] of Object.entries(permCash)) {
    entradas[mm] = (entradas[mm] || 0) + v;
  }

  // Despesas pagas por terceiro NÃO geram saída na competência — a saída da
  // empresa ocorre só na restituição (prevista/realizada). Fase 4.
  const { despesaIds: terceiroIds, saidasPrevistas: restPrevistas } =
    await getRestituicoesPendentesByVersion(ctx.version.id);
  const excluir = new Set(terceiroIds);

  // Saídas: despesas COM parcelas entram pelas parcelas (por vencimento);
  // despesas SEM parcelas entram pelo vencimento da própria despesa.
  const saidas: Record<string, number> = {};
  const comParcela = new Set(parcelas.map((p) => p.despesaId));
  for (const p of parcelas) {
    if (p.status === "Cancelado" || excluir.has(p.despesaId)) continue;
    const mm = vencMonth(p.vencimento);
    if (mm) saidas[mm] = (saidas[mm] || 0) + Number(p.valorOriginal);
  }
  for (const d of despesas) {
    if (comParcela.has(d.id) || excluir.has(d.id)) continue;
    const mm = vencMonth(d.vencimento) ?? vencMonth(d.competencia);
    if (mm) saidas[mm] = (saidas[mm] || 0) + Number(d.valor);
  }
  // Restituições pendentes: saída projetada no mês previsto de restituição.
  for (const [mm, v] of Object.entries(restPrevistas)) {
    saidas[mm] = (saidas[mm] || 0) + v;
  }

  // Saldo inicial = soma dos saldos das contas correntes.
  const saldoInicial = contas.reduce((a, c) => a + Number(c.saldo), 0);

  // Horizonte + janelas de 12 meses (Ano N).
  const axis = [
    ...new Set([...incc.map((r) => r.m), ...Object.keys(entradas), ...Object.keys(saidas)]),
  ].sort(sortMonthKey);
  const years: { value: number; months: string[]; label: string }[] = [];
  for (let i = 0; i < axis.length; i += 12) {
    const months = axis.slice(i, i + 12);
    if (months.length)
      years.push({
        value: years.length + 1,
        months,
        label: `Ano ${years.length + 1} (${months[0]}–${months[months.length - 1]})`,
      });
  }
  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);
  const selectedYear = Math.min(Math.max(1, Number(sp.ano) || 1), Math.max(1, years.length));
  // Com período informado, o intervalo de datas tem prioridade sobre o Ano N.
  const yearMonths = hasRange
    ? axis.filter((mm) => monthInRange(mm, de, ate))
    : years[selectedYear - 1]?.months ?? [];

  // Saldo acumulado corre desde o saldo inicial ao longo de todo o horizonte.
  let acumulado = saldoInicial;
  const acumMap: Record<string, number> = {};
  for (const mm of axis) {
    acumulado += (entradas[mm] || 0) - (saidas[mm] || 0);
    acumMap[mm] = acumulado;
  }

  const linhas = yearMonths.map((mm) => {
    const e = entradas[mm] || 0;
    const s = saidas[mm] || 0;
    return { mm, e, s, liquido: e - s, saldo: acumMap[mm] ?? saldoInicial };
  });
  const totE = linhas.reduce((a, l) => a + l.e, 0);
  const totS = linhas.reduce((a, l) => a + l.s, 0);
  const saldoAcumFinal = linhas.length ? linhas[linhas.length - 1].saldo : saldoInicial;

  return (
    <>
      <PageHeader
        title="Fluxo de Caixa Mensal"
        subtitle="Por data de vencimento/pagamento · saldo acumulado"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            {!hasRange && years.length > 1 && (
              <ProjecaoYearSelect years={years} selected={selectedYear} basePath="/fluxocaixa" />
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi icon="↓" label="Total entradas" value={brlk(totE)} tone="success" />
        <Kpi icon="↑" label="Total saídas" value={brlk(totS)} tone="danger" />
        <Kpi icon="⚖" label="Saldo do período" value={brlk(totE - totS)} tone="accent" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <tr>
                <TH>Mês</TH>
                <TH className="text-right">Entradas</TH>
                <TH className="text-right">Saídas</TH>
                <TH className="text-right">Saldo do mês</TH>
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
                  <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-success)]">
                    {brl0(l.liquido)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
                    {brl0(l.saldo)}
                  </TD>
                </TR>
              ))}
              {linhas.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="py-8 text-center text-[var(--color-ink4)]">
                    Sem movimentação neste período.
                  </TD>
                </TR>
              ) : (
                <TR className="bg-[var(--color-surface2)]">
                  <TD className="font-semibold text-[var(--color-ink)]">TOTAL</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-success)]">
                    {brl0(totE)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-danger)]">
                    {brl0(totS)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-success)]">
                    {brl0(totE - totS)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
                    {brl0(saldoAcumFinal)}
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: "success" | "danger" | "accent";
}) {
  const color =
    tone === "success"
      ? "var(--color-success)"
      : tone === "danger"
        ? "var(--color-danger)"
        : "var(--color-accent)";
  return (
    <Card>
      <CardContent className="p-5">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-sm"
          style={{ background: `${color}1a`, color }}
        >
          {icon}
        </span>
        <p className="mt-3 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold" style={{ color }}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
