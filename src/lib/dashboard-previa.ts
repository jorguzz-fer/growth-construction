/**
 * Prompt AA, 10.3 — prévia da chave "dashboard_definicao_nova", por obra e
 * cartão a cartão: o valor exibido hoje, o pela definição nova e a diferença.
 * SOMENTE LEITURA, pelas MESMAS funções da tela (getStatusProjeto,
 * getIndicadoresObra, getUnits, getMonthlyRevenue) com a chave desligada e
 * ligada. Para "Entradas de caixa" e "Executado", é o que as consultas do
 * BAA-3 medem.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getIndicadoresObra, getMonthlyRevenue, getStatusProjeto, getUnits, getVersionsDoProjeto } from "@/lib/queries";
import { rotuloDaVersao } from "@/lib/dashboard-tela";

export interface LinhaDaPrevia {
  cartao: string;
  hoje: number | null;
  nova: number | null;
  /** Unidade do número: R$ ou % (0..100). */
  tipo: "brl" | "pct";
}

export interface PreviaDashboardObra {
  projeto: string;
  linhas: LinhaDaPrevia[];
}

const soma = (xs: { valor: string | number }[]) => xs.reduce((a, x) => a + Number(x.valor), 0);

export async function previaDashboardDefinicaoNova(
  tenantId: string,
  projetos: readonly { id: string; name: string }[],
): Promise<PreviaDashboardObra[]> {
  const out: PreviaDashboardObra[] = [];
  for (const p of projetos) {
    const [hoje, nova, indHoje, indNova, vs] = await Promise.all([
      getStatusProjeto(tenantId, [p.id]),
      getStatusProjeto(tenantId, [p.id], { definicaoNova: true }),
      getIndicadoresObra(tenantId, p.id),
      getIndicadoresObra(tenantId, p.id, { definicaoNova: true }),
      getVersionsDoProjeto(tenantId, p.id),
    ]);
    const linhas: LinhaDaPrevia[] = [
      { cartao: "Entradas de caixa", hoje: hoje.recebido, nova: nova.recebido, tipo: "brl" },
      { cartao: "Executado — denominador (Orçamento)", hoje: hoje.despesaPrevista, nova: nova.despesaPrevista, tipo: "brl" },
      {
        cartao: "% executado",
        hoje: hoje.despesaPrevista > 0 ? hoje.pctExecutado * 100 : null,
        nova: nova.despesaPrevista > 0 ? nova.pctExecutado * 100 : null,
        tipo: "pct",
      },
      { cartao: "Margem de contribuição", hoje: hoje.margemContribuicao, nova: nova.margemContribuicao, tipo: "brl" },
      {
        cartao: "Liberação acumulada",
        hoje: indHoje.liberacaoAcumulada,
        nova: indNova.temMedicao ? indNova.liberacaoAcumulada : null,
        tipo: "brl",
      },
      {
        cartao: "Saldo de financiamento",
        hoje: indHoje.saldoFinanciamento,
        nova: indNova.temMedicao ? indNova.saldoFinanciamento : null,
        tipo: "brl",
      },
    ];
    // 4.5 e 4.2 — por versão de planejamento: VGV e "A receber".
    const atual = vs.find((v) => v.kind === "atual") ?? null;
    const vgvAtual = atual ? soma(await getUnits(tenantId, atual.id)) : null;
    for (const v of vs.filter((x) => x.kind !== "atual")) {
      const nome = `${rotuloDaVersao(v).titulo} “${v.label}”`;
      const [unidades, receita, caixa] = await Promise.all([
        getUnits(tenantId, v.id),
        getMonthlyRevenue(v.id, p.id),
        db
          .select({ valor: schema.cashEntries.valor })
          .from(schema.cashEntries)
          .where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.cashEntries.versionId, v.id))),
      ]);
      const receitaProj = Object.values(receita).reduce((a, x) => a + x, 0);
      const realizado = caixa.filter((c) => Number(c.valor) > 0).reduce((a, c) => a + Number(c.valor), 0);
      linhas.push({ cartao: `VGV · ${nome}`, hoje: soma(unidades), nova: vgvAtual, tipo: "brl" });
      linhas.push({ cartao: `A receber · ${nome}`, hoje: Math.max(0, receitaProj - realizado), nova: receitaProj - realizado, tipo: "brl" });
    }
    out.push({ projeto: p.name, linhas });
  }
  return out;
}
