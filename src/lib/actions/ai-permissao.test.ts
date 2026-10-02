import { describe, it, expect, vi } from "vitest";

/** Prompt AM, 6.1 — o teste de conexão segue a matriz, não o papel. */
const ctxRef: { current: unknown } = { current: null };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/context", () => ({ getTenantContext: async () => ctxRef.current }));
vi.mock("@/lib/ai/uso", () => ({ comUsoDeIa: (_m: unknown, fn: () => unknown) => fn(), registrarUso: async () => {} }));
vi.mock("@/lib/ai/client", () => ({
  isAiConfigured: () => false,
  primaryModel: () => "m",
  modelWarning: () => "",
  aiClient: () => ({}),
  createMessageWithFallback: async () => ({ model: "m" }),
}));

describe("testAiConnection — permissão", async () => {
  const { effectivePermissions } = await import("@/lib/permissions");
  const { testAiConnection } = await import("./ai");
  const nada = { ver: false, criar: false, editar: false, excluir: false };
  const tudo = { ver: true, criar: true, editar: true, excluir: true };

  it("a decisão é da matriz, não do papel: papel admin com a célula negada não executa", async () => {
    // Hoje o piso do papel dá tudo a owner/admin; a action não depende disso.
    ctxRef.current = { tenant: { id: "t" }, userId: null, role: "admin", perms: { ...effectivePermissions("admin", null), diagnosticoia: nada } };
    await expect(testAiConnection()).rejects.toThrow("Sem permissão");
  });

  it("membro com a tela concedida (editar) executa (antes recebia 'Sem permissão')", async () => {
    ctxRef.current = { tenant: { id: "t" }, userId: null, role: "membro", perms: effectivePermissions("membro", { diagnosticoia: tudo }) };
    expect(await testAiConnection()).toMatchObject({ keyPresent: false, ok: false });
  });

  it("só ver não executa o teste (o bloco de configuração é de quem edita)", async () => {
    ctxRef.current = { tenant: { id: "t" }, userId: null, role: "membro", perms: effectivePermissions("membro", { diagnosticoia: { ...nada, ver: true } }) };
    await expect(testAiConnection()).rejects.toThrow("Sem permissão");
  });
});
