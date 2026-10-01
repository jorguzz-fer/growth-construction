import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { can } from "@/lib/permissions";
import { getUnits, getClientes } from "@/lib/queries";
import { TIPOS_PERMUTA } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { PermutaForm } from "@/components/app/permuta-form";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function NovoAtivoPermutaPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "permuta", "ver")) return <AccessDenied />;
  if (!can(ctx.perms, "permuta", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para criar ativos de permuta.
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
    return <PedirProjeto titulo="Novo Ativo de Permuta" projetos={ctx.projects} oQue="cadastrar o ativo de permuta" />;
  }
  const { project, trabalho: version } = escolhido;

  const [units, clientes] = await Promise.all([
    getUnits(ctx.tenant.id, version.id),
    getClientes(ctx.tenant.id),
  ]);
  const unitCodes = [...new Set(units.map((u) => u.code))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${version.label}`}
        title="Novo Ativo de Permuta"
        subtitle="O bem recebido entra no inventário pelo valor estimado. A venda posterior gera caixa; o resultado é a diferença."
      />
      <PermutaForm
        projectId={project.id}
        unidades={unitCodes}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        tipos={TIPOS_PERMUTA}
      />
    </>
  );
}
