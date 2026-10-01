import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt F, 8.1–8.5 — a reprojeção é proposta pelo assistente e, quando o
 * usuário confirma, cria uma REVISÃO NOVA (a aberta fica intacta), com a
 * origem "assistente" no log; estouro de 100% é recusado antes de criar;
 * sem permissão nada acontece. Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Prompt F · reprojeção proposta pelo assistente", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { saveBudgetPlanning, createForecastFromBudget } = await import("./planning");
  const { proporReprojecao, criarRevisaoComReprojecao } = await import("./previsao-assistente");
  const { getBudgetPlanning } = await import("@/lib/queries");
  let tenantId = "";
  let projectId = "";
  let budgetId = "";
  let atualId = "";
  let previsaoId = "";
  const ano = new Date().getFullYear() + 1; // período futuro: nenhuma competência decorrida
  const meses = [`01/${ano}`, `02/${ano}`];

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-prompt-f-ia" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "Obra F IA", status: "Planejamento", startDate: `01/10/${ano}`, endDate: `02/20/${ano}`, valorConstrucao: "100000", terrenoForaCaixa: true }).returning();
    projectId = p.id;
    const [b] = await db.insert(schema.versions).values({ tenantId, projectId, key: "budget", kind: "budget", label: "Orçamento", color: "#000", isDefault: true }).returning();
    budgetId = b.id;
    const [a] = await db.insert(schema.versions).values({ tenantId, projectId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    atualId = a.id;
    await db.insert(schema.chartAccounts).values([{ tenantId, code: "1.1", name: "Terraplenagem", groupCode: "1", groupName: "Serviços Preliminares", kind: "cef", natureza: "despesa", ativo: true }]);
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "t@t", role: "owner", perms: defaultPermissions("owner") };
    await saveBudgetPlanning(budgetId, "despesa", [{ rowKey: "1", dreCategory: "Custo Variável", total: 400, months: [{ mes: meses[0], pct: 50 }, { mes: meses[1], pct: 50 }] }]);
    const criada = await createForecastFromBudget(projectId, budgetId, "Revisão 01");
    if (!criada.ok) throw new Error(criada.error);
    previsaoId = criada.id;
    // a previsão foi redistribuída à mão: 100% no primeiro mês
    await saveBudgetPlanning(previsaoId, "despesa", [{ rowKey: "1", dreCategory: "Custo Variável", total: 400, months: [{ mes: meses[0], pct: 100 }, { mes: meses[1], pct: 0 }] }]);
    // o orçamento mudou depois: 20/80 — é isso que "partir do orçamento" propõe
    await saveBudgetPlanning(budgetId, "despesa", [{ rowKey: "1", dreCategory: "Custo Variável", total: 400, months: [{ mes: meses[0], pct: 20 }, { mes: meses[1], pct: 80 }] }]);
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("propõe a partir do orçamento: comparação antes/depois, sem gravar", async () => {
    const r = await proporReprojecao(previsaoId, "orcamento");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.proposta.contas.find((x) => x.rowKey === "1")!;
    expect(c.antes).toEqual({ [meses[0]]: 100, [meses[1]]: 0 });
    expect(c.depois).toEqual({ [meses[0]]: 20, [meses[1]]: 80 });
    expect(c.variacao).toBe(640);
    const linhas = await db.select().from(schema.budgetLines).where(and(eq(schema.budgetLines.versionId, previsaoId), eq(schema.budgetLines.rowKey, "1")));
    expect(linhas.map((l) => `${l.mes}:${Number(l.pct)}`)).toEqual([`${meses[0]}:100`]);
  });

  it("partir do realizado sem competência decorrida: só redistribui o futuro por igual", async () => {
    const r = await proporReprojecao(previsaoId, "realizado");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposta.decorridas).toEqual([]);
    expect(r.proposta.contas[0].depois).toEqual({ [meses[0]]: 50, [meses[1]]: 50 });
  });

  it("confirmar cria uma revisão nova com a distribuição proposta; a atual fica intacta; log com origem assistente", async () => {
    const r = await criarRevisaoComReprojecao(previsaoId, "orcamento", "Revisão 02 · reprojeção");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).not.toBe(previsaoId);
    const nova = await getBudgetPlanning(tenantId, projectId, "forecast", r.id);
    expect(nova.despesas.find((x) => x.rowKey === "1")?.pct).toEqual({ [meses[0]]: 20, [meses[1]]: 80 });
    expect(nova.despesas.find((x) => x.rowKey === "1")?.total).toBe(400);
    const antiga = await getBudgetPlanning(tenantId, projectId, "forecast", previsaoId);
    expect(antiga.despesas.find((x) => x.rowKey === "1")?.pct).toEqual({ [meses[0]]: 100 });
    const [l] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "forecast.reprojecao")));
    expect(l.meta).toMatchObject({ origem: "assistente", base: "orcamento", de: previsaoId, contas: ["1"] });
    expect(l.entityId).toBe(r.id);
  });

  it("estouro de 100% é recusado antes de criar (8.4)", async () => {
    // competência decorrida com realizado acima do total: período passado
    const anoP = new Date().getFullYear() - 1;
    const [p2] = await db.insert(schema.projects).values({ tenantId, name: "Obra Passada", status: "Planejamento", startDate: `01/10/${anoP}`, endDate: `02/20/${anoP}`, valorConstrucao: "1000", terrenoForaCaixa: true }).returning();
    const [b2] = await db.insert(schema.versions).values({ tenantId, projectId: p2.id, key: "budget", kind: "budget", label: "Orç", color: "#000", isDefault: true }).returning();
    const [a2] = await db.insert(schema.versions).values({ tenantId, projectId: p2.id, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    ctxRef.current = { ...(ctxRef.current as object), projects: [{ id: projectId }, p2] };
    await saveBudgetPlanning(b2.id, "despesa", [{ rowKey: "1", dreCategory: "Custo Variável", total: 100, months: [{ mes: `01/${anoP}`, pct: 50 }, { mes: `02/${anoP}`, pct: 50 }] }]);
    const f2 = await createForecastFromBudget(p2.id, b2.id, "R1");
    if (!f2.ok) throw new Error(f2.error);
    await db.insert(schema.despesas).values({ tenantId, versionId: a2.id, valor: "150", contaCef: "1.1", competencia: `01/${anoP}`, categoriaDre: "Custo Variável" });
    const prop = await proporReprojecao(f2.id, "realizado");
    expect(prop.ok && prop.proposta.contas[0].estouro).toBe(50);
    const r = await criarRevisaoComReprojecao(f2.id, "realizado", "R2");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/acima do total herdado/) });
    const versoes = await db.select().from(schema.versions).where(and(eq(schema.versions.projectId, p2.id), eq(schema.versions.kind, "forecast")));
    expect(versoes.length).toBe(1);
    void atualId;
  });

  it("sem permissão de criar, confirmar recusa; sem origem, partir do orçamento recusa", async () => {
    ctxRef.current = { ...(ctxRef.current as object), perms: { ...defaultPermissions("owner"), forecast: { ver: true, criar: false, editar: true, excluir: false } } };
    expect((await criarRevisaoComReprojecao(previsaoId, "orcamento", "X"))).toMatchObject({ ok: false, error: expect.stringMatching(/Sem permissão/) });
    ctxRef.current = { ...(ctxRef.current as object), perms: defaultPermissions("owner") };
    await db.update(schema.versions).set({ sourceVersionId: null }).where(eq(schema.versions.id, previsaoId));
    expect((await proporReprojecao(previsaoId, "orcamento"))).toMatchObject({ ok: false, error: expect.stringMatching(/origem/) });
  });
});
