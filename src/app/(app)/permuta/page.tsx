import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getPermutas } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Tom do badge por tipo de ativo (ex.: Carro azul, Imóvel verde). */
function tipoTone(tipo: string | null): BadgeProps["tone"] {
  switch ((tipo ?? "").toLowerCase()) {
    case "carro":
      return "info";
    case "imovel":
    case "imóvel":
      return "success";
    default:
      return "accent";
  }
}

export default async function PermutaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const rows = await getPermutas(ctx.version.id);
  const estimado = rows.reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  const projetada = rows
    .filter((p) => p.status === "Vendido")
    .reduce((a, p) => a + Number(p.valorVenda ?? 0), 0);
  const canCriar = can(ctx.perms, "permuta", "criar");

  return (
    <>
      <PageHeader
        title="Inventário de Permuta"
        subtitle="Ativos recebidos como permuta"
        actions={
          canCriar ? (
            <Link href="/permuta/novo" className={buttonVariants({ size: "sm" })}>
              + Novo Ativo
            </Link>
          ) : undefined
        }
      />

      <p className="mb-6 text-sm text-[var(--color-ink3)]">
        Estimado: <strong className="text-[var(--color-ink)]">{brl0(estimado)}</strong>{" "}
        · Receita projetada:{" "}
        <strong className="text-[var(--color-success)]">{brl0(projetada)}</strong>
      </p>

      <Table>
        <THead>
          <tr>
            <TH className="text-right">#</TH>
            <TH>Unidade</TH>
            <TH>Cliente</TH>
            <TH>Dt.receb.</TH>
            <TH>Tipo</TH>
            <TH>Descricao</TH>
            <TH className="text-right">Val.est.</TH>
            <TH>Status</TH>
            <TH>Dt.venda</TH>
            <TH className="text-right">Val.venda</TH>
            <TH>Tipo perm.</TH>
            <TH>Obs.</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={12} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhum ativo de permuta nesta versão.
              </TD>
            </TR>
          ) : (
            rows.map((p, i) => {
              const sold = p.status === "Vendido";
              return (
                <TR key={p.id}>
                  <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink4)]">
                    {i + 1}
                  </TD>
                  <TD className="font-medium text-[var(--color-ink)]">
                    {p.unitCode ?? "—"}
                  </TD>
                  <TD>{p.cliente || "—"}</TD>
                  <TD className="font-[family-name:var(--font-mono)]">
                    {p.dataRecebimento || "—"}
                  </TD>
                  <TD>
                    {p.tipo ? <Badge tone={tipoTone(p.tipo)}>{p.tipo}</Badge> : "—"}
                  </TD>
                  <TD>{p.descricao || "—"}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brl0(Number(p.estimado ?? 0))}
                  </TD>
                  <TD>
                    <Badge tone={sold ? "success" : "neutral"}>
                      {p.status ?? "—"}
                    </Badge>
                  </TD>
                  <TD className="font-[family-name:var(--font-mono)]">
                    {p.dataVenda || "—"}
                  </TD>
                  <TD
                    className={`text-right font-[family-name:var(--font-mono)] ${
                      sold ? "font-semibold text-[var(--color-success)]" : ""
                    }`}
                  >
                    {sold ? brl0(Number(p.valorVenda ?? 0)) : "—"}
                  </TD>
                  <TD>{p.tipoPermuta || "—"}</TD>
                  <TD>{p.obs || "—"}</TD>
                </TR>
              );
            })
          )}
        </tbody>
      </Table>

      <div className="mt-6 flex items-start gap-2 rounded-[10px] bg-[#d1fae5] px-4 py-3 text-[13px] leading-relaxed text-[#065f46]">
        <span aria-hidden className="mt-px">
          ⓘ
        </span>
        <p>
          <strong>VENDIDO</strong> gera receita na Projeção e atualiza
          automaticamente o campo Permuta em Dados_de_Venda.
        </p>
      </div>
    </>
  );
}
