import { describe, it, expect } from "vitest";
import { isoDaData, previstoPorDia, saldosProjetados } from "./previsto-caixa";

describe("Prompt L2 — previsto dos próximos dias no Caixa", () => {
  const faixa = ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"];

  it("soma o que vence em cada dia de hoje em diante; o atrasado vai à parte", () => {
    const { porDia, atrasados } = previstoPorDia(
      faixa,
      "2026-10-18",
      [{ vencimento: "10/19/2026", saldo: 500 }, { vencimento: "10/19/2026", saldo: 100 }, { vencimento: "10/10/2026", saldo: 70 }],
      [{ vencimento: "10/18/2026", saldo: 200 }, { vencimento: "10/20/2026", saldo: 0 }, { vencimento: null, saldo: 9 }, { vencimento: "12/01/2026", saldo: 30 }],
    );
    expect(porDia).toEqual({
      "2026-10-18": { aReceber: 0, aPagar: 200 },
      "2026-10-19": { aReceber: 600, aPagar: 0 },
      "2026-10-20": { aReceber: 0, aPagar: 0 },
    });
    expect(atrasados).toEqual({ aReceber: { qtd: 1, valor: 70 }, aPagar: { qtd: 0, valor: 0 } });
  });

  it("saldo projetado parte do inicial de hoje e acumula caixa lançado + vencimentos", () => {
    const dias = [
      { dia: "2026-10-17", conciliado: { inicial: 900, final: 1000 } },
      { dia: "2026-10-18", conciliado: { inicial: 1000, final: 1050 } }, // +50 lançado hoje
      { dia: "2026-10-19", conciliado: { inicial: 1050, final: 1050 } },
    ];
    const s = saldosProjetados(dias, "2026-10-18", { "2026-10-18": { aReceber: 0, aPagar: 200 }, "2026-10-19": { aReceber: 600, aPagar: 0 } });
    expect(s).toEqual({ "2026-10-18": 850, "2026-10-19": 1450 });
  });

  it("data em formato errado não entra", () => {
    expect(isoDaData("2026-10-18")).toBeNull();
    expect(isoDaData("10/18/2026")).toBe("2026-10-18");
  });
});
