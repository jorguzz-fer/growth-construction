import { describe, it, expect } from "vitest";
import {
  CAT_BAIXA_RECEBER,
  aposEstorno,
  baixaCabe,
  conciliadaNoCaixa,
  divergenciaDeBaixa,
  impactoCaixaDaBaixa,
  impactoDreDaBaixa,
  origemDaBaixa,
  podeBaixar,
  saldoAReceber,
  statusAposBaixa,
  totalBaixado,
  type BaixaRegistrada,
} from "./baixa-receber";

const b = (valor: number, cat: string | null = CAT_BAIXA_RECEBER): BaixaRegistrada => ({
  cashEntryId: `ce-${valor}`,
  data: "01/15/2026",
  valor,
  cat,
});

describe("saldoAReceber", () => {
  it("devolve o que falta receber", () => {
    expect(saldoAReceber(1000, 300)).toBe(700);
  });
  it("zera quando já recebeu tudo", () => {
    expect(saldoAReceber(1000, 1000)).toBe(0);
  });
  it("nunca fica negativo, mesmo com recebimento a maior", () => {
    expect(saldoAReceber(1000, 1250)).toBe(0);
  });
  it("arredonda para centavos", () => {
    expect(saldoAReceber(0.3, 0.1)).toBe(0.2);
  });
});

describe("baixaCabe", () => {
  it("aceita baixa dentro do saldo", () => {
    expect(baixaCabe(1000, 300, 700)).toBe(true);
  });
  it("aceita baixa exatamente igual ao saldo", () => {
    expect(baixaCabe(1000, 0, 1000)).toBe(true);
  });
  it("recusa baixa acima do saldo", () => {
    expect(baixaCabe(1000, 300, 701)).toBe(false);
  });
  it("recusa valor zero", () => {
    expect(baixaCabe(1000, 0, 0)).toBe(false);
  });
  it("recusa valor negativo", () => {
    expect(baixaCabe(1000, 0, -50)).toBe(false);
  });
  it("recusa NaN", () => {
    expect(baixaCabe(1000, 0, Number.NaN)).toBe(false);
  });
  it("tolera 1 centavo de arredondamento", () => {
    expect(baixaCabe(1000, 999.995, 0.01)).toBe(true);
  });
});

describe("statusAposBaixa", () => {
  it("sem recebimento continua A receber", () => {
    expect(statusAposBaixa(1000, 0)).toBe("A receber");
  });
  it("parcial", () => {
    expect(statusAposBaixa(1000, 400)).toBe("Parcialmente recebido");
  });
  it("total", () => {
    expect(statusAposBaixa(1000, 1000)).toBe("Recebido");
  });
  it("fecha com 1 centavo faltando", () => {
    expect(statusAposBaixa(1000, 999.99)).toBe("Recebido");
  });
  it("2 centavos faltando ainda é parcial", () => {
    expect(statusAposBaixa(1000, 999.98)).toBe("Parcialmente recebido");
  });
});

describe("impacto contábil (RG-01 — competência ≠ caixa)", () => {
  it("a baixa NUNCA cria receita na DRE", () => {
    expect(impactoDreDaBaixa()).toBe(0);
  });
  it("a baixa entra no caixa pelo valor recebido", () => {
    expect(impactoCaixaDaBaixa(1500)).toBe(1500);
  });
  it("valor negativo vira entrada positiva (baixa é sempre entrada)", () => {
    expect(impactoCaixaDaBaixa(-1500)).toBe(1500);
  });
});

describe("origemDaBaixa", () => {
  it("cat de baixa manual", () => {
    expect(origemDaBaixa(CAT_BAIXA_RECEBER)).toBe("manual");
  });
  it("movimento do extrato é do caixa", () => {
    expect(origemDaBaixa("extrato")).toBe("caixa");
  });
  it("sem categoria também conta como caixa (conservador: não apagável daqui)", () => {
    expect(origemDaBaixa(null)).toBe("caixa");
  });
});

describe("totalBaixado / conciliadaNoCaixa", () => {
  it("soma os movimentos em módulo", () => {
    expect(totalBaixado([b(300), b(700)])).toBe(1000);
  });
  it("lista vazia soma zero", () => {
    expect(totalBaixado([])).toBe(0);
  });
  it("detecta baixa vinda do extrato", () => {
    expect(conciliadaNoCaixa([b(300), b(700, "extrato")])).toBe(true);
  });
  it("só baixas manuais não é conciliação de caixa", () => {
    expect(conciliadaNoCaixa([b(300), b(700)])).toBe(false);
  });
});

describe("divergenciaDeBaixa", () => {
  it("zero quando o gravado bate com os movimentos", () => {
    expect(divergenciaDeBaixa(1000, [b(400), b(600)])).toBe(0);
  });
  it("positiva quando a conta foi marcada à mão sem movimento de caixa", () => {
    expect(divergenciaDeBaixa(1000, [])).toBe(1000);
  });
  it("negativa quando há movimento sem o valor gravado", () => {
    expect(divergenciaDeBaixa(0, [b(500)])).toBe(-500);
  });
});

describe("podeBaixar", () => {
  it("conta em aberto pode", () => {
    expect(podeBaixar(1000, 0, false)).toEqual({ ok: true });
  });
  it("conta cancelada não pode", () => {
    expect(podeBaixar(1000, 0, true)).toEqual({ ok: false, motivo: "Conta cancelada." });
  });
  it("conta quitada não pode", () => {
    expect(podeBaixar(1000, 1000, false)).toEqual({
      ok: false,
      motivo: "Conta já totalmente recebida.",
    });
  });
  it("conta parcial ainda pode", () => {
    expect(podeBaixar(1000, 400, false)).toEqual({ ok: true });
  });
});

describe("aposEstorno", () => {
  it("devolve a conta ao estado anterior", () => {
    expect(aposEstorno(1000, 1000, 600)).toEqual({
      valorRecebido: 400,
      status: "Parcialmente recebido",
    });
  });
  it("estorno da única baixa volta para A receber", () => {
    expect(aposEstorno(1000, 1000, 1000)).toEqual({ valorRecebido: 0, status: "A receber" });
  });
  it("nunca deixa recebido negativo", () => {
    expect(aposEstorno(1000, 300, 900)).toEqual({ valorRecebido: 0, status: "A receber" });
  });
  it("baixa e estorno voltam ao ponto de partida (ida e volta)", () => {
    const inicial = 250;
    const depoisDaBaixa = inicial + 400;
    expect(statusAposBaixa(1000, depoisDaBaixa)).toBe("Parcialmente recebido");
    expect(aposEstorno(1000, depoisDaBaixa, 400).valorRecebido).toBe(inicial);
  });
});
