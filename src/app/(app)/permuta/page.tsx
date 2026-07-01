import { getActiveContext } from "@/lib/context";
import { getPermutas } from "@/lib/queries";
import { addPermuta } from "@/lib/actions/receitas";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function PermutaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const rows = await getPermutas(ctx.version.id);
  const estimado = rows.reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  const vendido = rows
    .filter((p) => p.status === "Vendido")
    .reduce((a, p) => a + Number(p.valorVenda ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Inventário de Permuta"
        subtitle={`${rows.length} ativos · estimado ${brl0(estimado)} · vendido ${brl0(vendido)}`}
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <form
            action={addPermuta}
            className="grid grid-cols-2 gap-3 sm:grid-cols-6"
          >
            <div>
              <Label>Unidade</Label>
              <Input name="unitCode" placeholder="BLA 401" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select name="tipo" defaultValue="Carro">
                <option>Carro</option>
                <option>Imovel</option>
                <option>Outro</option>
              </Select>
            </div>
            <div>
              <Label>Estimado</Label>
              <Input name="estimado" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue="Disponivel">
                <option>Disponivel</option>
                <option>Vendido</option>
              </Select>
            </div>
            <div>
              <Label>Valor venda</Label>
              <Input
                name="valorVenda"
                type="number"
                step="0.01"
                placeholder="0"
              />
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
            <TH>Unidade</TH>
            <TH>Tipo</TH>
            <TH className="text-right">Estimado</TH>
            <TH className="text-right">Valor venda</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((p) => (
            <TR key={p.id}>
              <TD className="font-medium text-[var(--color-ink)]">
                {p.unitCode ?? "—"}
              </TD>
              <TD>{p.tipo ?? "—"}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {brl0(Number(p.estimado ?? 0))}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {p.status === "Vendido" ? brl0(Number(p.valorVenda ?? 0)) : "—"}
              </TD>
              <TD>
                <Badge tone={p.status === "Vendido" ? "success" : "neutral"}>
                  {p.status ?? "—"}
                </Badge>
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum ativo de permuta nesta versão.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
