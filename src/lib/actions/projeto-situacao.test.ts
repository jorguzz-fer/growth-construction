import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt A, 25–27 — Ativo/Finalizado grava SÓ a situação e registra
 * { from, to }. Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getActiveContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {}, delete: () => {} }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));

describe.skipIf(!HAS_DB)("situação do projeto", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { setProjectSituacao, updateProject } = await import("./projects");
  let tenantId = "";
  let projeto: typeof schema.projects.$inferSelect;

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-sit" }).returning();
    tenantId = t.id;
    [projeto] = await db
      .insert(schema.projects)
      .values({ tenantId, name: "Obra X", status: "Em andamento", startDate: "01/01/2026", durationMonths: 24 })
      .returning();
    ctxRef.current = {
      tenant: t, projects: [projeto], project: projeto, versions: [], version: null,
      userId: null, role: "owner", perms: defaultPermissions("owner"),
    };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("projeto existente nasce sem classificação (nenhuma linha escrita)", () => {
    expect(projeto.situacao).toBeNull();
  });

  it("finalizar grava só a situação e registra { from, to }", async () => {
    expect((await setProjectSituacao(projeto.id, "Finalizado")).ok).toBe(true);
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projeto.id));
    expect(p.situacao).toBe("Finalizado");
    expect({ ...p, situacao: null }).toEqual(projeto); // nada mais mudou
    const [l] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "project.status.change")));
    expect(l.meta).toMatchObject({ from: null, to: "Finalizado" });
  });

  it("reativar volta a Ativo; repetir o mesmo valor não gera evento", async () => {
    ctxRef.current = { ...(ctxRef.current as object), projects: [{ ...projeto, situacao: "Finalizado" }] };
    expect((await setProjectSituacao(projeto.id, "Ativo")).ok).toBe(true);
    ctxRef.current = { ...(ctxRef.current as object), projects: [{ ...projeto, situacao: "Ativo" }] };
    expect((await setProjectSituacao(projeto.id, "Ativo")).ok).toBe(true);
    const ls = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "project.status.change")));
    expect(ls).toHaveLength(2);
  });

  it("valor fora do domínio é recusado pela action e pelo banco", async () => {
    expect((await setProjectSituacao(projeto.id, "Pausado" as never)).ok).toBe(false);
    const erro = await db
      .update(schema.projects)
      .set({ situacao: "Pausado" as never })
      .where(eq(schema.projects.id, projeto.id))
      .then(() => null, (e: unknown) => e);
    expect(erro).not.toBeNull();
  });

  it("projeto de outro tenant não é alcançado", async () => {
    ctxRef.current = { ...(ctxRef.current as object), projects: [] };
    expect((await setProjectSituacao(projeto.id, "Finalizado")).ok).toBe(false);
  });

  it("updateProject filtra o tenant também no where (Prompt A, 38)", async () => {
    const [outro] = await db.insert(schema.tenants).values({ name: "tenant-sit-2" }).returning();
    try {
      const [alheio] = await db
        .insert(schema.projects)
        .values({ tenantId: outro.id, name: "Obra de outra empresa" })
        .returning();
      // Simula a guarda em memória falhando: o projeto alheio "na lista".
      ctxRef.current = { ...(ctxRef.current as object), projects: [alheio] };
      await updateProject(alheio.id, { name: "Invadido" });
      const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, alheio.id));
      expect(p.name).toBe("Obra de outra empresa");
    } finally {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, outro.id));
    }
  });
});
