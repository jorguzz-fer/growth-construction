import { describe, it, expect, vi } from "vitest";

/**
 * Prompt P, PR P-6 — a action do lançamento assistido só PROPÕE: permissão e
 * obra validadas no servidor, nenhuma gravação. Sem banco (extrator e
 * consultas substituídos).
 */
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", () => ({
  getTenantContext: async () => ctxRef.current,
  getProjectVersions: async (_t: string, pid: string) => (pid === "p1" ? { project: { id: "p1" }, versions: [], trabalho: { id: "v1" } } : null),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({ isAiConfigured: () => true }));
vi.mock("@/lib/queries", () => ({
  getUnits: async () => [{ code: "101" }, { code: "Casa 12" }],
  getClientes: async () => [{ id: "c1", nomeCompleto: "Maria da Silva Souza" }],
}));
const chamadas: string[] = [];
vi.mock("@/lib/ai/permuta-extract", () => ({
  MAX_TEXTO_ATIVO: 2000,
  extractAtivoFromText: async (texto: string) => {
    chamadas.push(texto);
    return { unitCode: "casa 12", cliente: "maria souza", dataRecebimento: "2026-09-15", tipo: "carro", descricao: "Corolla 2020", estimado: 50000, baixaConfianca: [], observacoes: ["sem placa"] };
  },
}));

describe("lançamento assistido de ativo de permuta (Prompt P, PR P-6)", async () => {
  const { proporAtivoPorTexto } = await import("./permuta-assistente");
  const { defaultPermissions } = await import("@/lib/permissions");
  const projeto = { id: "p1", name: "OBRA" };
  const dono = () => ({ tenant: { id: "t1" }, projects: [projeto], userId: null, userEmail: "x@y", role: "owner", perms: defaultPermissions("owner") });

  it("sem permissão de criar, sem obra ou obra de outra empresa: recusa antes de falar com a IA", async () => {
    ctxRef.current = { ...dono(), perms: { ...defaultPermissions("owner"), permuta: { ver: true, criar: false, editar: true, excluir: true } } };
    expect(await proporAtivoPorTexto("recebi um carro", "p1")).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    ctxRef.current = dono();
    expect(await proporAtivoPorTexto("recebi um carro", "")).toEqual({ ok: false, error: expect.stringMatching(/obra/) });
    expect(await proporAtivoPorTexto("recebi um carro", "outra")).toEqual({ ok: false, error: expect.stringMatching(/obra/) });
    expect(await proporAtivoPorTexto("  ", "p1")).toEqual({ ok: false, error: expect.stringMatching(/Descreva/) });
    expect(await proporAtivoPorTexto("x".repeat(2001), "p1")).toEqual({ ok: false, error: expect.stringMatching(/longa/) });
    expect(chamadas).toEqual([]);
  });

  it("devolve a proposta casada com as listas da tela, sem gravar", async () => {
    ctxRef.current = dono();
    const r = await proporAtivoPorTexto("recebi um Corolla 2020 de 50 mil da Maria Souza pela casa 12 em 15/09", "p1");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const p = r.proposta;
    expect(p.valores).toEqual({ unitCode: "Casa 12", clienteId: "c1", clienteNome: "Maria da Silva Souza", dataRecebimento: "09/15/2026", tipo: "Veículo", descricao: "Corolla 2020", estimado: "50000" });
    expect(p.alertas).toEqual({});
    expect(p.observacoes).toEqual(["sem placa"]);
    expect(chamadas).toHaveLength(1);
  });
});
