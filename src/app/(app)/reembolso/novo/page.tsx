import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { addReembolso } from "@/lib/actions/receitas";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function NovoReembolsoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "reembolso", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para criar reembolsos.
      </p>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Novo Reembolso"
        subtitle="A data deve ser uma DATA REAL — o SERIAL é calculado automaticamente via INT(Data)."
      />

      <Card>
        <CardContent className="p-5">
          <form
            action={addReembolso}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div>
              <Label>Data (MM/DD/YYYY)</Label>
              <Input name="data" placeholder="01/27/2026" required />
            </div>
            <div>
              <Label>Origem</Label>
              <Input name="origem" placeholder="Origem X" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input name="valor" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>Porcentagem %</Label>
              <Input name="pct" placeholder="" />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Input name="obs" placeholder="" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit">Salvar reembolso</Button>
              <a href="/reembolso" className={buttonVariants({ variant: "ghost" })}>
                Cancelar
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
