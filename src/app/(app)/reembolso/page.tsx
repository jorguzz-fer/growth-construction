import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getReembolsos } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { brl0, dateBR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Normaliza status legado ("received") para o rótulo em português. */
function statusLabel(status: string | null): string {
  if (!status) return "Recebido";
  return status.toLowerCase() === "received" ? "Recebido" : status;
}

export default async function ReembolsoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const rows = await getReembolsos(ctx.version.id);
  const total = rows.reduce((a, r) => a + Number(r.valor ?? 0), 0);
  const canCriar = can(ctx.perms, "reembolso", "criar");

  return (
    <>
      <PageHeader
        title="Reembolso"
        subtitle="Aba própria — Data REAL + SERIAL automático"
        actions={
          canCriar ? (
            <Link href="/reembolso/novo" className={buttonVariants({ size: "sm" })}>
              + Novo Reembolso
            </Link>
          ) : undefined
        }
      />

      <p className="mb-4 text-sm text-[var(--color-ink3)]">
        Total:{" "}
        <strong className="text-[var(--color-success)]">{brl0(total)}</strong> ·{" "}
        {rows.length} lançamento(s)
      </p>

      <div className="mb-6 flex items-start gap-2 rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-accent4)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-ink2)]">
        <span aria-hidden className="mt-px">
          ⓘ
        </span>
        <p>
          A data deve ser uma <strong>DATA REAL</strong>. O <strong>SERIAL</strong>{" "}
          é calculado automaticamente via{" "}
          <code className="font-[family-name:var(--font-mono)]">INT(Data)</code>. A
          Projeção usa <strong>SUMIFS</strong> comparando col SERIAL com seriais de
          cada mês.
        </p>
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Data (DD/MM/AAAA)</TH>
            <TH>Origem</TH>
            <TH className="text-right">Valor R$</TH>
            <TH>Porcentagem %</TH>
            <TH>Observações</TH>
            <TH className="text-right">Serial (auto)</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhum reembolso lançado nesta versão.
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-[family-name:var(--font-mono)]">
                  {dateBR(r.data)}
                </TD>
                <TD>{r.origem ?? "—"}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-success)]">
                  {brl0(Number(r.valor ?? 0))}
                </TD>
                <TD>{r.pct || "—"}</TD>
                <TD>{r.obs || "—"}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {r.serial ?? "—"}
                </TD>
                <TD>
                  <Badge tone="success">✓ {statusLabel(r.status)}</Badge>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}
