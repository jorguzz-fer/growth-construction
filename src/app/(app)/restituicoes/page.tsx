import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { can } from "@/lib/permissions";
import { getBankAccounts, getChartAccounts, getStakeholders } from "@/lib/queries";
import { getContaCorrenteTerceiros, getDespesaTerceiros } from "@/lib/actions/restituicoes";
import { ContaCorrenteTerceiros } from "@/components/app/conta-corrente-terceiros";
import { RestituicaoLote } from "@/components/app/restituicao-lote";
import { getSaldosConsolidadosTerceiros } from "@/lib/actions/recebimento-terceiro";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { ymd } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { RestituicoesManager } from "@/components/app/restituicoes-manager";

export const dynamic = "force-dynamic";

/** Dias em aberto entre a data-base e hoje. */
function diasEmAberto(base: string | null): number {
  const b = ymd(base);
  if (b == null) return 0;
  const now = new Date();
  const hoje = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  // diferença aproximada em dias via datas UTC
  const toDate = (n: number) =>
    Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100);
  return Math.max(0, Math.round((toDate(hoje) - toDate(b)) / 86_400_000));
}

export default async function RestituicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "restituicoes", "ver")) return <AccessDenied />;

  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a obra do cookie. A obra decide
  // a lista de lançamentos e onde caem a despesa nova e a saída de caixa; a
  // conta corrente por terceiro continua sendo da empresa inteira.
  const sp = await searchParams;
  const selecao = lerSelecaoDeProjeto(ctx.projects, sp);
  const escolhido =
    selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido?.trabalho) {
    return (
      <PedirProjeto
        titulo="Restituições — pago por terceiro"
        projetos={ctx.projects}
        oQue="ver e lançar as restituições"
      />
    );
  }
  const { project, trabalho: version } = escolhido;

  const [stakeholders, contas, bancos, lista, contasCorrentes] = await Promise.all([
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getDespesaTerceiros(ctx.tenant.id, version.id),
    // Conta corrente por terceiro (§13) — escopo TENANT: a dívida com um sócio
    // é da empresa e não muda porque o usuário trocou o projeto ativo.
    getContaCorrenteTerceiros(ctx.tenant.id),
  ]);
  // Saldos dos DOIS lados por terceiro — base do encontro de contas (RG-05).
  const saldosConsolidados = await getSaldosConsolidadosTerceiros(ctx.tenant.id);
  const rows = lista.map((r) => ({
    ...r,
    diasEmAberto: diasEmAberto(r.dataPrevistaRestituicao ?? r.dataPagamentoOriginal),
  }));

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${version.label}`}
        title="Restituições — pago por terceiro"
        subtitle="Restituição de valores pagos para fornecedores anteriormente. A despesa é reconhecida 1× na DRE; a saída de caixa ocorre só na restituição."
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={project.id}
          />
        }
      />
      <LembrarProjeto projectId={project.id} />

      {/* Conta corrente por terceiro: saldo devido e o extrato dos movimentos
          que o formam. NÃO é saldo bancário disponível — é obrigação. */}
      <ContaCorrenteTerceiros contas={contasCorrentes} />

      {/* Item 4.1 — o cliente não restitui item a item: fecha o combo e paga um
          valor único, distribuído entre os PEDs em aberto por FIFO. */}
      <RestituicaoLote
        terceiros={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        saldos={saldosConsolidados}
        canEditar={can(ctx.perms, "restituicoes", "editar")}
        projectId={project.id}
      />

      <RestituicoesManager
        rows={rows}
        stakeholders={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        contas={[...contas]
          .filter((c) => c.kind === "cef")
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map((c) => ({ code: c.code, name: c.name }))}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        bancos={bancos.map((b) => ({ id: b.id, banco: b.banco, tipo: b.tipo }))}
        categorias={CATEGORIAS_DRE}
        canCriar={can(ctx.perms, "restituicoes", "criar")}
        projectId={project.id}
        canEditar={can(ctx.perms, "restituicoes", "editar")}
      />
    </>
  );
}
