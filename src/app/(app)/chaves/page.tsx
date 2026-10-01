import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { CHAVES } from "@/lib/chaves";
import { getPlanejamentoNaoAprovado } from "@/lib/queries";
import { brl } from "@/lib/utils";
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
    </>
  );
}
