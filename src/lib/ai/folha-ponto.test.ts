import { describe, expect, it, vi } from "vitest";

// Decisão de 01/10/2026 (BE-2): só o documento vai ao modelo.
const pedidos: unknown[] = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({
  isAiConfigured: () => true,
  aiClient: () => ({}),
  createMessageWithFallback: async (_c: unknown, params: unknown) => {
    pedidos.push(params);
    return { content: [{ type: "tool_use", id: "t", name: "listar_presencas", input: { linhas: [{ nome: "Joao", quantidade: 1, confianca: "alta" }], observacoes: [] } }] };
  },
}));

import { lerFolhaDePontoComIA } from "./folha-ponto";

describe("folha de ponto — o que vai ao modelo", () => {
  it("leva só o documento: nenhuma lista da equipe no pedido", async () => {
    const r = await lerFolhaDePontoComIA([{ bytes: new Uint8Array([1, 2, 3]), mime: "image/png", filename: "folha.png" }]);
    expect(r.linhas).toEqual([{ nome: "Joao", quantidade: 1, confianca: "alta" }]);
    const texto = JSON.stringify(pedidos[0]);
    expect(texto).not.toMatch(/equipe alocada/i);
    expect(lerFolhaDePontoComIA.length).toBe(1);
  });
});
