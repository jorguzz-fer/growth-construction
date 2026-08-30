import { describe, expect, it } from "vitest";
import { hojeSP, isoParaInterno } from "./datas";

describe("hojeSP", () => {
  it("usa o fuso de São Paulo, não o do servidor", () => {
    // 30/08/2026 às 02:00 UTC = 29/08/2026 às 23:00 em Brasília.
    // A VPS roda em UTC: sem conversão, "contas de hoje" viraria as de amanhã
    // toda noite depois das 21h.
    expect(hojeSP(new Date("2026-08-30T02:00:00Z"))).toBe("08/29/2026");
  });

  it("vira o dia no horário certo", () => {
    expect(hojeSP(new Date("2026-08-30T03:00:00Z"))).toBe("08/30/2026");
  });
});

describe("isoParaInterno", () => {
  it("converte YYYY-MM-DD para o MM/DD/YYYY interno", () => {
    expect(isoParaInterno("2026-08-30")).toBe("08/30/2026");
  });

  it("devolve null para entrada inválida ou vazia", () => {
    expect(isoParaInterno("30/08/2026")).toBeNull();
    expect(isoParaInterno("")).toBeNull();
    expect(isoParaInterno(null)).toBeNull();
  });
});
