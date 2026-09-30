import Link from "next/link";
import { getTenantContext } from "@/lib/context";
import { getClientes } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { TELA_DADOS_CLIENTE, mascararDocumento } from "@/lib/clientes-sensivel";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "clientes", "ver")) return <AccessDenied />;
  const clientes = await getClientes(ctx.tenant.id);
  const canCriar = can(ctx.perms, "clientes", "criar");
  // Interesse é inteligência de mercado (BM-3): só com a permissão de dados.
  const veDados = can(ctx.perms, TELA_DADOS_CLIENTE, "ver");

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
            {veDados && <TH className="text-right">Interesse</TH>}
            <TH className="text-right">Ação</TH>
          </tr>
        </THead>
        <tbody>
          {clientes.length === 0 ? (
            <TR>
              <TD colSpan={veDados ? 7 : 6} className="py-8 text-center text-[var(--color-ink4)]">
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
                  {/* Mascarado na lista para todos (5.1); completo só na ficha, com permissão. */}
                  {mascararDocumento(c.cpfCnpj) ?? "—"}
                </TD>
                <TD>{c.cidadeEstado ?? "—"}</TD>
                <TD>
                  {c.statusContrato ? <Badge tone="neutral">{c.statusContrato}</Badge> : "—"}
                </TD>
                {veDados && (
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {c.interesse != null ? `${c.interesse}/5` : "—"}
                  </TD>
                )}
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
