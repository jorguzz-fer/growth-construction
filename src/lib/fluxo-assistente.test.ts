import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/** Prompt AD, Parte 4 — os lados do assistente pelo banco. Integração: só com DATABASE_URL. */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("@/lib/context", async (orig) => ({ ...(await orig<typeof import("@/lib/context")>()), getTenantContext: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt AD — assistente do Fluxo (banco)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { flowMaps, flowMapsRealizado, ladosDoFluxo } = await import("./fluxo-caixa");
  let tenantId = "";
  let outroTenant = "";
  const obra = { id: "", name: "OBRA A" };
  const semOrc = { id: "", name: "OBRA B" };
  let budget: typeof schema.versions.$inferSelect;
  let atual: typeof schema.versions.$inferSelect;

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "fluxo-assistente" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: obra.name }).returning();
    obra.id = p.id;
    [budget] = await db.insert(schema.versions).values({ projectId: p.id, tenantId, key: "budget", kind: "budget", label: "Orç 2026", color: "#000" }).returning();
    [atual] = await db.insert(schema.versions).values({ projectId: p.id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    await db.insert(schema.budgetLines).values({ tenantId, versionId: budget.id, kind: "receita", rowKey: "Vendas", dreCategory: "Receita", mes: "02/2026", valor: "100" } as never);
    await db.insert(schema.cashEntries).values({ tenantId, versionId: atual.id, data: "02/05/2026", valor: "40", descricao: "real" } as never);
    // OBRA B: só Atual, sem Orçamento — com caixa, que NÃO pode entrar no lado comparado.
    const [p2] = await db.insert(schema.projects).values({ tenantId, name: semOrc.name }).returning();
    semOrc.id = p2.id;
    const [a2] = await db.insert(schema.versions).values({ projectId: p2.id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    await db.insert(schema.cashEntries).values({ tenantId, versionId: a2.id, data: "02/07/2026", valor: "999", descricao: "real B" } as never);
    // Outro tenant com o mesmo projeto-id não existe: o filtro de tenant devolve vazio.
    const [t2] = await db.insert(schema.tenants).values({ name: "fluxo-assistente-2" }).returning();
    outroTenant = t2.id;
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    await db.delete(schema.tenants).where(eq(schema.tenants.id, outroTenant));
  });

  it("um projeto: o plano e o realizado são os mesmos mapas da tabela", async () => {
    const [orc, prev] = await ladosDoFluxo(tenantId, [obra], false);
    expect(orc.ausente).toBeNull();
    expect(orc.versao).toBe("“Orç 2026”");
    expect(orc.plano).toEqual(await flowMaps(budget, obra.id));
    expect(orc.plano!.entradas["02/2026"]).toBe(100);
    const r = await flowMapsRealizado(atual.id);
    expect(orc.realizado).toEqual({ entradas: r.entradas, saidas: r.saidas });
    expect(orc.previstoAtual).toEqual(await flowMaps(atual, obra.id));
    // sem Previsão: ausente com o motivo, nunca mapas zerados
    expect(prev.ausente).toBe("OBRA A não tem Previsão Atualizada.");
    expect(prev.plano).toBeNull();
    expect(prev.realizado).toBeNull();
  });

  it("4.5.3 — Empresa toda: projeto sem o cenário fica fora dos DOIS lados e entra na contagem", async () => {
    const [orc] = await ladosDoFluxo(tenantId, [obra, semOrc], false);
    expect(orc.cobertura).toBe("Orçamento: 1 de 2 projeto(s) entram; 1 sem Orçamento ficam fora dos dois lados.");
    expect(orc.versao).toBe("de cada projeto, 1 de 2");
    // o caixa de 999 da OBRA B não entra no realizado comparado
    expect(Object.values(orc.realizado!.entradas)).toEqual([40]);
  });

  it("4.7 — tenant errado: nenhuma versão lida, tudo ausente", async () => {
    const lados = await ladosDoFluxo(outroTenant, [obra], false);
    expect(lados.every((l) => l.ausente && !l.plano && !l.realizado)).toBe(true);
  });

  it("nunca grava: as tabelas lidas ficam iguais", async () => {
    const contar = async () => ({
      caixa: (await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.tenantId, tenantId))).length,
      linhas: (await db.select().from(schema.budgetLines).where(eq(schema.budgetLines.tenantId, tenantId))).length,
      versoes: (await db.select().from(schema.versions).where(eq(schema.versions.tenantId, tenantId))).length,
    });
    const antes = await contar();
    await ladosDoFluxo(tenantId, [obra, semOrc], true);
    expect(await contar()).toEqual(antes);
  });
});
