import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { getUnits } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { updateCliente, deleteCliente } from "@/lib/actions/clientes";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClienteFields } from "@/components/app/cliente-fields";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const { id } = await params;

  const [cliente] = await db
    .select()
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!cliente) notFound();

  const canEditar = can(ctx.perms, "clientes", "editar");
  const canExcluir = can(ctx.perms, "clientes", "excluir");
  const units = await getUnits(ctx.version.id);
  const unitCodes = [...new Set(units.map((u) => u.code))].sort();

  return (
    <>
      <PageHeader
        eyebrow={ctx.project.name}
        title={`Cliente: ${cliente.nomeCompleto}`}
        actions={
          canExcluir ? (
            <form action={deleteCliente}>
              <input type="hidden" name="id" value={cliente.id} />
              <Button type="submit" variant="ghost" size="sm">
                Excluir
              </Button>
            </form>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="p-5">
          <form action={updateCliente} className="space-y-6">
            <input type="hidden" name="id" value={cliente.id} />
            <ClienteFields cliente={cliente} unitCodes={unitCodes} />
            {canEditar && (
              <div className="flex items-center gap-2">
                <Button type="submit">Salvar alterações</Button>
                <Link href="/clientes" className={buttonVariants({ variant: "ghost" })}>
                  Voltar
                </Link>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </>
  );
}
