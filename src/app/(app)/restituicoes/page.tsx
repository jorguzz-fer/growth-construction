import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { can } from "@/lib/permissions";
import { getBankAccounts, getChartAccounts, getStakeholders } from "@/lib/queries";
import Link from "next/link";
import { getContaCorrenteTerceiros, getDespesaTerceiros, getPreviaSaidaPorObra, type PreviaSaidaPorObra } from "@/lib/actions/restituicoes";
import { chaveLigada } from "@/lib/chaves-tenant";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
  // §21 — prévia da chave "saída segue a despesa": só quem administra chaves.
  const podeVerPrevia = can(ctx.perms, "chaves", "ver");
  const [segueDespesa, previa] = await Promise.all([
    chaveLigada(ctx.tenant.id, "restituicao_segue_despesa"),
    podeVerPrevia ? getPreviaSaidaPorObra(ctx.tenant.id) : Promise.resolve([]),
  ]);
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
      {podeVerPrevia && <PreviaSaidaSegueDespesa linhas={previa} ligada={segueDespesa} obraDaTela={project.name} />}
    </>
  );
}

/**
 * §21 (B11) — prévia da chave `restituicao_segue_despesa`: em que obra cairão
 * as próximas saídas de restituição. Desligada, tudo cai na obra aberta na
 * tela; ligada, cada saída cai na obra da despesa restituída.
 */
function PreviaSaidaSegueDespesa({ linhas, ligada, obraDaTela }: { linhas: PreviaSaidaPorObra[]; ligada: boolean; obraDaTela: string }) {
  const total = linhas.reduce((a, l) => a + l.saldo, 0);
  return (
    <Card id="previa" className="mt-6">
      <CardContent className="p-5">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">
          Prévia da chave “Saída da restituição segue a despesa” — {ligada ? "ligada" : "desligada"}
        </h2>
        <p className="mt-1.5 text-[13px] text-[var(--color-ink2)]">
          {linhas.length === 0
            ? "Não há obrigação pendente com terceiros. Ligar a chave não muda nenhum número hoje."
            : ligada
              ? `As próximas restituições avulsas (${brl0(total)} pendentes) caem na obra de cada despesa, como abaixo. Nada já lançado muda.`
              : `Hoje toda saída de restituição cai na obra aberta na tela (${obraDaTela}). Com a chave ligada, as próximas restituições avulsas (${brl0(total)} pendentes) caem na obra de cada despesa, como abaixo. Nada já lançado muda; o lote continua na obra da tela.`}{" "}
          <Link href="/chaves" className="text-[var(--color-accent2)] hover:underline">
            Chaves de mudança
          </Link>
        </p>
        {linhas.length > 0 && (
          <table className="mt-3 w-full max-w-xl border-collapse text-[13px]">
            <thead>
              <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                <th className="px-2 py-1">Obra da despesa</th>
                <th className="px-2 py-1 text-right">Obrigações</th>
                <th className="px-2 py-1 text-right">Saldo a restituir</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.projectId} className="border-t border-[var(--color-accent2)]/8">
                  <td className="px-2 py-1">{l.projectName}</td>
                  <td className="px-2 py-1 text-right font-[family-name:var(--font-mono)]">{l.obrigacoes}</td>
                  <td className="px-2 py-1 text-right font-[family-name:var(--font-mono)]">{brl0(l.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
