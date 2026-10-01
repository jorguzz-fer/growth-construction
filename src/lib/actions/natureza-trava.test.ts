import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt S, 3-C e 3.2 — a trava de natureza em TODOS os caminhos que gravam
 * `despesa.categoria_dre`, chamados direto (sem a tela), e o domínio do status.
 * Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Trava de natureza em todos os caminhos (Prompt S, PR S-1)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { ERRO_CATEGORIA_CREDORA } = await import("@/lib/calc/natureza-dre");
  const { addDespesa, updateDespesa } = await import("./despesas");
  const { concluirAcerto, ratearEntreObras } = await import("./acerto");
  const { criarLancamentoDoExtrato } = await import("./caixa");
  let tenantId = "";
  let projectId = "";
  let versionId = "";
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const contagemReceita = () => db.select().from(schema.despesas).where(eq(schema.despesas.categoriaDre, "Receita")).then((r) => r.length);
  let receitaAntes = 0;

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "natureza-S1" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA S1" }).returning();
    projectId = p.id;
    const [v] = await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    versionId = v.id;
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "s@teste", role: "owner", perms: defaultPermissions("owner") };
    receitaAntes = await contagemReceita();
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("15h — addDespesa chamada direto com 'Receita' é recusada com a mensagem do módulo", async () => {
    const r = await addDespesa(fd({ projectId, categoriaDre: "Receita", valor: "100", competencia: "09/2026", vencimento: "09/30/2026" }));
    expect(r).toEqual({ ok: false, error: ERRO_CATEGORIA_CREDORA });
  });

  it("15i — sem categoria é recusada, com a mensagem própria", async () => {
    const r = await addDespesa(fd({ projectId, categoriaDre: "", valor: "100", competencia: "09/2026", vencimento: "09/30/2026" }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("Selecione a categoria DRE da despesa.");
  });

  it("3.2 — status fora da lista é recusado na criação e na edição; 'Pago' continua aceito (decisão pendente)", async () => {
    const ruim = await addDespesa(fd({ projectId, categoriaDre: "Custo Fixo", valor: "10", competencia: "09/2026", vencimento: "09/30/2026", status: "Quitado" }));
    expect(ruim.ok).toBe(false);
    expect((ruim as { error: string }).error).toMatch(/Status inválido: "Quitado"/);
    const ok = await addDespesa(fd({ projectId, categoriaDre: "Custo Fixo", valor: "10", competencia: "09/2026", vencimento: "09/30/2026", status: "Pago" }));
    expect(ok.ok).toBe(true);
    const id = (ok as { id: string }).id;
    const u = await updateDespesa(id, { status: "Liquidado" });
    expect(u.ok).toBe(false);
    expect((u as { error: string }).error).toMatch(/Status inválido/);
    expect((await db.select().from(schema.despesas).where(eq(schema.despesas.id, id)))[0].status).toBe("Pago");
  });

  it("15l — a diferença do Acerto recusa categoria credora antes de tocar o banco", async () => {
    const r = await concluirAcerto({ dataPagamento: "09/01/2026", valorTransferido: 100, itens: [{ despesaId: "00000000-0000-0000-0000-000000000000", valor: 100 }], categoriaDiferenca: "Receita" });
    expect(r).toEqual({ ok: false, error: ERRO_CATEGORIA_CREDORA });
  });

  it("15l — o rateio entre obras recusa categoria credora", async () => {
    const r = await ratearEntreObras({ prestadorId: null, valorTotal: 100, dataPagamento: "09/01/2026", categoriaDre: "Receita", linhas: [] });
    expect(r).toEqual({ ok: false, error: ERRO_CATEGORIA_CREDORA });
  });

  it("15l — a despesa criada do extrato (saída) exige categoria devedora; a entrada não passa pela trava", async () => {
    const semCategoria = await criarLancamentoDoExtrato({ mov: { data: "09/03/2026", descricao: "PIX", valor: -50, doc: "s1-a" }, projectId, caixaProjectId: projectId });
    expect(semCategoria.ok).toBe(false);
    expect(semCategoria.error).toBe("Selecione a categoria DRE da despesa.");
    const credora = await criarLancamentoDoExtrato({ mov: { data: "09/03/2026", descricao: "PIX", valor: -50, doc: "s1-b" }, projectId, caixaProjectId: projectId, categoriaDre: "Receita" });
    expect(credora.error).toBe(ERRO_CATEGORIA_CREDORA);
    const ok = await criarLancamentoDoExtrato({ mov: { data: "09/03/2026", descricao: "PIX", valor: -50, doc: "s1-c" }, projectId, caixaProjectId: projectId, categoriaDre: "Custo Fixo" });
    expect(ok.ok).toBe(true);
    const [d] = await db.select().from(schema.despesas).where(eq(schema.despesas.id, ok.id!));
    expect(d.categoriaDre).toBe("Custo Fixo");
    const entrada = await criarLancamentoDoExtrato({ mov: { data: "09/04/2026", descricao: "PIX", valor: 60, doc: "s1-d" }, projectId, caixaProjectId: projectId });
    expect(entrada.ok).toBe(true);
    expect(d.versionId).toBe(versionId);
  });

  it("15o — a trava não corrige o passado: a contagem de 'Receita' não muda", async () => {
    expect(await contagemReceita()).toBe(receitaAntes);
  });
});
