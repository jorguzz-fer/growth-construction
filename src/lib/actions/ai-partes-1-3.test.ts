import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { sessaoRevogada } from "@/lib/context";
import { PAPEIS, PAPEIS_CRIACAO, papelValido } from "@/lib/papeis";

describe("sessaoRevogada (AI 1.3)", () => {
  const t = new Date("2026-09-29T12:00:00Z");
  it("sem troca registrada, nenhuma sessão cai (estado de todos no deploy)", () => {
    expect(sessaoRevogada(null, undefined)).toBe(false);
    expect(sessaoRevogada(null, 1)).toBe(false);
  });
  it("sessão aberta antes da troca cai; depois, vale", () => {
    expect(sessaoRevogada(t, t.getTime() - 1)).toBe(true);
    expect(sessaoRevogada(t, t.getTime())).toBe(false);
    expect(sessaoRevogada(t, t.getTime() + 1000)).toBe(false);
  });
  it("sessão sem instante de login (anterior a este código) cai quando há troca", () => {
    expect(sessaoRevogada(t, undefined)).toBe(true);
  });
});

describe("papéis — uma lista só (AI 3.5)", () => {
  it("criação oferece a mesma lista, sem owner", () => {
    expect(PAPEIS_CRIACAO).toEqual(PAPEIS.filter((p) => p !== "owner"));
    expect(papelValido("owner")).toBe(true);
    expect(papelValido("root")).toBe(false);
  });
});

const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));

describe.skipIf(!HAS_DB)("AI Partes 1 e 3 — integração", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const users = await import("./users");
  let tenantId = "";
  const U = { eu: "ai-eu", owner2: "ai-owner2", membro: "ai-membro" };

  const m = async (userId: string) =>
    (
      await db
        .select()
        .from(schema.memberships)
        .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, tenantId)))
    )[0];

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-ai" }).returning();
    tenantId = t.id;
    await db.insert(schema.users).values([
      { id: U.eu, email: "eu@ai.local" },
      { id: U.owner2, email: "owner2@ai.local" },
      { id: U.membro, email: "membro@ai.local" },
    ]);
    await db.insert(schema.memberships).values([
      { userId: U.eu, tenantId, role: "owner" },
      { userId: U.owner2, tenantId, role: "owner" },
      {
        userId: U.membro,
        tenantId,
        role: "membro",
        permissions: { dre: { ver: false, criar: false, editar: false, excluir: false }, rolling: { ver: true } } as never,
      },
    ]);
    ctxRef.current = {
      tenant: t, projects: [], project: null, versions: [], version: null,
      userId: U.eu, userEmail: "eu@ai.local", role: "owner", perms: defaultPermissions("owner"),
    };
  });

  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    for (const id of Object.values(U)) await db.delete(schema.users).where(eq(schema.users.id, id));
    await db.delete(schema.users).where(eq(schema.users.email, "novo@ai.local"));
  });

  it("3.2 — ninguém altera o próprio papel", async () => {
    const r = await users.changeRole(U.eu, "admin");
    expect(r.ok).toBe(false);
    expect((await m(U.eu)).role).toBe("owner");
  });

  it("papel inválido é recusado", async () => {
    expect((await users.changeRole(U.membro, "root" as never)).ok).toBe(false);
  });

  it("3.4 — manter personalizações mantém o jsonb", async () => {
    expect((await users.changeRole(U.membro, "contador", { manterPersonalizacoes: true })).ok).toBe(true);
    const x = await m(U.membro);
    expect(x.role).toBe("contador");
    expect(x.permissions).toHaveProperty("dre");
  });

  it("3.4 — voltar ao padrão descarta as telas e preserva a chave órfã, com log", async () => {
    expect((await users.changeRole(U.membro, "membro", { manterPersonalizacoes: false })).ok).toBe(true);
    const x = await m(U.membro);
    expect(x.permissions).toEqual({ rolling: { ver: true } });
    const [l] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "membership.role")))
      .orderBy(schema.auditLog.createdAt);
    expect(l).toBeTruthy();
  });

  it("3.3 — último owner: rebaixamentos simultâneos não deixam o tenant sem dono", async () => {
    // Visto por outro owner (owner2 rebaixa eu, eu rebaixa owner2 ao mesmo tempo).
    const ctxEu = ctxRef.current as { userId: string };
    const comoOwner2 = { ...(ctxRef.current as object), userId: U.owner2 };
    const a = (async () => { ctxRef.current = comoOwner2; return users.changeRole(U.eu, "admin"); })();
    ctxRef.current = { ...(comoOwner2 as object), userId: ctxEu.userId };
    const b = users.changeRole(U.owner2, "admin");
    const rs = await Promise.all([a, b]);
    const owners = (
      await db.select().from(schema.memberships).where(eq(schema.memberships.tenantId, tenantId))
    ).filter((x) => x.role === "owner");
    expect(owners.length).toBeGreaterThanOrEqual(1);
    expect(rs.filter((r) => r.ok).length).toBeLessThanOrEqual(1);
    // restaura
    await db.update(schema.memberships).set({ role: "owner" }).where(eq(schema.memberships.tenantId, tenantId));
    await db.update(schema.memberships).set({ role: "membro" }).where(eq(schema.memberships.userId, U.membro));
    ctxRef.current = { ...(comoOwner2 as object), userId: U.eu };
  });

  it("1.1/1.3 — redefinir senha marca provisória e o instante da troca", async () => {
    const antes = Date.now();
    expect((await users.resetMemberPassword(U.membro, "12345678")).ok).toBe(true);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, U.membro));
    expect(u.mustChangePassword).toBe(true);
    expect(u.passwordChangedAt!.getTime()).toBeGreaterThanOrEqual(antes - 1000);
  });

  it("1.4 — convite com senha curta é recusado e não cria usuário", async () => {
    const fd = new FormData();
    fd.set("email", "novo@ai.local");
    fd.set("password", "12345");
    const r = await users.inviteMember(fd);
    expect(r.ok).toBe(false);
    const us = await db.select().from(schema.users).where(eq(schema.users.email, "novo@ai.local"));
    expect(us).toHaveLength(0);
  });

  it("1.1 — convite com senha inicial nasce provisório; não entrega owner", async () => {
    const fd = new FormData();
    fd.set("email", "novo@ai.local");
    fd.set("password", "12345678");
    fd.set("role", "owner");
    expect((await users.inviteMember(fd)).ok).toBe(true);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, "novo@ai.local"));
    expect(u.mustChangePassword).toBe(true);
    expect((await m(u.id)).role).toBe("membro");
  });
});
