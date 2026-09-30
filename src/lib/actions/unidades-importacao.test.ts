import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt J, PR J-3 — importação atualiza em vez de duplicar (4.1), nunca toca
 * no plano (4.2), respeita o bloqueio (4.3) e relata (4.4). Integração: só com
 * DATABASE_URL (a migração 0046 precisa estar aplicada: índice único).
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

describe.skipIf(!HAS_DB)("Unidades — importação por planilha (Prompt J, PR J-3)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { emptyPlan } = await import("@/lib/calc");
  const { importUnits, saveUnit } = await import("./units");
  let tenantId = "";
  let projectId = "";
  let versionId = "";
  const plano = () => ({ ...emptyPlan(), usarAS: true, AS: { val: 50000, venc: "10/01/2026", n: 1, usarS1: false } });
  const unidades = async () =>
    db.select().from(schema.units).where(and(eq(schema.units.tenantId, tenantId), eq(schema.units.versionId, versionId))).orderBy(schema.units.code);
  const resumo = async () => {
    const rows = await unidades();
    return { n: rows.length, soma: rows.reduce((a, u) => a + Number(u.valor), 0) };
  };

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "unid-J3" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA J3" }).returning();
    projectId = p.id;
    const [v] = await db
      .insert(schema.versions)
      .values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" })
      .returning();
    versionId = v.id;
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("4.1 · reimportar a mesma planilha atualiza em vez de duplicar; 4.4 · relatório com motivos", async () => {
    const planilha = [
      { code: "101", bloco: "A", tipo: "Apto", m2: 65.5, andar: 1, valor: 350000, status: "Disponivel" as const },
      { code: "102", bloco: "A", valor: 360000 },
      { code: "" },
      { code: "102", valor: 1 },
    ];
    const r1 = await importUnits(planilha, projectId);
    expect(r1).toMatchObject({ ok: true, inseridas: 2, atualizadas: 0 });
    expect((r1 as { ignoradas: { motivo: string }[] }).ignoradas.map((i) => i.motivo)).toEqual([
      "sem código",
      expect.stringMatching(/repetido na planilha/),
    ]);
    expect(await resumo()).toEqual({ n: 2, soma: 710000 });

    const r2 = await importUnits(planilha, projectId);
    expect(r2).toMatchObject({ ok: true, inseridas: 0, atualizadas: 2 });
    expect(await resumo()).toEqual({ n: 2, soma: 710000 }); // nada duplicou, nada mudou
    const [l] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "unit.import")))
      .orderBy(schema.auditLog.createdAt);
    expect(l.meta).toMatchObject({ versionId, inseridas: ["101", "102"], atualizadas: [] });
  });

  it("4.2 · a atualização toca só o que a planilha traz preenchido; plano, data da venda e tipo de cadastro ficam", async () => {
    // Vende a 101 pelo formulário: plano e data entram.
    const [u101] = (await unidades()).filter((u) => u.code === "101");
    const s = await saveUnit({ id: u101.id, projectId, itemType: "condominio", code: "101", bloco: "A", tipo: "Apto", m2: 65.5, andar: 1, valor: 350000, status: "Vendido", mesVenda: "09/25/2026", plan: plano() });
    expect(s.ok).toBe(true);

    // Planilha só com código e valor novo (sem bloco, tipo, status…).
    const r = await importUnits([{ code: " 101 ", valor: 355000 }], projectId);
    expect(r).toMatchObject({ ok: true, inseridas: 0, atualizadas: 1, ignoradas: [] });
    const [depois] = (await unidades()).filter((u) => u.code === "101");
    expect(depois.valor).toBe("355000.00");
    expect(depois.bloco).toBe("A");
    expect(depois.tipo).toBe("Apto");
    expect(depois.status).toBe("Vendido");
    expect(depois.mesVenda).toBe("09/25/2026");
    expect(depois.itemType).toBe("condominio");
    expect(depois.paymentPlan).toEqual(plano());
    expect(await resumo()).toEqual({ n: 2, soma: 715000 });
  });

  it("4.3 · versão bloqueada recusa com mensagem legível e não grava", async () => {
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    expect(await importUnits([{ code: "103" }], projectId)).toEqual({ ok: false, error: expect.stringMatching(/congelada/) });
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
    expect(await resumo()).toEqual({ n: 2, soma: 715000 });
  });

  it("4.1 · a trava do banco (0046) impede um segundo registro com o mesmo código na versão", async () => {
    const sqlstate = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    await expect(
      db.insert(schema.units).values({ tenantId, versionId, code: "101", valor: "1", paymentPlan: emptyPlan() }),
    ).rejects.toSatisfy((e) => sqlstate(e) === "23505");
    // Em outra versão o mesmo código pode existir.
    const [v2] = await db
      .insert(schema.versions)
      .values({ projectId, tenantId, key: "budget", kind: "budget", label: "Orçamento", color: "#000" })
      .returning();
    await db.insert(schema.units).values({ tenantId, versionId: v2.id, code: "101", valor: "1", paymentPlan: emptyPlan() });
    expect(await resumo()).toEqual({ n: 2, soma: 715000 });
  });
});
