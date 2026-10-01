import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt O, PR O-3 — editar (4.3), cancelar (4.2), consultas sem canceladas
 * (4.4) e não regressão dos totais (seção 9). Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Liberações de Obra — editar e cancelar (Prompt O, PR O-3)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addReembolso, updateReembolso, cancelarReembolso } = await import("./receitas");
  const { getReembolsos, reembToCalc, getMonthlyRevenue } = await import("@/lib/queries");
  const { calcTotals, reembursementsByMonth } = await import("@/lib/calc");
  const { excelSerial } = await import("@/lib/utils");
  let tenantId = "";
  let projectId = "";
  let versionId = "";
  let tenant: unknown;
  let projects: unknown[] = [];
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const comPerms = (role: string) => {
    ctxRef.current = { tenant, projects, userId: null, userEmail: "quem@teste", role, perms: defaultPermissions(role as "owner") };
  };
  const logs = (action: string) => db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, action)));

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "lib-O3" }).returning();
    tenantId = t.id;
    tenant = t;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA O3" }).returning();
    projectId = p.id;
    projects = [p];
    const [v] = await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    versionId = v.id;
    comPerms("owner");
    expect((await addReembolso(fd({ projectId, data: "09/10/2026", origem: "CEF · medição 03/2026", valor: "1000" }))).ok).toBe(true);
    expect((await addReembolso(fd({ projectId, data: "10/10/2026", origem: "CEF · medição 04/2026", valor: "500" }))).ok).toBe(true);
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("4.3 · editar valida como o lançamento, grava valor/data/origem/obs (serial acompanha a data) e registra anterior × novo; sem mudança não há linha", async () => {
    const [a] = await getReembolsos(tenantId, versionId);
    const campos = { id: a.id, data: "09/10/2026", origem: "CEF · medição 03/2026", valor: "1000" };
    expect(await updateReembolso(fd({ ...campos, valor: "0" }))).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await updateReembolso(fd({ ...campos, data: "" }))).toEqual({ ok: false, error: expect.stringMatching(/data/) });
    expect(await updateReembolso(fd({ ...campos, data: "09/12/2026", valor: "1.250,00", obs: "corrigido" }))).toEqual({ ok: true, id: a.id });
    const [dep] = await db.select().from(schema.reembolsos).where(eq(schema.reembolsos.id, a.id));
    expect(dep).toMatchObject({ data: "09/12/2026", valor: "1250.00", obs: "corrigido", origem: "CEF · medição 03/2026" });
    expect(dep.serial).toBe(excelSerial("09/12/2026"));
    const [l] = await logs("reembolso.update");
    const changes = (l.meta as { changes: Record<string, { de: unknown; para: unknown }> }).changes;
    expect(changes.valor).toEqual({ de: 1000, para: 1250 });
    expect(changes.data).toEqual({ de: "09/10/2026", para: "09/12/2026" });
    expect(changes.obs).toEqual({ de: null, para: "corrigido" });
    expect(changes.origem).toBeUndefined();
    expect((await updateReembolso(fd({ ...campos, data: "09/12/2026", valor: "1250", obs: "corrigido" }))).ok).toBe(true);
    expect(await logs("reembolso.update")).toHaveLength(1);
    comPerms("viewer");
    expect(await updateReembolso(fd(campos))).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    comPerms("owner");
  });

  it("seção 9 · enquanto ninguém cancela, os totais são os de hoje; 4.2/4.4 · cancelar exige motivo, preserva o registro e tira a liberação de getReembolsos, de reembursementsByMonth, de calcTotals e da receita mensal", async () => {
    const antes = await getReembolsos(tenantId, versionId);
    expect(antes).toHaveLength(2);
    expect(reembursementsByMonth(reembToCalc(antes))).toEqual({ "09/2026": 1250, "10/2026": 500 });
    expect(calcTotals([], [], reembToCalc(antes)).reemb).toBe(1750);
    const receitaAntes = await getMonthlyRevenue(versionId, projectId);
    expect(receitaAntes["10/2026"]).toBe(500);
    const [, b] = antes;
    expect(await cancelarReembolso(b.id, " ")).toEqual({ ok: false, error: expect.stringMatching(/motivo/) });
    expect(await cancelarReembolso(b.id, "lançada em duplicidade")).toEqual({ ok: true, id: b.id });
    expect(await cancelarReembolso(b.id, "de novo")).toEqual({ ok: false, error: expect.stringMatching(/já cancelada/) });
    expect(await updateReembolso(fd({ id: b.id, data: "10/10/2026", origem: "x", valor: "1" }))).toEqual({ ok: false, error: expect.stringMatching(/cancelada/) });
    const [row] = await db.select().from(schema.reembolsos).where(eq(schema.reembolsos.id, b.id));
    expect(row).toMatchObject({ cancelado: true, canceladoPor: "quem@teste", motivoCancelamento: "lançada em duplicidade", valor: "500.00", data: "10/10/2026" });
    expect(row.canceladoEm).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const depois = await getReembolsos(tenantId, versionId);
    expect(depois.map((r) => r.id)).toEqual([antes[0].id]);
    expect(reembursementsByMonth(reembToCalc(depois))).toEqual({ "09/2026": 1250 });
    expect(calcTotals([], [], reembToCalc(depois)).reemb).toBe(1250);
    expect((await getMonthlyRevenue(versionId, projectId))["10/2026"]).toBeUndefined();
    expect(await getReembolsos(tenantId, versionId, { incluirCanceladas: true })).toHaveLength(2);
    const [l] = await logs("reembolso.cancel");
    expect(l.meta).toMatchObject({ motivo: "lançada em duplicidade", valor: "500.00", data: "10/10/2026", origem: "CEF · medição 04/2026" });
    // Status legado não é migrado: continua "Recebido"/"received" como gravado.
    expect(row.status).toBe("Recebido");
  });

  it("versão congelada recusa editar e cancelar com mensagem", async () => {
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    const [a] = await getReembolsos(tenantId, versionId);
    expect(await updateReembolso(fd({ id: a.id, data: "09/12/2026", origem: "CEF", valor: "1250" }))).toEqual({ ok: false, error: expect.stringMatching(/congelada/) });
    expect(await cancelarReembolso(a.id, "x")).toEqual({ ok: false, error: expect.stringMatching(/congelada/) });
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
  });
});
