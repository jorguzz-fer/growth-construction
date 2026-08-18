import { describe, it, expect } from "vitest";
import {
  impactoDreRecebimentoTerceiro,
  impactoDreRepasse,
  podeCompensar,
  repasseCabe,
  rotuloStatusRepasse,
  saldoARepassar,
  saldosAposCompensacao,
  statusRepasse,
  valorCompensavel,
} from "./recebimento-terceiro";

describe("status e saldo do repasse", () => {
  it("sem repasse → aguardando; saldo = total", () => {
    expect(statusRepasse(50000, 0)).toBe("Aguardando repasse");
    expect(saldoARepassar(50000, 0)).toBe(50000);
  });
  it("repasse parcial", () => {
    expect(statusRepasse(50000, 20000)).toBe("Parcialmente repassado");
    expect(saldoARepassar(50000, 20000)).toBe(30000);
  });
  it("repasse integral", () => {
    expect(statusRepasse(50000, 50000)).toBe("Repassado");
    expect(saldoARepassar(50000, 50000)).toBe(0);
  });
  it("repasse a maior fica negativo e visível", () => {
    expect(saldoARepassar(1000, 1500)).toBe(-500);
  });
  it('"Aguardando repasse" é exibido como "Pendente"', () => {
    expect(rotuloStatusRepasse("Aguardando repasse")).toBe("Pendente");
    expect(rotuloStatusRepasse("Repassado")).toBe("Repassado");
  });
});

describe("trava de valor do repasse", () => {
  it("aceita dentro do saldo, recusa acima", () => {
    expect(repasseCabe(50000, 20000, 30000)).toBe(true);
    expect(repasseCabe(50000, 20000, 30000.5)).toBe(false);
  });
  it("tolera 1 centavo e recusa zero/negativo", () => {
    expect(repasseCabe(50000, 20000, 30000.01)).toBe(true);
    expect(repasseCabe(50000, 0, 0)).toBe(false);
    expect(repasseCabe(50000, 0, -1)).toBe(false);
  });
});

describe("RG-02 / RG-04 — repasse não duplica receita na DRE (CA-22)", () => {
  it("o recebimento por terceiro NÃO impacta a DRE", () => {
    expect(impactoDreRecebimentoTerceiro()).toBe(0);
  });

  it("o repasse NÃO impacta a DRE", () => {
    expect(impactoDreRepasse()).toBe(0);
  });

  it("cenário completo: PF recebe 50.000 e repassa — a receita continua sendo 50.000", () => {
    // A receita foi reconhecida NA VENDA. O trânsito do dinheiro não acrescenta
    // nada ao resultado: se acrescentasse, a DRE mostraria 100.000 de receita
    // para uma venda de 50.000.
    const receitaDaVenda = 50000;
    const dre =
      receitaDaVenda + impactoDreRecebimentoTerceiro() + impactoDreRepasse();
    expect(dre).toBe(50000);
  });

  it("nem repasses parciais somam receita", () => {
    const receitaDaVenda = 50000;
    let dre = receitaDaVenda;
    for (let i = 0; i < 3; i++) dre += impactoDreRepasse();
    expect(dre).toBe(50000);
  });
});

describe("encontro de contas — RG-05 (CA-23)", () => {
  it("compensa o menor dos dois saldos", () => {
    expect(valorCompensavel({ saldoARestituir: 8000, saldoARepassar: 5000 })).toBe(5000);
    expect(valorCompensavel({ saldoARestituir: 3000, saldoARepassar: 9000 })).toBe(3000);
  });

  it("sem os dois lados não há o que compensar", () => {
    expect(podeCompensar({ saldoARestituir: 8000, saldoARepassar: 0 })).toBe(false);
    expect(podeCompensar({ saldoARestituir: 0, saldoARepassar: 5000 })).toBe(false);
    expect(podeCompensar({ saldoARestituir: 8000, saldoARepassar: 5000 })).toBe(true);
  });

  it("saldo negativo não vira compensação", () => {
    expect(valorCompensavel({ saldoARestituir: -100, saldoARepassar: 5000 })).toBe(0);
  });

  it("depois de compensar, um lado zera e o outro guarda a diferença", () => {
    const depois = saldosAposCompensacao({ saldoARestituir: 8000, saldoARepassar: 5000 });
    expect(depois).toEqual({ saldoARestituir: 3000, saldoARepassar: 0 });
  });

  it("saldos iguais zeram os dois lados", () => {
    expect(saldosAposCompensacao({ saldoARestituir: 5000, saldoARepassar: 5000 })).toEqual({
      saldoARestituir: 0,
      saldoARepassar: 0,
    });
  });

  it("a compensação não altera a DRE em nenhuma competência", () => {
    // Compensar é baixa simultânea de passivo e ativo — patrimonial, nunca
    // resultado.
    const s = { saldoARestituir: 8000, saldoARepassar: 5000 };
    const depois = saldosAposCompensacao(s);
    const variacaoPatrimonio =
      s.saldoARestituir - s.saldoARepassar - (depois.saldoARestituir - depois.saldoARepassar);
    expect(variacaoPatrimonio).toBe(0);
  });
});
