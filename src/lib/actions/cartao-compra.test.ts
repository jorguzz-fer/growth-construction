import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";

/** Prompt U, seção 2 / Prompt S 3-B.4 e 3-B.6 — compra no cartão. Integração (precisa de DATABASE_URL). */
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

describe.skipIf(!HAS_DB)("Compra no cartão de crédito (Prompt U, 2)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addDespesa, updateDespesa } = await import("./despesas");
  const { getFaturasCartao, getContasPagar, getParcelasContasPagar } = await import("@/lib/queries");
  const { linhasComFaturas } = await import("@/lib/calc/fatura");
  let tenantId = "";
  let projectId = "";
  let cartaoId = "";
  let pagamentosAntes = 0;
  let caixaAntes = 0;
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  // Só o tenant deste teste: contar o banco inteiro variava com outros testes rodando em paralelo (intermitente).
  const contar = async () => ({
    pagamentos: (await db.select().from(schema.pagamentos).where(eq(schema.pagamentos.tenantId, tenantId))).length,
    caixa: (await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.tenantId, tenantId))).length,
  });

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "cartao-U2" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA U2" }).returning();
    projectId = p.id;
    await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" });
    const [c] = await db.insert(schema.cartoesCredito).values({ tenantId, apelido: "Itaú", ultimos4: "1234", diaFechamento: 10, diaVencimento: 20, limite: "10000" }).returning();
    cartaoId = c.id;
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "u2@teste", role: "owner", perms: defaultPermissions("owner") };
    const n = await contar();
    pagamentosAntes = n.pagamentos;
    caixaAntes = n.caixa;
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  const base = { projectId: "", categoriaDre: "Custo Variável", competencia: "03/2026", valor: "600", formaPagamento: "Cartão de crédito", status: "A pagar", obs: "cimento no cartão" };

  it("1, 2, 5, 6 — 6x: seis parcelas em seis faturas consecutivas; competência única; sem caixa; não nasce paga", async () => {
    const r = await addDespesa(fd({ ...base, projectId, cartaoId, cartaoDataCompra: "03/11/2026", cartaoParcelas: "6" }));
    expect(r).toMatchObject({ ok: true });
    const [d] = await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId));
    expect(d.cartaoId).toBe(cartaoId);
    expect(d.status).toBe("A pagar"); // 3-B.5
    expect(d.bancoId).toBeNull();
    expect(d.pagoPorTerceiro).toBe(false);
    expect(d.competencia).toBe("03/2026"); // 2 e 6: a competência é a informada, única
    expect(d.valor).toBe("600.00");
    expect(d.vencimento).toBe("04/20/2026"); // 1ª fatura: compra dia 11 > fecha dia 10 → fecha 04/10, vence 04/20
    const parcelas = await db.select().from(schema.despesaParcelas).where(eq(schema.despesaParcelas.despesaId, d.id)).orderBy(schema.despesaParcelas.numeroParcela);
    expect(parcelas).toHaveLength(6);
    expect(parcelas.map((p) => p.vencimento)).toEqual(["04/20/2026", "05/20/2026", "06/20/2026", "07/20/2026", "08/20/2026", "09/20/2026"]);
    expect(parcelas.every((p) => p.faturaId && p.formaPagamento === "Cartão de crédito" && p.status === "Pendente")).toBe(true);
    expect(new Set(parcelas.map((p) => p.faturaId)).size).toBe(6);
    expect(parcelas.map((p) => Number(p.valorOriginal)).reduce((a, b) => a + b, 0)).toBe(600);
    const faturas = await getFaturasCartao(tenantId);
    expect(faturas.map((f) => f.fechamento)).toEqual(["04/10/2026", "05/10/2026", "06/10/2026", "07/10/2026", "08/10/2026", "09/10/2026"]);
    expect(faturas.every((f) => f.valorCompras === 100 && f.qtdCompras === 1)).toBe(true);
    // 1 e 19 — nenhuma saída de caixa, nenhum pagamento
    expect(await contar()).toEqual({ pagamentos: pagamentosAntes, caixa: caixaAntes });
  });

  it("3 / 16b — compra à vista até o fechamento cai na fatura que fecha e faz o valor dela crescer", async () => {
    const r = await addDespesa(fd({ ...base, projectId, cartaoId, cartaoDataCompra: "04/10/2026", cartaoParcelas: "1", valor: "250", obs: "areia" }));
    expect(r).toMatchObject({ ok: true });
    const faturas = await getFaturasCartao(tenantId);
    const abril = faturas.find((f) => f.fechamento === "04/10/2026")!;
    expect(abril.valorCompras).toBe(350);
    expect(abril.qtdCompras).toBe(2);
    expect(faturas).toHaveLength(6); // mesma fatura, não nasce outra
  });

  it("7 — em Contas a Pagar aparece a fatura, e não as compras", async () => {
    const [despesas, parcelas, faturas] = await Promise.all([getContasPagar(tenantId), getParcelasContasPagar(tenantId), getFaturasCartao(tenantId)]);
    expect(despesas.every((d) => d.cartaoId === cartaoId)).toBe(true);
    const r = linhasComFaturas(despesas, parcelas, faturas, "2026-03-20");
    expect(r.compras).toEqual([]);
    expect(r.faturas).toHaveLength(6);
    expect(r.faturas[0]).toMatchObject({ valor: 350, status: "Prevista", prevista: true, formaPagamento: "Cartão de crédito" });
    expect(r.faturas[1]).toMatchObject({ valor: 100, status: "Prevista" });
  });

  it("trava de edição — valor, vencimento, forma e status seguem a fatura; competência continua livre", async () => {
    const [d] = await db.select().from(schema.despesas).where(and(eq(schema.despesas.tenantId, tenantId), eq(schema.despesas.obs, "areia")));
    expect(await updateDespesa(d.id, { valor: "999" })).toMatchObject({ ok: false, error: expect.stringMatching(/cartão/) });
    expect(await updateDespesa(d.id, { vencimento: "12/31/2026" })).toMatchObject({ ok: false });
    expect(await updateDespesa(d.id, { competencia: "05/2026" })).toEqual({ ok: true });
  });

  it("recusas — cartão inativo, cartão + terceiro, sem data, recorrente, parcelas manuais", async () => {
    expect(await addDespesa(fd({ ...base, projectId, cartaoId, cartaoParcelas: "1" }))).toMatchObject({ ok: false, error: expect.stringMatching(/data da compra/) });
    expect(await addDespesa(fd({ ...base, projectId, cartaoId, cartaoDataCompra: "04/10/2026", recorrente: "1", recorrenciaMeses: "3" }))).toMatchObject({ ok: false, error: expect.stringMatching(/recorrente/) });
    expect(await addDespesa(fd({ ...base, projectId, cartaoId, cartaoDataCompra: "04/10/2026", pagoPorSocioId: "x" }))).toMatchObject({ ok: false, error: expect.stringMatching(/OU por terceiro/) });
    await db.update(schema.cartoesCredito).set({ ativo: false }).where(eq(schema.cartoesCredito.id, cartaoId));
    expect(await addDespesa(fd({ ...base, projectId, cartaoId, cartaoDataCompra: "04/10/2026" }))).toMatchObject({ ok: false, error: expect.stringMatching(/inativo/) });
    await db.update(schema.cartoesCredito).set({ ativo: true }).where(eq(schema.cartoesCredito.id, cartaoId));
    expect((await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId))).length).toBe(2);
  });
});
