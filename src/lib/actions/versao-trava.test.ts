import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/** Prompt AP, BAP-2 — a trava mudou de lugar, com permissão própria. Integração: só com DATABASE_URL. */
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

describe.skipIf(!HAS_DB)("Prompt AP — travar e destravar versão", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions, effectivePermissions } = await import("@/lib/permissions");
  const { travarVersao } = await import("./versao-trava");
  let tenantId = "";
  let outroTenant = "";
  let versaoId = "";
  let versaoAlheia = "";
  let t: { id: string };

  beforeAll(async () => {
    [t] = await db.insert(schema.tenants).values({ name: "trava-AP" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA" }).returning();
    const [v] = await db.insert(schema.versions).values({ projectId: p.id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    versaoId = v.id;
    const [o] = await db.insert(schema.tenants).values({ name: "trava-AP-outro" }).returning();
    outroTenant = o.id;
    const [po] = await db.insert(schema.projects).values({ tenantId: o.id, name: "OUTRA" }).returning();
    const [vo] = await db.insert(schema.versions).values({ projectId: po.id, tenantId: o.id, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    versaoAlheia = vo.id;
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    await db.delete(schema.tenants).where(eq(schema.tenants.id, outroTenant));
  });
  const versao = async (id: string) => (await db.select().from(schema.versions).where(eq(schema.versions.id, id)))[0];

  it("6 — owner trava e destrava; cada mudança tem log com de→para na mesma transação", async () => {
    ctxRef.current = { tenant: t, projects: [], userId: null, role: "owner", perms: defaultPermissions("owner") };
    expect(await travarVersao(versaoId, true)).toEqual({ ok: true });
    expect((await versao(versaoId)).locked).toBe(true);
    expect(await travarVersao(versaoId, false)).toEqual({ ok: true });
    expect((await versao(versaoId)).locked).toBe(false);
    const logs = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "version.lock")));
    expect(logs.map((l) => (l.meta as { changes: { locked: { de: boolean; para: boolean } } }).changes.locked)).toEqual(
      expect.arrayContaining([{ de: false, para: true }, { de: true, para: false }]),
    );
  });

  it("permissão própria: membro e contador não travam pelo padrão; override de `versaotrava` libera", async () => {
    ctxRef.current = { tenant: t, projects: [], userId: null, role: "membro", perms: defaultPermissions("membro") };
    expect(await travarVersao(versaoId, true)).toMatchObject({ ok: false, error: expect.stringMatching(/Sem permissão/) });
    ctxRef.current = { tenant: t, projects: [], userId: null, role: "contador", perms: effectivePermissions("contador", { versaotrava: { ver: true, criar: true, editar: true, excluir: true } }) };
    expect(await travarVersao(versaoId, true)).toMatchObject({ ok: false });
    ctxRef.current = { tenant: t, projects: [], userId: null, role: "membro", perms: effectivePermissions("membro", { versaotrava: { ver: true, criar: false, editar: true, excluir: false } }) };
    expect(await travarVersao(versaoId, true)).toEqual({ ok: true });
    expect(await travarVersao(versaoId, false)).toEqual({ ok: true });
  });

  it("versão de outra empresa não é encontrada nem alterada", async () => {
    ctxRef.current = { tenant: t, projects: [], userId: null, role: "owner", perms: defaultPermissions("owner") };
    expect(await travarVersao(versaoAlheia, true)).toMatchObject({ ok: false, error: expect.stringMatching(/não encontrada/) });
    expect((await versao(versaoAlheia)).locked).toBe(false);
  });

  it("só `locked` muda: rótulo, padrão, tipo e situação ficam", async () => {
    const antes = await versao(versaoId);
    await travarVersao(versaoId, true);
    const depois = await versao(versaoId);
    expect({ ...depois, locked: antes.locked }).toEqual(antes);
    await travarVersao(versaoId, false);
  });
});
