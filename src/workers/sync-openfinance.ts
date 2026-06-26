/**
 * Worker de sincronização Open Finance (Pluggy → lançamentos de caixa).
 *
 * Para cada conta bancária com `openFinanceId`, busca as transações recentes e
 * insere lançamentos de caixa (não conciliados) na versão "atual" do projeto
 * correspondente. Idempotência: usa a descrição+data para evitar duplicar.
 *
 * Execução: agendado pelo Coolify (Scheduled Tasks) ou BullMQ. Ver
 * docs/STACK.md §2 (Jobs) e §7 (Fase 4). Requer PLUGGY_* configurado.
 *
 * Uso manual: `npx tsx src/workers/sync-openfinance.ts`
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  authenticate,
  isPluggyConfigured,
  listTransactions,
} from "@/lib/openfinance/pluggy";

/** Converte ISO "YYYY-MM-DD" → "MM/DD/YYYY" (formato usado no caixa). */
function toAppDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

export async function syncOpenFinance(): Promise<{ inserted: number }> {
  if (!isPluggyConfigured()) {
    console.log("Pluggy não configurada — sync ignorado.");
    return { inserted: 0 };
  }

  const apiKey = await authenticate();
  const accounts = await db
    .select()
    .from(schema.bankAccounts)
    .where(isNotNull(schema.bankAccounts.openFinanceId));

  let inserted = 0;

  for (const acc of accounts) {
    // versão "atual" (caixa real) do(s) projeto(s) do tenant da conta
    const versions = await db
      .select({ id: schema.versions.id })
      .from(schema.versions)
      .where(
        and(
          eq(schema.versions.tenantId, acc.tenantId),
          eq(schema.versions.kind, "atual"),
        ),
      );
    if (versions.length === 0) continue;

    const txs = await listTransactions(apiKey, acc.openFinanceId!);

    for (const v of versions) {
      for (const t of txs) {
        const existing = await db
          .select({ id: schema.cashEntries.id })
          .from(schema.cashEntries)
          .where(
            and(
              eq(schema.cashEntries.versionId, v.id),
              eq(schema.cashEntries.descricao, t.description),
              eq(schema.cashEntries.data, toAppDate(t.date)),
            ),
          )
          .limit(1);
        if (existing.length > 0) continue;

        await db.insert(schema.cashEntries).values({
          versionId: v.id,
          tenantId: acc.tenantId,
          bankAccountId: acc.id,
          data: toAppDate(t.date),
          descricao: t.description,
          valor: String(t.amount),
          cat: t.category ?? "openfinance",
          rec: false,
        });
        inserted++;
      }
    }

    await db
      .update(schema.bankAccounts)
      .set({ lastSync: new Date() })
      .where(eq(schema.bankAccounts.id, acc.id));
  }

  console.log(`Open Finance sync: ${inserted} lançamentos inseridos.`);
  return { inserted };
}

// Permite execução direta via tsx.
if (process.argv[1]?.includes("sync-openfinance")) {
  syncOpenFinance()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Falha no sync:", err);
      process.exit(1);
    });
}
