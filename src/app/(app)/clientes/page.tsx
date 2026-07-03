import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getClientes } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const clientes = await getClientes(ctx.tenant.id);
  const canCriar = can(ctx.perms, "clientes", "criar");

  return (
    <>
      <PageHeader
        title="Clientes (Compradores)"
        subtitle={`${clientes.length} compradores cadastrados`}
        actions={
          canCriar ? (
            <Link href="/clientes/novo" className={buttonVariants({ size: "sm" })}>
              + Novo cliente
            </Link>
          ) : undefined
        }
      />

      <Table>
        <THead>
          <tr>
            <TH>Unidade</TH>
            <TH>Nome</TH>
            <TH>CPF/CNPJ</TH>
            <TH>Cidade/Estado</TH>
            <TH>Status contrato</TH>
            <TH className="text-right">Interesse</TH>
            <TH className="text-right">Ação</TH>
          </tr>
        </THead>
        <tbody>
          {clientes.length === 0 ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhum comprador cadastrado.
              </TD>
            </TR>
          ) : (
            clientes.map((c) => (
              <TR key={c.id}>
                <TD className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
                  {c.unitCode ?? "—"}
                </TD>
                <TD className="font-medium text-[var(--color-ink)]">{c.nomeCompleto}</TD>
                <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {c.cpfCnpj ?? "—"}
                </TD>
                <TD>{c.cidadeEstado ?? "—"}</TD>
                <TD>
                  {c.statusContrato ? <Badge tone="neutral">{c.statusContrato}</Badge> : "—"}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {c.interesse != null ? `${c.interesse}/5` : "—"}
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/clientes/${c.id}`}
                    className="text-sm text-[var(--color-accent2)] hover:underline"
                  >
                    Editar
                  </Link>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}
