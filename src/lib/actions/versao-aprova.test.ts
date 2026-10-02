import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/** Decisões de 01/10/2026 — aprovar e desaprovar com permissão própria. Integração: só com DATABASE_URL. */
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

describe.skipIf(!HAS_DB)("setVersionStatus — ordem e permissão própria", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions, effectivePermissions } = await import("@/lib/permissions");
  const { setVersionStatus } = await import("./planning");
  let t: { id: string };
  let v = "";
  let alheia = "";
  let outro = "";

  beforeAll(async () => {
    [t] = await db.insert(schema.tenants).values({ name: "aprova-0110" }).returning();
    const [p] = await db.insert(schema.projects).values({ tenantId: t.id, name: "OBRA" }).returning();
    v = (await db.insert(schema.versions).values({ projectId: p.id, tenantId: t.id, key: "b", kind: "budget", label: "Orç", color: "#000", status: "Rascunho" }).returning())[0].id;
    const [o] = await db.insert(schema.tenants).values({ name: "aprova-0110-outro" }).returning();
    outro = o.id;
    const [po] = await db.insert(schema.projects).values({ tenantId: o.id, name: "X" }).returning();
    alheia = (await db.insert(schema.versions).values({ projectId: po.id, tenantId: o.id, key: "b", kind: "budget", label: "Y", color: "#000", status: "Concluído" }).returning())[0].id;
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, t.id));
    await db.delete(schema.tenants).where(eq(schema.tenants.id, outro));
  });
  const status = async (id: string) => (await db.select().from(schema.versions).where(eq(schema.versions.id, id)))[0].status;
  const como = (role: string, perms: unknown) => (ctxRef.current = { tenant: t, projects: [], userId: null, role, perms });

  it("Rascunho → Aprovado é recusado; a ordem é Rascunho → Concluído → Aprovado", async () => {
    como("owner", defaultPermissions("owner"));
    expect(await setVersionStatus(v, "Aprovado")).toMatchObject({ ok: false, error: expect.stringMatching(/Conclua/) });
    expect(await status(v)).toBe("Rascunho");
    expect(await setVersionStatus(v, "Concluído")).toEqual({ ok: true });
    expect(await setVersionStatus(v, "Aprovado")).toEqual({ ok: true });
    expect(await status(v)).toBe("Aprovado");
  });

  it("quem só edita o Orçamento não desaprova; com versaoaprova, desaprova", async () => {
    const editor = effectivePermissions("membro", { budget: { ver: true, criar: true, editar: true, excluir: false } });
    como("membro", editor);
    expect(await setVersionStatus(v, "Concluído")).toMatchObject({ ok: false, error: expect.stringMatching(/aprovar ou desaprovar/) });
    expect(await status(v)).toBe("Aprovado");
    como("membro", effectivePermissions("membro", { budget: { ver: true, criar: true, editar: true, excluir: false }, versaoaprova: { ver: true, criar: false, editar: true, excluir: false } }));
    expect(await setVersionStatus(v, "Concluído")).toEqual({ ok: true });
    // e Concluído → Rascunho segue o editar da tela
    como("membro", editor);
    expect(await setVersionStatus(v, "Rascunho")).toEqual({ ok: true });
  });

  it("a troca fica na Auditoria com de → para; versão de outra empresa não é tocada", async () => {
    const logs = await db.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, t.id));
    expect(logs.filter((l) => l.action === "version.status").map((l) => l.meta)).toEqual(
      expect.arrayContaining([{ status: "Aprovado", de: "Concluído" }, { status: "Concluído", de: "Aprovado" }]),
    );
    como("owner", defaultPermissions("owner"));
    expect(await setVersionStatus(alheia, "Aprovado")).toMatchObject({ ok: false, error: expect.stringMatching(/não encontrada/) });
    expect(await status(alheia)).toBe("Concluído");
  });
});
