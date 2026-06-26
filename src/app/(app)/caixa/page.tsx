import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import {
  getCash,
  getInccRows,
  getReembolsos,
  getUnits,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import { addCash } from "@/lib/actions/caixa";
import {
  calcProjection,
  reembursementsByMonth,
  type MonthlyProjection,
} from "@/lib/calc";
import { isPluggyConfigured as pluggyCfg } from "@/lib/openfinance/pluggy";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ConciliarToggle } from "@/components/app/conciliar-toggle";

export const dynamic = "force-dynamic";

type Tab = "lancamentos" | "conciliacao" | "previstas";
const TABS: { key: Tab; label: string }[] = [
  { key: "lancamentos", label: "Lançamentos" },
  { key: "conciliacao", label: "Conciliação" },
  { key: "previstas", label: "Previstas" },
];

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab)
    ? (sp.tab as Tab)
    : "lancamentos";

  const cash = await getCash(ctx.version.id);
  const entradas = cash
    .filter((c) => Number(c.valor) > 0)
    .reduce((a, c) => a + Number(c.valor), 0);
  const conciliados = cash.filter((c) => c.rec).length;

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Caixa"
        subtitle={`${cash.length} lançamentos · realizado ${brl0(entradas)} · ${conciliados} conciliados`}
        actions={
          <Badge tone={pluggyCfg() ? "success" : "neutral"}>
            Open Finance {pluggyCfg() ? "ativo" : "não configurado"}
          </Badge>
        }
      />

      <div className="mb-5 flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/caixa?tab=${t.key}`}
            className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
              t.key === tab
                ? "bg-white text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "lancamentos" && <Lancamentos ctx={ctx} cash={cash} />}
      {tab === "conciliacao" && <Conciliacao cash={cash} />}
      {tab === "previstas" && <Previstas ctx={ctx} />}
    </>
  );
}

async function Lancamentos({
  ctx,
  cash,
}: {
  ctx: NonNullable<Awaited<ReturnType<typeof getActiveContext>>>;
  cash: Awaited<ReturnType<typeof getCash>>;
}) {
  void ctx;
  return (
    <>
      <Card className="mb-6">
        <CardContent className="p-5">
          <form action={addCash} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <Label>Data (MM/DD/YYYY)</Label>
              <Input name="data" placeholder="06/10/2026" />
            </div>
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Input name="descricao" placeholder="BLA 401 - Parcela #6" />
            </div>
            <div>
              <Label>Valor</Label>
              <Input name="valor" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select name="cat" defaultValue="mensais">
                <option value="mensais">Mensais</option>
                <option value="AS">Ato/Sinal</option>
                <option value="reembolso">Reembolso</option>
                <option value="outro">Outro</option>
              </Select>
            </div>
            <div className="flex items-end sm:col-span-5">
              <Button type="submit">Adicionar lançamento</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <CashTable cash={cash} withToggle={false} />
    </>
  );
}

function Conciliacao({ cash }: { cash: Awaited<ReturnType<typeof getCash>> }) {
  return (
    <>
      <p className="mb-3 text-sm text-[var(--color-ink3)]">
        Marque os lançamentos que batem com o extrato bancário.
      </p>
      <CashTable cash={cash} withToggle />
    </>
  );
}

async function Previstas({
  ctx,
}: {
  ctx: NonNullable<Awaited<ReturnType<typeof getActiveContext>>>;
}) {
  const [unitRows, reembRows, incc] = await Promise.all([
    getUnits(ctx.version.id),
    getReembolsos(ctx.version.id),
    getInccRows(ctx.project.id),
  ]);
  const monthly: MonthlyProjection = {};
  for (const r of unitRows) {
    const p = calcProjection(toCalcUnit(r), incc);
    for (const [mm, v] of Object.entries(p)) monthly[mm] = (monthly[mm] || 0) + v;
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  const all = new Set([...Object.keys(monthly), ...Object.keys(reemb)]);

  // Próximos meses a partir de hoje (junho/2026).
  const now = new Date();
  const cur = now.getFullYear() * 12 + now.getMonth();
  const rows = [...all]
    .map((mm) => {
      const [m, y] = mm.split("/").map(Number);
      return { mm, ord: y * 12 + (m - 1), total: (monthly[mm] || 0) + (reemb[mm] || 0) };
    })
    .filter((r) => r.total > 0 && r.ord >= cur)
    .sort((a, b) => a.ord - b.ord)
    .slice(0, 12);

  return (
    <Table>
      <THead>
        <tr>
          <TH>Mês</TH>
          <TH className="text-right">Entradas previstas</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map((r) => (
          <TR key={r.mm}>
            <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
              {r.mm}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)]">
              {brl0(r.total)}
            </TD>
          </TR>
        ))}
        {rows.length === 0 && (
          <TR>
            <TD colSpan={2} className="py-6 text-center text-[var(--color-ink3)]">
              Sem entradas previstas a partir deste mês.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}

function CashTable({
  cash,
  withToggle,
}: {
  cash: Awaited<ReturnType<typeof getCash>>;
  withToggle: boolean;
}) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Data</TH>
          <TH>Descrição</TH>
          <TH>Categoria</TH>
          <TH className="text-right">Valor</TH>
          <TH>Conciliação</TH>
        </tr>
      </THead>
      <tbody>
        {cash.map((c) => (
          <TR key={c.id}>
            <TD className="font-[family-name:var(--font-mono)]">{c.data ?? "—"}</TD>
            <TD>{c.descricao ?? "—"}</TD>
            <TD>
              <Badge>{c.cat ?? "—"}</Badge>
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)]">
              {brl0(Number(c.valor))}
            </TD>
            <TD>
              {withToggle ? (
                <ConciliarToggle id={c.id} rec={c.rec} />
              ) : (
                <Badge tone={c.rec ? "success" : "warning"}>
                  {c.rec ? "conciliado" : "pendente"}
                </Badge>
              )}
            </TD>
          </TR>
        ))}
        {cash.length === 0 && (
          <TR>
            <TD colSpan={5} className="py-6 text-center text-[var(--color-ink3)]">
              Nenhum lançamento de caixa nesta versão.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}
