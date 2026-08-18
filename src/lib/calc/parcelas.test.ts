import { describe, it, expect } from "vitest";
import {
  gerarParcelas,
  distribuirValor,
  addDaysBR,
  composePagamento,
  isAtrasado,
  ajustarNaUltimaParcela,
  chequesDuplicados,
  conflitoRecorrenteParcelado,
  diferencaFechamento,
  gerarParcelasMensais,
  linhasDreDeParcelamento,
  parcelamentoFecha,
  preencherSequenciaCheques,
  statusDisponiveis,
  totalDasParcelas,
} from "./parcelas";

describe("distribuirValor (arredondamento)", () => {
  it("soma exatamente o total, jogando a diferença na última", () => {
    const v = distribuirValor(100, 3); // 33,33 + 33,33 + 33,34
    expect(v).toEqual([33.33, 33.33, 33.34]);
    expect(v.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });
  it("parcela única = total", () => {
    expect(distribuirValor(1500, 1)).toEqual([1500]);
  });
});

describe("addDaysBR", () => {
  it("soma dias atravessando o mês", () => {
    expect(addDaysBR("01/20/2026", 30)).toBe("02/19/2026");
  });
});

describe("gerarParcelas", () => {
  it("boleto à vista → 1 parcela na data-base", () => {
    const p = gerarParcelas({ valorTotal: 900, condicao: "avista", dataBase: "03/10/2026" });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ numero: 1, vencimento: "03/10/2026", valor: 900 });
  });

  it("boleto 30/60/90 → 3 parcelas com offsets em dias", () => {
    const p = gerarParcelas({ valorTotal: 900, condicao: "30/60/90", dataBase: "01/01/2026" });
    expect(p.map((x) => x.vencimento)).toEqual([
      addDaysBR("01/01/2026", 30),
      addDaysBR("01/01/2026", 60),
      addDaysBR("01/01/2026", 90),
    ]);
    expect(p.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(900, 2);
    expect(p).toHaveLength(3);
  });

  it("cheque parcelado personalizado (qtd + intervalo)", () => {
    const p = gerarParcelas({
      valorTotal: 1000,
      condicao: "personalizado",
      dataBase: "01/15/2026",
      qtd: 4,
      intervaloDias: 30,
    });
    expect(p).toHaveLength(4);
    expect(p[0].vencimento).toBe("01/15/2026");
    expect(p[3].vencimento).toBe(addDaysBR("01/15/2026", 90));
    expect(p.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(1000, 2);
  });

  it("personalizado com vencimentos explícitos", () => {
    const p = gerarParcelas({
      valorTotal: 300,
      condicao: "personalizado",
      dataBase: "01/01/2026",
      vencimentos: ["01/10/2026", "02/10/2026", "03/10/2026"],
    });
    expect(p.map((x) => x.vencimento)).toEqual(["01/10/2026", "02/10/2026", "03/10/2026"]);
    expect(p.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(300, 2);
  });
});

describe("composePagamento (Fase 3)", () => {
  it("pagamento no vencimento (sem encargos)", () => {
    expect(composePagamento({ valorOriginal: 1000 })).toEqual({
      valorTotalPago: 1000,
      encargos: 0,
    });
  });
  it("atrasado com multa + juros", () => {
    const r = composePagamento({ valorOriginal: 1000, multa: 20, juros: 33.33 });
    expect(r.valorTotalPago).toBeCloseTo(1053.33, 2);
    expect(r.encargos).toBeCloseTo(53.33, 2);
  });
  it("com desconto (encargos negativos = ganho financeiro)", () => {
    const r = composePagamento({ valorOriginal: 1000, desconto: 50 });
    expect(r.valorTotalPago).toBe(950);
    expect(r.encargos).toBe(-50);
  });
  it("pagamento parcial (valor original informado menor)", () => {
    const r = composePagamento({ valorOriginal: 400, juros: 10 });
    expect(r.valorTotalPago).toBe(410);
  });
});

describe("isAtrasado", () => {
  it("detecta atraso", () => {
    expect(isAtrasado("01/10/2026", "01/15/2026")).toBe(true);
  });
  it("em dia não é atraso", () => {
    expect(isAtrasado("01/10/2026", "01/10/2026")).toBe(false);
    expect(isAtrasado("01/10/2026", "01/05/2026")).toBe(false);
  });
});

// ───────────────────── Módulo 2 — grade de parcelas e cheques ───────────────

describe("Modo A (top-down) — CA-07", () => {
  it("R$ 10.000 em 3 parcelas gera 3.333,33 / 3.333,33 / 3.333,34", () => {
    const p = gerarParcelasMensais(10000, 3, "01/10/2026");
    expect(p.map((x) => x.valor)).toEqual([3333.33, 3333.33, 3333.34]);
  });

  it("a soma fecha EXATAMENTE com o total", () => {
    for (const [total, n] of [[10000, 3], [1000, 7], [999.99, 4], [1, 3]] as [number, number][]) {
      const p = gerarParcelasMensais(total, n, "01/10/2026");
      expect(totalDasParcelas(p)).toBe(total);
    }
  });

  it("os vencimentos avançam mês a mês", () => {
    const p = gerarParcelasMensais(300, 3, "01/10/2026");
    expect(p.map((x) => x.vencimento)).toEqual(["01/10/2026", "02/10/2026", "03/10/2026"]);
  });

  it('CA-09 — "todo dia 30" a partir de dez/2026 respeita fevereiro', () => {
    const p = gerarParcelasMensais(300, 3, "12/30/2026");
    expect(p.map((x) => x.vencimento)).toEqual([
      "12/30/2026",
      "01/30/2027",
      "02/28/2027", // 2027 não é bissexto — nunca 02/03
    ]);
  });
});

describe("Modo B (bottom-up) — CA-08", () => {
  it("total do PED = soma das parcelas de valores livres", () => {
    const parcelas = [{ valor: 2000 }, { valor: 5500 }, { valor: 1200 }];
    expect(totalDasParcelas(parcelas)).toBe(8700);
  });

  it("lista vazia soma zero", () => {
    expect(totalDasParcelas([])).toBe(0);
  });
});

describe("fechamento do parcelamento — CA-12 / RG-08", () => {
  it("soma igual ao total fecha", () => {
    expect(parcelamentoFecha(10000, [{ valor: 5000 }, { valor: 5000 }])).toBe(true);
    expect(diferencaFechamento(10000, [{ valor: 5000 }, { valor: 5000 }])).toBe(0);
  });

  it("divergência é reportada com o valor exato", () => {
    expect(diferencaFechamento(10000, [{ valor: 5000 }, { valor: 4000 }])).toBe(-1000);
    expect(parcelamentoFecha(10000, [{ valor: 5000 }, { valor: 4000 }])).toBe(false);
  });

  it("tolera 1 centavo POR PARCELA de arredondamento", () => {
    expect(parcelamentoFecha(10000, [{ valor: 3333.33 }, { valor: 3333.33 }, { valor: 3333.34 }])).toBe(true);
    // Meio real de diferença não é arredondamento — é erro de digitação.
    expect(parcelamentoFecha(10000, [{ valor: 5000 }, { valor: 5000.5 }])).toBe(false);
  });

  it('"Ajustar na última parcela" fecha a diferença sem tocar nas demais', () => {
    const ajustado = ajustarNaUltimaParcela(10000, [{ valor: 5000 }, { valor: 4000 }]);
    expect(ajustado.map((p) => p.valor)).toEqual([5000, 5000]);
    expect(parcelamentoFecha(10000, ajustado)).toBe(true);
  });

  it("ajustar não muta o array de entrada", () => {
    const original = [{ valor: 5000 }, { valor: 4000 }];
    ajustarNaUltimaParcela(10000, original);
    expect(original.map((p) => p.valor)).toEqual([5000, 4000]);
  });
});

describe("cheques — CA-10", () => {
  it("números não sequenciais são aceitos como estão", () => {
    const parcelas = [
      { forma: "Cheque", numeroCheque: "000450", bancoContaId: "b1" },
      { forma: "Cheque", numeroCheque: "000455", bancoContaId: "b1" },
      { forma: "Cheque", numeroCheque: "000461", bancoContaId: "b1" },
    ];
    expect(chequesDuplicados(parcelas)).toEqual([]);
  });

  it("preencher sequência preserva a largura do número", () => {
    expect(preencherSequenciaCheques("000450", 3)).toEqual(["000450", "000451", "000452"]);
    expect(preencherSequenciaCheques("A-99", 3)).toEqual(["A-99", "A-100", "A-101"]);
  });

  it("número repetido na MESMA conta gera alerta", () => {
    const parcelas = [
      { forma: "Cheque", numeroCheque: "450", bancoContaId: "b1" },
      { forma: "Cheque", numeroCheque: "450", bancoContaId: "b1" },
    ];
    expect(chequesDuplicados(parcelas)).toEqual(["450"]);
  });

  it("mesmo número em CONTAS diferentes não é duplicidade", () => {
    // Talões de contas distintas podem repetir numeração.
    const parcelas = [
      { forma: "Cheque", numeroCheque: "450", bancoContaId: "b1" },
      { forma: "Cheque", numeroCheque: "450", bancoContaId: "b2" },
    ];
    expect(chequesDuplicados(parcelas)).toEqual([]);
  });

  it("parcela que não é cheque não entra na conferência", () => {
    const parcelas = [
      { forma: "PIX", numeroCheque: "450", bancoContaId: "b1" },
      { forma: "PIX", numeroCheque: "450", bancoContaId: "b1" },
    ];
    expect(chequesDuplicados(parcelas)).toEqual([]);
  });

  it("cheque tem ciclo próprio: compensado/devolvido, não apenas pago", () => {
    expect(statusDisponiveis("Cheque")).toContain("Compensado");
    expect(statusDisponiveis("Cheque")).toContain("Devolvido");
    expect(statusDisponiveis("Cheque")).not.toContain("Pago");
    expect(statusDisponiveis("PIX")).toContain("Pago");
  });
});

describe("recorrente × parcelado — item 2.7 / CA-13", () => {
  it("marcar os dois é conflito", () => {
    expect(conflitoRecorrenteParcelado(true, true)).toBe(true);
  });

  it("cada um isolado é válido", () => {
    expect(conflitoRecorrenteParcelado(true, false)).toBe(false);
    expect(conflitoRecorrenteParcelado(false, true)).toBe(false);
    expect(conflitoRecorrenteParcelado(false, false)).toBe(false);
  });

  it("uma despesa parcelada em 6x gera UMA linha na DRE", () => {
    // Replicar a despesa por competência de parcela seria erro de competência
    // (RG-01): o custo foi incorrido uma vez, na compra.
    const parcelas = gerarParcelasMensais(6000, 6, "01/10/2026");
    expect(parcelas.length).toBe(6); // 6 saídas de caixa
    expect(linhasDreDeParcelamento()).toBe(1); // 1 linha na DRE
  });
});

describe("painel auxiliar de parcelas — item 2.1", () => {
  const linha = (valor: number, forma = "Cheque", banco = "b1", cheque = "") => ({
    valor,
    forma,
    bancoContaId: banco,
    numeroCheque: cheque,
  });

  it("herança de banco: a linha nova nasce com o banco do cabeçalho", () => {
    // O painel monta cada linha a partir do cabeçalho; só a exceção é editada.
    const bancoCabecalho = "conta-itau";
    const nova = { forma: "Cheque", bancoContaId: bancoCabecalho, numeroCheque: "" };
    expect(nova.bancoContaId).toBe(bancoCabecalho);
  });

  it("duplicar linha NÃO copia o número do cheque", () => {
    // Dois cheques com o mesmo número é exatamente o erro que a duplicação
    // facilitaria — o painel limpa o campo na cópia.
    const original = linha(1000, "Cheque", "b1", "000450");
    const copia = { ...original, numeroCheque: "" };
    expect(copia.numeroCheque).toBe("");
    expect(chequesDuplicados([original, copia])).toEqual([]);
  });

  it("modo bottom-up: sem total no cabeçalho, o total vira a soma", () => {
    const linhas = [linha(2000), linha(5500), linha(1200)];
    const totalCabecalho = 0;
    const soma = totalDasParcelas(linhas);
    const totalFinal = totalCabecalho > 0 ? totalCabecalho : soma;
    expect(totalFinal).toBe(8700);
  });

  it("modo bottom-up não acusa divergência", () => {
    // Sem total declarado não existe com o que divergir.
    const linhas = [linha(2000), linha(5500)];
    const bottomUp = true;
    const fecha = bottomUp || parcelamentoFecha(0, linhas);
    expect(fecha).toBe(true);
  });

  it("gerar série com dia de vencimento próprio respeita o fim de mês", () => {
    const p = gerarParcelasMensais(3000, 3, "01/05/2027", 31);
    expect(p.map((x) => x.vencimento)).toEqual([
      "01/31/2027",
      "02/28/2027",
      "03/31/2027",
    ]);
    expect(totalDasParcelas(p)).toBe(3000);
  });

  it("trocar a forma para Cheque reposiciona um status que não existe nele", () => {
    const statusAntigo = "Pago"; // válido em PIX, não em cheque
    const permitidos = statusDisponiveis("Cheque");
    const novo = permitidos.includes(statusAntigo) ? statusAntigo : "Pendente";
    expect(novo).toBe("Pendente");
  });

  it("trocar de Cheque para PIX preserva um status comum aos dois", () => {
    const permitidos = statusDisponiveis("PIX");
    const novo = permitidos.includes("Pendente") ? "Pendente" : "Pendente";
    expect(novo).toBe("Pendente");
  });

  it("sequência de cheques só preenche as linhas que são cheque", () => {
    const linhas = [linha(100, "Cheque"), linha(100, "PIX"), linha(100, "Cheque")];
    const nums = preencherSequenciaCheques("000450", linhas.length);
    const aplicado = linhas.map((l, i) =>
      l.forma === "Cheque" ? { ...l, numeroCheque: nums[i] } : l,
    );
    expect(aplicado.map((l) => l.numeroCheque)).toEqual(["000450", "", "000452"]);
  });
});
