import { getTenantContext, getWorkingVersion } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getChartAccounts, getMedicoes } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { brl0 } from "@/lib/utils";
import { idsDuplicados, podeTocarMedicao, rotuloDoAutor, textoDoVazio, veSoAsProprias } from "@/lib/medicao-regras";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { MedicaoForm } from "@/components/app/medicao-form";
import { MedicaoTable } from "@/components/app/medicao-manager";
import { ProjectPicker } from "@/components/app/project-picker";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function MedicaoLancamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "medicaolanc", "ver")) return <AccessDenied />;
  const sp = await searchParams;

  // Projetos de obra (kind "proj") — só eles têm medição/CEF.
  const projetos = ctx.projects.filter((p) => p.kind === "proj");
  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a do cookie nem a primeira.
  const selecao = lerSelecaoDeProjeto(projetos, sp);
  const atualOuNada =
    selecao.tipo === "projeto" ? await getWorkingVersion(ctx.tenant.id, selecao.projeto.id) : null;
  if (selecao.tipo !== "projeto" || !atualOuNada) {
    return <PedirProjeto titulo="Lançamento de Medição" projetos={projetos} oQue="lançar a medição" />;
  }
  const selectedProject = selecao.projeto;
  // Versão de trabalho do projeto medido (Atual). A medição é informação
  // auxiliar: alimenta o Relatório CEF, não a DRE (Prompt V, seção 2).
  const atual = atualOuNada;

  // 0.5.2 — o engenheiro recebe só as próprias (e as sem autor), filtrado NA
  // CONSULTA: medição de outro autor não chega ao navegador.
  const soAsProprias = veSoAsProprias(ctx.role);
  const [rows, chart] = await Promise.all([
    getMedicoes(ctx.tenant.id, atual.id, { autor: soAsProprias ? ctx.userId : null }),
    getChartAccounts(ctx.tenant.id),
  ]);
  const duplicadas = idsDuplicados(rows.map((r) => ({ id: r.id, competencia: r.competencia, grupoCode: r.grupoCode, valor: Number(r.valor) })));

  // Grupos CEF distintos (para o seletor de grupo de obra).
  const grupos = [
    ...new Map(
      chart
        .filter((c) => c.kind === "cef")
        .map((c) => [c.groupCode, { code: c.groupCode, name: c.groupName }]),
    ).values(),
  ].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const canCriar = can(ctx.perms, "medicaolanc", "criar");
  const canEditar = can(ctx.perms, "medicaolanc", "editar");
  const canExcluir = can(ctx.perms, "medicaolanc", "excluir");
  const total = rows.reduce((a, r) => a + Number(r.valor), 0);
  const locked = atual.locked;

  return (
    <>
      <PageHeader
        eyebrow={`${selectedProject.name} · ${atual.label}`}
        title="Lançamento de Medição"
        subtitle={`${rows.length} lançamentos · total ${brl0(total)} — alimenta o Relatório CEF (orçado × medido); não entra na DRE`}
        actions={
          <ProjectPicker
            projects={projetos.map((p) => ({ id: p.id, label: p.name }))}
            selected={selectedProject.id}
          />
        }
      />
      <LembrarProjeto projectId={selectedProject.id} />

      {locked && (
        <p className="mb-4 rounded-[8px] bg-[#fef3c7] px-3 py-2 text-[13px] text-[#92400e]">
          Versão congelada — lançamentos bloqueados.
        </p>
      )}

      {canCriar && !locked && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <MedicaoForm projectId={selectedProject.id} grupos={grupos} />
          </CardContent>
        </Card>
      )}

      <MedicaoTable
        rows={rows.map((r) => ({
          id: r.id,
          competencia: r.competencia,
          grupoCode: r.grupoCode,
          grupoName: r.grupoName,
          valor: Number(r.valor),
          obs: r.obs ?? "",
          autor: rotuloDoAutor(r),
          semAutor: !r.createdBy,
          quando: r.createdAt.toLocaleDateString("pt-BR"),
          podeTocar: podeTocarMedicao(r, { userId: ctx.userId, role: ctx.role }),
          duplicada: duplicadas.has(r.id),
        }))}
        canEditar={canEditar && !locked}
        canExcluir={canExcluir && !locked}
        vazio={textoDoVazio({ soAsProprias, filtrado: false })}
      />
    </>
  );
}
