import Link from "next/link";
import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getReembolsos } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { brl0, dateBR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/** Normaliza status legado ("received") para o rótulo em português. */
function statusLabel(status: string | null): string {
  if (!status) return "Recebido";
  return status.toLowerCase() === "received" ? "Recebido" : status;
}

export default async function ReembolsoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "reembolso", "ver")) return <AccessDenied />;
  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a obra do cookie.
  const sp = await searchParams;
  const selecao = lerSelecaoDeProjeto(ctx.projects, sp);
  const escolhido =
    selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido?.trabalho) {
    return <PedirProjeto titulo="Liberação de Obra" projetos={ctx.projects} oQue="ver as liberações de obra" />;
  }
  const { project, trabalho: version } = escolhido;
  const rows = await getReembolsos(version.id);
  const total = rows.reduce((a, r) => a + Number(r.valor ?? 0), 0);
  const canCriar = can(ctx.perms, "reembolso", "criar");

  return (
    <>
      <PageHeader
        title="Liberação de Obra"
        eyebrow={`${project.name} · ${version.label}`}
        subtitle="Aba própria — Data REAL + SERIAL automático"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <ProjectPicker
              projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
              selected={project.id}
            />
            {canCriar && (
              <Link
                href={`/reembolso/novo?proj=${project.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                + Nova Liberação
              </Link>
            )}
          </div>
        }
      />
      <LembrarProjeto projectId={project.id} />

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
                Nenhuma liberação lançada nesta versão.
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
