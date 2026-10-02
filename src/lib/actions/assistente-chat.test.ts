import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/** Prompt E, Etapa 2 — chat somente leitura. Integração: só com DATABASE_URL. */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
const ia = { ligada: false, pedidos: [] as unknown[][], devolve: {} as Record<string, unknown> };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("@/lib/ai/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/client")>()),
  isAiConfigured: () => ia.ligada,
}));
vi.mock("@/lib/ai/chat-intencao", async () => {
  const { normalizarIntencao } = await import("@/lib/assistente-chat");
  return {
    interpretarPergunta: async (...args: unknown[]) => {
      ia.pedidos.push(args);
      return normalizarIntencao(ia.devolve);
    },
  };
});

describe.skipIf(!HAS_DB)("chat do assistente (Prompt E, Etapa 2)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions, effectivePermissions } = await import("@/lib/permissions");
  const { perguntarAoAssistente } = await import("./assistente-chat");
  let tenantId = "";
  let obraA = { id: "", name: "OBRA CHAT ALFA" };
  let obraB = { id: "", name: "OBRA CHAT BETA" };
  const como = (role: "owner" | "membro", perms?: ReturnType<typeof defaultPermissions>) => {
    ctxRef.current = {
      tenant: { id: tenantId, name: "chat" },
      projects: [obraA, obraB],
      userId: null,
      userEmail: "t@t",
      role,
      perms: perms ?? defaultPermissions(role),
    };
  };
  const resposta = async (pergunta: string, proj: string | null = null) => {
    const r = await perguntarAoAssistente(pergunta, proj);
    if (!r.ok) throw new Error(r.error);
    const sp = (x: string) => x.replace(/\u00a0/g, " ");
    return { ...r.resposta, texto: sp(r.resposta.texto), tudo: sp([r.resposta.texto, ...r.resposta.detalhes].join(" ")) };
  };

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-chat" }).returning();
    tenantId = t.id;
    for (const o of [obraA, obraB]) {
      const [p] = await db.insert(schema.projects).values({ tenantId, name: o.name }).returning();
      o.id = p.id;
    }
    obraA = { ...obraA };
    obraB = { ...obraB };
    const versao = async (projectId: string, kind: "atual" | "budget") =>
      (await db.insert(schema.versions).values({ projectId, tenantId, key: kind, kind, label: kind, color: "#000" }).returning())[0];
    const aAtual = await versao(obraA.id, "atual");
    const aBudget = await versao(obraA.id, "budget");
    const bAtual = await versao(obraB.id, "atual");
    await db.insert(schema.despesas).values([
      { tenantId, versionId: aAtual.id, categoriaDre: "Custo Variável", valor: "1000", status: "Pago", competencia: "01/2026" },
      { tenantId, versionId: aAtual.id, categoriaDre: "Custo Fixo", valor: "500", status: "Pago", competencia: "02/2026" },
      { tenantId, versionId: aAtual.id, categoriaDre: "Despesa Fixa", valor: "999", status: "Pago", competencia: "02/2026" },
      { tenantId, versionId: bAtual.id, categoriaDre: "Custo Variável", valor: "300", status: "Pago", competencia: "01/2026" },
    ]);
    await db.insert(schema.budgetLines).values({ tenantId, versionId: aBudget.id, kind: "despesa", rowKey: "chat-1", mes: "01/2026", valor: "1200", dreCategory: "Custo Variável" });
    await db.insert(schema.bankAccounts).values({ tenantId, banco: "Banco Chat", cc: "1", saldo: "2500.50" });
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("custo da obra citada: Custo Variável + Custo Fixo da Atual (sem a Despesa Fixa)", async () => {
    como("owner");
    const r = await resposta("custo da obra alfa");
    expect(r.texto).toContain("R$ 1.500,00");
    expect(r.texto).toContain("OBRA CHAT ALFA");
    expect(r.via).toBe("local");
    expect(r.link?.href).toBe(`/dre?proj=${obraA.id}`);
  });

  it("sem obra na pergunta, usa a da tela; com 'todas', soma e diz a cobertura", async () => {
    como("owner");
    expect((await resposta("quanto gastamos nesta obra?", obraB.id)).texto).toContain("R$ 300,00");
    const todas = await resposta("custo de todas as obras");
    expect(todas.texto).toContain("R$ 1.800,00");
    expect(todas.tudo).toContain("Soma de 2 de 2 obra(s)");
  });

  it("período: só as competências pedidas", async () => {
    como("owner");
    expect((await resposta("custo da obra alfa em fevereiro de 2026")).texto).toContain("R$ 500,00");
  });

  it("desvio: Atual × Orçamento; obra sem Orçamento fica fora e é dita", async () => {
    como("owner");
    const r = await resposta("desvio de custo de todas as obras em 2026");
    // Alfa: 1.500 realizados × 1.200 orçados = +300 (25%). Beta sem Orçamento.
    expect(r.texto).toContain("+R$ 300,00");
    expect(r.texto).toContain("25,0% acima");
    expect(r.tudo).toContain("OBRA CHAT BETA");
  });

  it("orçado: obra sem Orçamento fica fora, não entra como zero", async () => {
    como("owner");
    const r = await resposta("custo orçado de todas as obras");
    expect(r.texto).toContain("R$ 1.200,00");
    expect(r.tudo).toContain("fora da soma: OBRA CHAT BETA");
  });

  it("saldo das contas da empresa", async () => {
    como("owner");
    expect((await resposta("qual o saldo das contas?")).texto).toContain("R$ 2.500,50");
  });

  it("sem ver Despesas, não recebe custo por nenhum caminho", async () => {
    como("membro", effectivePermissions("membro", { despesas: { ver: false, criar: false, editar: false, excluir: false }, dre: { ver: true, criar: false, editar: false, excluir: false } }));
    for (const p of ["custo da obra alfa", "desvio de custo"]) {
      const r = await resposta(p);
      expect(r.texto).toContain("não tem acesso");
      expect(r.tudo).not.toMatch(/R\$ \d/);
    }
  });

  it("obra de fora da lista do usuário não é achada; pergunta fora do catálogo lista o que responde", async () => {
    como("owner");
    expect((await resposta("custo da obra Vila Nova")).texto).toContain("Não achei a obra");
    const r = await resposta("qual o telefone do cliente da unidade 12?");
    expect(r.texto).toContain("Ainda não sei responder");
    expect(r.tudo).not.toContain("telefone");
  });

  it("com IA: o modelo recebe só a pergunta e o mês — nenhum dado da empresa", async () => {
    como("owner");
    ia.ligada = true;
    ia.devolve = { metrica: "custo", cenario: "atual", obra: "alfa", todas: false, de: "", ate: "" };
    const r = await resposta("quanto a alfa gastou?");
    ia.ligada = false;
    expect(r.via).toBe("ia");
    expect(r.texto).toContain("R$ 1.500,00");
    expect(ia.pedidos).toHaveLength(1);
    const [pergunta, mes, ...resto] = ia.pedidos[0];
    expect(pergunta).toBe("quanto a alfa gastou?");
    expect(mes).toMatch(/^\d{2}\/\d{4}$/);
    expect(resto).toEqual([]);
  });

  it("pergunta vazia ou longa demais é recusada", async () => {
    como("owner");
    expect(await perguntarAoAssistente("  ", null)).toMatchObject({ ok: false });
    expect(await perguntarAoAssistente("x".repeat(501), null)).toMatchObject({ ok: false });
  });

  it("ausência não é zero: sem lançamento no recorte, diz que não há (como o “—” da DRE)", async () => {
    como("owner");
    const r = await resposta("receita da obra alfa");
    expect(r.texto).toContain("Não há receita lançada");
    expect(r.texto).not.toContain("R$ 0,00");
  });
});
