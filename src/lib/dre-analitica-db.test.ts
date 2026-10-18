import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt AC3 — a DRE Analítica lê o mesmo que a DRE: com as mesmas despesas
 * (inclusive a categoria "Receita", a cancelada e a sem conta), a cascata
 * montada pela analítica bate com a da DRE, com e sem a definição nova.
 * Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt AC3 — DRE Analítica × DRE", async () => {
  const { db, schema } = await import("@/lib/db");
  const { versionInputsByMonth, versionAnaliticaByMonth } = await import("@/lib/dre-inputs");
  const { aggregateInputs, waterfall } = await import("@/lib/calc/dre-cascata");
  const { linhasDaDreAnalitica, somarPeriodo } = await import("@/lib/dre-analitica");
  let tenantId = "";
  let projectId = "";
  let atualId = "";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-prompt-ac3" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "Obra AC3" }).returning();
    projectId = p.id;
    const [a] = await db.insert(schema.versions).values({ tenantId, projectId, key: "atual", kind: "atual", label: "Atual", color: "#000", isDefault: true }).returning();
    atualId = a.id;
    await db.insert(schema.chartAccounts).values([
      { tenantId, code: "1.1", name: "Serviços técnicos", groupCode: "1", groupName: "Preliminares", kind: "cef" },
      { tenantId, code: "A.1", name: "Aluguel", groupCode: "A", groupName: "Administrativo", kind: "complementar" },
    ]);
    const base = { tenantId, versionId: atualId, status: "A pagar" };
    await db.insert(schema.despesas).values([
      { ...base, contaCef: "1.1", categoriaDre: "Custo Variável", valor: "1000", competencia: "09/2026", numDoc: "AC3-1" },
      { ...base, contaCef: "A.1", categoriaDre: "Despesa Fixa", valor: "300", competencia: "10/2026", numDoc: "AC3-2" },
      { ...base, contaCef: null, categoriaDre: "Custo Fixo", valor: "70", competencia: "10/2026", numDoc: "AC3-3" },
      { ...base, contaCef: null, categoriaDre: "Receita", valor: "45", competencia: "10/2026", numDoc: "AC3-4" },
      { ...base, contaCef: "1.1", categoriaDre: "Custo Variável", valor: "999", competencia: "10/2026", numDoc: "AC3-5", cancelado: true },
    ]);
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  for (const definicaoNova of [false, true]) {
    it(`a cascata da analítica é a da DRE (definição nova: ${definicaoNova})`, async () => {
      const contas = (await db.select().from(schema.chartAccounts).where(eq(schema.chartAccounts.tenantId, tenantId))).map((c) => ({ code: c.code, name: c.name, groupCode: c.groupCode, groupName: c.groupName }));
      for (const meses of [null, new Set(["10/2026"])]) {
        const dre = waterfall([aggregateInputs(await versionInputsByMonth(tenantId, atualId, projectId, { definicaoNova }), meses)]);
        const linhas = linhasDaDreAnalitica(somarPeriodo(await versionAnaliticaByMonth(tenantId, atualId, projectId, { definicaoNova }), meses), contas);
        for (const r of dre.rows) expect(linhas.find((l) => l.nivel === 0 && l.label === r.label)!.valor, `${r.label} ${meses ? "out" : "acum"}`).toBeCloseTo(r.value, 2);
      }
    });
  }

  it("a conta e o grupo aparecem; a cancelada não", async () => {
    const linhas = linhasDaDreAnalitica(somarPeriodo(await versionAnaliticaByMonth(tenantId, atualId, projectId), null), [
      { code: "1.1", name: "Serviços técnicos", groupCode: "1", groupName: "Preliminares" },
    ]);
    expect(linhas.find((l) => l.id === "cat:Custo Variável:g:1:c:1.1")?.valor).toBe(1000);
    expect(linhas.find((l) => l.id === "cat:Custo Fixo:g:—")?.valor).toBe(70);
  });
});
