import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt A, PR 5 — Unidades, Permuta e Liberações de Obra sem "projeto
 * ativo". Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
const redirects: string[] = [];
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => void redirects.push(u) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Receitas com obra explícita", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { emptyPlan } = await import("@/lib/calc");
  const { saveUnit, importUnits } = await import("./units");
  const { addReembolso, addPermuta } = await import("./receitas");
  const tenants: string[] = [];
  let tA: typeof schema.tenants.$inferSelect;
  const p: Record<string, typeof schema.projects.$inferSelect> = {};
  const v: Record<string, typeof schema.versions.$inferSelect> = {};

  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, val] of Object.entries(campos)) f.set(k, val);
    return f;
  };
  const unidade = (projectId: string, code: string, id?: string) => ({
    id,
    projectId,
    code,
    valor: 1000,
    status: "Disponivel" as const,
    plan: emptyPlan(),
  });

  beforeAll(async () => {
    [tA] = await db.insert(schema.tenants).values({ name: "rec-A" }).returning();
    const [tB] = await db.insert(schema.tenants).values({ name: "rec-B" }).returning();
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

  const unidadesDe = (versionId: string) =>
    db.select().from(schema.units).where(eq(schema.units.versionId, versionId));

  // Desde a PR J-2 as actions de unidade devolvem { ok, error } e não navegam:
  // quem volta para a lista da obra é o formulário, com o resultado em mãos.
  it("saveUnit grava na Atual da obra escolhida e devolve id e código", async () => {
    const r = await saveUnit(unidade(p.a2.id, "U-201"));
    expect(r).toEqual({ ok: true, id: expect.any(String), code: "U-201" });
    expect((await unidadesDe(v.a2.id)).map((u) => u.code)).toEqual(["U-201"]);
    expect(await unidadesDe(v.a1.id)).toHaveLength(0);
  });

  it("saveUnit sem obra: recusa — na edição, não move a unidade", async () => {
    expect(await saveUnit(unidade("", "U-X"))).toEqual({ ok: false, error: expect.stringMatching(/Escolha o projeto/) });
    const [u] = await unidadesDe(v.a2.id);
    expect(await saveUnit(unidade("", "U-201-editada", u.id))).toEqual({ ok: false, error: expect.stringMatching(/Escolha o projeto/) });
    const [depois] = await db.select().from(schema.units).where(eq(schema.units.id, u.id));
    expect(depois.versionId).toBe(v.a2.id);
    expect(depois.code).toBe("U-201");
  });

  it("saveUnit com obra de outra empresa: recusa", async () => {
    expect(await saveUnit(unidade(p.b1.id, "U-B"))).toEqual({ ok: false, error: expect.stringMatching(/sem versão Atual/) });
    expect(await unidadesDe(v.b1.id)).toHaveLength(0);
  });

  it("importUnits exige a obra e grava nela", async () => {
    expect(await importUnits([{ code: "I-1" }])).toEqual({ ok: false, error: expect.stringMatching(/Escolha o projeto/) });
    expect(await importUnits([{ code: "I-1" }], p.a1.id)).toMatchObject({ ok: true, inseridas: 1 });
    expect((await unidadesDe(v.a1.id)).map((u) => u.code)).toEqual(["I-1"]);
  });

  it("addReembolso grava na obra do formulário; sem obra ou obra alheia, recusa", async () => {
    await expect(addReembolso(fd({ data: "2026-09-10", valor: "10" }))).rejects.toThrow(/Escolha o projeto/);
    await expect(addReembolso(fd({ projectId: p.b1.id, data: "2026-09-10", valor: "10" }))).rejects.toThrow(
      /Escolha o projeto/,
    );
    await addReembolso(fd({ projectId: p.a2.id, data: "2026-09-10", valor: "250.00" }));
    const rs = await db.select().from(schema.reembolsos).where(eq(schema.reembolsos.tenantId, tA.id));
    expect(rs).toHaveLength(1);
    expect(rs[0].versionId).toBe(v.a2.id);
    expect(redirects.at(-1)).toBe(`/reembolso?proj=${p.a2.id}`);
    const outro = await db.select().from(schema.reembolsos).where(eq(schema.reembolsos.versionId, v.b1.id));
    expect(outro).toHaveLength(0);
  });

  it("addPermuta grava na obra do formulário; sem obra, recusa", async () => {
    await expect(addPermuta(fd({ tipo: "Imóvel", estimado: "1" }))).rejects.toThrow(/Escolha o projeto/);
    await addPermuta(fd({ projectId: p.a1.id, tipo: "Imóvel", estimado: "300000" }));
    const ps = await db.select().from(schema.permutas).where(eq(schema.permutas.tenantId, tA.id));
    expect(ps).toHaveLength(1);
    expect(ps[0].versionId).toBe(v.a1.id);
    expect(redirects.at(-1)).toBe(`/permuta?proj=${p.a1.id}`);
  });

  it("versão congelada bloqueia Liberação e Permuta (decisão de 30/09/2026)", async () => {
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, v.a2.id));
    await expect(addReembolso(fd({ projectId: p.a2.id, data: "2026-09-11", valor: "1" }))).rejects.toThrow(/congelada/);
    await expect(addPermuta(fd({ projectId: p.a2.id, tipo: "Imóvel", estimado: "1" }))).rejects.toThrow(/congelada/);
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, v.a2.id));
  });
});
