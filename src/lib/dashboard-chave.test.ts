import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/** Prompt AA, 10.2 — a chave do Dashboard. Integração: só com DATABASE_URL. */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("@/lib/context", async (orig) => ({ ...(await orig<typeof import("@/lib/context")>()), getTenantContext: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt AA — chave dashboard_definicao_nova (banco)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { getStatusProjeto, getIndicadoresObra } = await import("./queries");
  const { previaDashboardDefinicaoNova } = await import("./dashboard-previa");
  let tenantId = "";
  let A = "";
  let B = "";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "aa2-chave" }).returning();
    tenantId = t.id;
    A = (await db.insert(schema.projects).values({ tenantId, name: "A", startDate: "01/01/2026", endDate: "03/31/2026" } as never).returning())[0].id;
    B = (await db.insert(schema.projects).values({ tenantId, name: "B", financiamentoConstrucao: "800000", financiamentoTerreno: "150000" } as never).returning())[0].id;
    const ver = async (projectId: string, kind: string, label: string, dia: number, extra: Record<string, unknown> = {}) =>
      (await db.insert(schema.versions).values({ tenantId, projectId, key: label, kind, label, color: "#000", createdAt: new Date(2026, 0, dia), ...extra } as never).returning())[0].id as string;
    const atual = await ver(A, "atual", "Atual", 1);
    const orc1 = await ver(A, "budget", "Orç antigo", 2);
    const orc2 = await ver(A, "budget", "Orç novo", 3);
    await ver(A, "budget", "Orç cópia", 4, { sourceVersionId: orc2 });
    const prev = await ver(A, "forecast", "Prev", 5);
    await ver(B, "atual", "Atual B", 1);
    for (const [vid, data, valor] of [[atual, "02/10/2026", "500"], [atual, "06/10/2026", "50"], [prev, "02/10/2026", "300"]] as const)
      await db.insert(schema.cashEntries).values({ tenantId, versionId: vid, data, valor, descricao: "x" } as never);
    const desp = (competencia: string, valor: string, categoriaDre: string) =>
      db.insert(schema.despesas).values({ versionId: atual, tenantId, valor, categoriaDre, competencia, vencimento: "10/03/2026", status: "A pagar", obs: "AA2" } as never);
    await desp("02/2026", "100", "Custo Variável");
    await desp("05/2026", "70", "Custo Variável"); // fora da janela do projeto (jan–mar)
    await desp("03/2026", "40", "Despesa Variável");
    const bl = (versionId: string, mes: string, valor: string) =>
      db.insert(schema.budgetLines).values({ tenantId, versionId, kind: "despesa", rowKey: `d-${mes}-${valor}`, dreCategory: "Custo Variável", mes, valor } as never);
    await bl(orc1, "02/2026", "1000");
    await bl(orc2, "02/2026", "3000");
    await bl(orc2, "06/2026", "500");
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("desligada: como antes — todas as versões no caixa e todos os Orçamentos somados", async () => {
    const st = await getStatusProjeto(tenantId, [A]);
    expect(st.recebido).toBe(850);
    expect(st.despesaPrevista).toBe(4500);
    expect(st.margemContribuicao).toBe(-210);
    expect(st.composicao.definicaoNova).toBe(false);
  });

  it("4-B.1 e 4-B.2 — ligada: caixa só da Atual; um Orçamento, o mais recente que não é cópia", async () => {
    const st = await getStatusProjeto(tenantId, [A], { definicaoNova: true });
    expect(st.recebido).toBe(550);
    expect(st.despesaPrevista).toBe(3500);
    expect(st.composicao.orcamentosUsados).toEqual(["Orç novo"]);
  });

  it("4-B.3 — ligada: os custos da margem na janela do projeto (jan–mar)", async () => {
    const st = await getStatusProjeto(tenantId, [A], { definicaoNova: true });
    expect(st.composicao.janela).toBe("projeto");
    expect(st.custoVariavel).toBe(100);
    expect(st.margemContribuicao).toBe(-140);
  });

  it("2.3.2 — ligada, com período: caixa pela data, despesa e Orçamento pela competência", async () => {
    const st = await getStatusProjeto(tenantId, [A], { definicaoNova: true, de: "06/01/2026", ate: "06/30/2026" });
    expect(st.recebido).toBe(50);
    expect(st.despesaPrevista).toBe(500);
    expect(st.executado).toBe(0);
    expect(st.composicao.janela).toBe("periodo");
  });

  it("3.1 — ligada: sem medição, liberação e saldo não assumem o cadastro", async () => {
    const hoje = await getIndicadoresObra(tenantId, B);
    const nova = await getIndicadoresObra(tenantId, B, { definicaoNova: true });
    expect([hoje.liberacaoAcumulada, hoje.saldoFinanciamento]).toEqual([150000, 800000]);
    expect([nova.liberacaoAcumulada, nova.saldoFinanciamento, nova.temMedicao]).toEqual([0, 0, false]);
  });

  it("prévia: hoje × nova, cartão a cartão, e não grava nada", async () => {
    const contar = async () => (await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.tenantId, tenantId))).length;
    const antes = await contar();
    const pv = await previaDashboardDefinicaoNova(tenantId, [{ id: A, name: "A" }, { id: B, name: "B" }]);
    expect(await contar()).toBe(antes);
    const linha = (o: number, c: string) => pv[o].linhas.find((l) => l.cartao === c)!;
    expect(linha(0, "Entradas de caixa")).toMatchObject({ hoje: 850, nova: 550 });
    expect(linha(0, "Executado — denominador (Orçamento)")).toMatchObject({ hoje: 4500, nova: 3500 });
    // 01/10: Liberação acumulada e Saldo de financiamento saíram da tela de vez.
    expect(pv[1].linhas.some((l) => l.cartao === "Liberação acumulada")).toBe(false);
  });
});
