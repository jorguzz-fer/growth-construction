import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Prompt AI2 — o convite grava as telas escolhidas (a sugestão do papel,
 * editada) como override; aceitar a sugestão não grava nada; readicionar quem
 * já era membro troca as personalizações antigas pela escolha nova (BAI2-1).
 * Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));

describe.skipIf(!HAS_DB)("Prompt AI2 · convite com as telas escolhidas", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions, effectivePermissions } = await import("@/lib/permissions");
  const { telasSugeridas } = await import("@/lib/telas-sugeridas");
  const users = await import("./users");
  let tenantId = "";
  const emails = ["c1@ai2.local", "c2@ai2.local"];
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const vinculo = async (email: string) => {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.userId, u.id), eq(schema.memberships.tenantId, tenantId)));
    return m;
  };
  const sugestao = (role: "contador" | "membro") => telasSugeridas(role).filter((t) => t.sugerida).map((t) => t.id);

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-ai2" }).returning();
    tenantId = t.id;
    ctxRef.current = { tenant: t, projects: [], userId: null, userEmail: "dono@ai2.local", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    await db.delete(schema.users).where(inArray(schema.users.email, emails));
  });

  it("aceitar a sugestão do papel não grava override", async () => {
    expect((await users.inviteMember(fd({ email: emails[0], role: "contador", telas: sugestao("contador").join(",") }))).ok).toBe(true);
    expect((await vinculo(emails[0])).permissions).toBeNull();
  });

  it("desmarcar a DRE do contador grava a negação; a tela fica negada", async () => {
    const telas = sugestao("contador").filter((id) => id !== "dre");
    expect((await users.inviteMember(fd({ email: emails[1], role: "contador", telas: telas.join(",") }))).ok).toBe(true);
    const m = await vinculo(emails[1]);
    expect(Object.keys(m.permissions ?? {})).toEqual(["dre"]);
    expect(effectivePermissions("contador", m.permissions).dre.ver).toBe(false);
  });

  it("readicionar como membro troca as personalizações antigas pela escolha nova", async () => {
    expect((await users.inviteMember(fd({ email: emails[1], role: "membro", telas: sugestao("membro").join(",") }))).ok).toBe(true);
    const m = await vinculo(emails[1]);
    expect(m.role).toBe("membro");
    expect(m.permissions).toBeNull();
  });

  it("sem o campo de telas, o convite fica como antes (só o papel)", async () => {
    await db.update(schema.memberships).set({ permissions: { dre: { ver: false, criar: false, editar: false, excluir: false } } }).where(eq(schema.memberships.tenantId, tenantId));
    expect((await users.inviteMember(fd({ email: emails[1], role: "contador" }))).ok).toBe(true);
    expect(Object.keys((await vinculo(emails[1])).permissions ?? {})).toEqual(["dre"]);
  });
});
