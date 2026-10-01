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
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function ReembolsoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string; salva?: string }>;
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
    return <PedirProjeto titulo="Liberações de Obra" projetos={ctx.projects} oQue="ver as liberações de obra" />;
  }
  const { project, trabalho: version } = escolhido;
  const rows = await getReembolsos(ctx.tenant.id, version.id);
  const total = rows.reduce((a, r) => a + Number(r.valor ?? 0), 0);
  const canCriar = can(ctx.perms, "reembolso", "criar");

  return (
    <>
      <PageHeader
        title="Liberações de Obra"
        eyebrow={`${project.name} · ${version.label}`}
        subtitle="Parcelas do financiamento da obra liberadas pela instituição financeira após a medição. Entrada de caixa, não receita."
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
                + Nova liberação
              </Link>
            )}
          </div>
        }
      />
      <LembrarProjeto projectId={project.id} />
      {sp.salva && (
        <p role="status" className="mb-4 rounded-[10px] border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2.5 text-sm text-[var(--color-ink)]">
          Liberação lançada.
        </p>
      )}

      <p className="mb-4 text-sm text-[var(--color-ink3)]">
        Total:{" "}
        <strong className="text-[var(--color-success)]">{brl0(total)}</strong> ·{" "}
        {rows.length} lançamento(s)
      </p>

      {/* Prompt O, 2.1/2.2 — o aviso sobre SERIAL/SUMIFS e a coluna Serial
          saíram: descreviam a planilha de origem, não este sistema. A coluna
          `serial` continua gravada, exportada e reimportada. 5.2 — a coluna
          Status saiu da listagem: era gravada fixa e nunca lida. */}

      <Table>
        <THead>
          <tr>
            <TH>Data</TH>
            <TH>Origem</TH>
            <TH className="text-right">Valor R$</TH>
            <TH>Observações</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={4} className="py-8 text-center text-[var(--color-ink4)]">
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
                <TD>{r.obs || "—"}</TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}
