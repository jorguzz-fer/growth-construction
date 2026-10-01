import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt Q, PR Q-1 — projeção explícita que preserva oficiais (2.2), conversão
 * explícita de mês futuro (2.3), auditoria de/para (3.2), { ok, error } (4.4),
 * faixa (4.3), filtro de empresa (4.2). Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Parâmetros / INCC — integridade (Prompt Q, PR Q-1)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { updateInccMonth, projectFutureIncc, marcarComoProjecao } = await import("./incc");
  const { getInccRows } = await import("@/lib/queries");
  let tenantId = "";
  let outroTenantId = "";
  let projectId = "";
  let tenant: unknown;
  let projects: unknown[] = [];
  const comPerms = (role: string) => {
    ctxRef.current = { tenant, projects, userId: null, userEmail: "quem@teste", role, perms: defaultPermissions(role as "owner") };
  };
  const logs = (action: string) => db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, action)));
  const mesRel = (delta: number) => {
    const d = new Date();
    const m = d.getMonth() + delta;
    const y = d.getFullYear() + Math.floor(m / 12);
    return `${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}/${y}`;
  };
  // Série: 3 meses passados oficiais, mês corrente oficial, 1 futuro OFICIAL informado, 2 futuros projetados.
  const serie = [
    { mes: mesRel(-3), monthly: "0.5000", accumulated: "0.5000", projected: false },
    // Acumulado como o sistema grava: encadeado e arredondado a 3 casas.
    { mes: mesRel(-2), monthly: "0.3000", accumulated: "0.8010", projected: false },
    { mes: mesRel(-1), monthly: "0.4000", accumulated: "1.2040", projected: false },
    { mes: mesRel(0), monthly: "0.6000", accumulated: "1.8110", projected: false },
    { mes: mesRel(1), monthly: "0.9000", accumulated: "2.7270", projected: false },
    { mes: mesRel(2), monthly: "0.0000", accumulated: "0.0000", projected: true },
    { mes: mesRel(3), monthly: "0.0000", accumulated: "0.0000", projected: true },
  ];

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "incc-Q1" }).returning();
    tenantId = t.id;
    tenant = t;
    const [o] = await db.insert(schema.tenants).values({ name: "incc-Q1-outro" }).returning();
    outroTenantId = o.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA Q1" }).returning();
    projectId = p.id;
    projects = [p];
    await db.insert(schema.inccRates).values(serie.map((s, i) => ({ projectId, tenantId, ordem: i, ...s })));
    comPerms("owner");
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    if (outroTenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, outroTenantId));
  });

  it("4.4 · sem permissão ou sem obra devolve mensagem, não silêncio; 4.3 · não finito é recusado, nada muda", async () => {
    comPerms("viewer");
    expect(await updateInccMonth(projectId, mesRel(0), 0.5)).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    expect(await projectFutureIncc(projectId)).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    comPerms("owner");
    expect(await updateInccMonth("00000000-0000-0000-0000-000000000000", mesRel(0), 0.5)).toEqual({ ok: false, error: expect.stringMatching(/obra/) });
    expect(await updateInccMonth(projectId, mesRel(0), Number.NaN)).toEqual({ ok: false, error: expect.stringMatching(/número/) });
    expect(await updateInccMonth(projectId, "13/2099", 0.5)).toEqual({ ok: false, error: expect.stringMatching(/não está na tabela/) });
    const rows = await getInccRows(tenantId, projectId);
    expect(rows.map((r) => r.mo)).toEqual([0.5, 0.3, 0.4, 0.6, 0.9, 0, 0]);
  });

  it("2.2 · a reprojeção só recalcula meses projetados: o futuro OFICIAL informado fica igual; auditoria com de/para (1.3)", async () => {
    const r = await projectFutureIncc(projectId);
    expect(r).toEqual({ ok: true, meses: 2 });
    const rows = await getInccRows(tenantId, projectId);
    expect(rows[4]).toMatchObject({ m: mesRel(1), mo: 0.9, projected: false });
    // média dos 5 anteriores (0.5+0.3+0.4+0.6+0.9)/5 = 0.54
    expect(rows[5]).toMatchObject({ m: mesRel(2), mo: 0.54, projected: true });
    expect(rows[6].projected).toBe(true);
    const [l] = await logs("incc.project");
    expect(l.meta).toMatchObject({ mesesReescritos: 2 });
    expect((l.meta as { mudancas: { mes: string; mensal: { de: number; para: number } }[] }).mudancas[0]).toMatchObject({ mes: mesRel(2), mensal: { de: 0, para: 0.54 } });
  });

  it("3.2 · editar um mês grava oficial, registra de/para e a lista dos reprojetados com os dois valores; 4.3 · negativo e fora da faixa são aceitos", async () => {
    const r = await updateInccMonth(projectId, mesRel(-1), -7);
    expect(r.ok).toBe(true);
    const rows = await getInccRows(tenantId, projectId);
    expect(rows[2]).toMatchObject({ mo: -7, projected: false });
    const [l] = await logs("incc.update");
    const meta = l.meta as { mes: string; mensal: { de: number; para: number }; eraProjetado: boolean; mesesReescritos: number; reprojetados: { mes: string; mensal: { de: number; para: number }; acumulado: { de: number; para: number } }[] };
    expect(meta).toMatchObject({ mes: mesRel(-1), mensal: { de: 0.4, para: -7 }, eraProjetado: false });
    // Os dois projetados foram reescritos (a média mudou); o oficial futuro aparece só pelo acumulado reencadeado.
    expect(meta.reprojetados.map((x) => x.mes)).toContain(mesRel(2));
    expect(meta.reprojetados.find((x) => x.mes === mesRel(2))?.mensal.de).toBe(0.54);
    expect(meta.mesesReescritos).toBeGreaterThanOrEqual(2);
  });

  it("2.3 · converter em projeção é explícito e só para meses futuros; mês corrente ou passado é recusado; auditoria guarda o valor anterior", async () => {
    expect(await marcarComoProjecao(projectId, [mesRel(0)])).toEqual({ ok: false, error: expect.stringMatching(/futuros/) });
    expect(await marcarComoProjecao(projectId, [mesRel(-2)])).toEqual({ ok: false, error: expect.stringMatching(/futuros/) });
    expect(await marcarComoProjecao(projectId, ["01/2099"])).toEqual({ ok: false, error: expect.stringMatching(/fora da tabela/) });
    expect(await marcarComoProjecao(projectId, [mesRel(2)])).toEqual({ ok: false, error: expect.stringMatching(/já são projeção/) });
    expect(await marcarComoProjecao(projectId, [])).toEqual({ ok: false, error: expect.stringMatching(/ao menos um mês/) });
    expect(await marcarComoProjecao(projectId, [mesRel(1)])).toEqual({ ok: true, meses: 1 });
    const rows = await getInccRows(tenantId, projectId);
    expect(rows[4].projected).toBe(true);
    expect(rows[4].mo).not.toBe(0.9);
    const [l] = await logs("incc.marcarProjecao");
    expect(l.meta).toMatchObject({ convertidos: [mesRel(1)], valoresAnteriores: [{ mes: mesRel(1), mensal: 0.9 }] });
  });

  it("4.2 · getInccRows filtra pela empresa: linha gravada com outro tenant no mesmo projeto não aparece", async () => {
    await db.insert(schema.inccRates).values({ projectId, tenantId: outroTenantId, mes: "01/2099", monthly: "1", accumulated: "1", ordem: 99 });
    expect((await getInccRows(tenantId, projectId)).some((r) => r.m === "01/2099")).toBe(false);
    expect((await getInccRows(outroTenantId, projectId)).map((r) => r.m)).toEqual(["01/2099"]);
  });
});
