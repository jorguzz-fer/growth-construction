import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt AD3 — o Fluxo Analítico lê o mesmo que o Fluxo de Caixa: as saídas
 * de `saidasDoFluxo` somam, mês a mês, o que `flowMaps` mostra (parcelas,
 * despesas sem parcela, cancelada fora). Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("@/lib/context", async (orig) => ({ ...(await orig<typeof import("@/lib/context")>()), getTenantContext: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt AD3 — Fluxo Analítico × Fluxo de Caixa", async () => {
  const { db, schema } = await import("@/lib/db");
  const { flowMaps, saidasDoFluxo, entradasDoFluxo } = await import("./fluxo-caixa");
  const { linhasDoFluxoAnalitico } = await import("./fluxo-analitico");
  let tenantId = "";
  let projectId = "";
  let atual: typeof schema.versions.$inferSelect;

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "fluxo-analitico" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA AD3" }).returning();
    projectId = p.id;
    [atual] = await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    await db.insert(schema.chartAccounts).values([
      { tenantId, code: "1.1", name: "Serviços técnicos", groupCode: "1", groupName: "Preliminares", kind: "cef" },
      { tenantId, code: "A.1", name: "Aluguel", groupCode: "A", groupName: "Administrativo", kind: "complementar" },
    ]);
    const base = { tenantId, versionId: atual.id, status: "A pagar" };
    await db.insert(schema.despesas).values([
      { ...base, contaCef: "1.1", valor: "400", vencimento: "10/05/2026", competencia: "10/2026" },
      { ...base, contaCef: "A.1", valor: "250", vencimento: "11/10/2026", competencia: "11/2026" },
      { ...base, contaCef: null, valor: "30", vencimento: "11/12/2026", competencia: "11/2026" },
      { ...base, contaCef: "1.1", valor: "999", vencimento: "10/06/2026", competencia: "10/2026", cancelado: true },
    ] as never);
    // Parcelada: as parcelas valem, não a despesa.
    const [parc] = await db.insert(schema.despesas).values({ ...base, contaCef: "1.1", valor: "600", vencimento: "10/20/2026", competencia: "10/2026" } as never).returning();
    await db.insert(schema.despesaParcelas).values([
      { tenantId, despesaId: parc.id, numeroParcela: 1, valorOriginal: "300", vencimento: "10/20/2026", status: "A pagar" },
      { tenantId, despesaId: parc.id, numeroParcela: 2, valorOriginal: "300", vencimento: "11/20/2026", status: "A pagar" },
    ] as never);
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("as saídas somam, mês a mês, o que o Fluxo mostra", async () => {
    const m = await flowMaps(atual, projectId);
    const lista = await saidasDoFluxo(atual);
    const porMes: Record<string, number> = {};
    for (const s of lista) porMes[s.mes] = (porMes[s.mes] || 0) + s.valor;
    expect(porMes).toEqual(m.saidas);
    expect(m.saidas).toEqual({ "10/2026": 700, "11/2026": 580 });
  });

  it("o analítico abre por bloco e conta e fecha com o total", async () => {
    const contas = (await db.select().from(schema.chartAccounts).where(eq(schema.chartAccounts.tenantId, tenantId))).map((c) => ({ code: c.code, name: c.name, groupCode: c.groupCode, groupName: c.groupName, kind: c.kind }));
    const ent = await entradasDoFluxo(atual, projectId);
    const total = (x: Record<string, number>) => Object.values(x).reduce((a, v) => a + v, 0);
    const linhas = linhasDoFluxoAnalitico({ vendas: total(ent.vendas), permuta: total(ent.permuta), saidas: await saidasDoFluxo(atual) }, contas);
    const val = (id: string) => linhas.find((l) => l.id === id)?.valor;
    expect(val("saidas")).toBe(1280);
    expect(val("saidas:cef:g:1:c:1.1")).toBe(1000);
    expect(val("saidas:complementar")).toBe(250);
    expect(val("saidas:sem")).toBe(30);
  });
});
