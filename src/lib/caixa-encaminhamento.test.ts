import { describe, expect, it } from "vitest";
import { linkParaLancar } from "./caixa-encaminhamento";

describe("encaminhamento do movimento sem contraparte (Prompt L, 3-A.2 / 7.2)", () => {
  it("20 / 5e — saída vai para Despesas com data, valor, histórico e o movimento reservado", () => {
    const r = linkParaLancar({ id: "m1", data: "09/21/2026", descricao: "TED FORNECEDOR", valor: -250 }, "P");
    expect(r.destino).toBe("Despesas");
    const u = new URL("http://x" + r.href);
    expect(u.pathname).toBe("/despesas");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ proj: "P", novo: "1", pf_valor: "250.00", pf_venc: "09/21/2026", pf_comp: "09/2026", pf_obs: "TED FORNECEDOR", pf_cash: "m1" });
  });
  it("entrada vai para Contas a Receber", () => {
    const r = linkParaLancar({ id: "m2", data: "09/22/2026", descricao: "PIX CLIENTE", valor: 1000 }, "P");
    expect(r.destino).toBe("Contas a Receber");
    expect(r.href).toContain("/contasreceber?");
    expect(r.href).toContain("pf_valor=1000.00");
    expect(r.href).toContain("pf_cash=m2");
  });
});
