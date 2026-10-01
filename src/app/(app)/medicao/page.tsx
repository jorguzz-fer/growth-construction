import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getBudgetLines, getMedicoes } from "@/lib/queries";
import { brl0 } from "@/lib/utils";
import { escolherOrcamento, LEGENDA_ESTADO, montarRelatorioCef, recorteDeCompetencia, textoDaEscolha, type LinhaCef } from "@/lib/medicao-cef";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { OrcamentoPicker, RecorteDeCompetencia } from "@/components/app/medicao-cef-controls";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

const pct1 = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export default async function MedicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; proj?: string; project?: string; orc?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  if (!can(ctx.perms, "medicao", "ver")) return <AccessDenied />;

  const sp = await searchParams;
  // 3.9 — acumulado por padrão; recorte por competência só com os dois limites.
  const recorte = recorteDeCompetencia(sp.de, sp.ate);

  // Fontes dos dados:
  //  - Orçado  → lançamento simplificado da versão de Orçamento ESCOLHIDA (3.8).
  //  - Realizado → medições da versão Atual, de TODOS os autores (0.5.4).
  // Só obras (kind "proj") têm medição.
  const obras = ctx.projects.filter((p) => p.kind === "proj");
  const selecao = lerSelecaoDeProjeto(obras, sp);
  const escolhido = selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido?.trabalho) {
    return <PedirProjeto titulo="Medição de Obra — Relatório CEF" projetos={obras} oQue="ver a medição" />;
  }
  const { project, versions } = escolhido;
  const orcamento = escolherOrcamento(versions, sp.orc);
  const budgetV = orcamento.escolhido;
  const atualV = escolhido.trabalho;

  const [budgetLines, medicoes] = await Promise.all([
    // Prompt H: o orçado do relatório respeita a situação da versão. 3.7: sem
    // Budget não há orçado — e a tela DIZ isso em vez de mostrar zeros.
    budgetV ? getBudgetLines(budgetV.id, { respeitarSituacao: true }) : Promise.resolve([]),
    getMedicoes(ctx.tenant.id, atualV.id),
  ]);
  const rel = montarRelatorioCef({ orcamento: budgetLines, medicoes, recorte });
  const semOrcamento = !budgetV;
  const estadosUsados = [...new Set(rel.linhas.map((l) => l.estado).filter((e) => e !== "ok"))] as LinhaCef["estado"][];

  const celula = (v: number | null) => (v == null ? "—" : brl0(v));

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · Orçado: ${budgetV ? `${budgetV.label} (${textoDaEscolha(orcamento.motivo)})` : "sem versão de Orçamento"} · Realizado: ${atualV.label}`}
        title="Medição de Obra — Relatório CEF"
        subtitle={rel.recorte.ativo ? `Recorte por competência: ${rel.recorte.de} a ${rel.recorte.ate} (orçado e medido dentro do intervalo)` : "Acumulado desde o início da obra: todo o orçado × todo o medido"}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <ProjectPicker projects={obras.map((p) => ({ id: p.id, label: p.name }))} selected={project.id} />
            {orcamento.opcoes.length > 1 && budgetV && (
              <OrcamentoPicker opcoes={orcamento.opcoes.map((v) => ({ id: v.id, label: v.label }))} selected={budgetV.id} />
            )}
            <RecorteDeCompetencia de={rel.recorte.de ?? ""} ate={rel.recorte.ate ?? ""} />
            <PrintButton label="Imprimir página" />
          </div>
        }
      />
      <LembrarProjeto projectId={project.id} />

      {semOrcamento && (
        // 3.7 — obra sem Budget: a ausência é declarada, não disfarçada em zeros.
        <p role="status" data-sem-orcamento className="mb-4 rounded-[8px] bg-[#fef3c7] px-3 py-2 text-[13px] text-[#92400e]">
          Esta obra <strong>não tem versão de Orçamento</strong>: a coluna Orçado fica vazia e o “% do orçado medido” não pode ser calculado. Crie o Orçamento em Orçamentos (ou em Configuração da Versão) para o relatório comparar.
        </p>
      )}
      {rel.retencao.atingida && (
        // 3.6 — retenção final: a Caixa libera até 95%; daí em diante mede-se sem liberação.
        <p role="status" data-retencao className="mb-4 rounded-[8px] bg-[#fee2e2] px-3 py-2 text-[13px] text-[#991b1b]">
          <strong>Retenção final:</strong> o medido já alcança {pct1(rel.totalPct ?? 0)} do orçado — acima de {rel.retencao.limite}% as medições continuam, mas a Caixa não libera mais recurso até a conclusão.
        </p>
      )}
      {rel.totalExcedeu && (
        <p role="status" data-excedente className="mb-4 rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[13px] text-[var(--color-ink2)]">
          O medido passa do orçado em <strong>{brl0(rel.excedente)}</strong> ({pct1(rel.totalPct ?? 0)} do orçado). O total não é truncado em 100%: confira os grupos marcados.
        </p>
      )}

      <Table>
        <THead>
          <tr>
            <TH>Grupo de Despesa (CEF)</TH>
            <TH className="text-right">Orçado</TH>
            <TH className="text-right">Realizado (medido)</TH>
            <TH className="text-right" title="Valor medido ÷ valor orçado. É razão financeira, não o percentual físico declarado no laudo.">
              % do orçado medido
            </TH>
          </tr>
        </THead>
        <tbody>
          {rel.linhas.map((r) => (
            <TR key={r.codigo} data-estado={r.estado}>
              <TD className="font-medium text-[var(--color-ink)]">
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">{r.codigo}</span> {r.nome}
                {r.excedeu && (
                  <Badge tone="warning" className="ml-2" title="Medido acima do orçado neste grupo.">
                    acima do orçado
                  </Badge>
                )}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">{celula(r.orcado)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">{celula(r.realizado)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]" title={r.estado === "ok" ? undefined : LEGENDA_ESTADO[r.estado]}>
                {r.pct == null ? "—" : pct1(r.pct)}
              </TD>
            </TR>
          ))}
          <TR>
            <TD className="font-semibold text-[var(--color-ink)]">Total</TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">{rel.totalOrcado > 0 ? brl0(rel.totalOrcado) : "—"}</TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">{rel.totalRealizado > 0 ? brl0(rel.totalRealizado) : "—"}</TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold" data-total-pct>
              {rel.totalPct == null ? "—" : pct1(rel.totalPct)}
              {rel.totalExcedeu && <span className="ml-1 text-[var(--color-warning)]">▲</span>}
            </TD>
          </TR>
        </tbody>
      </Table>

      <div className="mt-4 space-y-1 text-xs text-[var(--color-ink3)]">
        {estadosUsados.length > 0 && (
          <p>
            “—” significa: {estadosUsados.map((e) => LEGENDA_ESTADO[e]).join(" · ")}. Nunca quer dizer 0% executado.
          </p>
        )}
        <p>
          <strong>Orçado</strong> vem do lançamento simplificado da versão de Orçamento escolhida (despesas por grupo do plano de contas).{" "}
          <strong>Realizado</strong> é a soma das medições lançadas na versão <strong>Atual</strong>, de todos os autores.{" "}
          <strong>% do orçado medido</strong> é valor medido ÷ valor orçado — razão financeira, não o percentual físico do laudo.
          A coluna de percentuais de referência saiu: os números eram do empreendimento-piloto, não desta obra.
        </p>
        <p>
          <strong>Imprimir página</strong> abre a impressão do navegador com esta tabela; não gera o FRE / Cronograma CEF formatado.
        </p>
      </div>
    </>
  );
}
