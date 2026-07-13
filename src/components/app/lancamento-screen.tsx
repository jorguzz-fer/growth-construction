import type { ActiveContext } from "@/lib/context";
import { getReceitaByProject, getDespesaLinhas } from "@/lib/queries";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { ReceitaProjetosMatrix } from "@/components/app/receita-projetos-matrix";
import { DespesaLinhasEditor } from "@/components/app/despesa-linhas-editor";

/**
 * Lançamento simplificado (Budget ou Forecast) consolidado: receita por projeto
 * (matriz projetos × meses + "Outras Receitas") e despesas por linha (grupo do
 * plano de contas × projeto/filial, criadas pelo usuário).
 */
export async function LancamentoScreen({
  ctx,
  kind,
}: {
  ctx: ActiveContext;
  kind: "budget" | "forecast";
}) {
  const title = kind === "budget" ? "Lançamento Budget" : "Lançamento Forecast";
  const canEditKind = can(ctx.perms, kind, "editar");

  const [receita, despesa] = await Promise.all([
    getReceitaByProject(ctx.tenant.id, kind),
    getDespesaLinhas(ctx.tenant.id, kind),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title={title}
        subtitle="Receita por projeto (consolidada) e despesas por grupo × projeto/filial — valores mensais."
      />

      <section className="mb-8 space-y-2">
        <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
          Receitas por projeto
        </h2>
        <ReceitaProjetosMatrix
          kind={kind}
          months={receita.months}
          rows={receita.rows.map((r) => ({
            projectId: r.projectId,
            projectName: r.projectName,
            values: r.values,
          }))}
          canEdit={canEditKind}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
          Despesas por grupo · projeto/filial
        </h2>
        <DespesaLinhasEditor
          kind={kind}
          months={despesa.months}
          projetos={despesa.projetos}
          grupos={despesa.grupos}
          dreCategories={CATEGORIAS_DRE.filter((c) => c !== "Receita")}
          initialLines={despesa.lines.map((l) => ({
            projectId: l.projectId,
            grupoCode: l.grupoCode,
            dreCategory: l.dreCategory,
            values: l.values,
          }))}
          canEdit={canEditKind}
        />
      </section>
    </>
  );
}
