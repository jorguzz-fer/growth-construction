import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getBudgetLines, getMedicoes } from "@/lib/queries";
import { PLANO_CONTAS, PCT_REF_CEF } from "@/lib/calc/constants";
import { brl0, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function MedicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "medicao", "ver")) return <AccessDenied />;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);
  const inRange = (mm: string | null) => !hasRange || monthInRange(mm, de, ate);

  // Fontes dos dados:
  //  - Orçado  → lançamento simplificado da versão Budget (despesas por grupo CEF).
  //  - Realizado → lançamento de medição da versão Atual (medições por grupo).
  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha. Só obras (kind "proj") têm medição.
  const obras = ctx.projects.filter((p) => p.kind === "proj");
  const selecao = lerSelecaoDeProjeto(obras, sp);
  const escolhido =
    selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido?.trabalho) {
    return (
      <PedirProjeto titulo="Medição de Obra — Relatório CEF" projetos={obras} oQue="ver a medição" />
    );
  }
  const { project, versions } = escolhido;
  // Mesma escolha de antes, agora nas versões da obra da tela.
  const budgetV = versions.find((v) => v.kind === "budget");
  const atualV = escolhido.trabalho;

  const [budgetLines, medicoes] = await Promise.all([
    // Prompt H: o orçado do relatório CEF respeita a situação da versão.
    budgetV ? getBudgetLines(budgetV.id, { respeitarSituacao: true }) : Promise.resolve([]),
    // 0.5.4 — o relatório soma TODOS os autores: sem recorte de autoria.
    getMedicoes(ctx.tenant.id, atualV.id),
  ]);

  // Orçado por grupo de obra (prefixo antes do primeiro ponto do rowKey/CEF).
  // Vem exclusivamente do lançamento do Budget: se o grupo estiver zerado no
  // Budget, o orçado aqui também é zero (sem estimativa de referência).
  const orcadoPorGrupo = new Map<string, number>();
  for (const l of budgetLines) {
    if (l.kind !== "despesa" || !inRange(l.mes)) continue;
    const grp = (l.rowKey ?? "").split(".")[0];
    orcadoPorGrupo.set(grp, (orcadoPorGrupo.get(grp) || 0) + Number(l.valor));
  }

  // Realizado por grupo de obra a partir das medições lançadas (versão Atual).
  const realizadoPorGrupo = new Map<string, number>();
  for (const m of medicoes) {
    if (!inRange(m.competencia)) continue;
    realizadoPorGrupo.set(
      m.grupoCode,
      (realizadoPorGrupo.get(m.grupoCode) || 0) + Number(m.valor),
    );
  }

  const rows = PLANO_CONTAS.obra.map((g, i) => {
    // Orçado estritamente do Budget: grupo sem lançamento no Budget → zero.
    const orcado = orcadoPorGrupo.get(g.id) || 0;
    const realizado = realizadoPorGrupo.get(g.id) || 0;
    const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
    return { g, pctRef: PCT_REF_CEF[i], orcado, realizado, pctFisico };
  });
  const totOrc = rows.reduce((a, r) => a + r.orcado, 0);
  const totReal = rows.reduce((a, r) => a + r.realizado, 0);
  const totPct = totOrc > 0 ? (totReal / totOrc) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · Orçado ${budgetV?.label ?? "Budget"} · Realizado ${atualV.label}`}
        title="Medição de Obra — Relatório CEF"
        subtitle="Orçado: lançamento do Budget · Realizado: lançamento de medição (versão Atual)"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <ProjectPicker
              projects={obras.map((p) => ({ id: p.id, label: p.name }))}
              selected={project.id}
            />
            <DateRangeFilter de={de} ate={ate} />
            <PrintButton label="Imprimir Relatório" />
          </div>
        }
      />
      <LembrarProjeto projectId={project.id} />

      <Table>
        <THead>
          <tr>
            <TH>Grupo de Despesa (CEF)</TH>
            <TH className="text-right">% Ref. CEF</TH>
            <TH className="text-right">Orçado</TH>
            <TH className="text-right">Realizado</TH>
            <TH className="text-right">% Físico</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.g.id}>
              <TD className="font-medium text-[var(--color-ink)]">
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
                  {r.g.id}
                </span>{" "}
                {r.g.nome}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.pctRef.toFixed(2)}%
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {r.orcado > 0 ? brl0(r.orcado) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {r.realizado > 0 ? brl0(r.realizado) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {r.pctFisico.toFixed(1)}%
              </TD>
            </TR>
          ))}
          <TR>
            <TD className="font-semibold text-[var(--color-ink)]">Total</TD>
            <TD className="text-right font-[family-name:var(--font-mono)]">
              100%
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totOrc)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totReal)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {totPct.toFixed(1)}%
            </TD>
          </TR>
        </tbody>
      </Table>

      <p className="mt-4 text-xs text-[var(--color-ink3)]">
        <strong>Orçado</strong> importado do lançamento simplificado da versão{" "}
        <strong>Budget</strong> (despesas por grupo do plano de contas).{" "}
        <strong>Realizado</strong> importado do{" "}
        <strong>Lançamento de Medição</strong> da versão <strong>Atual</strong>.
        Use <strong>Imprimir Relatório</strong> para gerar a versão formatada
        (FRE / Cronograma CEF).
      </p>
    </>
  );
}
