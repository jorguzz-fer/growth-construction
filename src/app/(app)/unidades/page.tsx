import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getUnits, toCalcUnit } from "@/lib/queries";
import { calcUnitTotal } from "@/lib/calc";
import { can } from "@/lib/permissions";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Badge, unitStatusTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ImportUnitsButton } from "@/components/app/import-units";

export const dynamic = "force-dynamic";

export default async function UnidadesPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const rows = await getUnits(ctx.version.id);
  const vgv = rows.reduce((a, r) => a + Number(r.valor), 0);
  const canEdit = can(ctx.perms, "unidades", "criar");

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Unidades / Dados de Venda"
        subtitle={`${rows.length} unidades · VGV ${brl0(vgv)}`}
        actions={
          canEdit ? (
            <>
              <ImportUnitsButton />
              <Link href="/unidades/nova" className={buttonVariants({ size: "sm" })}>
                Nova Unidade
              </Link>
            </>
          ) : undefined
        }
      />

      <Table>
        <THead>
          <tr>
            <TH>Código</TH>
            <TH>Tipo</TH>
            <TH className="text-right">m²</TH>
            <TH className="text-right">VGV</TH>
            <TH className="text-right">Contratado</TH>
            <TH className="text-right">Saldo</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => {
            const u = toCalcUnit(row);
            const total = calcUnitTotal(u);
            const saldo = total - u.valor;
            const ok = u.status !== "Vendido" || Math.abs(saldo) < 1;
            return (
              <TR key={row.id}>
                <TD className="font-medium text-[var(--color-ink)]">
                  <Link
                    href={`/unidades/${row.id}`}
                    className="hover:text-[var(--color-accent2)] hover:underline"
                  >
                    {row.code}
                  </Link>
                </TD>
                <TD>{row.tipo ?? "—"}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {row.m2 ? Number(row.m2).toFixed(2) : "—"}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {brl0(u.valor)}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {u.status === "Vendido" ? brl0(total) : "—"}
                </TD>
                <TD
                  className={`text-right font-[family-name:var(--font-mono)] ${
                    u.status === "Vendido"
                      ? ok
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-danger)]"
                      : ""
                  }`}
                >
                  {u.status === "Vendido" ? brl0(saldo) : "—"}
                </TD>
                <TD>
                  <Badge tone={unitStatusTone(row.status)}>{row.status}</Badge>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
