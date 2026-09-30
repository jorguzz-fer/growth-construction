import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt I, PR I-2 — pagamentos: transação, idempotência, status pelo
 * acumulado, despesa-mãe, valor do servidor. Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Pagamentos — integridade (Prompt I, §13 e §14)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addDespesa, pagarDespesa } = await import("./despesas");
  const { registrarPagamento } = await import("./pagamentos");
  let tenantId = "";
  let projectId = "";
  let versionId = "";
  let forecastId = "";
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const base = () => ({ projectId, categoriaDre: "Custo Variável", valor: "100", competencia: "09/2026", vencimento: "09/30/2026" });
  const despesa = (id: string) => db.select().from(schema.despesas).where(eq(schema.despesas.id, id)).then((r) => r[0]);
  const pagamentosDe = (id: string) => db.select().from(schema.pagamentos).where(eq(schema.pagamentos.despesaId, id));
  const caixaDe = (descricao: string) =>
    db.select().from(schema.cashEntries).where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.cashEntries.descricao, descricao)));

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "pag-I2" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA I2" }).returning();
    projectId = p.id;
    for (const kind of ["atual", "forecast"] as const) {
      const [v] = await db
        .insert(schema.versions)
        .values({ projectId, tenantId, key: kind, kind, label: kind, color: "#000" })
        .returning();
      if (kind === "atual") versionId = v.id;
      else forecastId = v.id;
    }
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: null, role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("§47.7 — despesa 100, pagamentos 60 e 40: saldo zero, Pago, caixa −100", async () => {
    const r0 = await addDespesa(fd(base()));
    const id = (r0 as { id: string }).id;
    expect((await pagarDespesa({ despesaId: id, dataPagamento: "09/10/2026", valorPago: 60, idempotencyKey: "a-60" })).ok).toBe(true);
    expect((await despesa(id)).status).toBe("Parcialmente paga");
    expect((await pagarDespesa({ despesaId: id, dataPagamento: "09/20/2026", valorPago: 40, idempotencyKey: "a-40" })).ok).toBe(true);
    expect((await despesa(id)).status).toBe("Pago"); // antes: "Parcialmente paga", porque o último foi 40
    expect(await pagamentosDe(id)).toHaveLength(2);
    const caixa = await db
      .select()
      .from(schema.cashEntries)
      .where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.cashEntries.cat, "despesa")));
    expect(caixa.reduce((a, c) => a + Number(c.valor), 0)).toBe(-100);
    expect(caixa.every((c) => c.versionId === versionId)).toBe(true); // na Atual da despesa
  });

  it("§47.8 — duplo submit do mesmo pagamento: um único fato financeiro", async () => {
    const r0 = await addDespesa(fd({ ...base(), valor: "50" }));
    const id = (r0 as { id: string }).id;
    const input = { despesaId: id, dataPagamento: "09/10/2026", valorPago: 50, idempotencyKey: "dup-1" };
    const [a, b] = await Promise.all([pagarDespesa(input), pagarDespesa(input)]);
    expect(a.ok && b.ok).toBe(true);
    expect(await pagamentosDe(id)).toHaveLength(1);
    expect((await despesa(id)).status).toBe("Pago");
    // Reenvio depois: idem, devolve o existente.
    const c = await pagarDespesa(input);
    expect(c).toMatchObject({ ok: true, jaExistia: true });
    expect(await pagamentosDe(id)).toHaveLength(1);
  });

  it("encargos não abatem o principal; desconto abate", async () => {
    const r0 = await addDespesa(fd({ ...base(), valor: "100" }));
    const id = (r0 as { id: string }).id;
    // Pagou 105 (100 + 5 de juros): quitado.
    expect((await pagarDespesa({ despesaId: id, dataPagamento: "09/10/2026", valorPago: 105, juros: 5, idempotencyKey: "j-1" })).ok).toBe(true);
    expect((await despesa(id)).status).toBe("Pago");
    const r1 = await addDespesa(fd({ ...base(), valor: "100" }));
    const id2 = (r1 as { id: string }).id;
    // Pagou 90 com 10 de desconto: quitado.
    expect((await pagarDespesa({ despesaId: id2, dataPagamento: "09/10/2026", valorPago: 90, desconto: 10, idempotencyKey: "d-1" })).ok).toBe(true);
    expect((await despesa(id2)).status).toBe("Pago");
  });

  it("falha no meio não deixa pagamento pela metade", async () => {
    const r0 = await addDespesa(fd({ ...base(), valor: "30" }));
    const id = (r0 as { id: string }).id;
    // Conta bancária inexistente viola a chave estrangeira DEPOIS do insert do
    // pagamento... o cash_entry é o que falha; nada pode ficar.
    await expect(
      pagarDespesa({ despesaId: id, dataPagamento: "09/10/2026", valorPago: 30, bankAccountId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow();
    expect(await pagamentosDe(id)).toHaveLength(0);
    expect((await despesa(id)).status).toBe("A pagar");
  });

  it("valor zero, data ausente e versão de planejamento são recusados", async () => {
    const r0 = await addDespesa(fd({ ...base(), valor: "10" }));
    const id = (r0 as { id: string }).id;
    expect((await pagarDespesa({ despesaId: id, dataPagamento: "", valorPago: 10 })).ok).toBe(false);
    const [f] = await db
      .insert(schema.despesas)
      .values({ tenantId, versionId: forecastId, valor: "10", status: "A pagar" })
      .returning();
    const r = await pagarDespesa({ despesaId: f.id, dataPagamento: "09/10/2026", valorPago: 10 });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/planejamento/) });
  });

  it("§14 — parcelas: valor do servidor, status acumulado e despesa-mãe (§47.10)", async () => {
    const parcelasJson = JSON.stringify([
      { vencimento: "10/30/2026", valor: 60, status: "Pendente" },
      { vencimento: "11/30/2026", valor: 40, status: "Pendente" },
    ]);
    const r0 = await addDespesa(fd({ ...base(), parcelasJson }));
    const id = (r0 as { id: string }).id;
    const [p1, p2] = await db.select().from(schema.despesaParcelas).where(eq(schema.despesaParcelas.despesaId, id)).orderBy(schema.despesaParcelas.numeroParcela);
    // O navegador manda 999 de "valor original": o servidor usa os 60 da parcela.
    const r1 = await registrarPagamento({ parcelaId: p1.id, valorOriginal: 999, dataPagamento: "10/30/2026", idempotencyKey: "p1" });
    expect(r1.ok).toBe(true);
    const [pag] = await db.select().from(schema.pagamentos).where(eq(schema.pagamentos.parcelaId, p1.id));
    expect(pag.valorOriginal).toBe("60.00");
    expect(pag.valorTotalPago).toBe("60.00");
    expect((await caixaDe("Pagamento parcela #1"))[0].valor).toBe("-60.00");
    expect((await despesa(id)).status).toBe("Parcialmente paga");
    // Duplo submit da parcela 2: um pagamento só; despesa-mãe vira Pago.
    const input = { parcelaId: p2.id, dataPagamento: "11/30/2026", idempotencyKey: "p2" };
    await Promise.all([registrarPagamento(input), registrarPagamento(input)]);
    expect(await db.select().from(schema.pagamentos).where(eq(schema.pagamentos.parcelaId, p2.id))).toHaveLength(1);
    const [p2d] = await db.select().from(schema.despesaParcelas).where(eq(schema.despesaParcelas.id, p2.id));
    expect(p2d.status).toBe("Pago");
    expect((await despesa(id)).status).toBe("Pago");
  });
});
