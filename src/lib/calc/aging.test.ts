import { describe, expect, it } from "vitest";
import { agingDasObrigacoes, dataBaseDoAging, diasEmAberto, somarAging } from "./aging";

describe("aging compartilhado (Prompt T, 2-A)", () => {
  it("12b — base = previsão de ressarcimento, senão desembolso; mesmo cálculo em todos os lugares", () => {
    expect(dataBaseDoAging({ dataPrevistaRestituicao: "09/01/2026", dataPagamentoOriginal: "06/01/2026" })).toBe("09/01/2026");
    expect(dataBaseDoAging({ dataPrevistaRestituicao: null, dataPagamentoOriginal: "06/01/2026" })).toBe("06/01/2026");
    expect(diasEmAberto("09/01/2026", "2026-09-30")).toBe(29);
    expect(diasEmAberto("12/01/2026", "2026-09-30")).toBe(0); // futuro não é negativo
    expect(diasEmAberto(null, "2026-09-30")).toBe(0);
  });
  it("12a — distribui o saldo pelas faixas e soma por terceiro", () => {
    const a = agingDasObrigacoes(
      [
        { saldo: 100, dataPrevistaRestituicao: "09/15/2026", dataPagamentoOriginal: "01/01/2026" }, // 15 d
        { saldo: 200, dataPrevistaRestituicao: null, dataPagamentoOriginal: "08/01/2026" }, // 60 d
        { saldo: 300, dataPrevistaRestituicao: "07/01/2026", dataPagamentoOriginal: null }, // 91 d
        { saldo: 0, dataPrevistaRestituicao: "01/01/2020", dataPagamentoOriginal: null }, // sem saldo não entra
      ],
      "2026-09-30",
    );
    expect(a).toEqual({ ate30: 100, de31a60: 200, de61a90: 0, acima90: 300 });
    expect(somarAging([a, a])).toEqual({ ate30: 200, de31a60: 400, de61a90: 0, acima90: 600 });
  });
});
