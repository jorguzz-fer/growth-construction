import Link from "next/link";
import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getMedicoes, getReembolsos, getUnits } from "@/lib/queries";
import { analisarLiberacoes } from "@/lib/liberacao-analise";
import { AssistenteLiberacoes } from "@/components/app/assistente-liberacoes";
import { LiberacaoActions } from "@/components/app/liberacao-actions";
import { Badge } from "@/components/ui/badge";
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
  searchParams: Promise<{ proj?: string; project?: string; salva?: string; cancelada?: string }>;
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
  // A lista mantém as canceladas legíveis (4.2); o total não as conta (4.4).
  const rows = await getReembolsos(ctx.tenant.id, version.id, { incluirCanceladas: true });
  const ativas = rows.filter((r) => !r.cancelado);
  const total = ativas.reduce((a, r) => a + Number(r.valor ?? 0), 0);
  const canCriar = can(ctx.perms, "reembolso", "criar");
  const canEditar = can(ctx.perms, "reembolso", "editar");
  const canExcluir = can(ctx.perms, "reembolso", "excluir");
  // Seção 6 — análises do assistente (somente leitura), em código puro,
  // sobre o que a página carregou: liberações, medições e o financiamento
  // previsto das unidades vendidas desta versão.
  const [medicoes, unidades] = await Promise.all([getMedicoes(ctx.tenant.id, version.id), getUnits(ctx.tenant.id, version.id)]);
  const analise = analisarLiberacoes(
    rows.map((r) => ({ id: r.id, data: r.data, origem: r.origem, valor: Number(r.valor ?? 0), pct: r.pct, cancelado: r.cancelado })),
    medicoes.map((m) => ({ competencia: m.competencia, valor: Number(m.valor) })),
    unidades.map((u) => ({ status: u.status, valorFinanciado: Number(u.paymentPlan?.Banco?.valFinanc ?? 0) })),
  );

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
      {/* Abaixo de 1180px o painel desce para baixo do conteúdo (Prompt E, 6.2). */}
      <div className="flex flex-col gap-6 min-[1180px]:flex-row min-[1180px]:items-start">
      <div className="min-w-0 flex-1">
      {(sp.salva || sp.cancelada) && (
        <p role="status" className="mb-4 rounded-[10px] border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2.5 text-sm text-[var(--color-ink)]">
          {sp.cancelada ? "Liberação cancelada. Ela continua na lista, fora dos totais." : "Liberação lançada."}
        </p>
      )}

      <p className="mb-4 text-sm text-[var(--color-ink3)]">
        Total:{" "}
        <strong className="text-[var(--color-success)]">{brl0(total)}</strong> ·{" "}
        {ativas.length} lançamento(s){rows.length > ativas.length ? ` · ${rows.length - ativas.length} cancelada(s)` : ""}
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
            <TH className="text-right">Ações</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={5} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhuma liberação lançada nesta versão.
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.id} className={r.cancelado ? "text-[var(--color-ink4)] line-through" : undefined}>
                <TD className="font-[family-name:var(--font-mono)]">
                  {dateBR(r.data)}
                </TD>
                <TD>
                  {r.origem ?? "—"}
                  {r.cancelado && (
                    <Badge tone="neutral" className="ml-2 no-underline" title={`Cancelada em ${dateBR(r.canceladoEm)} por ${r.canceladoPor ?? "—"}${r.motivoCancelamento ? `: ${r.motivoCancelamento}` : ""}`}>
                      Cancelada
                    </Badge>
                  )}
                </TD>
                <TD className={`text-right font-[family-name:var(--font-mono)] font-semibold ${r.cancelado ? "" : "text-[var(--color-success)]"}`}>
                  {brl0(Number(r.valor ?? 0))}
                </TD>
                <TD>{r.obs || "—"}</TD>
                <TD className="text-right">
                  <LiberacaoActions id={r.id} rotulo={`de ${dateBR(r.data)} (${brl0(Number(r.valor ?? 0))})`} projectId={project.id} cancelada={r.cancelado} canEditar={canEditar} canExcluir={canExcluir} />
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
      </div>
      <AssistenteLiberacoes usuario={ctx.userEmail ?? "anon"} analise={analise} />
      </div>
    </>
  );
}
