import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt A, PR 8 — ações de versão sem "projeto ativo": a obra sai da própria
 * versão, validada no tenant. Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Versões com obra explícita", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { getVersionContext } = await import("@/lib/context");
  const { duplicateVersion, updateVersion, setDefaultVersion, deleteVersion } = await import("./versions");
  const tenants: string[] = [];
  let tA = "";
  const p: Record<string, typeof schema.projects.$inferSelect> = {};
  const v: Record<string, typeof schema.versions.$inferSelect> = {};

  async function versao(k: string, projeto: string, tenantId: string, kind: "atual" | "budget" | "forecast", isDefault = false) {
    [v[k]] = await db
      .insert(schema.versions)
      .values({ projectId: p[projeto].id, tenantId, key: kind, kind, label: `${projeto}-${kind}`, color: "#000", isDefault })
      .returning();
  }
  const versoesDe = (projectId: string) =>
    db.select().from(schema.versions).where(eq(schema.versions.projectId, projectId));

  beforeAll(async () => {
    const [a] = await db.insert(schema.tenants).values({ name: "ver-A" }).returning();
    const [b] = await db.insert(schema.tenants).values({ name: "ver-B" }).returning();
    tA = a.id;
    tenants.push(a.id, b.id);
    for (const [k, t, nome] of [
      ["a1", a.id, "OBRA 1"],
      ["a2", a.id, "OBRA 2"],
      ["b1", b.id, "OBRA B"],
    ] as const) {
      [p[k]] = await db.insert(schema.projects).values({ tenantId: t, name: nome }).returning();
    }
    await versao("a1atual", "a1", a.id, "atual", true);
    await versao("a2atual", "a2", a.id, "atual");
    await versao("a2forecast", "a2", a.id, "forecast", true);
    await versao("b1atual", "b1", b.id, "atual", true);
    ctxRef.current = {
      tenant: a,
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

  it("getVersionContext: a obra sai da versão; versão de outro tenant, null", async () => {
    const r = await getVersionContext(tA, v.a2forecast.id);
    expect(r?.project.id).toBe(p.a2.id);
    expect(r?.versions.map((x) => x.id).sort()).toEqual([v.a2atual.id, v.a2forecast.id].sort());
    expect(await getVersionContext(tA, v.b1atual.id)).toBeNull();
    expect(await getVersionContext(tA, "")).toBeNull();
  });

  it("updateVersion edita versão de qualquer obra do tenant (antes: só da obra do cookie)", async () => {
    await updateVersion(v.a2atual.id, { label: "Atual OBRA 2" });
    const [x] = await db.select().from(schema.versions).where(eq(schema.versions.id, v.a2atual.id));
    expect(x.label).toBe("Atual OBRA 2");
  });

  it("updateVersion não alcança versão de outro tenant", async () => {
    await updateVersion(v.b1atual.id, { label: "Invadida" });
    const [x] = await db.select().from(schema.versions).where(eq(schema.versions.id, v.b1atual.id));
    expect(x.label).toBe("b1-atual");
  });

  it("setDefaultVersion mexe só nas versões da obra da versão", async () => {
    await setDefaultVersion(v.a2atual.id);
    const a2 = await versoesDe(p.a2.id);
    expect(a2.find((x) => x.id === v.a2atual.id)?.isDefault).toBe(true);
    expect(a2.find((x) => x.id === v.a2forecast.id)?.isDefault).toBe(false);
    const [a1] = await versoesDe(p.a1.id);
    expect(a1.isDefault).toBe(true); // outra obra: intacta
    const [l] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tA), eq(schema.auditLog.action, "version.setDefault")));
    expect(l.meta).toMatchObject({ projeto: "OBRA 2" });
  });

  it("duplicateVersion cria a cópia na obra da versão de origem", async () => {
    await duplicateVersion(v.a2atual.id, "Cenário");
    const a2 = await versoesDe(p.a2.id);
    expect(a2.some((x) => x.kind === "custom" && x.label === "Cenário")).toBe(true);
    expect((await versoesDe(p.a1.id)).some((x) => x.kind === "custom")).toBe(false);
  });

  it("duplicateVersion recusa versão de outro tenant", async () => {
    await expect(duplicateVersion(v.b1atual.id, "X")).rejects.toThrow(/não encontrada/);
  });

  it("deleteVersion: versão de outro tenant intacta", async () => {
    const [custom] = await db
      .insert(schema.versions)
      .values({ projectId: p.b1.id, tenantId: tenants[1], key: "c", kind: "custom", label: "c", color: "#000" })
      .returning();
    await deleteVersion(custom.id);
    expect(await db.select().from(schema.versions).where(eq(schema.versions.id, custom.id))).toHaveLength(1);
  });
});
