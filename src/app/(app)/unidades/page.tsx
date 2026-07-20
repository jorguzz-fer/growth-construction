import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getUnits, getAtualVersion, toCalcUnit } from "@/lib/queries";
import { calcUnitTotal } from "@/lib/calc";
import { can } from "@/lib/permissions";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { ProjectPicker } from "@/components/app/project-picker";
import { Badge, unitStatusTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { UnitActions } from "@/components/app/unit-actions";
import { UnidadesImportExport } from "@/components/app/unidades-import-export";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["Disponivel", "Reservado", "Vendido"] as const;

/** VGV compacto em milhões, no formato do protótipo (ex.: R$ 40,19M). */
function vgvMi(value: number): string {
  const mi = (value / 1e6).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R$ ${mi}M`;
}

export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const filter = STATUS_FILTERS.find((s) => s === sp.status);

  const project = ctx.projects.find((p) => p.id === sp.proj) ?? ctx.projects[0];
  const version = await getAtualVersion(ctx.tenant.id, project.id);
  // Só lista unidades da versão Atual DESTE projeto. Sem versão Atual, lista
  // vazia — nunca cai na versão de outro projeto (evita mostrar unidades alheias).
  const allRows = version ? await getUnits(version.id) : [];
  const rows = filter ? allRows.filter((r) => r.status === filter) : allRows;

  const vgv = allRows.reduce((a, r) => a + Number(r.valor), 0);
  const countOf = (s: string) => allRows.filter((r) => r.status === s).length;

  const blocos = [
    ...new Set(allRows.map((r) => r.bloco).filter((b): b is string => !!b)),
  ];
  const blocoLabel =
    blocos.length === 1
      ? `Bloco ${blocos[0]}`
      : blocos.length > 1
        ? `Blocos ${blocos.join(" · ")}`
        : null;
  const subtitle = [blocoLabel, `${allRows.length} unidades`, `VGV ${vgvMi(vgv)}`]
    .filter(Boolean)
    .join(" · ");

  const canEdit = can(ctx.perms, "unidades", "criar");
  const canEditar = can(ctx.perms, "unidades", "editar");
  const canExcluir = can(ctx.perms, "unidades", "excluir");
  const showActions = canEditar || canExcluir;

  const tabs = [
    { key: undefined as string | undefined, label: "Todas", count: allRows.length },
    { key: "Disponivel", label: "Disponíveis", count: countOf("Disponivel") },
    { key: "Reservado", label: "Reservadas", count: countOf("Reservado") },
    { key: "Vendido", label: "Vendidas", count: countOf("Vendido") },
  ];

  const colCount = showActions ? 10 : 9;

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · Atual`}
        title="Unidades do Empreendimento"
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <ProjectPicker
              projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
              selected={project.id}
            />
            {canEdit && (
              <Link
                href={`/unidades/nova?proj=${project.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                Nova Unidade
              </Link>
            )}
          </div>
        }
      />

      {/* Import / export de unidades por planilha (considera o projeto selecionado) */}
      <div className="mb-4">
        <UnidadesImportExport
          projectId={project.id}
          projectName={project.name}
          canImport={canEdit}
          units={allRows.map((u) => ({
            code: u.code,
            bloco: u.bloco,
            tipo: u.tipo,
            m2: u.m2,
            andar: u.andar,
            valor: String(u.valor),
            status: u.status,
          }))}
        />
      </div>

      {/* Filtros por status */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = filter === t.key;
          return (
            <Link
              key={t.label}
              href={
                t.key
                  ? `/unidades?proj=${project.id}&status=${t.key}`
                  : `/unidades?proj=${project.id}`
              }
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-[var(--color-accent)] text-white"
                  : "border border-[var(--color-accent2)]/15 bg-[var(--color-surface)] text-[var(--color-ink2)] hover:bg-[var(--color-surface3)]"
              }`}
            >
              {t.label}
              <span
                className={`font-[family-name:var(--font-mono)] text-[11px] ${
                  active ? "text-white/70" : "text-[var(--color-ink4)]"
                }`}
              >
                {t.count}
              </span>
            </Link>
          );
        })}
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Unidade</TH>
            <TH>Tipo</TH>
            <TH className="text-right">m²</TH>
            <TH className="text-right">And.</TH>
            <TH className="text-right">Valor R$</TH>
            <TH>Status</TH>
            <TH>Mês venda</TH>
            <TH className="text-right">Total fontes</TH>
            <TH className="text-right">Saldo</TH>
            {showActions && <TH className="text-right">Ações</TH>}
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={colCount} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhuma unidade{filter ? " com este status" : ""}.
              </TD>
            </TR>
          ) : (
            rows.map((row) => {
              const u = toCalcUnit(row);
              const total = calcUnitTotal(u);
              const saldo = total - u.valor;
              const sold = u.status === "Vendido";
              const ok = !sold || Math.abs(saldo) < 1;
              return (
                <TR key={row.id}>
                  <TD className="font-medium text-[var(--color-ink)]">
                    <Link
                      href={`/unidades/${row.id}`}
                      className="hover:text-[var(--color-accent2)] hover:underline"
                    >
                      {row.code}
                    </Link>
                    {row.itemType === "condominio" && (
                      <Badge tone="accent" className="ml-2">
                        Condomínio
                      </Badge>
                    )}
                  </TD>
                  <TD>{row.tipo ?? "—"}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {row.m2 ? Number(row.m2).toFixed(2) : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {row.andar != null ? `${row.andar}º` : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brl0(u.valor)}
                  </TD>
                  <TD>
                    <Badge tone={unitStatusTone(row.status)}>{row.status}</Badge>
                  </TD>
                  <TD className="font-[family-name:var(--font-mono)]">
                    {row.mesVenda ?? "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {sold ? brl0(total) : "—"}
                  </TD>
                  <TD
                    className={`text-right font-[family-name:var(--font-mono)] ${
                      sold
                        ? ok
                          ? "text-[var(--color-success)]"
                          : "text-[var(--color-danger)]"
                        : ""
                    }`}
                  >
                    {sold ? brl0(saldo) : "—"}
                  </TD>
                  {showActions && (
                    <TD className="text-right">
                      <UnitActions
                        id={row.id}
                        code={row.code}
                        canEditar={canEditar}
                        canExcluir={canExcluir}
                      />
                    </TD>
                  )}
                </TR>
              );
            })
          )}
        </tbody>
      </Table>
    </>
  );
}
