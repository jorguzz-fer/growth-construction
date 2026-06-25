import { getActiveContext } from "@/lib/context";
import { getReembolsos } from "@/lib/queries";
import { addReembolso } from "@/lib/actions/receitas";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ReembolsoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const rows = await getReembolsos(ctx.version.id);
  const total = rows.reduce((a, r) => a + Number(r.valor ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Reembolso"
        subtitle={`${rows.length} lançamentos · total ${brl0(total)}`}
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <form
            action={addReembolso}
            className="grid grid-cols-2 gap-3 sm:grid-cols-5"
          >
            <div>
              <Label>Data (MM/DD/YYYY)</Label>
              <Input name="data" placeholder="01/27/2026" />
            </div>
            <div>
              <Label>Origem</Label>
              <Input name="origem" placeholder="Origem X" />
            </div>
            <div>
              <Label>Valor</Label>
              <Input name="valor" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>%</Label>
              <Input name="pct" placeholder="" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Adicionar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Table>
        <THead>
          <tr>
            <TH>Serial</TH>
            <TH>Data</TH>
            <TH>Origem</TH>
            <TH className="text-right">Valor</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="font-[family-name:var(--font-mono)]">{r.serial}</TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {r.data ?? "—"}
              </TD>
              <TD>{r.origem ?? "—"}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {brl0(Number(r.valor ?? 0))}
              </TD>
              <TD>
                <Badge tone="success">{r.status ?? "—"}</Badge>
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum reembolso lançado nesta versão.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
