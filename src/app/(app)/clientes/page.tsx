import Link from "next/link";
import { getTenantContext } from "@/lib/context";
import { getClientesPagina, getStatusContratoUsados } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { TELA_DADOS_CLIENTE, mascararDocumento } from "@/lib/clientes-sensivel";
import {
  CLIENTES_POR_PAGINA,
  STATUS_EM_BRANCO,
  interesseNaFaixa,
  lerFiltrosClientes,
  linkDaListagem,
  termosDaBusca,
} from "@/lib/clientes-regras";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "clientes", "ver")) return <AccessDenied />;
  // Busca, filtro por status e paginação (6.8), tudo na URL.
  const filtros = lerFiltrosClientes(await searchParams);
  const [{ itens: clientes, total, totalGeral }, statusUsados] = await Promise.all([
    getClientesPagina(ctx.tenant.id, {
      termos: termosDaBusca(filtros.q),
      status: filtros.status,
      pagina: filtros.pagina,
      porPagina: CLIENTES_POR_PAGINA,
      statusEmBranco: STATUS_EM_BRANCO,
    }),
    getStatusContratoUsados(ctx.tenant.id),
  ]);
  const paginas = Math.max(1, Math.ceil(total / CLIENTES_POR_PAGINA));
  const filtrando = !!filtros.q || !!filtros.status;
  const canCriar = can(ctx.perms, "clientes", "criar");
  // Interesse é inteligência de mercado (BM-3): só com a permissão de dados.
  const veDados = can(ctx.perms, TELA_DADOS_CLIENTE, "ver");
  const colunas = veDados ? 7 : 6;
  const primeiro = total === 0 ? 0 : (filtros.pagina - 1) * CLIENTES_POR_PAGINA + 1;
  const ultimo = Math.min(total, filtros.pagina * CLIENTES_POR_PAGINA);

  return (
    <>
      <PageHeader
        title="Clientes (Compradores)"
        actions={
          canCriar ? (
            <Link href="/clientes/novo" className={buttonVariants({ size: "sm" })}>
              + Novo cliente
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          name="q"
          defaultValue={filtros.q}
          placeholder="Buscar por nome ou unidade"
          aria-label="Buscar por nome ou unidade"
          className="max-w-[320px]"
        />
        <Select
          name="status"
          defaultValue={filtros.status}
          aria-label="Status do contrato"
          className="max-w-[240px]"
        >
          <option value="">Todos os status</option>
          {statusUsados.map((s) =>
            s.status == null ? (
              <option key={STATUS_EM_BRANCO} value={STATUS_EM_BRANCO}>
                Sem status ({s.qtd})
              </option>
            ) : (
              <option key={s.status} value={s.status}>
                {s.status} ({s.qtd})
              </option>
            ),
          )}
        </Select>
        <Button type="submit" size="sm" variant="outline">
          Filtrar
        </Button>
        {filtrando && (
          <Link href="/clientes" className={buttonVariants({ size: "sm", variant: "ghost" })}>
            Limpar
          </Link>
        )}
        <span className="ml-auto text-[13px] text-[var(--color-ink3)]">
          {filtrando
            ? `${total} de ${totalGeral} compradores cadastrados`
            : `${totalGeral} compradores cadastrados`}
        </span>
      </form>

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
              <TD colSpan={colunas} className="py-8 text-center text-[var(--color-ink4)]">
                {total > 0 ? (
                  <Link href={linkDaListagem(filtros, { pagina: 1 })} className="text-[var(--color-accent2)] hover:underline">
                    Página sem resultados — voltar à primeira
                  </Link>
                ) : filtrando ? (
                  "Nenhum comprador encontrado com esses filtros."
                ) : (
                  "Nenhum comprador cadastrado."
                )}
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
                    {c.interesse == null ? (
                      "—"
                    ) : interesseNaFaixa(c.interesse) ? (
                      `${c.interesse}/5`
                    ) : (
                      // 6.7 — gravado fora da faixa: aparece, sinalizado.
                      <span className="text-[var(--color-warning)]" title="Fora da faixa de 1 a 5">
                        {c.interesse} · fora da faixa
                      </span>
                    )}
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

      {total > CLIENTES_POR_PAGINA && (
        <nav
          aria-label="Paginação"
          className="mt-3 flex items-center justify-between text-[13px] text-[var(--color-ink3)]"
        >
          <span>
            {primeiro}–{ultimo} de {total}
          </span>
          <span className="flex items-center gap-2">
            {filtros.pagina > 1 ? (
              <Link
                href={linkDaListagem(filtros, { pagina: filtros.pagina - 1 })}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                ← Anterior
              </Link>
            ) : null}
            <span>
              Página {Math.min(filtros.pagina, paginas)} de {paginas}
            </span>
            {filtros.pagina < paginas ? (
              <Link
                href={linkDaListagem(filtros, { pagina: filtros.pagina + 1 })}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                Próxima →
              </Link>
            ) : null}
          </span>
        </nav>
      )}
    </>
  );
}
