import { Fragment } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { CHAVES } from "@/lib/chaves";
import { getPlanejamentoNaoAprovado } from "@/lib/queries";
import { previaDreDefinicaoNova } from "@/lib/dre-inputs";
import { previaFluxoDefinicaoNova } from "@/lib/fluxo-caixa";
import { previaDashboardDefinicaoNova } from "@/lib/dashboard-previa";
import { previaResumoDefinicaoNova } from "@/lib/resumo-previa";
import { getBankAccounts } from "@/lib/queries";
import { saldoDisponivel } from "@/lib/contas-saldo";
import { brl, pct1 } from "@/lib/utils";
import { membroRestritoPorAmbiente } from "@/lib/membro-padrao";
import { definirChave } from "@/lib/actions/chaves";
import { FormComResultado } from "@/components/app/form-com-resultado";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Chaves de mudança por empresa (V2-BLOQUEIOS B4). Cada mudança que altera
 * número ou acesso nasce desligada; aqui se confere a prévia e se liga.
 */
export default async function ChavesPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "chaves", "ver")) return <AccessDenied />;
  const podeEditar = can(ctx.perms, "chaves", "editar");

  const linhas = await db
    .select()
    .from(schema.tenantFlags)
    .where(eq(schema.tenantFlags.tenantId, ctx.tenant.id));
  const estado = new Map(linhas.map((l) => [l.chave, l]));
  // Prompt H, 5.3: prévia da chave "rascunho_fora_dos_relatorios" (só leitura).
  const naoAprovadas = await getPlanejamentoNaoAprovado(ctx.tenant.id);
  const rascunhoLigada = estado.get("rascunho_fora_dos_relatorios")?.ligada ?? false;
  // Prompt AC, 10.3: prévia da chave "dre_definicao_nova" (só leitura).
  const previaDre = await previaDreDefinicaoNova(ctx.tenant.id, ctx.projects);
  const dreLigada = estado.get("dre_definicao_nova")?.ligada ?? false;
  // Prompt AD, 8.1: prévia da chave "fluxo_definicao_nova" (só leitura).
  const previaFluxo = await previaFluxoDefinicaoNova(ctx.tenant.id, ctx.projects, saldoDisponivel(await getBankAccounts(ctx.tenant.id)));
  // Prompt AA, 10.3: prévia da chave "dashboard_definicao_nova" (só leitura).
  const previaDashboard = await previaDashboardDefinicaoNova(ctx.tenant.id, ctx.projects);
  // Prompt AE, 6.2: prévia da chave "resumo_definicao_nova" (só leitura).
  const previaResumo = await previaResumoDefinicaoNova(ctx.tenant.id, ctx.projects);
  // A chave do membro também liga pela variável de ambiente, de antes do B4.
  const peloAmbiente: Record<string, boolean> = {
    membro_padrao_restrito: membroRestritoPorAmbiente(ctx.tenant.id),
  };

  return (
    <>
      <PageHeader title="Chaves de mudança" />
      <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-[var(--color-ink2)]">
        Mudanças que alteram número de relatório ou acesso entram <strong>desligadas</strong>.
        Desligada, a empresa continua exatamente como antes. Confira a prévia de cada uma e
        ligue quando estiver de acordo. Desligar volta ao comportamento anterior. Toda troca
        fica na Auditoria.
      </p>
      <div className="space-y-4">
        {CHAVES.map((c) => {
          const l = estado.get(c.id);
          const ligadaAqui = l?.ligada ?? false;
          const ambiente = peloAmbiente[c.id] ?? false;
          const ligada = ligadaAqui || ambiente;
          return (
            <Card key={c.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-[var(--color-ink)]">{c.titulo}</h2>
                  <Badge tone={ligada ? "success" : "neutral"}>{ligada ? "Ligada" : "Desligada"}</Badge>
                  {ambiente && (
                    <span className="text-[12px] text-[var(--color-ink3)]">
                      · ligada pela configuração do servidor (MEMBRO_PADRAO_RESTRITO)
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] text-[var(--color-ink2)]">{c.efeito}</p>
                <p className="mt-1 text-[12px] text-[var(--color-ink3)]">
                  Origem: {c.origem}
                  {l && (
                    <>
                      {" "}· última troca por {l.alteradaPor ?? "—"} em{" "}
                      {l.alteradaEm.toLocaleString("pt-BR")}
                    </>
                  )}
                </p>
                <p className="mt-2 text-[13px]">
                  Prévia:{" "}
                  <Link href={c.previa.href} className="text-[var(--color-accent2)] hover:underline">
                    {c.previa.rotulo}
                  </Link>
                </p>
                {podeEditar &&
                  (ligadaAqui ? (
                    <FormComResultado
                      action={definirChave}
                      aoConcluir="recarregar"
                      sucesso="Chave desligada."
                      className="mt-3 flex items-center gap-3"
                    >
                      <input type="hidden" name="chave" value={c.id} />
                      <input type="hidden" name="ligar" value="0" />
                      <Button type="submit" size="sm" variant="outline">
                        Desligar
                      </Button>
                    </FormComResultado>
                  ) : (
                    <FormComResultado
                      action={definirChave}
                      aoConcluir="recarregar"
                      sucesso="Chave ligada."
                      className="mt-3 flex flex-wrap items-center gap-3"
                    >
                      <input type="hidden" name="chave" value={c.id} />
                      <input type="hidden" name="ligar" value="1" />
                      <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink2)]">
                        <input type="checkbox" name="viPrevia" />
                        Conferi a prévia e concordo com o efeito
                      </label>
                      <Button type="submit" size="sm">
                        Ligar
                      </Button>
                    </FormComResultado>
                  ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6" id="previa-rascunho">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Prévia · Orçamento em Rascunho não entra em relatório
          </h2>
          <p className="mt-1.5 text-[13px] text-[var(--color-ink2)]">
            Versões de Orçamento e Previsão Atualizada que <strong>não estão Aprovadas</strong> nesta empresa.
            {rascunhoLigada
              ? " Com a chave ligada, os valores abaixo já NÃO entram em DRE, Fluxo de Caixa, Dashboard, Consolidado, Projeção, Resumo, Medição e Contabilidade."
              : " Ao ligar a chave, os valores abaixo deixam de entrar em DRE, Fluxo de Caixa, Dashboard, Consolidado, Projeção, Resumo, Medição e Contabilidade."}{" "}
            A versão Atual (movimento real) nunca é filtrada. Nada é apagado: cada versão continua inteira na tela dela, e basta Aprovar para voltar a contar.
          </p>
          {naoAprovadas.length === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--color-ink3)]">Nenhuma versão de planejamento fora de Aprovado: ligar a chave não muda nenhum número hoje.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12.5px]" aria-label="Versões de planejamento não aprovadas">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
                    <th className="py-1.5 pr-3">Projeto</th>
                    <th className="py-1.5 pr-3">Versão</th>
                    <th className="py-1.5 pr-3">Tipo</th>
                    <th className="py-1.5 pr-3">Situação</th>
                    <th className="py-1.5 pr-3 text-right">Receitas</th>
                    <th className="py-1.5 text-right">Despesas</th>
                  </tr>
                </thead>
                <tbody>
                  {naoAprovadas.map((v) => (
                    <tr key={v.versionId} className="border-b border-[var(--color-line)]/60">
                      <td className="py-1.5 pr-3">{v.projeto}</td>
                      <td className="py-1.5 pr-3">
                        <Link href={`/${v.kind}?p=${v.projectId}&v=${v.versionId}`} className="text-[var(--color-accent2)] hover:underline">
                          {v.nome}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3">{v.kind === "budget" ? "Orçamento" : "Previsão Atualizada"}</td>
                      <td className="py-1.5 pr-3">{v.status}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{brl(v.receitas)}</td>
                      <td className="py-1.5 text-right tabular-nums">{brl(v.despesas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="mt-6" id="previa-dre">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Prévia · DRE pela definição nova</h2>
          <p className="mt-1.5 text-[13px] text-[var(--color-ink2)]">
            Resultado Final da versão Atual de cada projeto, {dreLigada ? "como estava antes da chave e como está agora" : "hoje e pela definição nova"}.
            Mudam: despesa classificada como “Receita” sai da receita; multa, juros e outros encargos vão para a
            competência da despesa. Na Empresa toda, projeto sem o cenário escolhido deixa de entrar com o Realizado.
            Nada é gravado nem reclassificado.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]" aria-label="Prévia da DRE pela definição nova">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
                  <th className="py-1.5 pr-3">Projeto</th>
                  <th className="py-1.5 pr-3 text-right">Resultado hoje</th>
                  <th className="py-1.5 pr-3 text-right">Definição nova</th>
                  <th className="py-1.5 pr-3 text-right">Diferença</th>
                  <th className="py-1.5">O que muda</th>
                </tr>
              </thead>
              <tbody>
                {previaDre.map((p) => (
                  <tr key={p.projeto} className="border-b border-[var(--color-line)]/60 align-top">
                    <td className="py-1.5 pr-3">{p.projeto}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{brl(p.hoje)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{brl(p.nova)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{brl(p.nova - p.hoje)}</td>
                    <td className="py-1.5 text-[12px] text-[var(--color-ink2)]">
                      {p.meses.length === 0 && p.comoReceita.length === 0 && p.semCenario.length === 0 ? (
                        "nada"
                      ) : (
                        <ul className="space-y-0.5">
                          {p.meses.slice(0, 6).map((m) => (
                            <li key={m.mes}>
                              {m.mes}: {brl(m.hoje)} → {brl(m.nova)}
                            </li>
                          ))}
                          {p.meses.length > 6 && <li>e mais {p.meses.length - 6} competência(s)</li>}
                          {p.comoReceita.map((r, i) => (
                            <li key={`r-${i}`}>
                              Sai da receita: {r.numDoc ?? "sem PED"} · {r.competencia ?? "sem competência"} · {brl(r.valor)}
                            </li>
                          ))}
                          {p.semCenario.length > 0 && (
                            <li>
                              Sem {p.semCenario.map((k) => (k === "budget" ? "Orçamento" : k === "forecast" ? "Previsão Atualizada" : "Realizado")).join(" e ")}:
                              na Empresa toda, fica fora dessa coluna.
                            </li>
                          )}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-6" id="previa-fluxo">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Prévia · Fluxo de Caixa pela definição nova</h2>
          <p className="mt-1.5 text-[13px] text-[var(--color-ink2)]">
            Por obra (versão Atual), de onde parte e onde termina o saldo acumulado hoje e pela definição nova. Hoje toda obra parte
            do saldo das contas da empresa; pela nova, parte do caixa da própria obra e corre pelo realizado nos meses fechados. Mostra
            também a permuta que sai das colunas de Orçamento e Previsão e o caixa gravado fora da Atual. Nada é gravado.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]" aria-label="Prévia do Fluxo de Caixa pela definição nova">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
                  <th className="py-1.5 pr-3">Obra</th>
                  <th className="py-1.5 pr-3 text-right">Partida hoje</th>
                  <th className="py-1.5 pr-3 text-right">Partida nova</th>
                  <th className="py-1.5 pr-3 text-right">Acumulado hoje</th>
                  <th className="py-1.5 pr-3 text-right">Acumulado novo</th>
                  <th className="py-1.5 pr-3 text-right">Permuta no planejamento</th>
                  <th className="py-1.5 text-right">Caixa fora da Atual</th>
                </tr>
              </thead>
              <tbody>
                {previaFluxo.map((p) => (
                  <tr key={p.projeto} className="border-b border-[var(--color-line)]/60">
                    <td className="py-1.5 pr-3">{p.projeto}{!p.temAtual && <span className="ml-1 text-[11px] text-[var(--color-warning)]">sem Atual: sem realizado</span>}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{brl(p.partidaHoje)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{brl(p.partidaNova)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{brl(p.acumuladoHoje)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{brl(p.acumuladoNovo)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{brl(p.permutaNoPlanejamento)}</td>
                    <td className="py-1.5 text-right tabular-nums">{brl(p.caixaForaDaAtual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-6" id="previa-dashboard">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Prévia · Dashboard pela definição nova</h2>
          <p className="mt-1.5 text-[13px] text-[var(--color-ink2)]">
            Por obra, cartão a cartão, sem filtro de período: o número exibido hoje, o pela definição nova e a diferença. Entradas de
            caixa passam a somar só a Atual; o Executado passa a ser dividido por um Orçamento só; a margem usa a mesma janela de
            competências nos dois lados; VGV vem da Atual; A receber do planejamento mostra o negativo. Nada é gravado.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]" aria-label="Prévia do Dashboard pela definição nova">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
                  <th className="py-1.5 pr-3">Obra · cartão</th>
                  <th className="py-1.5 pr-3 text-right">Hoje</th>
                  <th className="py-1.5 pr-3 text-right">Definição nova</th>
                  <th className="py-1.5 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {previaDashboard.map((o) => (
                  <Fragment key={o.projeto}>
                    <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface2)]">
                      <td colSpan={4} className="py-1.5 pr-3 font-semibold text-[var(--color-ink)]">{o.projeto}</td>
                    </tr>
                    {o.linhas.map((l) => {
                      const f = (n: number | null) => (n == null ? "—" : l.tipo === "pct" ? pct1(n) : brl(n));
                      const dif = l.hoje != null && l.nova != null ? l.nova - l.hoje : null;
                      return (
                        <tr key={l.cartao} className="border-b border-[var(--color-line)]/60" data-previa-dashboard={l.cartao}>
                          <td className="py-1.5 pr-3 pl-3">{l.cartao}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{f(l.hoje)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{f(l.nova)}</td>
                          <td className={`py-1.5 text-right tabular-nums ${dif ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink4)]"}`}>
                            {dif == null ? (l.hoje == null && l.nova == null ? "—" : "vira “—”") : dif === 0 ? "igual" : `${dif > 0 ? "+" : "−"}${l.tipo === "pct" ? pct1(Math.abs(dif)) : brl(Math.abs(dif))}`}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-6" id="previa-resumo">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Prévia · Resumo Executivo pela definição nova</h2>
          <p className="mt-1.5 text-[13px] text-[var(--color-ink2)]">
            Por obra (versão Atual): cada indicador hoje e pela definição nova. Mudam os sinais (S1, S2 e S3 passam a multiplicar
            pela quantidade), a permuta e a liberação canceladas (saem), a permuta por tipo (compara com o cadastro e ganha &ldquo;outros
            tipos&rdquo;) e o total de unidades (passa a contar as Permutadas). Com a chave ligada, a tela troca a tabela pelos blocos
            Vendas, Exposição e Atenção. Nada é gravado.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]" aria-label="Prévia do Resumo Executivo pela definição nova">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
                  <th className="py-1.5 pr-3">Obra · indicador</th>
                  <th className="py-1.5 pr-3 text-right">Hoje</th>
                  <th className="py-1.5 pr-3 text-right">Definição nova</th>
                  <th className="py-1.5 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {previaResumo.map((o) => (
                  <Fragment key={o.projeto}>
                    <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface2)]">
                      <td colSpan={4} className="py-1.5 pr-3 font-semibold text-[var(--color-ink)]">
                        {o.projeto}
                        {!o.temAtual && <span className="ml-1 text-[11px] font-normal text-[var(--color-warning)]">sem versão Atual: nada a comparar</span>}
                      </td>
                    </tr>
                    {o.linhas.map((l) => {
                      const contagem = l.label.startsWith("Total de unidades");
                      const f = (n: number | null) => (n == null ? "—" : contagem ? String(n) : brl(n));
                      const dif = l.hoje != null && l.nova != null ? l.nova - l.hoje : null;
                      return (
                        <tr key={l.label} className="border-b border-[var(--color-line)]/60" data-previa-resumo={l.label}>
                          <td className="py-1.5 pr-3 pl-3">{l.label}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{f(l.hoje)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{f(l.nova)}</td>
                          <td className={`py-1.5 text-right tabular-nums ${dif ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink4)]"}`}>
                            {dif == null ? (l.hoje == null && l.nova == null ? "—" : l.hoje == null ? "linha nova" : "vira “—”") : dif === 0 ? "igual" : `${dif > 0 ? "+" : "−"}${contagem ? Math.abs(dif) : brl(Math.abs(dif))}`}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
