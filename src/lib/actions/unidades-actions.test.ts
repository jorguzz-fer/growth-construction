import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt J, PR J-2 — 5.1 (retorno legível) e 5.2 (auditoria com o plano).
 * Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Unidades — actions com retorno legível (Prompt J, PR J-2)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { emptyPlan } = await import("@/lib/calc");
  const { saveUnit, importUnits, deleteUnit } = await import("./units");
  let tenantId = "";
  let projectId = "";
  let versionId = "";
  let tenant: typeof schema.tenants.$inferSelect;
  let project: typeof schema.projects.$inferSelect;
  const dono = () => ({ tenant, projects: [project], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") });
  const plano = () => ({ ...emptyPlan(), usarAS: true, AS: { val: 1000, venc: "10/01/2026", n: 1, usarS1: false } });
  const auditoria = async (action: string) =>
    db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, action)));

  beforeAll(async () => {
    [tenant] = await db.insert(schema.tenants).values({ name: "unid-J2" }).returning();
    tenantId = tenant.id;
    [project] = await db.insert(schema.projects).values({ tenantId, name: "OBRA J2" }).returning();
    projectId = project.id;
    const [v] = await db
      .insert(schema.versions)
      .values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" })
      .returning();
    versionId = v.id;
    ctxRef.current = dono();
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("5.1 · saveUnit devolve erro legível: sem projeto, sem permissão, versão congelada, valor inválido", async () => {
    const base = { code: "J2-1", valor: 1000, status: "Disponivel" as const, plan: emptyPlan() };
    expect(await saveUnit({ ...base })).toEqual({ ok: false, error: expect.stringMatching(/projeto/) });
    expect(await saveUnit({ ...base, projectId, valor: -5 })).toEqual({ ok: false, error: expect.stringMatching(/inválido/) });
    ctxRef.current = { ...dono(), perms: { ...defaultPermissions("owner"), unidades: { ver: true, criar: false, editar: false, excluir: false } } };
    expect(await saveUnit({ ...base, projectId })).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    ctxRef.current = dono();
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    expect(await saveUnit({ ...base, projectId })).toEqual({ ok: false, error: expect.stringMatching(/congelada/) });
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
    expect(await db.select().from(schema.units).where(eq(schema.units.tenantId, tenantId))).toHaveLength(0);
  });

  it("5.1 · saveUnit grava e devolve id e código; edição de id inexistente não 'salva' em silêncio; auditoria traz a origem", async () => {
    const r = await saveUnit({ projectId, code: " J2-1 ", valor: 1000, status: "Vendido", mesVenda: "09/25/2026", plan: plano() });
    expect(r.ok).toBe(true);
    const { id, code } = r as { id: string; code: string };
    expect(code).toBe("J2-1");
    const [u] = await db.select().from(schema.units).where(eq(schema.units.id, id));
    expect(u.versionId).toBe(versionId);
    expect(u.mesVenda).toBe("09/25/2026");
    expect((await auditoria("unit.create"))[0].meta).toMatchObject({ code: "J2-1", status: "Vendido", origem: "formulario" });

    const r2 = await saveUnit({ id, projectId, code: "J2-1", valor: 1200, status: "Vendido", mesVenda: "09/25/2026", plan: plano(), origem: "assistente" });
    expect(r2).toEqual({ ok: true, id, code: "J2-1" });
    expect((await auditoria("unit.update"))[0].meta).toMatchObject({ origem: "assistente" });

    const r3 = await saveUnit({ id: "00000000-0000-0000-0000-000000000000", projectId, code: "X", valor: 1, status: "Disponivel", plan: emptyPlan() });
    expect(r3).toEqual({ ok: false, error: expect.stringMatching(/não encontrada/) });
  });

  it("5.1 · importUnits devolve { ok, error } e conta o que inseriu", async () => {
    expect(await importUnits([{ code: "I-1" }])).toEqual({ ok: false, error: expect.stringMatching(/projeto/) });
    expect(await importUnits([{ code: "I-1", valor: 10 }, { code: "  " }, { code: "I-2" }], projectId)).toEqual({ ok: true, inseridas: 2 });
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    expect(await importUnits([{ code: "I-3" }], projectId)).toEqual({ ok: false, error: expect.stringMatching(/congelada/) });
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
  });

  it("5.2 · a auditoria da exclusão guarda o plano de pagamento removido", async () => {
    const r = await saveUnit({ projectId, code: "J2-DEL", valor: 500, status: "Disponivel", plan: plano() });
    const id = (r as { id: string }).id;
    expect(await deleteUnit(id, "J2-DEL")).toEqual({ ok: true });
    const [l] = await auditoria("unit.delete");
    expect(l.meta).toMatchObject({ code: "J2-DEL", valor: "500.00", status: "Disponivel", paymentPlan: { usarAS: true, AS: { val: 1000 } } });
  });
});
