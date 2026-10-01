import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { LiberacaoForm } from "@/components/app/liberacao-form";
import { getMedicoes, getReembolsos } from "@/lib/queries";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function NovoReembolsoPage({
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
  if (!can(ctx.perms, "reembolso", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para lançar liberações de obra.
      </p>
    );
  }

  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a obra do cookie.
  const sp = await searchParams;
  const selecao = lerSelecaoDeProjeto(ctx.projects, sp);
  const escolhido =
    selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido?.trabalho) {
    return <PedirProjeto titulo="Nova liberação de obra" projetos={ctx.projects} oQue="lançar a liberação de obra" />;
  }
  const { project, trabalho: version } = escolhido;
  // 6.2 — avisos do assistente no cadastro (competência com medição e sem
  // liberação; lançamento igual a um existente). Só leitura.
  const [existentes, medicoes] = await Promise.all([getReembolsos(ctx.tenant.id, version.id), getMedicoes(ctx.tenant.id, version.id)]);

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${version.label}`}
        title="Nova liberação de obra"
        subtitle="Parcela do financiamento liberada após a medição. Entrada de caixa, não receita."
      />
      <LiberacaoForm
        projectId={project.id}
        existentes={existentes.map((r) => ({ id: r.id, data: r.data, origem: r.origem, valor: Number(r.valor ?? 0), pct: r.pct, cancelado: r.cancelado }))}
        medicoes={medicoes.map((m) => ({ competencia: m.competencia, valor: Number(m.valor) }))}
      />
    </>
  );
}
