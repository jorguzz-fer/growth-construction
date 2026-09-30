import { describe, it, expect, vi } from "vitest";

/**
 * Prompt J, PR J-5 — a action do lançamento assistido só PROPÕE: permissão e
 * obra validadas no servidor, nenhuma gravação. Sem banco (o extrator é
 * substituído por um resultado fixo).
 */
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", () => ({ getTenantContext: async () => ctxRef.current }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", () => ({ isAiConfigured: () => true }));
const chamadas: string[] = [];
vi.mock("@/lib/ai/unidade-extract", () => ({
  MAX_TEXTO_VENDA: 2000,
  extractVendaFromText: async (texto: string) => {
    chamadas.push(texto);
    return {
      code: "12", itemType: "unidade", tipo: "Casa", bloco: "", m2: null, andar: null, valor: 380000, status: "Vendido", dataVenda: "2026-03-05",
      AS: { valor: 50000, parcelas: 1, primeiroVencimento: "2026-03-05" }, S1: null, S2: null, S3: null,
      Mensais: { valor: 4500, parcelas: 36, primeiroVencimento: "2026-04-05" }, Semestrais: null, Anuais: null,
      FGTS: null, Subsidio: null, Permuta: null, Banco: { valorFinanciado: null, dataEntrada: "", dataPrimeiraParcela: "", restante: true },
      baixaConfianca: [], observacoes: [],
    };
  },
}));

describe("lançamento assistido de unidade (Prompt J, PR J-5)", async () => {
  const { proporUnidadePorTexto } = await import("./unidades-assistente");
  const { defaultPermissions } = await import("@/lib/permissions");
  const projeto = { id: "p1", name: "OBRA" };
  const dono = () => ({ tenant: { id: "t1" }, projects: [projeto], userId: null, userEmail: "x@y", role: "owner", perms: defaultPermissions("owner") });

  it("sem permissão de criar, sem obra ou obra de outra empresa: recusa antes de falar com a IA", async () => {
    ctxRef.current = { ...dono(), perms: { ...defaultPermissions("owner"), unidades: { ver: true, criar: false, editar: true, excluir: true } } };
    expect(await proporUnidadePorTexto("vendi a casa 12", "p1")).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    ctxRef.current = dono();
    expect(await proporUnidadePorTexto("vendi a casa 12", "")).toEqual({ ok: false, error: expect.stringMatching(/obra/) });
    expect(await proporUnidadePorTexto("vendi a casa 12", "outra")).toEqual({ ok: false, error: expect.stringMatching(/obra/) });
    expect(await proporUnidadePorTexto("  ", "p1")).toEqual({ ok: false, error: expect.stringMatching(/Descreva/) });
    expect(await proporUnidadePorTexto("x".repeat(2001), "p1")).toEqual({ ok: false, error: expect.stringMatching(/longa/) });
    expect(chamadas).toEqual([]);
  });

  it("devolve a proposta com os campos e o plano, sem gravar", async () => {
    ctxRef.current = dono();
    const r = await proporUnidadePorTexto("vendi a casa 12 por 380 mil em 05/03, sinal de 50 mil, 36x de 4.500 e financiamento do restante", "p1");
    expect(r.ok).toBe(true);
    const p = (r as { proposta: { valores: { code: string; valor: string; plan: { Banco: { valFinanc: number } } }; alertas: Record<string, unknown> } }).proposta;
    expect(p.valores.code).toBe("12");
    expect(p.valores.valor).toBe("380000");
    expect(p.valores.plan.Banco.valFinanc).toBe(168000);
    expect(Object.keys(p.alertas)).toEqual(["plano"]);
    expect(chamadas).toHaveLength(1);
  });
});
