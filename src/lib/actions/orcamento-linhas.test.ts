import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt D, D-1 — gravação não destrutiva (BG-11), total de "Receitas do
 * Projeto" vindo do cadastro (BD-1), seleção de linhas (BD-6) com incluir e
 * remover auditados (4-A), Previsão herdando a seleção (BD-7), fim do
 * fallback de receita. Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Prompt D · grade de Orçamentos", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { saveBudgetPlanning, incluirLinhaDoOrcamento, removerLinhaDoOrcamento, createForecastFromBudget } = await import("./planning");
  const { getBudgetPlanning } = await import("@/lib/queries");
  const { RECEITAS_PROJETO_KEY } = await import("@/lib/budget/config");
  let tenantId = "";
  let projectId = "";
  let budgetId = "";
  const meses = ["01/2026", "02/2026", "03/2026"];
  const conta = (rowKey: string, total: number, pcts: number[], dre = "Despesa Fixa") => ({ rowKey, dreCategory: dre, total, months: meses.map((mes, i) => ({ mes, pct: pcts[i] ?? 0 })) });
  const contasGravadas = async (kind: string) => (await db.select().from(schema.budgetAccounts).where(and(eq(schema.budgetAccounts.versionId, budgetId), eq(schema.budgetAccounts.kind, kind)))).map((a) => `${a.rowKey}=${Number(a.total)}`).sort();

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-prompt-d" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "Obra D", status: "Planejamento", startDate: "01/10/2026", endDate: "03/20/2026", valorConstrucao: "270000", valorTerreno: "105000", terrenoForaCaixa: true }).returning();
    projectId = p.id;
    const [b] = await db.insert(schema.versions).values({ tenantId, projectId, key: "budget", kind: "budget", label: "Budget", color: "#000", isDefault: true }).returning();
    budgetId = b.id;
    // Plano de contas: dois grupos de despesa e um de receita ("Outras Receitas")
    await db.insert(schema.chartAccounts).values([
      { tenantId, code: "1.1", name: "Terraplenagem", groupCode: "1", groupName: "Serviços Preliminares", kind: "cef", natureza: "despesa", ativo: true },
      { tenantId, code: "F.1", name: "Juros", groupCode: "F", groupName: "Financeiro / Contábil", kind: "complementar", natureza: "despesa", ativo: true },
      { tenantId, code: "OR.1", name: "Aluguel de equipamento", groupCode: "OR", groupName: "Outras Receitas", kind: "complementar", natureza: "receita", ativo: true },
    ]);
    // Linha legada "Receita" com valor (BD-2), gravada antes do Prompt D.
    await db.insert(schema.budgetAccounts).values({ tenantId, versionId: budgetId, kind: "receita", rowKey: "Receita", dreCategory: "Receita", total: "204140.40" });
    await db.insert(schema.budgetLines).values({ tenantId, versionId: budgetId, kind: "receita", rowKey: "Receita", dreCategory: "Receita", mes: "01/2026", valor: "204140.40", pct: "100" });
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "t@t", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("grade padrão: fixa com o total do cadastro, Outras Receitas, legada visível; despesas = grupos do plano; sem fallback", async () => {
    const d = await getBudgetPlanning(tenantId, projectId, "budget");
    expect(d.project.receitaDoCadastro).toBe(270000);
    expect(d.selecao).toEqual({ receita: false, despesa: false });
    expect(d.receitas.map((r) => `${r.rowKey}:${r.total}`)).toEqual([`${RECEITAS_PROJETO_KEY}:270000`, "OR:0", "Receita:204140.4"]);
    expect(d.receitas[0].fixa).toBe(true);
    expect(d.receitas[2].fromChart).toBe(false);
    expect(d.despesas.map((r) => r.rowKey)).toEqual(["1", "F"]);
  });

  it("salvar receitas sem mandar a legada NÃO a apaga (BG-11); o total da fixa é o do cadastro, não o do cliente", async () => {
    await saveBudgetPlanning(budgetId, "receita", [conta(RECEITAS_PROJETO_KEY, 999, [50, 50, 0], "Receita"), conta("OR", 1000, [100, 0, 0], "Receita")]);
    expect(await contasGravadas("receita")).toEqual(["OR=1000", "Receita=204140.4", `${RECEITAS_PROJETO_KEY}=270000`]);
    const linhas = await db.select().from(schema.budgetLines).where(and(eq(schema.budgetLines.versionId, budgetId), eq(schema.budgetLines.rowKey, RECEITAS_PROJETO_KEY)));
    expect(linhas.map((l) => `${l.mes}:${Number(l.valor)}`).sort()).toEqual(["01/2026:135000", "02/2026:135000"]);
    const legada = await db.select().from(schema.budgetLines).where(and(eq(schema.budgetLines.versionId, budgetId), eq(schema.budgetLines.rowKey, "Receita")));
    expect(legada.length).toBe(1);
    expect(Number(legada[0].valor)).toBe(204140.4);
  });

  it("conta enviada zerada é apagada (o usuário zerou); conta ausente fica", async () => {
    await saveBudgetPlanning(budgetId, "despesa", [conta("1", 500, [100, 0, 0]), conta("F", 300, [0, 100, 0])]);
    expect(await contasGravadas("despesa")).toEqual(["1=500", "F=300"]);
    await saveBudgetPlanning(budgetId, "despesa", [conta("1", 0, [0, 0, 0])]);
    expect(await contasGravadas("despesa")).toEqual(["F=300"]);
    await saveBudgetPlanning(budgetId, "despesa", [conta("1", 500, [100, 0, 0])]);
  });

  it("remover: fixa e legada recusadas; linha com valor exige confirmação; remoção apaga o lançamento e registra o que saiu", async () => {
    expect((await removerLinhaDoOrcamento(budgetId, "receita", RECEITAS_PROJETO_KEY)).ok).toBe(false);
    expect((await removerLinhaDoOrcamento(budgetId, "receita", "Receita"))).toMatchObject({ ok: false, error: expect.stringMatching(/legada/) });
    expect((await removerLinhaDoOrcamento(budgetId, "despesa", "F"))).toMatchObject({ ok: false, error: expect.stringMatching(/confirme/) });
    const r = await removerLinhaDoOrcamento(budgetId, "despesa", "F", true);
    expect(r.ok).toBe(true);
    expect(await contasGravadas("despesa")).toEqual(["1=500"]);
    const d = await getBudgetPlanning(tenantId, projectId, "budget");
    expect(d.selecao.despesa).toBe(true);
    expect(d.despesas.map((x) => x.rowKey)).toEqual(["1"]);
    const [l] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "budget.linha.remover")));
    expect(l.meta).toMatchObject({ bloco: "despesa", rowKey: "F", conta: "Financeiro / Contábil", total: 300, competencias: 1, meses: [{ mes: "02/2026", pct: 100 }] });
    // a legada "Receita" continua lá
    expect(await contasGravadas("receita")).toContain("Receita=204140.4");
  });

  it("incluir: só grupo ativo da natureza e ausente; entra zerado; registra", async () => {
    expect((await incluirLinhaDoOrcamento(budgetId, "despesa", "1"))).toMatchObject({ ok: false, error: expect.stringMatching(/já está/) });
    expect((await incluirLinhaDoOrcamento(budgetId, "despesa", "OR"))).toMatchObject({ ok: false, error: expect.stringMatching(/é de receita/) });
    expect((await incluirLinhaDoOrcamento(budgetId, "despesa", "ZZ"))).toMatchObject({ ok: false, error: expect.stringMatching(/Cadastre-o/) });
    expect(await incluirLinhaDoOrcamento(budgetId, "despesa", "F")).toMatchObject({ ok: true, linha: { rowKey: "F", label: "Financeiro / Contábil", dreCategory: "Despesa Fixa" } });
    const d = await getBudgetPlanning(tenantId, projectId, "budget");
    expect(d.despesas.map((x) => `${x.rowKey}:${x.total}`)).toEqual(["1:500", "F:0"]);
    expect(await contasGravadas("despesa")).toEqual(["1=500"]); // zerada não grava budget_account
    const logs = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "budget.linha.incluir")));
    expect(logs.length).toBe(1);
  });

  it("linha zerada sai sem confirmação", async () => {
    expect((await removerLinhaDoOrcamento(budgetId, "despesa", "F")).ok).toBe(true);
    expect((await getBudgetPlanning(tenantId, projectId, "budget")).despesas.map((x) => x.rowKey)).toEqual(["1"]);
  });

  it("a Previsão herda a seleção (BD-7) e recusa incluir/remover", async () => {
    const fid = await createForecastFromBudget(projectId, budgetId, "Revisão 01");
    const sel = await db.select().from(schema.budgetSelecoes).where(eq(schema.budgetSelecoes.versionId, fid));
    expect(sel.map((s) => `${s.kind}:${s.rowKey}`)).toEqual(["despesa:1"]);
    const f = await getBudgetPlanning(tenantId, projectId, "forecast", fid);
    expect(f.despesas.map((x) => x.rowKey)).toEqual(["1"]);
    expect(f.receitas.map((x) => x.rowKey)).toEqual([RECEITAS_PROJETO_KEY, "OR", "Receita"]);
    expect((await incluirLinhaDoOrcamento(fid, "despesa", "F"))).toMatchObject({ ok: false, error: expect.stringMatching(/herda/) });
  });

  it("sem permissão de editar, incluir e remover recusam", async () => {
    ctxRef.current = { ...(ctxRef.current as object), perms: { ...defaultPermissions("owner"), budget: { ver: true, criar: false, editar: false, excluir: false } } };
    expect((await incluirLinhaDoOrcamento(budgetId, "despesa", "F"))).toMatchObject({ ok: false, error: expect.stringMatching(/Sem permissão/) });
    expect((await removerLinhaDoOrcamento(budgetId, "despesa", "1", true))).toMatchObject({ ok: false, error: expect.stringMatching(/Sem permissão/) });
  });
});
