import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/** Prompt AM, 5.1/5.2/5.4 — registro do consumo e limite. Integração: só com DATABASE_URL. */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("consumo da IA", async () => {
  const { db, schema } = await import("@/lib/db");
  const { comUsoDeIa, limiteDeConversa } = await import("./uso");
  const { createMessageWithFallback } = await import("./client");
  let tenantId = "";
  beforeAll(async () => {
    tenantId = (await db.insert(schema.tenants).values({ name: "tenant-ia-uso" }).returning())[0].id;
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });
  const linhas = () => db.select().from(schema.iaUso).where(eq(schema.iaUso.tenantId, tenantId));
  const cliente = (respostas: (() => unknown)[]) => {
    const chamados: string[] = [];
    return {
      chamados,
      messages: {
        create: async (p: { model: string }) => {
          chamados.push(p.model);
          return respostas.shift()!();
        },
      },
    } as never;
  };

  it("sem marca, nada é gravado (e a chamada funciona igual)", async () => {
    const c = cliente([() => ({ model: "m1", usage: { input_tokens: 3, output_tokens: 1 }, content: [] })]);
    expect((await createMessageWithFallback(c, { max_tokens: 1, messages: [] })).model).toBe("m1");
    expect(await linhas()).toHaveLength(0);
  });

  it("com marca: grava modelo e tokens — e nenhum conteúdo", async () => {
    const c = cliente([() => ({ model: "m1", usage: { input_tokens: 30, output_tokens: 5, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0 }, content: [] })]);
    await comUsoDeIa({ tenantId, userId: null, operacao: "assistente" }, () =>
      createMessageWithFallback(c, { max_tokens: 1, messages: [{ role: "user", content: "pergunta secreta" }] }),
    );
    const [r] = await linhas();
    expect(r).toMatchObject({ operacao: "assistente", modelo: "m1", fallback: false, entrada: 30, saida: 5, cacheCriacao: 2000, erro: false });
    expect(JSON.stringify(r)).not.toContain("pergunta secreta");
  });

  it("primário indisponível: registra o modelo que respondeu, marcado como alternativo", async () => {
    const c = cliente([
      () => {
        throw new Error("404 not_found_error: model not found");
      },
      () => ({ model: "alternativo", usage: { input_tokens: 1, output_tokens: 1 }, content: [] }),
    ]);
    await comUsoDeIa({ tenantId, userId: null, operacao: "despesa" }, () => createMessageWithFallback(c, { max_tokens: 1, messages: [] }));
    const r = (await linhas()).find((x) => x.operacao === "despesa");
    expect(r).toMatchObject({ modelo: "alternativo", fallback: true, erro: false });
  });

  it("erro que não é de modelo: registra a falha e o erro chega traduzido", async () => {
    const c = cliente([
      () => {
        throw new Error("boom");
      },
    ]);
    await expect(comUsoDeIa({ tenantId, userId: null, operacao: "extrato" }, () => createMessageWithFallback(c, { max_tokens: 1, messages: [] }))).rejects.toThrow();
    expect((await linhas()).find((x) => x.operacao === "extrato")).toMatchObject({ erro: true, modelo: null });
  });

  it("limite das conversas conta a empresa na última hora", async () => {
    expect(await limiteDeConversa(tenantId, null)).toBeNull();
    await db.insert(schema.iaUso).values([...Array(300)].map(() => ({ tenantId, operacao: "chat" })));
    expect(await limiteDeConversa(tenantId, null)).toContain("300 perguntas por hora da empresa");
  });
});
