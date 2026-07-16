import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { getUnitCodesByTenant } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { updateCliente, deleteCliente, uploadClienteDoc } from "@/lib/actions/clientes";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
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
  // Todas as unidades do tenant (não só do projeto do contexto). A unidade já
  // vinculada a este cliente sempre aparece na lista, mesmo que vendida.
  const unitCodesAll = await getUnitCodesByTenant(ctx.tenant.id);
  const unitCodes = [
    ...new Set([...(cliente.unitCode ? [cliente.unitCode] : []), ...unitCodesAll]),
  ].sort();

  // Documentos de venda/contrato vinculados a este cliente (mais recentes primeiro).
  const r2 = isR2Configured();
  const docsRaw = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.clienteId, cliente.id), eq(schema.documents.tenantId, ctx.tenant.id)))
    .orderBy(desc(schema.documents.uploadedAt));
  const docs = r2
    ? await Promise.all(docsRaw.map(async (d) => ({ ...d, url: await readUrl(d.storageKey) })))
    : docsRaw.map((d) => ({ ...d, url: null as string | null }));

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

      {/* Documentos de venda / contrato */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
            Documentos de venda &amp; contrato
          </h2>
          {!r2 ? (
            <p className="text-[13px] text-[var(--color-ink3)]">
              Configure as variáveis R2_* para habilitar o upload de documentos.
            </p>
          ) : (
            canEditar && (
              <form action={uploadClienteDoc} className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <input type="hidden" name="clienteId" value={cliente.id} />
                <div>
                  <Label>Tipo</Label>
                  <Select name="tipo" defaultValue="">
                    <option value="">—</option>
                    {["Contrato assinado", "Proposta", "Documentos do comprador", "Comprovante", "Termo aditivo", "Distrato", "Outros"].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Select name="unitCode" defaultValue={cliente.unitCode ?? ""}>
                    <option value="">—</option>
                    {unitCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Arquivo (até 15 MB)</Label>
                  <Input type="file" name="file" required />
                </div>
                <div className="flex items-end">
                  <Button type="submit">Enviar documento</Button>
                </div>
              </form>
            )
          )}

          {docs.length > 0 && (
            <Table>
              <THead>
                <tr>
                  <TH>Arquivo</TH>
                  <TH>Tipo</TH>
                  <TH>Unidade</TH>
                  <TH className="text-right">Versão</TH>
                  <TH>Enviado por</TH>
                  <TH>Enviado em</TH>
                  <TH></TH>
                </tr>
              </THead>
              <tbody>
                {docs.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-medium text-[var(--color-ink)]">{d.filename}</TD>
                    <TD className="text-[var(--color-ink2)]">{d.tipo ?? "—"}</TD>
                    <TD className="font-[family-name:var(--font-mono)]">{d.unitCode ?? "—"}</TD>
                    <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">v{d.versao}</TD>
                    <TD className="text-[var(--color-ink3)]">{d.uploadedBy ?? "—"}</TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString("pt-BR") : "—"}
                    </TD>
                    <TD className="text-right">
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noopener" className="text-sm text-[var(--color-accent2)] hover:underline">
                          abrir
                        </a>
                      ) : (
                        <span className="text-[var(--color-ink4)]">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
          {docs.length === 0 && r2 && (
            <p className="text-[13px] text-[var(--color-ink4)]">Nenhum documento anexado.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
