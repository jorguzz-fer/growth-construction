import "server-only";
import { chaveLigada } from "@/lib/chaves-tenant";
import { getMapaDeCategorias } from "@/lib/queries";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { categoriaHerdada, despesasQueMudam, mapaParaDespesas, type MudancaDeCategoria } from "@/lib/categoria-do-plano";

/**
 * Prompt DP — a categoria da DRE que a despesa grava. Com a chave
 * "despesa_categoria_do_plano" desligada, a escolhida (como antes). Ligada,
 * a da conta no Plano de Contas, qualquer que seja a enviada: a trava vale
 * no servidor, porque a Server Action é chamável diretamente.
 */
export async function categoriaParaGravar(
  tenantId: string,
  contaCef: string | null | undefined,
  escolhida: string | null | undefined,
): Promise<{ ok: true; categoria: string | null; herdada: boolean } | { ok: false; error: string }> {
  if (!(await chaveLigada(tenantId, "despesa_categoria_do_plano"))) return { ok: true, categoria: escolhida ?? null, herdada: false };
  return categoriaHerdada(await getMapaDeCategorias(tenantId), contaCef, escolhida);
}

/**
 * Prévia da chave (BDP-3): as despesas da versão Atual, não canceladas, que
 * mudam de categoria quando a chave ligar, por conta. Só leitura.
 */
export async function previaCategoriaDoPlano(tenantId: string): Promise<MudancaDeCategoria[]> {
  const [mapa, linhas] = await Promise.all([
    getMapaDeCategorias(tenantId),
    db
      .select({ contaCef: schema.despesas.contaCef, categoriaDre: schema.despesas.categoriaDre, valor: schema.despesas.valor })
      .from(schema.despesas)
      .innerJoin(schema.versions, eq(schema.versions.id, schema.despesas.versionId))
      .where(and(eq(schema.despesas.tenantId, tenantId), eq(schema.versions.kind, "atual"), eq(schema.despesas.cancelado, false))),
  ]);
  return despesasQueMudam(
    linhas.map((l) => ({ contaCef: l.contaCef, categoriaDre: l.categoriaDre, valor: Number(l.valor) })),
    mapaParaDespesas(mapa),
  );
}
