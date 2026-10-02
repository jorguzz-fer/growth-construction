import { describe, it, expect, vi } from "vitest";

/** Prompt AM — a action do Assistente do produto: permissão, chave, limite e o que vai ao modelo. */
const ctxRef: { current: unknown } = { current: null };
const estado = { chave: true, limite: null as string | null, conversas: [] as unknown[], usos: [] as unknown[] };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/context", () => ({ getTenantContext: async () => ctxRef.current }));
vi.mock("@/lib/ai/client", () => ({ isAiConfigured: () => estado.chave }));
vi.mock("@/lib/ai/uso", () => ({
  limiteDeConversa: async () => estado.limite,
  comUsoDeIa: (m: unknown, fn: () => unknown) => (estado.usos.push(m), fn()),
}));
vi.mock("@/lib/ai/assistente-produto", () => ({
  responderSobreOProduto: async (c: unknown) => (estado.conversas.push(c), "Vá em [Despesas](/despesas)."),
}));

describe("perguntarAoProduto", async () => {
  const { effectivePermissions } = await import("@/lib/permissions");
  const { perguntarAoProduto } = await import("./assistente-produto");
  const como = (role: "owner" | "membro", over?: Record<string, { ver: boolean; criar: boolean; editar: boolean; excluir: boolean }>) =>
    (ctxRef.current = { tenant: { id: "t1" }, userId: "u1", role, perms: effectivePermissions(role, over ?? null) });
  const q = [{ de: "usuario", texto: "Onde lanço despesa?" }];

  it("responde, registra o uso como 'assistente' e manda ao modelo só a conversa", async () => {
    como("owner");
    expect(await perguntarAoProduto(q)).toEqual({ ok: true, texto: "Vá em [Despesas](/despesas)." });
    expect(estado.usos.at(-1)).toEqual({ tenantId: "t1", userId: "u1", operacao: "assistente" });
    expect(estado.conversas.at(-1)).toEqual([{ de: "usuario", texto: "Onde lanço despesa?" }]);
  });

  it("membro sem a tela não pergunta; com a tela concedida, pergunta", async () => {
    como("membro");
    expect(await perguntarAoProduto(q)).toMatchObject({ ok: false, error: expect.stringContaining("Sem permissão") });
    como("membro", { diagnosticoia: { ver: true, criar: false, editar: false, excluir: false } });
    expect((await perguntarAoProduto(q)).ok).toBe(true);
  });

  it("sem chave, diz que está indisponível; no limite, diz o limite", async () => {
    como("owner");
    estado.chave = false;
    expect(await perguntarAoProduto(q)).toMatchObject({ ok: false, error: expect.stringContaining("chave de IA não está configurada") });
    estado.chave = true;
    estado.limite = "Limite de 30 perguntas por hora por pessoa atingido.";
    expect(await perguntarAoProduto(q)).toEqual({ ok: false, error: "Limite de 30 perguntas por hora por pessoa atingido." });
    estado.limite = null;
  });

  it("conversa inválida é recusada sem chamar o modelo", async () => {
    como("owner");
    const antes = estado.conversas.length;
    expect((await perguntarAoProduto("texto solto")).ok).toBe(false);
    expect((await perguntarAoProduto([{ de: "assistente", texto: "oi" }])).ok).toBe(false);
    expect(estado.conversas.length).toBe(antes);
  });
});
