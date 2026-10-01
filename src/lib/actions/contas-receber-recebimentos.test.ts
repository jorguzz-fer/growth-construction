import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt K, PR K-2 — estado derivado, baixa manual, conciliação com valor por
 * vínculo, estorno, trava 5.1, cancelamento. Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Contas a Receber — estados, baixa e vínculo (Prompt K, PR K-2)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { createContaReceber, updateContaReceber, cancelarContaReceber, registrarRecebimento, estornarRecebimento } = await import("./contas-receber");
  const { conciliarContaReceber } = await import("./caixa");
  const { getContasReceber, getEntradasDisponiveis, getRecebimentosDasContas } = await import("@/lib/queries");
  let tenantId = "";
  let projectId = "";
  let versionId = "";
  let n = 0;
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const novaConta = async (valor: string) => {
    const r = await createContaReceber(fd({ projectId, tipo: "Sinal", valor, vencimento: "10/15/2026" }));
    if (!r.ok) throw new Error(r.error);
    return r.id;
  };
  const entrada = async (valor: number, data = "10/10/2026") =>
    (await db.insert(schema.cashEntries).values({ tenantId, versionId, data, descricao: `PIX ${++n}`, valor: String(valor), cat: "receita", rec: false }).returning())[0];
  const conta = async (id: string) => (await db.select().from(schema.contasReceber).where(eq(schema.contasReceber.id, id)))[0];
  const mov = async (id: string) => (await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.id, id)))[0];
  const chave = () => `k2-${++n}`;

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "cr-K2" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA K2" }).returning();
    projectId = p.id;
    const [v] = await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    versionId = v.id;
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("3.2/3.3 · baixa manual exige valor, data e forma; fora do banco exige justificativa; resulta em 'recebida, não conciliada' (status derivado gravado como cache)", async () => {
    const id = await novaConta("324,00");
    expect(await registrarRecebimento({ contaReceberId: id, valor: 0, data: "10/10/2026", forma: "Espécie", justificativa: "x", idempotencyKey: chave() })).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await registrarRecebimento({ contaReceberId: id, valor: 100, data: "", forma: "Espécie", justificativa: "x", idempotencyKey: chave() })).toEqual({ ok: false, error: expect.stringMatching(/data/) });
    expect(await registrarRecebimento({ contaReceberId: id, valor: 100, data: "10/10/2026", forma: "Espécie", idempotencyKey: chave() })).toEqual({ ok: false, error: expect.stringMatching(/justificativa/) });
    expect(await registrarRecebimento({ contaReceberId: id, valor: 5000, data: "10/10/2026", forma: "Espécie", justificativa: "x", idempotencyKey: chave() })).toEqual({ ok: false, error: expect.stringMatching(/passa do que falta/) });
    const k = chave();
    const r = await registrarRecebimento({ contaReceberId: id, valor: 100, data: "10/10/2026", forma: "Espécie", justificativa: "pago na obra", idempotencyKey: k });
    expect(r.ok).toBe(true);
    // Idempotência: repetir a mesma chave não grava de novo.
    expect(await registrarRecebimento({ contaReceberId: id, valor: 100, data: "10/10/2026", forma: "Espécie", justificativa: "pago na obra", idempotencyKey: k })).toEqual(r);
    const c = await conta(id);
    expect(c.valorRecebido).toBe("100.00");
    expect(c.status).toBe("Parcialmente recebido");
    expect(c.dataRecebimento).toBe("10/10/2026");
    const [l] = await getRecebimentosDasContas(tenantId, [id]);
    expect(l).toMatchObject({ forma: "Espécie", cashEntryId: null, justificativa: "pago na obra", estornado: false });
    // Status não é editável por lugar nenhum: o formulário de edição ignora o campo.
    expect((await updateContaReceber(fd({ id, tipo: "Sinal", valor: "324,00", vencimento: "10/15/2026", status: "Recebido", valorRecebido: "324" }))).ok).toBe(true);
    expect((await conta(id)).status).toBe("Parcialmente recebido");
    expect((await conta(id)).valorRecebido).toBe("100.00");
  });

  it("4.1/4.2 · conciliar exige linha de extrato; um depósito quita três parcelas; a soma dos vínculos não excede o movimento", async () => {
    const a = await novaConta("100");
    const b = await novaConta("150");
    const c = await novaConta("50");
    const dep = await entrada(300);
    expect(await registrarRecebimento({ contaReceberId: a, valor: 100, data: "10/10/2026", forma: "Extrato bancário", idempotencyKey: chave() })).toEqual({ ok: false, error: expect.stringMatching(/linha do extrato/) });
    expect((await registrarRecebimento({ contaReceberId: a, valor: 100, data: "10/10/2026", forma: "Extrato bancário", cashEntryId: dep.id, idempotencyKey: chave() })).ok).toBe(true);
    expect((await registrarRecebimento({ contaReceberId: b, valor: 150, data: "10/10/2026", forma: "Extrato bancário", cashEntryId: dep.id, idempotencyKey: chave() })).ok).toBe(true);
    // Sobram 50 no depósito: 60 passa.
    expect(await registrarRecebimento({ contaReceberId: c, valor: 60, data: "10/10/2026", forma: "Extrato bancário", cashEntryId: dep.id, idempotencyKey: chave() })).toEqual({ ok: false, error: expect.stringMatching(/passa do que falta|soma dos vínculos/) });
    expect((await registrarRecebimento({ contaReceberId: c, valor: 50, data: "10/10/2026", forma: "Extrato bancário", cashEntryId: dep.id, idempotencyKey: chave() })).ok).toBe(true);
    for (const id of [a, b, c]) {
      const x = await conta(id);
      expect(x.status).toBe("Recebido");
      expect(Number(x.valorRecebido)).toBe(Number(x.valor));
    }
    const m = await mov(dep.id);
    expect(m.rec).toBe(true);
    expect(m.conciliadoContaReceberId).toBe(a); // 4.5 — campo antigo continua gravado
    expect((await getEntradasDisponiveis(tenantId, projectId)).find((e) => e.id === dep.id)).toBeUndefined(); // sem valor livre
  });

  it("4.2 · uma parcela recebida em dois depósitos fecha com a soma; o depósito parcialmente usado continua disponível", async () => {
    const id = await novaConta("200");
    const d1 = await entrada(120);
    const d2 = await entrada(500);
    expect((await registrarRecebimento({ contaReceberId: id, valor: 120, data: "10/11/2026", forma: "Extrato bancário", cashEntryId: d1.id, idempotencyKey: chave() })).ok).toBe(true);
    expect((await registrarRecebimento({ contaReceberId: id, valor: 80, data: "10/12/2026", forma: "Extrato bancário", cashEntryId: d2.id, idempotencyKey: chave() })).ok).toBe(true);
    expect((await conta(id)).status).toBe("Recebido");
    const livre = (await getEntradasDisponiveis(tenantId, projectId)).find((e) => e.id === d2.id);
    expect(livre).toMatchObject({ valor: 500, disponivel: 420 });
  });

  it("4.3 · estornar registra quem, quando e por quê, sem apagar; a conta reabre e o movimento volta a livre", async () => {
    const id = await novaConta("90");
    const d = await entrada(90);
    const r = await registrarRecebimento({ contaReceberId: id, valor: 90, data: "10/13/2026", forma: "Extrato bancário", cashEntryId: d.id, idempotencyKey: chave() });
    expect(r.ok).toBe(true);
    const recId = (r as { id: string }).id;
    expect(await estornarRecebimento(recId, "  ")).toEqual({ ok: false, error: expect.stringMatching(/motivo/) });
    expect(await estornarRecebimento(recId, "depósito era de outro cliente")).toEqual({ ok: true, id: recId });
    expect(await estornarRecebimento(recId, "de novo")).toEqual({ ok: false, error: expect.stringMatching(/já foi estornado/) });
    const [l] = await getRecebimentosDasContas(tenantId, [id]);
    expect(l).toMatchObject({ estornado: true, estornadoPor: "quem@teste", motivoEstorno: "depósito era de outro cliente" });
    expect((await conta(id)).status).toBe("A receber");
    expect((await mov(d.id)).rec).toBe(false);
    expect((await getEntradasDisponiveis(tenantId, projectId)).find((e) => e.id === d.id)).toMatchObject({ disponivel: 90 });
  });

  it("5.1 · conta conciliada recusa alteração de valor e de vencimento sem estorno; descrição pode", async () => {
    const id = await novaConta("70");
    const d = await entrada(70);
    expect((await registrarRecebimento({ contaReceberId: id, valor: 70, data: "10/14/2026", forma: "Extrato bancário", cashEntryId: d.id, idempotencyKey: chave() })).ok).toBe(true);
    expect(await updateContaReceber(fd({ id, tipo: "Sinal", valor: "80", vencimento: "10/15/2026" }))).toEqual({ ok: false, error: expect.stringMatching(/estorne o vínculo/) });
    expect(await updateContaReceber(fd({ id, tipo: "Sinal", valor: "70", vencimento: "11/15/2026" }))).toEqual({ ok: false, error: expect.stringMatching(/estorne o vínculo/) });
    expect(await updateContaReceber(fd({ id, tipo: "Sinal", valor: "70", vencimento: "10/15/2026", descricao: "ok mudar" }))).toEqual({ ok: true, id });
    // Baixa manual (sem extrato) não trava, mas o valor não desce abaixo do recebido.
    const id2 = await novaConta("100");
    expect((await registrarRecebimento({ contaReceberId: id2, valor: 40, data: "10/14/2026", forma: "Espécie", justificativa: "x", idempotencyKey: chave() })).ok).toBe(true);
    expect(await updateContaReceber(fd({ id: id2, tipo: "Sinal", valor: "30", vencimento: "10/15/2026" }))).toEqual({ ok: false, error: expect.stringMatching(/abaixo do que já foi recebido/) });
    expect((await updateContaReceber(fd({ id: id2, tipo: "Sinal", valor: "120", vencimento: "10/15/2026" }))).ok).toBe(true);
    // Cancelar conta com recebimento ativo: recusa; depois do estorno, pode.
    expect(await cancelarContaReceber(fd({ id: id2 }))).toEqual({ ok: false, error: expect.stringMatching(/estorne os recebimentos/) });
  });

  it("BK-3 · R$ 323,97 numa conta de R$ 324,00 fecha com resíduo registrado na auditoria", async () => {
    const id = await novaConta("324,00");
    const d = await entrada(323.97);
    expect((await registrarRecebimento({ contaReceberId: id, valor: 323.97, data: "10/16/2026", forma: "Extrato bancário", cashEntryId: d.id, idempotencyKey: chave() })).ok).toBe(true);
    expect((await conta(id)).status).toBe("Recebido");
    const logs = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "contaReceber.conciliar"), eq(schema.auditLog.entityId, id)));
    expect(logs[0].meta).toMatchObject({ residuo: 0.03, estado: "Recebida e conciliada" });
  });

  it("Caixa · conciliarContaReceber (usado pelo pareamento) grava o mesmo recebimento, limitado ao livre do movimento e ao saldo da conta", async () => {
    const id = await novaConta("500");
    const d = await entrada(200);
    await conciliarContaReceber({ cashEntryId: d.id, contaReceberId: id });
    expect((await conta(id))).toMatchObject({ status: "Parcialmente recebido", valorRecebido: "200.00" });
    const [l] = await getRecebimentosDasContas(tenantId, [id]);
    expect(l).toMatchObject({ forma: "Extrato bancário", cashEntryId: d.id, valor: "200.00" });
    await expect(conciliarContaReceber({ cashEntryId: d.id, contaReceberId: id })).rejects.toThrow(/já está processado/);
    expect((await getContasReceber(tenantId, projectId)).find((c) => c.id === id)?.valorRecebido).toBe(200);
  });
});
