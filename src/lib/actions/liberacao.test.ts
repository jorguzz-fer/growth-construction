import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt O, PR O-2 — validação e retorno legível do lançamento (3.1, 3.2),
 * origem na auditoria (3.3), filtro de empresa (3.5), serial íntegro (2.2).
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

describe.skipIf(!HAS_DB)("Liberações de Obra — lançamento (Prompt O, PR O-2)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addReembolso } = await import("./receitas");
  const { getReembolsos } = await import("@/lib/queries");
  const { excelSerial } = await import("@/lib/utils");
  let tenantId = "";
  let outroTenantId = "";
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
  const base = { data: "09/10/2026", origem: "CEF · medição 03/2026", valor: "1.500,50" };

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "lib-O2" }).returning();
    tenantId = t.id;
    tenant = t;
    const [o] = await db.insert(schema.tenants).values({ name: "lib-O2-outro" }).returning();
    outroTenantId = o.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA O2" }).returning();
    projectId = p.id;
    projects = [p];
    const [v] = await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    versionId = v.id;
    comPerms("owner");
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    if (outroTenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, outroTenantId));
  });

  it("3.1 · valor zero, negativo ou vazio, data ausente/inválida e origem em branco são recusados com mensagem; nada é gravado", async () => {
    const r = (c: Record<string, string>) => addReembolso(fd({ projectId, ...base, ...c }));
    expect(await r({ valor: "" })).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await r({ valor: "0" })).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await r({ valor: "-5" })).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await r({ data: "" })).toEqual({ ok: false, error: expect.stringMatching(/data/) });
    expect(await r({ data: "2026-09-10" })).toEqual({ ok: false, error: expect.stringMatching(/data/) });
    expect(await r({ origem: "" })).toEqual({ ok: false, error: expect.stringMatching(/origem/) });
    expect(await getReembolsos(tenantId, versionId)).toHaveLength(0);
  });

  it("3.2 · sem permissão de criar devolve erro legível, não silêncio", async () => {
    comPerms("viewer");
    expect(await addReembolso(fd({ projectId, ...base }))).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    comPerms("owner");
    expect(await getReembolsos(tenantId, versionId)).toHaveLength(0);
  });

  it("3.3/2.2 · grava com vírgula decimal lida certo, serial = INT(data), status 'Recebido', pct nulo; auditoria com valor, data e origem", async () => {
    const r = await addReembolso(fd({ projectId, ...base, obs: "primeira parcela" }));
    expect(r.ok).toBe(true);
    const [row] = await getReembolsos(tenantId, versionId);
    expect(row).toMatchObject({ valor: "1500.50", data: "09/10/2026", origem: "CEF · medição 03/2026", obs: "primeira parcela", status: "Recebido", pct: null });
    expect(row.serial).toBe(excelSerial("09/10/2026"));
    expect(row.serial).toBeGreaterThan(40000);
    const logs = await db.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenantId));
    const l = logs.find((x) => x.action === "reembolso.create");
    expect(l?.meta).toMatchObject({ valor: "1500.50", data: "09/10/2026", origem: "CEF · medição 03/2026" });
  });

  it("3.5 · getReembolsos filtra pela empresa: linha gravada com outro tenant na mesma versão não aparece", async () => {
    await db.insert(schema.reembolsos).values({ tenantId: outroTenantId, versionId, data: "09/11/2026", origem: "X", valor: "1.00" });
    expect(await getReembolsos(tenantId, versionId)).toHaveLength(1);
    expect(await getReembolsos(outroTenantId, versionId)).toHaveLength(1);
  });
});
