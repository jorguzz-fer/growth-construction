import { describe, it, expect, vi } from "vitest";
import { capturar, dadosOuErro } from "./resultado";

describe("Prompt D2 — ação devolve { ok, error }", () => {
  it("sucesso traz o dado; recusa escrita volta como texto", async () => {
    expect(await capturar(async () => 7)).toEqual({ ok: true, dados: 7 });
    expect(await capturar(async () => { throw new Error("Versão congelada."); })).toEqual({ ok: false, error: "Versão congelada." });
  });

  it("erro de outro tipo (banco) vira a mensagem genérica, e o log leva só o tipo", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    class PostgresError extends Error {}
    const r = await capturar(async () => { throw new PostgresError("relation \"x\" does not exist"); }, "teste");
    expect(r).toEqual({ ok: false, error: "Não foi possível concluir. Tente de novo." });
    expect(JSON.stringify(log.mock.calls)).not.toContain("relation");
    log.mockRestore();
  });

  it("no cliente, dadosOuErro devolve o dado ou lança a recusa", () => {
    expect(dadosOuErro({ ok: true, dados: "x" })).toBe("x");
    expect(() => dadosOuErro({ ok: false, error: "Sem permissão." })).toThrow("Sem permissão.");
  });
});
