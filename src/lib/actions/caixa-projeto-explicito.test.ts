import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt A, PR 4 — Caixa sem "projeto ativo". Todo movimento de caixa vai
 * para a versão de trabalho da obra que a tela informa, e só se ela for da
 * empresa. Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Caixa com obra explícita", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { versaoDeTrabalho } = await import("@/lib/context");
  const { addCash, importCash, pairMovimento, criarLancamentoDoExtrato } = await import("./caixa");
  const tenants: string[] = [];
  let tA: typeof schema.tenants.$inferSelect;
  const p: Record<string, typeof schema.projects.$inferSelect> = {};
  const v: Record<string, typeof schema.versions.$inferSelect> = {};

  async function versao(chave: string, tenantId: string, kind: "atual" | "budget" | "forecast", isDefault = false) {
    const [row] = await db
      .insert(schema.versions)
      .values({ projectId: p[chave].id, tenantId, key: kind, kind, label: kind, color: "#000", isDefault })
      .returning();
    return row;
  }
  const caixaDe = (versionId: string) =>
    db.select().from(schema.cashEntries).where(eq(schema.cashEntries.versionId, versionId));
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, val] of Object.entries(campos)) f.set(k, val);
    return f;
  };

  beforeAll(async () => {
    [tA] = await db.insert(schema.tenants).values({ name: "caixa-A" }).returning();
    const [tB] = await db.insert(schema.tenants).values({ name: "caixa-B" }).returning();
    tenants.push(tA.id, tB.id);
    for (const [k, t, nome] of [
      ["a1", tA.id, "OBRA 1"],
      ["a2", tA.id, "OBRA 2"],
      ["semAtual", tA.id, "OBRA SEM ATUAL"],
      ["b1", tB.id, "OBRA B"],
    ] as const) {
      [p[k]] = await db.insert(schema.projects).values({ tenantId: t, name: nome }).returning();
    }
    v.a1 = await versao("a1", tA.id, "atual");
    v.a2budget = await versao("a2", tA.id, "budget");
    v.a2 = await versao("a2", tA.id, "atual");
    v.semAtualBudget = await versao("semAtual", tA.id, "budget");
    v.semAtualForecast = await versao("semAtual", tA.id, "forecast", true);
    v.b1 = await versao("b1", tB.id, "atual");
    ctxRef.current = {
      tenant: tA,
      projects: [p.a1, p.a2, p.semAtual],
      userId: null,
      userEmail: null,
      role: "owner",
      perms: defaultPermissions("owner"),
    };
  });
  afterAll(async () => {
    for (const id of tenants) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });

  it("versaoDeTrabalho: Atual → padrão → mais antiga (a regra de sempre)", () => {
    expect(versaoDeTrabalho([v.a2budget, v.a2])?.id).toBe(v.a2.id);
    expect(versaoDeTrabalho([v.semAtualBudget, v.semAtualForecast])?.id).toBe(v.semAtualForecast.id);
    expect(versaoDeTrabalho([v.a2budget])?.id).toBe(v.a2budget.id);
    expect(versaoDeTrabalho([])).toBeNull();
  });

  it("addCash grava na Atual da obra informada (a segunda da lista)", async () => {
    await addCash(fd({ projectId: p.a2.id, tipo: "ajuste", valor: "10", data: "09/29/2026" }));
    expect(await caixaDe(v.a2.id)).toHaveLength(1);
    expect(await caixaDe(v.a1.id)).toHaveLength(0);
    expect(await caixaDe(v.a2budget.id)).toHaveLength(0);
  });

  it("addCash sem Atual: versão padrão da obra (como antes com o cookie)", async () => {
    await addCash(fd({ projectId: p.semAtual.id, tipo: "ajuste", valor: "5" }));
    expect(await caixaDe(v.semAtualForecast.id)).toHaveLength(1);
  });

  it("addCash sem obra ou com obra de outra empresa: recusa, nada gravado", async () => {
    await expect(addCash(fd({ tipo: "ajuste", valor: "10" }))).rejects.toThrow(/Escolha o projeto/);
    await expect(addCash(fd({ projectId: p.b1.id, tipo: "ajuste", valor: "10" }))).rejects.toThrow(
      /Escolha o projeto/,
    );
    expect(await caixaDe(v.b1.id)).toHaveLength(0);
  });

  it("importCash grava na versão da obra informada; obra alheia é recusada", async () => {
    const rows = [{ data: "09/01/2026", descricao: "TED", valor: 77.7, doc: "imp-1" }];
    const r = await importCash({ rows, projectId: p.a1.id });
    expect(r.inserted).toBe(1);
    expect((await caixaDe(v.a1.id)).some((c) => c.doc === "imp-1")).toBe(true);
    await expect(importCash({ rows: [{ ...rows[0], doc: "imp-2" }], projectId: p.b1.id })).rejects.toThrow(
      /Escolha o projeto/,
    );
    expect(await caixaDe(v.b1.id)).toHaveLength(0);
  });

  it("versão congelada da obra informada bloqueia", async () => {
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, v.a1.id));
    await expect(addCash(fd({ projectId: p.a1.id, tipo: "ajuste", valor: "1" }))).rejects.toThrow(/congelada/);
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, v.a1.id));
  });

  it("pairMovimento: obra alheia recusada antes de gravar", async () => {
    const r = await pairMovimento({
      mov: { data: "09/02/2026", descricao: "x", valor: -10, doc: "par-1" },
      projectId: p.b1.id,
      alvoId: "00000000-0000-0000-0000-000000000000",
      alvoTipo: "despesa",
    });
    expect(r).toEqual({ ok: false, error: "Escolha o projeto do caixa." });
  });

  it("criarLancamentoDoExtrato: conta a receber em obra de outra empresa é recusada", async () => {
    const r = await criarLancamentoDoExtrato({
      mov: { data: "09/03/2026", descricao: "PIX", valor: 50, doc: "cr-1" },
      projectId: p.b1.id,
      caixaProjectId: p.a1.id,
    });
    expect(r.ok).toBe(false);
    const crs = await db
      .select()
      .from(schema.contasReceber)
      .where(and(eq(schema.contasReceber.tenantId, tA.id), eq(schema.contasReceber.projectId, p.b1.id)));
    expect(crs).toHaveLength(0);
    expect((await caixaDe(v.a1.id)).some((c) => c.doc === "cr-1")).toBe(false);
  });

  it("criarLancamentoDoExtrato: conta a receber na obra escolhida, caixa na obra da tela", async () => {
    const r = await criarLancamentoDoExtrato({
      mov: { data: "09/04/2026", descricao: "PIX", valor: 60, doc: "cr-2" },
      projectId: p.a1.id,
      caixaProjectId: p.a2.id,
    });
    expect(r.ok).toBe(true);
    expect((await caixaDe(v.a2.id)).some((c) => c.doc === "cr-2")).toBe(true);
    const [cr] = await db.select().from(schema.contasReceber).where(eq(schema.contasReceber.id, r.id!));
    expect(cr.projectId).toBe(p.a1.id);
  });
});
