import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { AiDiagnosticPanel } from "@/components/app/ai-diagnostic-panel";
import { AssistenteProduto } from "@/components/app/assistente-produto";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { isAiConfigured, modelWarning, primaryModel } from "@/lib/ai/client";
import { rotuloModelo } from "@/lib/ai/modelos";
import { getUltimoTesteDeIa, getUsoDaIa } from "@/lib/queries";
import { LIMITES_DE_CONVERSA, ROTULO_DA_OPERACAO, avisoDeFallback, resumoPorOperacao } from "@/lib/ia-uso-regras";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("pt-BR");

export default async function DiagnosticoIaPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // Prompt AM, 6.2: sem permissão, o componente padrão — não página em branco.
  if (!can(ctx.perms, "diagnosticoia", "ver")) return <AccessDenied />;
  // 6.3: o bloco de configuração (teste, modelo, consumo) é de quem edita a tela.
  const configura = can(ctx.perms, "diagnosticoia", "editar");

  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [uso, ultimo] = configura ? await Promise.all([getUsoDaIa(ctx.tenant.id, desde), getUltimoTesteDeIa(ctx.tenant.id)]) : [[], null];
  const porOperacao = resumoPorOperacao(uso);
  const fallback = avisoDeFallback(uso);
  const modelo = primaryModel();

  return (
    <>
      {/* Prompt AM: a tela vira o Assistente — um chat que explica o sistema. A rota não muda. */}
      <PageHeader title="Assistente" subtitle="Como o sistema funciona — sem acesso aos dados da empresa" />
      <AssistenteProduto />
      {configura && (
        // 7.1 — o diagnóstico fica, como bloco secundário e recolhido, para quem configura.
        <details className="mt-6 space-y-4" data-diagnostico-ia>
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">Diagnóstico de IA (configuração)</summary>
          <div className="mt-4 space-y-4">
          {/* 7.3 — o estado, que antes só aparecia depois de clicar no teste. */}
          <Card data-estado-ia>
            <CardContent className="space-y-2 p-5 text-[13px]">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">Estado</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[var(--color-ink2)]">Chave de IA:</span>
                <Badge tone={isAiConfigured() ? "success" : "danger"}>{isAiConfigured() ? "presente" : "ausente"}</Badge>
              </div>
              <div className="text-[var(--color-ink2)]">
                Modelo configurado: <span className="font-[family-name:var(--font-mono)]">{modelo}</span> ({rotuloModelo(modelo)})
              </div>
              {modelWarning() && <p className="text-[12px] text-[var(--color-warning)]">{modelWarning()}</p>}
              <div className="text-[var(--color-ink2)]">
                Último teste:{" "}
                {ultimo ? (
                  <>
                    {ultimo.em.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por {ultimo.email ?? "—"} —{" "}
                    <Badge tone={ultimo.erro ? "danger" : "success"}>{ultimo.erro ? "falhou" : `ok (${ultimo.modelo ?? "?"})`}</Badge>
                  </>
                ) : (
                  "nenhum registrado"
                )}
              </div>
              {fallback && <p className="rounded-[8px] bg-[var(--color-warning)]/10 px-3 py-2 text-[12.5px] text-[var(--color-ink2)]">{fallback}</p>}
            </CardContent>
          </Card>

          {/* 5.1 — consumo dos últimos 30 dias, por operação. Só números: nenhum conteúdo é guardado. */}
          <Card data-consumo-ia>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">Consumo dos últimos 30 dias</h2>
              <p className="mb-3 text-[11.5px] text-[var(--color-ink3)]">
                Registro de quantas chamadas e quantos tokens, por operação. Nunca o conteúdo: pergunta, documento e resposta não são
                guardados. A chave é do servidor: todas as empresas consomem da mesma conta. As conversas têm limite de{" "}
                {LIMITES_DE_CONVERSA.porPessoaPorHora} perguntas por hora por pessoa e {LIMITES_DE_CONVERSA.porEmpresaPorHora} por
                empresa; as leituras de documento só são medidas.
              </p>
              {porOperacao.length === 0 ? (
                <p className="text-[12.5px] text-[var(--color-ink3)]">Nenhuma chamada registrada no período.</p>
              ) : (
                <Table aria-label="Consumo da IA por operação">
                  <THead>
                    <tr>
                      <TH>Operação</TH>
                      <TH className="text-right">Chamadas</TH>
                      <TH className="text-right">Falhas</TH>
                      <TH className="text-right">Tokens de entrada</TH>
                      <TH className="text-right">Lidos do cache</TH>
                      <TH className="text-right">Tokens de saída</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {porOperacao.map((r) => (
                      <TR key={r.operacao}>
                        <TD>{ROTULO_DA_OPERACAO[r.operacao] ?? r.operacao}</TD>
                        <TD className="text-right tabular-nums">{fmt(r.chamadas)}</TD>
                        <TD className="text-right tabular-nums">{fmt(r.erros)}</TD>
                        <TD className="text-right tabular-nums">{fmt(r.entrada)}</TD>
                        <TD className="text-right tabular-nums">{fmt(r.cacheLida)}</TD>
                        <TD className="text-right tabular-nums">{fmt(r.saida)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>

          <AiDiagnosticPanel />
          </div>
        </details>
      )}
    </>
  );
}
