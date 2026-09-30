import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { statusLiberaUnidade, type VinculosDoCliente } from "@/lib/clientes-regras";

type Executor = Pick<typeof db, "select">;

/**
 * Vínculos que impedem excluir um cliente (Prompt M, 6.1), contados no
 * tenant. Usado pela action (dentro da transação) e pela ficha, que mostra
 * de antemão o que bloqueia.
 */
export async function vinculosDoCliente(
  exec: Executor,
  tenantId: string,
  cliente: { id: string; unitCode: string | null; statusContrato: string | null },
): Promise<VinculosDoCliente> {
  const qtd = async (
    t:
      | typeof schema.contasReceber
      | typeof schema.documents
      | typeof schema.projects
      | typeof schema.recebimentosTerceiros,
  ) => {
    const [r] = await exec
      .select({ n: count() })
      .from(t)
      .where(and(eq(t.clienteId, cliente.id), eq(t.tenantId, tenantId)));
    return Number(r?.n ?? 0);
  };
  return {
    unidadeComContratoAtivo:
      cliente.unitCode && !statusLiberaUnidade(cliente.statusContrato) ? cliente.unitCode : null,
    contasReceber: await qtd(schema.contasReceber),
    documentos: await qtd(schema.documents),
    obrasComoCliente: await qtd(schema.projects),
    recebimentosTerceiros: await qtd(schema.recebimentosTerceiros),
  };
}
