import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt A, PR 3 — Despesas sem "projeto ativo". O lançamento vai para a obra
 * escolhida (e só se for da empresa); o pagamento de parcela usa a versão da
 * própria parcela. Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Despesas com obra explícita", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addDespesa } = await import("./despesas");
  const { registrarPagamento } = await import("./pagamentos");
  const tenants: string[] = [];
  let tA: typeof schema.tenants.$inferSelect;
  const v: Record<string, typeof schema.versions.$inferSelect> = {};
  const p: Record<string, typeof schema.projects.$inferSelect> = {};

  async function obra(tenantId: string, nome: string, chave: string) {
    [p[chave]] = await db.insert(schema.projects).values({ tenantId, name: nome }).returning();
    [v[chave]] = await db
      .insert(schema.versions)
      .values({ projectId: p[chave].id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" })
      .returning();
  }
  async function parcela(chave: string, tenantId: string) {
    const [d] = await db
      .insert(schema.despesas)
      .values({ versionId: v[chave].id, tenantId, valor: "100", categoriaDre: "Custo Variável" })
      .returning();
    const [pa] = await db
      .insert(schema.despesaParcelas)
      .values({ tenantId, despesaId: d.id, numeroParcela: 1, valorOriginal: "100" })
      .returning();
    return pa;
  }
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, val] of Object.entries(campos)) f.set(k, val);
    return f;
  };

  beforeAll(async () => {
    [tA] = await db.insert(schema.tenants).values({ name: "desp-A" }).returning();
    const [tB] = await db.insert(schema.tenants).values({ name: "desp-B" }).returning();
    tenants.push(tA.id, tB.id);
    await obra(tA.id, "OBRA 1", "a1");
    await obra(tA.id, "OBRA 2", "a2");
    await obra(tB.id, "OBRA B", "b1");
    ctxRef.current = {
      tenant: tA,
      projects: [p.a1, p.a2],
      userId: null,
      userEmail: null,
      role: "owner",
      perms: defaultPermissions("owner"),
    };
  });
  afterAll(async () => {
    for (const id of tenants) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });

  const base = { categoriaDre: "Custo Variável", valor: "123.45", competencia: "09/2026", vencimento: "09/30/2026" };

  it("sem projeto no formulário, recusa — não cai em obra nenhuma", async () => {
    await expect(addDespesa(fd(base))).rejects.toThrow(/Escolha o projeto/);
    const n = await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tA.id));
    expect(n).toHaveLength(0);
  });

  it("projeto de outra empresa é recusado", async () => {
    await expect(addDespesa(fd({ ...base, projectId: p.b1.id }))).rejects.toThrow(/Escolha o projeto/);
    const n = await db.select().from(schema.despesas).where(eq(schema.despesas.versionId, v.b1.id));
    expect(n).toHaveLength(0);
  });

  it("grava na versão Atual da obra escolhida (a segunda da lista)", async () => {
    await addDespesa(fd({ ...base, projectId: p.a2.id }));
    const rows = await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tA.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].versionId).toBe(v.a2.id);
    expect(rows[0].valor).toBe("123.45");
  });

  it("pagamento de parcela usa a versão da própria parcela", async () => {
    const pa = await parcela("a2", tA.id);
    await registrarPagamento({ parcelaId: pa.id, valorOriginal: 100, dataPagamento: "09/29/2026" });
    const [atual] = await db.select().from(schema.despesaParcelas).where(eq(schema.despesaParcelas.id, pa.id));
    expect(atual.status).toBe("Pago");
    const caixa = await db
      .select()
      .from(schema.cashEntries)
      .where(and(eq(schema.cashEntries.tenantId, tA.id), eq(schema.cashEntries.descricao, "Pagamento parcela #1")));
    expect(caixa).toHaveLength(1);
    expect(caixa[0].versionId).toBe(v.a2.id);
  });

  it("parcela de outra empresa não é alcançada", async () => {
    const pb = await parcela("b1", tenants[1]);
    await expect(
      registrarPagamento({ parcelaId: pb.id, valorOriginal: 100, dataPagamento: "09/29/2026" }),
    ).rejects.toThrow(/não encontrada/);
    const [intacta] = await db.select().from(schema.despesaParcelas).where(eq(schema.despesaParcelas.id, pb.id));
    expect(intacta.valorPago).toBe("0.00");
  });

  it("versão congelada da parcela bloqueia o pagamento", async () => {
    const pa = await parcela("a1", tA.id);
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, v.a1.id));
    await expect(
      registrarPagamento({ parcelaId: pa.id, valorOriginal: 100, dataPagamento: "09/29/2026" }),
    ).rejects.toThrow(/congelada/);
  });
});
