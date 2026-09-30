import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt A, 10 a 14 e 38 — contexto só de empresa e resolução explícita de
 * projeto e versão. Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const sessao: { email: string | null; cookie: string | undefined } = { email: null, cookie: undefined };
vi.mock("@/lib/auth", () => ({
  auth: async () => (sessao.email ? { user: { email: sessao.email }, authAt: Date.now() } : null),
  unstable_update: async () => null,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (k === "gtc_project" && sessao.cookie ? { value: sessao.cookie } : undefined),
  }),
}));

describe.skipIf(!HAS_DB)("contexto de tenant e resolução explícita", async () => {
  const { db, schema } = await import("@/lib/db");
  const ctxMod = await import("@/lib/context");
  const { getTenantContext, getProjectContext, getProjectVersion } = ctxMod;
  const { effectivePermissions } = await import("@/lib/permissions");
  const tenants: string[] = [];
  let tA = "";
  let tB = "";
  const proj: Record<string, typeof schema.projects.$inferSelect> = {};
  const ver: Record<string, typeof schema.versions.$inferSelect> = {};
  const sufixo = Math.random().toString(36).slice(2, 8);

  async function usuario(tenantId: string, email: string, role: "owner" | "membro" | "contador") {
    const [u] = await db.insert(schema.users).values({ email, name: email }).returning();
    await db.insert(schema.memberships).values({ userId: u.id, tenantId, role });
    return u;
  }
  async function versao(projectId: string, tenantId: string, kind: "atual" | "budget" | "forecast") {
    const [v] = await db
      .insert(schema.versions)
      .values({ projectId, tenantId, key: kind, kind, label: kind, color: "#000" })
      .returning();
    return v;
  }

  beforeAll(async () => {
    const [a] = await db.insert(schema.tenants).values({ name: "ctx-A" }).returning();
    const [b] = await db.insert(schema.tenants).values({ name: "ctx-B" }).returning();
    const [vazio] = await db.insert(schema.tenants).values({ name: "ctx-vazio" }).returning();
    tA = a.id;
    tB = b.id;
    tenants.push(a.id, b.id, vazio.id);
    // Criados fora da ordem numérica, de propósito.
    for (const [k, name, kind] of [
      ["o28", "OBRA 28", "proj"],
      ["esc", "DESPESAS GERAIS", "office"],
      ["o3", "OBRA 3", "proj"],
    ] as const) {
      [proj[k]] = await db.insert(schema.projects).values({ tenantId: tA, name, kind }).returning();
    }
    [proj.b1] = await db.insert(schema.projects).values({ tenantId: tB, name: "OBRA B" }).returning();
    ver.o28atual = await versao(proj.o28.id, tA, "atual");
    ver.o28budget = await versao(proj.o28.id, tA, "budget");
    ver.o3atual = await versao(proj.o3.id, tA, "atual");
    ver.b1atual = await versao(proj.b1.id, tB, "atual");
    await usuario(tA, `dono-${sufixo}@a.test`, "owner");
    await usuario(tA, `cont-${sufixo}@a.test`, "contador");
    await usuario(vazio.id, `vazio-${sufixo}@a.test`, "owner");
  });
  afterAll(async () => {
    for (const id of tenants) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
    for (const e of ["dono", "cont", "vazio"]) {
      await db.delete(schema.users).where(eq(schema.users.email, `${e}-${sufixo}@a.test`));
    }
  });

  it("getTenantContext: sem sessão, null", async () => {
    sessao.email = null;
    expect(await getTenantContext()).toBeNull();
  });

  it("getTenantContext: só o tenant, projetos ordenados, sem projeto escolhido", async () => {
    sessao.email = `dono-${sufixo}@a.test`;
    const ctx = await getTenantContext();
    expect(ctx?.tenant.id).toBe(tA);
    expect(ctx?.projects.map((p) => p.name)).toEqual(["OBRA 3", "OBRA 28", "DESPESAS GERAIS"]);
    expect(ctx).not.toHaveProperty("project");
    expect(ctx).not.toHaveProperty("version");
  });

  it("getTenantContext: cookie de projeto não influi", async () => {
    sessao.cookie = proj.o28.id;
    const ctx = await getTenantContext();
    expect(ctx).not.toHaveProperty("project");
    sessao.cookie = undefined;
  });

  it("permissões = papel + overrides do vínculo, como sempre (seção 39)", async () => {
    for (const [e, role] of [["dono", "owner"], ["cont", "contador"]] as const) {
      sessao.email = `${e}-${sufixo}@a.test`;
      const ctx = await getTenantContext();
      expect(ctx?.role).toBe(role);
      expect(ctx?.perms).toEqual(effectivePermissions(role, null));
    }
  });

  it("tenant sem projeto: getTenantContext responde, com a lista vazia", async () => {
    sessao.email = `vazio-${sufixo}@a.test`;
    expect((await getTenantContext())?.projects).toEqual([]);
  });

  it("não existe mais contexto de projeto ativo (Prompt A, 47)", () => {
    expect("getActiveContext" in ctxMod).toBe(false);
    expect("ACTIVE_PROJECT_COOKIE" in ctxMod).toBe(false);
  });

  it("getProjectContext: projeto do tenant", async () => {
    expect((await getProjectContext(tA, proj.o3.id))?.id).toBe(proj.o3.id);
  });

  it("getProjectContext: projeto de outro tenant é recusado (teste 21)", async () => {
    expect(await getProjectContext(tA, proj.b1.id)).toBeNull();
    expect(await getProjectContext(tB, proj.o3.id)).toBeNull();
  });

  it("getProjectContext: id vazio ou inexistente não escolhe outro", async () => {
    expect(await getProjectContext(tA, "")).toBeNull();
    expect(await getProjectContext(tA, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("getProjectVersion: por tipo e por id, dentro do projeto", async () => {
    expect((await getProjectVersion(tA, proj.o28.id, { kind: "atual" }))?.id).toBe(ver.o28atual.id);
    expect((await getProjectVersion(tA, proj.o28.id, { kind: "budget" }))?.id).toBe(ver.o28budget.id);
    expect((await getProjectVersion(tA, proj.o28.id, { id: ver.o28budget.id }))?.id).toBe(ver.o28budget.id);
  });

  it("getProjectVersion: versão de outro projeto é recusada (teste 20)", async () => {
    expect(await getProjectVersion(tA, proj.o3.id, { id: ver.o28atual.id })).toBeNull();
  });

  it("getProjectVersion: versão de outro tenant é recusada, mesmo com o projeto dela", async () => {
    expect(await getProjectVersion(tA, proj.b1.id, { id: ver.b1atual.id })).toBeNull();
    expect(await getProjectVersion(tA, proj.b1.id, { kind: "atual" })).toBeNull();
  });

  it("getProjectVersion: tipo ausente não cai em outro tipo", async () => {
    expect(await getProjectVersion(tA, proj.o3.id, { kind: "forecast" })).toBeNull();
  });
});
