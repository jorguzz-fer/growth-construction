import { getActiveContext } from "@/lib/context";
import { getDespesas, getMembers, getMonthlyRevenue } from "@/lib/queries";
import { inviteContador } from "@/lib/actions/users";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ContabilidadePage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [despesas, revenue, members] = await Promise.all([
    getDespesas(ctx.version.id),
    getMonthlyRevenue(ctx.version.id, ctx.project.id),
    getMembers(ctx.tenant.id),
  ]);
  const receita = Object.values(revenue).reduce((a, b) => a + b, 0);
  const totalDespesas = despesas.reduce((a, d) => a + Number(d.valor), 0);
  const resultado = receita - totalDespesas;
  const contadores = members.filter((m) => m.role === "contador");
  const podeGerir = ctx.role === "owner" || ctx.role === "admin";

  return (
    <>
      <PageHeader
        title="Acesso Contabilidade"
        subtitle="Visão somente-leitura de balancetes e demonstrativos"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Receita projetada
            </p>
            <p className="mt-2 text-xl font-semibold">{brl0(receita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Despesas lançadas
            </p>
            <p className="mt-2 text-xl font-semibold">{brl0(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Resultado
            </p>
            <p
              className={`mt-2 text-xl font-semibold ${
                resultado >= 0
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]"
              }`}
            >
              {brl0(resultado)}
            </p>
          </CardContent>
        </Card>
      </div>

      {podeGerir && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Convidar escritório contábil
            </h2>
            <form
              action={inviteContador}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              <div>
                <Label>Nome</Label>
                <Input name="name" placeholder="Escritório Contábil" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input name="email" type="email" required />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Convidar (somente leitura)
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Contadores com acesso
      </h2>
      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>E-mail</TH>
            <TH>Acesso</TH>
          </tr>
        </THead>
        <tbody>
          {contadores.map((m) => (
            <TR key={m.userId}>
              <TD className="font-medium text-[var(--color-ink)]">
                {m.name ?? "—"}
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {m.email ?? "—"}
              </TD>
              <TD>
                <Badge tone="warning">somente leitura</Badge>
              </TD>
            </TR>
          ))}
          {contadores.length === 0 && (
            <TR>
              <TD colSpan={3} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum contador convidado ainda.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
