import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt A, PR 7 — Planejamento sem "projeto ativo": o lançamento de medição
 * exige a obra e vai para a versão de trabalho dela. Integração: só com
 * DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
  getActiveContext: async () => {
    throw new Error("Planejamento não pode mais depender do projeto ativo");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Medição com obra explícita", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addMedicao } = await import("./medicao");
  const tenants: string[] = [];
  const p: Record<string, typeof schema.projects.$inferSelect> = {};
  const v: Record<string, typeof schema.versions.$inferSelect> = {};
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, val] of Object.entries(campos)) f.set(k, val);
    return f;
  };
  const base = { competencia: "09/2026", grupo: "01|Serviços preliminares", valor: "1000" };
  const medicoesDe = (versionId: string) =>
    db.select().from(schema.medicoes).where(eq(schema.medicoes.versionId, versionId));

  beforeAll(async () => {
    const [tA] = await db.insert(schema.tenants).values({ name: "plan-A" }).returning();
    const [tB] = await db.insert(schema.tenants).values({ name: "plan-B" }).returning();
    tenants.push(tA.id, tB.id);
    for (const [k, t, nome] of [
      ["a1", tA.id, "OBRA 1"],
      ["a2", tA.id, "OBRA 2"],
      ["b1", tB.id, "OBRA B"],
    ] as const) {
      [p[k]] = await db.insert(schema.projects).values({ tenantId: t, name: nome }).returning();
      [v[k]] = await db
        .insert(schema.versions)
        .values({ projectId: p[k].id, tenantId: t, key: "atual", kind: "atual", label: "Atual", color: "#000" })
        .returning();
    }
    ctxRef.current = {
      tenant: tA,
      projects: [p.a1, p.a2],
      userId: null,
      userEmail: null,
      role: "owner",
      perms: defaultPermissions("owner"),
    };
  });
  afterAll(async () => {
    for (const id of tenants) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });

  it("sem obra: recusa — não cai na obra do cookie", async () => {
    await expect(addMedicao(fd(base))).rejects.toThrow(/Escolha o projeto/);
    expect(await medicoesDe(v.a1.id)).toHaveLength(0);
  });

  it("obra de outra empresa: recusa", async () => {
    await expect(addMedicao(fd({ ...base, projectId: p.b1.id }))).rejects.toThrow(/Escolha o projeto/);
    expect(await medicoesDe(v.b1.id)).toHaveLength(0);
  });

  it("grava na Atual da obra informada (a segunda da lista)", async () => {
    await addMedicao(fd({ ...base, projectId: p.a2.id }));
    expect(await medicoesDe(v.a2.id)).toHaveLength(1);
    expect(await medicoesDe(v.a1.id)).toHaveLength(0);
  });

  it("versão congelada bloqueia", async () => {
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, v.a1.id));
    await expect(addMedicao(fd({ ...base, projectId: p.a1.id }))).rejects.toThrow(/congelada/);
  });
});
