/**
 * Custo Realizado (versão Atual) × Orçado de UMA obra, pela MESMA leitura da
 * DRE (`versionInputsByMonth`, seguindo a chave da DRE). O Orçamento é o do
 * cartão Orçado x Realizado (o padrão, senão o mais antigo) e, com a chave do
 * rascunho, só conta Aprovado. Usado pelo bloco Atenção do Resumo (BAE-1) e
 * pelo chat (Prompt E, Etapa 2). `orcado` null = sem Orçamento para comparar.
 */
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBudgetLines } from "@/lib/queries";
import { versionInputsByMonth } from "@/lib/dre-inputs";
import { chaveLigada } from "@/lib/chaves-tenant";
import { entraNosRelatorios } from "@/lib/situacao-versao";
import { custoAteOMes, custoNosMeses } from "@/lib/resumo-blocos";

/** Até `ate` ("MM/YYYY", inclusive) ou só nas competências de `meses`. */
export type RecorteDoCusto = { ate: string } | { meses: ReadonlySet<string> };

export async function custoOrcadoRealizado(tenantId: string, projectId: string, recorte: RecorteDoCusto | string, rascunhoFora: boolean) {
  const r: RecorteDoCusto = typeof recorte === "string" ? { ate: recorte } : recorte;
  const somar = (porMes: Parameters<typeof custoAteOMes>[0]) => ("ate" in r ? custoAteOMes(porMes, r.ate) : custoNosMeses(porMes, r.meses));
  const versoes = await db
    .select({ id: schema.versions.id, kind: schema.versions.kind, isDefault: schema.versions.isDefault, status: schema.versions.status })
    .from(schema.versions)
    .where(and(eq(schema.versions.tenantId, tenantId), eq(schema.versions.projectId, projectId)))
    .orderBy(asc(schema.versions.createdAt));
  const budgets = versoes.filter((v) => v.kind === "budget");
  const padrao = budgets.find((v) => v.isDefault) ?? budgets[0] ?? null;
  const budget = padrao && entraNosRelatorios(padrao, rascunhoFora) ? padrao : null;
  const atual = versoes.find((v) => v.kind === "atual") ?? null;
  if (!atual) return null;
  const linhasDoOrcamento = budget ? await getBudgetLines(budget.id) : [];
  const definicaoNova = await chaveLigada(tenantId, "dre_definicao_nova");
  const [porMesOrcado, porMesAtual] = await Promise.all([
    budget ? versionInputsByMonth(tenantId, budget.id, projectId, { definicaoNova }) : Promise.resolve(null),
    versionInputsByMonth(tenantId, atual.id, projectId, { definicaoNova }),
  ]);
  const temOrcamento = !!porMesOrcado && linhasDoOrcamento.length > 0;
  return {
    orcado: temOrcamento ? somar(porMesOrcado) : null,
    semOrcamento: temOrcamento ? undefined : padrao && !budget ? ("fora_dos_relatorios" as const) : ("sem_lancamento" as const),
    realizado: somar(porMesAtual),
  };
}
