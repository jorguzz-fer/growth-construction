import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";

/** Prompt L, Parte 9 — fechar o dia no cartão. Integração (precisa de DATABASE_URL). */
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

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const br = (i: string) => `${i.slice(5, 7)}/${i.slice(8, 10)}/${i.slice(0, 4)}`;
const diasAtras = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

describe.skipIf(!HAS_DB)("Fechar o dia no cartão (Prompt L, Parte 9)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { fecharDia, reabrirDia } = await import("./fechamento");
  let tenant: typeof schema.tenants.$inferSelect;
  let versionId = "";
  let projectId = "";
  const ONTEM = diasAtras(1);
  const ANTEONTEM = diasAtras(2);
  const AMANHA = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return iso(d);
  })();
  const ctxDe = (perms: ReturnType<typeof defaultPermissions>) => ({ tenant, projects: [{ id: projectId }], userId: null, userEmail: "l4@teste", role: "owner", perms });

  beforeAll(async () => {
    [tenant] = await db.insert(schema.tenants).values({ name: "fechamento-L4" }).returning();
    const [p] = await db.insert(schema.projects).values({ tenantId: tenant.id, name: "OBRA L4" }).returning();
    const [v] = await db.insert(schema.versions).values({ projectId: p.id, tenantId: tenant.id, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    projectId = p.id;
    versionId = v.id;
    const [conta] = await db.insert(schema.bankAccounts).values({ tenantId: tenant.id, banco: "Banco L4", cc: "9-9", saldo: "1000" }).returning();
    // ontem: uma saída do extrato conciliada (−100) e uma entrada do extrato sem lançamento (+40)
    await db.insert(schema.cashEntries).values([
      { versionId, tenantId: tenant.id, data: br(ONTEM), descricao: "TED", valor: "-100", cat: "extrato", importHash: "h1", rec: true, bankAccountId: conta.id },
      { versionId, tenantId: tenant.id, data: br(ONTEM), descricao: "PIX", valor: "40", cat: "extrato", importHash: "h2", rec: false, bankAccountId: conta.id },
    ]);
    ctxRef.current = ctxDe(defaultPermissions("owner"));
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  });

  it("9.2 / 9.4 — tudo calculado no servidor: saldo inicial da cadeia, divergência = em conta − conciliado, nada do cliente", async () => {
    const r = await fecharDia({ dia: ONTEM });
    expect(r).toMatchObject({ ok: true });
    const id = (r as { ok: true; id: string }).id;
    const [row] = await db.select().from(schema.dailyClosings).where(eq(schema.dailyClosings.id, id));
    // em conta ao fim de anteontem = 1000 − (−100 + 40) = 1060; ontem conciliado: 1060 − 100 = 960; em conta ao fim de ontem = 1000
    expect(row).toMatchObject({ projectId: null, dia: br(ONTEM), responsavelNome: "l4@teste", reabertoEm: null });
    expect(Number(row.saldoInicial)).toBe(1060);
    expect(Number(row.totalSaidas)).toBe(100);
    expect(Number(row.totalEntradas)).toBe(0);
    expect(Number(row.saldoFinal)).toBe(960);
    expect(Number(row.saldoEmConta)).toBe(1000);
    expect(Number(row.divergencias)).toBe(40);
    expect(row.naturezas).toMatchObject({ extratoSemLancamento: 40 });
    // 9.7 — carry_over não é mais gravado; 9.9 — auditoria aponta o id da linha
    expect(await db.select().from(schema.carryOvers).where(eq(schema.carryOvers.tenantId, tenant.id))).toHaveLength(0);
    const [log] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenant.id), eq(schema.auditLog.action, "caixa.fechamento")));
    expect(log.entityId).toBe(id);
  });

  it("9.5 — fechar duas vezes é impedido na action e no banco; dia futuro é recusado", async () => {
    expect(await fecharDia({ dia: ONTEM })).toMatchObject({ ok: false, error: expect.stringMatching(/já está fechado/) });
    expect(await fecharDia({ dia: AMANHA })).toMatchObject({ ok: false, error: expect.stringMatching(/futuro/) });
    await expect(db.insert(schema.dailyClosings).values({ tenantId: tenant.id, dia: br(ONTEM), saldoInicial: "0", totalEntradas: "0", totalSaidas: "0", saldoFinal: "0", divergencias: "0" })).rejects.toThrow(/daily_closing_tenant_dia_aberto_uq/);
  });

  it("9.6 — fechar não trava: lançar depois continua possível e o cartão passa a divergir do gravado", async () => {
    // lançamento à mão (não importado) marcado como conciliado: muda o conciliado, não o em conta
    await db.insert(schema.cashEntries).values({ versionId, tenantId: tenant.id, data: br(ONTEM), descricao: "TARIFA", valor: "-5", cat: "despesa", rec: true });
    const { cadeiaDaEmpresa } = await import("@/lib/cadeia-da-empresa");
    const { hojeISO } = await import("@/lib/despesa-status");
    const { cadeia } = await cadeiaDaEmpresa(tenant.id, { hojeISO: hojeISO(), diasPassados: 2, diasFuturos: 0 });
    const d = cadeia.dias.find((x) => x.dia === ONTEM)!;
    expect(d.fechamento?.saldoFinal).toBe(960);
    expect(d.divergeDoGravado).toBe(true);
    // anteontem aberto antes de um fechado → buraco
    expect(cadeia.dias.find((x) => x.dia === ANTEONTEM)?.buraco).toBe(true);
  });

  it("9.5 — reabrir exige motivo e a permissão própria; depois de reaberto o dia pode ser fechado de novo", async () => {
    const [row] = await db.select().from(schema.dailyClosings).where(and(eq(schema.dailyClosings.tenantId, tenant.id), eq(schema.dailyClosings.dia, br(ONTEM))));
    expect(await reabrirDia({ id: row.id, motivo: "  " })).toMatchObject({ ok: false, error: expect.stringMatching(/motivo/) });
    const perms = defaultPermissions("owner");
    perms.conciliacao = { ...perms.conciliacao, excluir: false };
    ctxRef.current = ctxDe(perms);
    expect(await reabrirDia({ id: row.id, motivo: "tarifa lançada depois" })).toMatchObject({ ok: false, error: expect.stringMatching(/permissão/) });
    ctxRef.current = ctxDe(defaultPermissions("owner"));
    expect(await reabrirDia({ id: row.id, motivo: "tarifa lançada depois" })).toMatchObject({ ok: true });
    const [re] = await db.select().from(schema.dailyClosings).where(eq(schema.dailyClosings.id, row.id));
    expect(re.reabertoEm).not.toBeNull();
    expect(re.motivoReabertura).toBe("tarifa lançada depois");
    expect(await reabrirDia({ id: row.id, motivo: "de novo" })).toMatchObject({ ok: false, error: expect.stringMatching(/já foi reaberto/) });
    const r2 = await fecharDia({ dia: ONTEM });
    expect(r2).toMatchObject({ ok: true });
    const [novo] = await db.select().from(schema.dailyClosings).where(eq(schema.dailyClosings.id, (r2 as { ok: true; id: string }).id));
    expect(Number(novo.saldoFinal)).toBe(955); // 960 − 5 da tarifa
    expect((await db.select().from(schema.dailyClosings).where(eq(schema.dailyClosings.tenantId, tenant.id))).length).toBe(2); // a linha reaberta FICA
  });
});
