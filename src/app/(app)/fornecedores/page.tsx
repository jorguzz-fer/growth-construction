import { getActiveContext } from "@/lib/context";
import { getBankAccounts, getStakeholders } from "@/lib/queries";
import { addBankAccount } from "@/lib/actions/despesas";
import { isAiConfigured } from "@/lib/ai/despesa-extract";
import { PAPEIS_STAKEHOLDER } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { FornecedorForm } from "@/components/app/fornecedor-form";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const [stakeholders, banks] = await Promise.all([
    getStakeholders(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
  ]);

  return (
    <>
      <PageHeader
        title="Fornecedores & Stakeholders"
        subtitle={`Registro global do tenant · ${stakeholders.length} cadastrados · ${banks.length} contas`}
      />

      {/* Novo stakeholder */}
      <FornecedorForm papeis={PAPEIS_STAKEHOLDER} aiConfigured={isAiConfigured()} />

      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>Tipo</TH>
            <TH>Documento</TH>
            <TH>Papéis</TH>
          </tr>
        </THead>
        <tbody>
          {stakeholders.map((s) => (
            <TR key={s.id}>
              <TD className="font-medium text-[var(--color-ink)]">{s.nome}</TD>
              <TD>
                <Badge tone={s.tipo === "PJ" ? "info" : "neutral"}>
                  {s.tipo}
                </Badge>
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {s.doc || "—"}
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {s.papeis.map((p) => (
                    <Badge key={p}>{p}</Badge>
                  ))}
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>

      {/* Contas bancárias */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-[var(--color-ink)]">
        Contas Bancárias
        <span className="ml-2 font-normal text-[var(--color-ink3)]">
          (campos Open Finance preparados)
        </span>
      </h2>
      <Card className="mb-6">
        <CardContent className="p-5">
          <form
            action={addBankAccount}
            className="grid grid-cols-2 gap-3 sm:grid-cols-6"
          >
            <div>
              <Label>Banco</Label>
              <Input name="banco" required />
            </div>
            <div>
              <Label>Agência</Label>
              <Input name="ag" />
            </div>
            <div>
              <Label>Operação</Label>
              <Input name="op" />
            </div>
            <div>
              <Label>Conta</Label>
              <Input name="cc" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select name="tipo" defaultValue="Construtora">
                <option>Construtora</option>
                <option>Imobiliária</option>
              </Select>
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
            <TH>Banco</TH>
            <TH>Agência</TH>
            <TH>Conta</TH>
            <TH>Tipo</TH>
            <TH>Open Finance</TH>
          </tr>
        </THead>
        <tbody>
          {banks.map((b) => (
            <TR key={b.id}>
              <TD className="font-medium text-[var(--color-ink)]">{b.banco}</TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {b.ag || "—"}
                {b.op ? ` · op ${b.op}` : ""}
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {b.cc || "—"}
              </TD>
              <TD>
                <Badge tone={b.tipo === "Imobiliária" ? "info" : "neutral"}>
                  {b.tipo}
                </Badge>
              </TD>
              <TD>
                <Badge tone={b.openFinanceId ? "success" : "neutral"}>
                  {b.openFinanceId ? "conectado" : "não conectado"}
                </Badge>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}
