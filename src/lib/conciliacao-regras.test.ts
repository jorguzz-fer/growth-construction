import { describe, expect, it } from "vitest";
import { conciliacaoConcluida, correspondenciaInequivoca, estadoDaDespesa, estadoDoMovimento, faltaNoMovimento, recusaDosVinculos } from "./conciliacao-regras";

describe("conciliação com valor — regras puras (Prompt L, Parte 2)", () => {
  it("9 — a soma dos vínculos não excede o valor do movimento; cada valor > 0; sem despesa repetida", () => {
    expect(recusaDosVinculos(-1000, 0, [{ despesaId: "a", valor: 600 }, { despesaId: "b", valor: 400 }])).toBeNull();
    expect(recusaDosVinculos(-1000, 0, [{ despesaId: "a", valor: 600 }, { despesaId: "b", valor: 400.01 }])).toBeNull(); // tolerância de centavo
    expect(recusaDosVinculos(-1000, 0, [{ despesaId: "a", valor: 600 }, { despesaId: "b", valor: 401 }])).toMatch(/excede/);
    expect(recusaDosVinculos(-1000, 700, [{ despesaId: "a", valor: 400 }])).toMatch(/excede/);
    expect(recusaDosVinculos(-1000, 0, [{ despesaId: "a", valor: 0 }])).toMatch(/maior que zero/);
    expect(recusaDosVinculos(-1000, 0, [{ despesaId: "a", valor: 1 }, { despesaId: "a", valor: 1 }])).toMatch(/mais de uma vez/);
    expect(recusaDosVinculos(-1000, 0, [])).toMatch(/ao menos uma/);
  });
  it("11 — a conciliação só conclui quando os vínculos somam o movimento", () => {
    expect(conciliacaoConcluida(-1000, 1000)).toBe(true);
    expect(conciliacaoConcluida(-1000, 999.995)).toBe(true);
    expect(conciliacaoConcluida(-1000, 900)).toBe(false);
    expect(faltaNoMovimento(-1000, 900)).toBe(100);
  });
  it("10 / 2.5 / 6.2 — estado derivado: R$ 1.000 conciliados numa despesa de R$ 5.000 é parcial, não paga", () => {
    const e = estadoDaDespesa({ valor: 5000, cancelado: false, principalPago: 1000, conciliado: 1000 });
    expect(e).toMatchObject({ estado: "Baixada e conciliada", statusGravado: "Parcialmente paga", pago: 1000, conciliado: 1000, baixadoSemConciliar: 0, saldo: 4000 });
    expect(estadoDaDespesa({ valor: 5000, cancelado: false, principalPago: 0, conciliado: 0 }).estado).toBe("Em aberto");
    expect(estadoDaDespesa({ valor: 5000, cancelado: false, principalPago: 5000, conciliado: 0 })).toMatchObject({ estado: "Baixada", statusGravado: "Pago", baixadoSemConciliar: 5000 });
    expect(estadoDaDespesa({ valor: 5000, cancelado: false, principalPago: 5000, conciliado: 5000 }).estado).toBe("Baixada e conciliada");
    expect(estadoDaDespesa({ valor: 5000, cancelado: true, principalPago: 0, conciliado: 0 }).estado).toBe("Cancelada");
  });
  it("19 / 6.6 — rec sem vínculo é estado próprio; parcial; ajuste", () => {
    const base = { rec: true, cat: "extrato", valor: -10, conciliadoDespesaId: null, conciliadoContaReceberId: null };
    expect(estadoDoMovimento(base, 0)).toBe("conciliado sem vínculo");
    expect(estadoDoMovimento(base, 10)).toBe("conciliado");
    expect(estadoDoMovimento({ ...base, conciliadoDespesaId: "d" }, 0)).toBe("conciliado");
    expect(estadoDoMovimento({ ...base, rec: false }, 4)).toBe("parcial");
    expect(estadoDoMovimento({ ...base, rec: false }, 0)).toBe("pendente");
    expect(estadoDoMovimento({ ...base, cat: "ajuste" }, 0)).toBe("ajuste");
  });
  it("13 — correspondência inequívoca: um candidato grava, mais de um propõe", () => {
    expect(correspondenciaInequivoca(["a"])).toBe("a");
    expect(correspondenciaInequivoca(["a", "b"])).toBeNull();
    expect(correspondenciaInequivoca([])).toBeNull();
  });
});
