import { describe, it, expect } from "vitest";
import { dataBRParaISO, estaVencida, hojeISO, statusExibido, tomDoStatus } from "./despesa-status";

const HOJE = "2026-09-30";

describe("status exibido (Prompt I, §16)", () => {
  it("vencida: vencimento anterior a hoje e sem fato de pagamento", () => {
    expect(statusExibido({ status: "A pagar", vencimento: "09/29/2026" }, HOJE)).toBe("Vencida");
    expect(statusExibido({ status: "Em aberto", vencimento: "01/05/2025" }, HOJE)).toBe("Vencida");
    expect(estaVencida({ status: "A pagar", vencimento: "09/29/2026" }, HOJE)).toBe(true);
  });
  it("vence hoje ou depois: mantém o status gravado; sem status vira Em aberto", () => {
    expect(statusExibido({ status: "A pagar", vencimento: "09/30/2026" }, HOJE)).toBe("A pagar");
    expect(statusExibido({ status: "A pagar", vencimento: "10/01/2026" }, HOJE)).toBe("A pagar");
    expect(statusExibido({ status: null, vencimento: "10/01/2026" }, HOJE)).toBe("Em aberto");
    expect(statusExibido({ status: "", vencimento: null }, HOJE)).toBe("Em aberto");
  });
  it("pago, parcialmente paga e cancelada têm prioridade sobre a data", () => {
    expect(statusExibido({ status: "Pago", vencimento: "01/01/2020" }, HOJE)).toBe("Pago");
    expect(statusExibido({ status: "Parcialmente paga", vencimento: "01/01/2020" }, HOJE)).toBe("Parcialmente paga");
    expect(statusExibido({ status: "Cancelada", vencimento: "01/01/2020" }, HOJE)).toBe("Cancelada");
    expect(statusExibido({ status: "A pagar", vencimento: "01/01/2020", cancelado: true }, HOJE)).toBe("Cancelada");
  });
  it("data inválida não vence", () => {
    expect(statusExibido({ status: "A pagar", vencimento: "2020-01-01" }, HOJE)).toBe("A pagar");
    expect(statusExibido({ status: "A pagar", vencimento: "x" }, HOJE)).toBe("A pagar");
    expect(dataBRParaISO("13/1/2026")).toBe("2026-13-01");
    expect(dataBRParaISO("1/2/2026")).toBe("2026-01-02");
    expect(dataBRParaISO("2026-01-02")).toBe("");
  });
  it("hoje e cores", () => {
    expect(hojeISO(new Date(2026, 8, 5))).toBe("2026-09-05");
    expect(tomDoStatus("Pago")).toBe("success");
    expect(tomDoStatus("Vencida")).toBe("danger");
    expect(tomDoStatus("Cancelada")).toBe("neutral");
    expect(tomDoStatus("A pagar")).toBe("warning");
  });
});
