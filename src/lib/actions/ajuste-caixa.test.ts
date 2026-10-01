import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";

/** Prompt L, Parte 4 — ajuste de caixa: motivo, permissão própria, auditoria, e nada além do cash_entry muda. Integração (precisa de DATABASE_URL). */
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

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe.skipIf(!HAS_DB)("Ajuste de caixa (Prompt L, Parte 4)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addAjuste } = await import("./caixa");
  const { getAutoresDosAjustes, getBaixadoSemConciliar } = await import("@/lib/queries");
  let tenant: typeof schema.tenants.$inferSelect;
  let projectId = "";
  let versionId = "";
  let contaId = "";
  const ctxDe = (perms: ReturnType<typeof defaultPermissions>) => ({ tenant, projects: [{ id: projectId }], userId: null, userEmail: "l3@teste", role: "owner", perms });

  beforeAll(async () => {
    [tenant] = await db.insert(schema.tenants).values({ name: "ajuste-L3" }).returning();
    const [p] = await db.insert(schema.projects).values({ tenantId: tenant.id, name: "OBRA L3" }).returning();
    const [v] = await db.insert(schema.versions).values({ projectId: p.id, tenantId: tenant.id, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    projectId = p.id;
    versionId = v.id;
    const [c] = await db.insert(schema.bankAccounts).values({ tenantId: tenant.id, banco: "Banco L3", cc: "1-2", saldo: "1234.56" }).returning();
    contaId = c.id;
    ctxRef.current = ctxDe(defaultPermissions("owner"));
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  });

  it("4.2.2 — sem motivo não grava", async () => {
    const r = await addAjuste(fd({ projectId, data: "09/30/2026", valor: "10", sinal: "mais", motivo: "   " }));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/motivo/i) });
    expect(await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.tenantId, tenant.id))).toHaveLength(0);
  });

  it("4.2.3 — exige a permissão própria (conciliacao: criar), não a de despesa", async () => {
    const perms = defaultPermissions("owner");
    perms.conciliacao = { ...perms.conciliacao, criar: false };
    ctxRef.current = ctxDe(perms);
    const r = await addAjuste(fd({ projectId, data: "09/30/2026", valor: "10", sinal: "mais", motivo: "teste" }));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/permissão/) });
    ctxRef.current = ctxDe(defaultPermissions("owner"));
  });

  it("4.2.1 / 4.2.4 — grava como cat 'ajuste' já conciliado, com motivo, autor na auditoria, e não mexe no saldo da conta", async () => {
    const r = await addAjuste(fd({ projectId, data: "09/30/2026", valor: "10.5", sinal: "menos", motivo: "Tarifa bancária sem documento", bankAccountId: contaId }));
    expect(r).toMatchObject({ ok: true });
    const id = (r as { ok: true; id: string }).id;
    const [c] = await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.id, id));
    expect(c).toMatchObject({ cat: "ajuste", rec: true, versionId, bankAccountId: contaId, descricao: "Tarifa bancária sem documento" });
    expect(Number(c.valor)).toBe(-10.5);
    const [conta] = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.id, contaId));
    expect(Number(conta.saldo)).toBe(1234.56); // o saldo em conta é o do extrato; o ajuste só entra no conciliado
    const autores = await getAutoresDosAjustes(tenant.id, [id]);
    expect(autores.get(id)?.autor).toBe("l3@teste");
    const [log] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenant.id), eq(schema.auditLog.action, "cash.adjust")));
    expect(log.meta).toMatchObject({ motivo: "Tarifa bancária sem documento", valor: "-10.50" });
  });

  it("6.4 — baixado sem conciliar: só conta principal pago sem vínculo ativo", async () => {
    const [d] = await db.insert(schema.despesas).values({ versionId, tenantId: tenant.id, valor: "300", categoriaDre: "Custo Variável", competencia: "09/2026", vencimento: "09/10/2026", status: "Pago", obs: "baixa manual", numDoc: "PED-L3" }).returning();
    await db.insert(schema.pagamentos).values({ tenantId: tenant.id, despesaId: d.id, dataPagamento: "09/11/2026", valorTotalPago: "300" });
    const b = await getBaixadoSemConciliar(tenant.id);
    expect(b).toMatchObject({ total: 300, despesas: 1, maisAntigoISO: "2026-09-11" });
  });
});
