import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt K, PR K-1 — correções da revisão: valor (CR-04), domínio (CR-05),
 * filtro na consulta (CR-06), unidades da obra (CR-07), identificador do
 * recebível (CR-08), retorno legível (CR-09). Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Contas a Receber — correções da revisão (Prompt K, PR K-1)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { emptyPlan } = await import("@/lib/calc");
  const { createContaReceber, updateContaReceber, cancelarContaReceber } = await import("./contas-receber");
  const { getContasReceber, getReceivables, getUnidadesAtuaisPorObra } = await import("@/lib/queries");
  let tenantId = "";
  let obraA = "";
  let obraB = "";
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const todas = async () => db.select().from(schema.contasReceber).where(eq(schema.contasReceber.tenantId, tenantId));

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "cr-K1" }).returning();
    tenantId = t.id;
    const [a] = await db.insert(schema.projects).values({ tenantId, name: "OBRA A" }).returning();
    const [b] = await db.insert(schema.projects).values({ tenantId, name: "OBRA B" }).returning();
    obraA = a.id;
    obraB = b.id;
    for (const pid of [obraA, obraB]) {
      const [v] = await db.insert(schema.versions).values({ projectId: pid, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
      await db.insert(schema.units).values({
        tenantId, versionId: v.id, code: pid === obraA ? "A-101" : "B-201", valor: "100000", status: "Vendido", mesVenda: "09/01/2026",
        paymentPlan: { ...emptyPlan(), usarAS: true, AS: { val: 100000, venc: "10/01/2026", n: 1, usarS1: false } },
      });
      // Unidade de outra versão (orçamento) não entra no seletor da obra.
      const [vb] = await db.insert(schema.versions).values({ projectId: pid, tenantId, key: "budget", kind: "budget", label: "Orçamento", color: "#000" }).returning();
      await db.insert(schema.units).values({ tenantId, versionId: vb.id, code: "ORC-X", valor: "1", paymentPlan: emptyPlan() });
    }
    ctxRef.current = { tenant: t, projects: [a, b], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("CR-04/CR-05/CR-09 · criação recusa zero, negativo, tipo fora da lista e 'Outras Receitas' sem descrição, com mensagem; nada é gravado", async () => {
    const base = { projectId: obraA, tipo: "Sinal", vencimento: "10/15/2026" };
    expect(await createContaReceber(fd({ ...base, valor: "0" }))).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await createContaReceber(fd({ ...base, valor: "-100" }))).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await createContaReceber(fd({ ...base, valor: "abc" }))).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await createContaReceber(fd({ ...base, tipo: "Aluguel", valor: "10" }))).toEqual({ ok: false, error: expect.stringMatching(/Tipo inválido/) });
    expect(await createContaReceber(fd({ ...base, tipo: "Outras Receitas", valor: "10" }))).toEqual({ ok: false, error: expect.stringMatching(/descrição/) });
    expect(await createContaReceber(fd({ ...base, projectId: "00000000-0000-0000-0000-000000000000", valor: "10" }))).toEqual({ ok: false, error: expect.stringMatching(/projeto/) });
    expect(await todas()).toHaveLength(0);
  });

  it("CR-04 · a edição valida como a criação: não dá para editar para zero nem negativo; status, recebido e data de recebimento são ignorados (K-2, 3.2: estado derivado)", async () => {
    const r = await createContaReceber(fd({ projectId: obraA, tipo: "Sinal", valor: "324,00", vencimento: "10/15/2026" }));
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    const edit = (extra: Record<string, string>) => updateContaReceber(fd({ id, tipo: "Sinal", valor: "324,00", vencimento: "10/15/2026", ...extra }));
    expect(await edit({ valor: "0" })).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await edit({ valor: "-1" })).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    // Status e valor recebido não são mais digitados: o formulário pode até
    // mandar os campos antigos, mas eles não mudam nada (só recebimentos mudam).
    expect(await edit({ status: "Recebido", valorRecebido: "5000", dataRecebimento: "10/10/2026" })).toEqual({ ok: true, id });
    const [c] = await todas();
    expect(c.valor).toBe("324.00");
    expect(c.valorRecebido).toBe("0.00");
    expect(c.status).toBe("A receber");
    expect(c.dataRecebimento).toBeNull();
  });

  it("CR-05/CR-09 · cancelar grava 'Cancelada' com rastro; cancelar de novo ou editar cancelada devolve erro legível", async () => {
    const [c] = await todas();
    expect(await cancelarContaReceber(fd({ id: c.id }))).toEqual({ ok: true, id: c.id });
    const [depois] = await todas();
    expect(depois.cancelado).toBe(true);
    expect(depois.status).toBe("Cancelada");
    expect(await cancelarContaReceber(fd({ id: c.id }))).toEqual({ ok: false, error: expect.stringMatching(/já cancelada/) });
    expect(await updateContaReceber(fd({ id: c.id, tipo: "Sinal", valor: "10", status: "A receber" }))).toEqual({ ok: false, error: expect.stringMatching(/já cancelada/) });
    expect(await cancelarContaReceber(fd({}))).toEqual({ ok: false, error: expect.stringMatching(/não informada/) });
  });

  it("CR-06 · a obra filtra na consulta: contas e recebíveis só da obra pedida; sem obra, todas", async () => {
    expect((await createContaReceber(fd({ projectId: obraA, tipo: "Outros", valor: "10", vencimento: "11/01/2026" }))).ok).toBe(true);
    expect((await createContaReceber(fd({ projectId: obraB, tipo: "Outros", valor: "20", vencimento: "11/02/2026" }))).ok).toBe(true);
    expect((await getContasReceber(tenantId, obraA)).map((c) => c.valor)).toEqual([10]);
    expect((await getContasReceber(tenantId, obraB)).map((c) => c.valor)).toEqual([20]);
    expect((await getContasReceber(tenantId)).map((c) => c.valor).sort()).toEqual([10, 20]);
    expect((await getReceivables(tenantId, obraA)).map((r) => r.unitCode)).toEqual(["A-101"]);
    expect((await getReceivables(tenantId)).map((r) => r.unitCode).sort()).toEqual(["A-101", "B-201"]);
  });

  it("CR-07/CR-08 · unidades por obra só da versão Atual; o recebível tem identificador unidade:índice", async () => {
    const porObra = await getUnidadesAtuaisPorObra(tenantId);
    expect(porObra[obraA]).toEqual(["A-101"]);
    expect(porObra[obraB]).toEqual(["B-201"]);
    const [rec] = await getReceivables(tenantId, obraA);
    const [u] = await db.select({ id: schema.units.id }).from(schema.units).where(eq(schema.units.code, "A-101"));
    expect(rec.refId).toBe(`${u.id}:0`);
  });
});
