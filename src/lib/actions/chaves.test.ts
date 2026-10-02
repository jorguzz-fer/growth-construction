import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";

/** B4 — chave de mudança por empresa. Integração: só com DATABASE_URL. */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));

describe.skipIf(!HAS_DB)("Chaves de mudança por empresa (B4)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { effectivePermissions } = await import("@/lib/permissions");
  const { definirChave } = await import("./chaves");
  const { membroRestritoNoTenant, opcoesDoTenant } = await import("@/lib/membro-padrao");
  const tenants: string[] = [];
  let tA: typeof schema.tenants.$inferSelect;
  let tB: typeof schema.tenants.$inferSelect;
  const ctx = (tenant: typeof tA, role: "owner" | "admin" | "membro") => ({
    tenant,
    projects: [],
    userId: null,
    userEmail: "quem@teste",
    role,
    perms: effectivePermissions(role, null),
  });
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  beforeAll(async () => {
    [tA] = await db.insert(schema.tenants).values({ name: "chaves-A" }).returning();
    [tB] = await db.insert(schema.tenants).values({ name: "chaves-B" }).returning();
    tenants.push(tA.id, tB.id);
  });
  afterAll(async () => {
    for (const id of tenants) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });
  afterEach(() => {
    delete process.env.MEMBRO_PADRAO_RESTRITO;
  });

  it("sem linha no banco: desligada (comportamento de antes)", async () => {
    expect(await membroRestritoNoTenant(tA.id)).toBe(false);
    expect(await opcoesDoTenant(tA.id)).toEqual({ membroRestrito: false });
  });

  it("membro não liga, mesmo com override na matriz (tela só de owner/admin)", async () => {
    ctxRef.current = {
      ...ctx(tA, "membro"),
      perms: effectivePermissions("membro", { chaves: { ver: true, criar: true, editar: true, excluir: true } }),
    };
    const r = await definirChave(fd({ chave: "membro_padrao_restrito", ligar: "1", viPrevia: "on" }));
    expect(r.ok).toBe(false);
    expect(await membroRestritoNoTenant(tA.id)).toBe(false);
  });

  it("ligar exige declarar que viu a prévia", async () => {
    ctxRef.current = ctx(tA, "admin");
    const r = await definirChave(fd({ chave: "membro_padrao_restrito", ligar: "1" }));
    expect(r).toEqual({ ok: false, error: "Confira a prévia e marque que a viu antes de ligar." });
    expect(await membroRestritoNoTenant(tA.id)).toBe(false);
  });

  it("chave fora do catálogo é recusada", async () => {
    ctxRef.current = ctx(tA, "owner");
    expect((await definirChave(fd({ chave: "qualquer", ligar: "1", viPrevia: "on" }))).ok).toBe(false);
  });

  it("owner liga: vale só para a empresa dele, e a auditoria guarda de → para", async () => {
    ctxRef.current = ctx(tA, "owner");
    expect(await definirChave(fd({ chave: "membro_padrao_restrito", ligar: "1", viPrevia: "on" }))).toEqual({ ok: true });
    expect(await membroRestritoNoTenant(tA.id)).toBe(true);
    expect(await membroRestritoNoTenant(tB.id)).toBe(false);
    const [l] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tA.id), eq(schema.auditLog.action, "chave.ligar")));
    expect(l.meta).toMatchObject({ chave: "membro_padrao_restrito", de: false, para: true });
  });

  it("ligar de novo não grava outra linha de auditoria", async () => {
    await definirChave(fd({ chave: "membro_padrao_restrito", ligar: "1", viPrevia: "on" }));
    const ls = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tA.id), eq(schema.auditLog.action, "chave.ligar")));
    expect(ls).toHaveLength(1);
  });

  it("desligar não exige prévia e volta ao de antes", async () => {
    expect(await definirChave(fd({ chave: "membro_padrao_restrito", ligar: "0" }))).toEqual({ ok: true });
    expect(await membroRestritoNoTenant(tA.id)).toBe(false);
  });

  it("a variável de ambiente de antes continua ligando", async () => {
    process.env.MEMBRO_PADRAO_RESTRITO = tB.id;
    expect(await membroRestritoNoTenant(tB.id)).toBe(true);
    expect(await membroRestritoNoTenant(tA.id)).toBe(false);
  });
  describe("decisão de 01/10: prévia exportada antes de ligar", () => {
    it("chave com prévia não liga sem a planilha exportada", async () => {
      ctxRef.current = ctx(tB, "owner");
      const r = await definirChave(fd({ chave: "dashboard_definicao_nova", ligar: "1", viPrevia: "on" }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("Exporte a prévia");
    });

    it("a rota exporta a prévia em .xlsx e registra quem exportou; aí liga e a auditoria leva a exportação", async () => {
      ctxRef.current = ctx(tB, "owner");
      const { GET } = await import("@/app/(app)/chaves/previa/route");
      const res = await GET(new Request("http://x/chaves/previa?chave=dashboard_definicao_nova"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toMatch(/previa-dashboard_definicao_nova-\d{4}-\d{2}-\d{2}\.xlsx/);
      const [exp] = await db
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.tenantId, tB.id), eq(schema.auditLog.action, "chave.previa.exportar")));
      expect(exp.entityId).toBe("dashboard_definicao_nova");
      expect(await definirChave(fd({ chave: "dashboard_definicao_nova", ligar: "1", viPrevia: "on" }))).toEqual({ ok: true });
      const [l] = await db
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.tenantId, tB.id), eq(schema.auditLog.action, "chave.ligar")));
      expect(l.meta).toMatchObject({ chave: "dashboard_definicao_nova", para: true, previaExportadaPor: "—" });
    });

    it("a exportação de outra chave não serve, e a antiga demais também não", async () => {
      ctxRef.current = ctx(tB, "owner");
      await db.insert(schema.auditLog).values({
        tenantId: tB.id,
        action: "chave.previa.exportar",
        entity: "tenant_flag",
        entityId: "fluxo_definicao_nova",
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      });
      expect((await definirChave(fd({ chave: "fluxo_definicao_nova", ligar: "1", viPrevia: "on" }))).ok).toBe(false);
      expect((await definirChave(fd({ chave: "resumo_definicao_nova", ligar: "1", viPrevia: "on" }))).ok).toBe(false);
    });

    it("rota: chave sem prévia exportável é recusada; membro sem ver também", async () => {
      const { GET } = await import("@/app/(app)/chaves/previa/route");
      ctxRef.current = ctx(tB, "owner");
      expect((await GET(new Request("http://x/chaves/previa?chave=membro_padrao_restrito"))).status).toBe(400);
      ctxRef.current = ctx(tB, "membro");
      expect((await GET(new Request("http://x/chaves/previa?chave=dre_definicao_nova"))).status).toBe(403);
    });
  });
});
