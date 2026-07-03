import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getUnits } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { addCliente } from "@/lib/actions/clientes";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClienteFields } from "@/components/app/cliente-fields";

export const dynamic = "force-dynamic";

export default async function NovoClientePage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "clientes", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para cadastrar clientes.
      </p>
    );
  }
  const units = await getUnits(ctx.version.id);
  const unitCodes = [...new Set(units.map((u) => u.code))].sort();

  return (
    <>
      <PageHeader eyebrow={ctx.project.name} title="Novo cliente comprador" />
      <Card>
        <CardContent className="p-5">
          <form action={addCliente} className="space-y-6">
            <ClienteFields unitCodes={unitCodes} />
            <div className="flex items-center gap-2">
              <Button type="submit">Salvar cliente</Button>
              <Link href="/clientes" className={buttonVariants({ variant: "ghost" })}>
                Cancelar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
