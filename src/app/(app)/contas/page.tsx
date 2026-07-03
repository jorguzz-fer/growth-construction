import { getActiveContext } from "@/lib/context";
import { getBankAccounts } from "@/lib/queries";
import { addConta } from "@/lib/actions/contas";
import { can } from "@/lib/permissions";
import { isPluggyConfigured } from "@/lib/openfinance/pluggy";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContasManager } from "@/components/app/contas-manager";

export const dynamic = "force-dynamic";

export default async function ContasPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const contas = await getBankAccounts(ctx.tenant.id);
  const canCriar = can(ctx.perms, "contas", "criar");
  const canEditar = can(ctx.perms, "contas", "editar");
  const canExcluir = can(ctx.perms, "contas", "excluir");
  const total = contas.reduce((a, c) => a + Number(c.saldo), 0);
  const ofConfigured = isPluggyConfigured();

  return (
    <>
      <PageHeader
        title="Contas Correntes"
        subtitle={`${contas.length} contas · saldo total ${brl0(total)}`}
        actions={
          <Badge tone={ofConfigured ? "success" : "neutral"}>
            Open Finance {ofConfigured ? "ativo" : "não configurado"}
          </Badge>
        }
      />

      <div className="mb-5 flex items-start gap-2 rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-accent4)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-ink2)]">
        <span aria-hidden className="mt-px">ⓘ</span>
        <p>
          Cadastre as contas correntes que serão acessadas automaticamente via{" "}
          <strong>Open Finance</strong>. O saldo pode ser <strong>rastreado
          automaticamente</strong> (Open Finance / upload de extrato na tela{" "}
          <strong>Caixa</strong>) ou <strong>lançado manualmente</strong>. O
          <strong> saldo total</strong> soma todas as contas cadastradas.
        </p>
      </div>

      {canCriar && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <form action={addConta} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              <div>
                <Label>Saldo atual</Label>
                <Input name="saldo" type="number" step="0.01" placeholder="0" />
              </div>
              <div>
                <Label>Atualização do saldo</Label>
                <Select name="saldoSource" defaultValue="manual">
                  <option value="manual">Manual</option>
                  <option value="auto">Automático (Open Finance/extrato)</option>
                </Select>
              </div>
              <div>
                <Label>ID Open Finance (opcional)</Label>
                <Input name="openFinanceId" placeholder="" />
              </div>
              <div className="flex items-end sm:col-span-4">
                <Button type="submit">Cadastrar conta</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <ContasManager
            contas={contas.map((c) => ({
              id: c.id,
              banco: c.banco,
              ag: c.ag,
              op: c.op,
              cc: c.cc,
              tipo: c.tipo,
              saldo: Number(c.saldo),
              saldoSource: c.saldoSource,
              openFinanceId: c.openFinanceId,
            }))}
            canEditar={canEditar}
            canExcluir={canExcluir}
          />
        </CardContent>
      </Card>
    </>
  );
}
