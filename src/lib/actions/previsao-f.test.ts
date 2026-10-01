import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt F, F-1 — nome obrigatório (3.2), limite dentro da transação com
 * mensagem legível (3.4, FC-10), seletor ordenado da mais recente com origem
 * e data (2), totais da origem para a divergência (6.2), comparação sem
 * fallback (FC-07), ausente ≠ zero (5.3). Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {}, delete: () => {} }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));

describe.skipIf(!HAS_DB)("Prompt F · Previsão Atualizada", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { createForecastFromBudget, duplicateForecast, saveBudgetPlanning } = await import("./planning");
  const { getBudgetPlanning, getForecastComparison } = await import("@/lib/queries");
  let tenantId = "";
  let projectId = "";
  let budgetId = "";
  let orfaId = "";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-prompt-f" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "Obra F", status: "Planejamento", startDate: "01/10/2026", endDate: "02/20/2026", valorConstrucao: "100000", terrenoForaCaixa: true }).returning();
    projectId = p.id;
    const [b] = await db.insert(schema.versions).values({ tenantId, projectId, key: "budget", kind: "budget", label: "Orçamento base", color: "#000", isDefault: true }).returning();
    budgetId = b.id;
    await db.insert(schema.chartAccounts).values([
      { tenantId, code: "1.1", name: "Terraplenagem", groupCode: "1", groupName: "Serviços Preliminares", kind: "cef", natureza: "despesa", ativo: true },
      { tenantId, code: "2.1", name: "Estacas", groupCode: "2", groupName: "Fundações", kind: "cef", natureza: "despesa", ativo: true },
    ]);
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "t@t", role: "owner", perms: defaultPermissions("owner") };
    await saveBudgetPlanning(budgetId, "despesa", [{ rowKey: "1", dreCategory: "Custo Variável", total: 400, months: [{ mes: "01/2026", pct: 100 }, { mes: "02/2026", pct: 0 }] }]);
    // previsão órfã (sem origem), como as antigas em produção
    const [o] = await db.insert(schema.versions).values({ tenantId, projectId, key: "forecast-orfa", kind: "forecast", label: "Forecast", color: "#000" }).returning();
    orfaId = o.id;
    // a órfã tem seleção só com "2": "1" fica AUSENTE da grade dela (5.3)
    await db.insert(schema.budgetSelecoes).values({ tenantId, versionId: orfaId, kind: "despesa", rowKey: "2", ordem: 0 });
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("criar exige nome e devolve { ok, id }", async () => {
    expect(await createForecastFromBudget(projectId, budgetId, "  ")).toMatchObject({ ok: false, error: expect.stringMatching(/nome/) });
    const r = await createForecastFromBudget(projectId, budgetId, "Revisão 01");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [v] = await db.select().from(schema.versions).where(eq(schema.versions.id, r.id));
    expect(v.label).toBe("Revisão 01");
    expect(v.sourceVersionId).toBe(budgetId);
    const contas = await db.select().from(schema.budgetAccounts).where(eq(schema.budgetAccounts.versionId, r.id));
    expect(contas.map((c) => `${c.rowKey}=${Number(c.total)}`)).toEqual(["1=400"]);
  });

  it("seletor: da mais recente para a mais antiga, com origem e data; totais da origem para divergência", async () => {
    const d = await getBudgetPlanning(tenantId, projectId, "forecast");
    expect(d.versions.map((v) => v.label)).toEqual(["Revisão 01", "Forecast"]);
    expect(d.versions[0].sourceLabel).toBe("Orçamento base");
    expect(d.versions[0].sourceKind).toBe("budget");
    expect(d.versions[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(d.versions[1].sourceLabel).toBeNull();
    // selecionada = a padrão? nenhuma é padrão → a primeira (mais recente)
    expect(d.versionId).toBe(d.versions[0].id);
    expect(d.totaisDaOrigem).toEqual({ receita: {}, despesa: { "1": 400 } });
    // muda o orçamento: a previsão mantém 400 e a origem passa a 500 (divergência visível, não corrigida)
    await saveBudgetPlanning(budgetId, "despesa", [{ rowKey: "1", dreCategory: "Custo Variável", total: 500, months: [{ mes: "01/2026", pct: 100 }, { mes: "02/2026", pct: 0 }] }]);
    const d2 = await getBudgetPlanning(tenantId, projectId, "forecast", d.versionId);
    expect(d2.despesas.find((r) => r.rowKey === "1")?.total).toBe(400);
    expect(d2.totaisDaOrigem?.despesa["1"]).toBe(500);
  });

  it("comparação: sem origem não escolhe sozinha; base explícita funciona; ausente é null, não zero", async () => {
    const semBase = await getForecastComparison(tenantId, orfaId);
    expect(semBase.ok).toBe(false);
    expect(semBase.semOrigem).toBe(true);
    expect(semBase.orcamentos?.map((b) => b.label)).toEqual(["Orçamento base"]);
    const comBase = await getForecastComparison(tenantId, orfaId, budgetId);
    expect(comBase.ok).toBe(true);
    expect(comBase.baseEscolhida).toBe(true);
    expect(comBase.regime).toBe("competência");
    // "1" não está na grade da órfã → previsão null (ausente), não zero; orçamento 500
    expect(comBase.despesas.find((r) => r.rowKey === "1")).toMatchObject({ budget: 500, forecast: null });
    // "2" está nas duas grades, zerada: zero é zero
    expect(comBase.despesas.find((r) => r.rowKey === "2")).toMatchObject({ budget: 0, forecast: 0 });
    expect(comBase.budgetByMonth["01/2026"]).toBe(-500);
    // base de outro projeto/tenant é recusada
    const [outro] = await db.insert(schema.tenants).values({ name: "tenant-prompt-f-outro" }).returning();
    const [po] = await db.insert(schema.projects).values({ tenantId: outro.id, name: "Outra", status: "Planejamento" }).returning();
    const [bo] = await db.insert(schema.versions).values({ tenantId: outro.id, projectId: po.id, key: "budget", kind: "budget", label: "B", color: "#000" }).returning();
    expect((await getForecastComparison(tenantId, orfaId, bo.id)).ok).toBe(false);
    await db.delete(schema.tenants).where(eq(schema.tenants.id, outro.id));
  });

  it("limite de 12 dentro da transação, com mensagem legível e aviso perto do teto", async () => {
    // já existem 2 (órfã + Revisão 01); cria até 12
    for (let i = 3; i <= 12; i++) {
      const r = await createForecastFromBudget(projectId, budgetId, `Rev ${i}`);
      expect(r.ok).toBe(true);
      if (r.ok && i >= 10) expect(r.aviso ?? "").toMatch(/restam|atingido/);
    }
    const r13 = await createForecastFromBudget(projectId, budgetId, "Rev 13");
    expect(r13).toEqual({ ok: false, error: "Limite de 12 versões de Previsão por projeto atingido." });
    const d = await duplicateForecast(orfaId, "Cópia");
    expect(d.ok).toBe(false);
    const n = await db.select().from(schema.versions).where(eq(schema.versions.projectId, projectId));
    expect(n.filter((v) => v.kind === "forecast").length).toBe(12);
  });

  it("sem permissão de criar, criar e duplicar recusam", async () => {
    ctxRef.current = { ...(ctxRef.current as object), perms: { ...defaultPermissions("owner"), forecast: { ver: true, criar: false, editar: true, excluir: false } } };
    expect((await createForecastFromBudget(projectId, budgetId, "X")).ok).toBe(false);
    expect((await duplicateForecast(orfaId, "X")).ok).toBe(false);
  });
});
