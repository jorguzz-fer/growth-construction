import { getActiveContext } from "@/lib/context";
import {
  getChartAccounts,
  getDespesas,
  getStakeholders,
  getBankAccounts,
} from "@/lib/queries";
import { addDespesa } from "@/lib/actions/despesas";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DespesasPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [despesas, fornecedores, contas, bancos] = await Promise.all([
    getDespesas(ctx.version.id),
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
  ]);

  const fornById = new Map(fornecedores.map((f) => [f.id, f.nome]));
  const total = despesas.reduce((a, d) => a + Number(d.valor), 0);
  const contasOrdenadas = [...contas].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Lançamentos de Despesas"
        subtitle={`${despesas.length} lançamentos · total ${brl0(total)}`}
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <form action={addDespesa} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label>Fornecedor</Label>
              <Select name="fornecedorId" defaultValue="">
                <option value="">Selecione...</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Conta CEF / Plano de Contas</Label>
              <Select name="contaCef" defaultValue="">
                <option value="">Selecione...</option>
                {contasOrdenadas.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Categoria DRE</Label>
              <Select name="categoriaDre" defaultValue="Custo Variável">
                {CATEGORIAS_DRE.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Banco</Label>
              <Select name="bancoId" defaultValue="">
                <option value="">—</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.banco} · {b.tipo}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Competência</Label>
              <Input name="competencia" placeholder="01/2026" />
            </div>
            <div>
              <Label>Vencimento (MM/DD/YYYY)</Label>
              <Input name="vencimento" placeholder="01/27/2026" />
            </div>
            <div>
              <Label>Valor</Label>
              <Input name="valor" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue="A pagar">
                <option>A pagar</option>
                <option>Pago</option>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Lançar despesa
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Table>
        <THead>
          <tr>
            <TH>Competência</TH>
            <TH>Fornecedor</TH>
            <TH>Conta CEF</TH>
            <TH>Cat. DRE</TH>
            <TH className="text-right">Valor</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {despesas.map((d) => (
            <TR key={d.id}>
              <TD className="font-[family-name:var(--font-mono)]">
                {d.competencia ?? "—"}
              </TD>
              <TD>{d.fornecedorId ? fornById.get(d.fornecedorId) ?? "—" : "—"}</TD>
              <TD>
                <Badge tone="warning">{d.contaCef ?? "—"}</Badge>
              </TD>
              <TD className="text-[var(--color-ink2)]">{d.categoriaDre ?? "—"}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {brl0(Number(d.valor))}
              </TD>
              <TD>
                <Badge tone={d.status === "Pago" ? "success" : "neutral"}>
                  {d.status ?? "—"}
                </Badge>
              </TD>
            </TR>
          ))}
          {despesas.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhuma despesa lançada nesta versão.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
