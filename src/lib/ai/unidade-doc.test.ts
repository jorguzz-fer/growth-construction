import { describe, it, expect } from "vitest";
import { montarPropostaDeUnidade, type DadosVendaLidos } from "./unidade-doc";
import { calcUnitTotal } from "@/lib/calc/projection";

function lido(over: Partial<DadosVendaLidos> = {}): DadosVendaLidos {
  return {
    code: "",
    itemType: "",
    tipo: "",
    bloco: "",
    m2: null,
    andar: null,
    valor: null,
    status: "",
    dataVenda: "",
    AS: null,
    S1: null,
    S2: null,
    S3: null,
    Mensais: null,
    Semestrais: null,
    Anuais: null,
    FGTS: null,
    Subsidio: null,
    Permuta: null,
    Banco: null,
    baixaConfianca: [],
    observacoes: [],
    ...over,
  };
}

describe("proposta de unidade a partir do texto (Prompt J, 6.3 / BJ-3) — regra pura", () => {
  it("'vendi a casa 12 por 380 mil em 05/03, sinal de 50 mil, 36 parcelas de 4.500 e financiamento do restante'", () => {
    const p = montarPropostaDeUnidade(
      lido({
        code: "12",
        tipo: "Casa",
        valor: 380000,
        status: "Vendido",
        dataVenda: "2026-03-05",
        AS: { valor: 50000, parcelas: 1, primeiroVencimento: "2026-03-05" },
        Mensais: { valor: 4500, parcelas: 36, primeiroVencimento: "2026-04-05" },
        Banco: { valorFinanciado: null, dataEntrada: "", dataPrimeiraParcela: "", restante: true },
      }),
    );
    expect(p.valores).toMatchObject({ code: "12", tipo: "Casa", valor: "380000", status: "Vendido", mesVenda: "03/05/2026", itemType: "unidade" });
    expect(p.valores.plan.AS).toMatchObject({ val: 50000, venc: "03/05/2026", n: 1 });
    expect(p.valores.plan.Mensais).toMatchObject({ val: 4500, venc: "04/05/2026", n: 36 });
    // restante: 380.000 − 50.000 − 162.000 = 168.000
    expect(p.valores.plan.Banco.valFinanc).toBe(168000);
    expect(calcUnitTotal({ ...p.valores.plan, code: "12", status: "Vendido", valor: 380000 })).toBe(380000);
    expect(p.valores.plan.usarAS).toBe(true);
    expect(p.valores.plan.S3.usarMens).toBe(true);
    expect(p.valores.plan.Permuta.usarFinanc).toBe(true);
    expect(p.alertas.plano?.nivel).toBe("conferir"); // financiamento calculado, não dito
    expect(p.alertas.code).toBeUndefined();
    expect(p.alertas.valor).toBeUndefined();
    expect(p.alertas.mesVenda).toBeUndefined();
    expect(p.resumo).toBe("Unidade 12 · Vendido · R$ 380.000,00 · venda em 05/03/2026");
    expect(p.preenchidos).toEqual(expect.arrayContaining(["Código", "VGV (valor)", "Data da venda", "Ato de assinatura", "Mensais", "Financiamento bancário"]));
  });

  it("não inventa: sem código e sem valor vira 'faltando'; vendida sem data e sem plano também", () => {
    const p = montarPropostaDeUnidade(lido({ status: "Vendido" }));
    expect(p.alertas.code?.nivel).toBe("faltando");
    expect(p.alertas.valor?.nivel).toBe("faltando");
    expect(p.alertas.mesVenda?.nivel).toBe("faltando");
    expect(p.alertas.plano?.nivel).toBe("faltando");
    expect(p.valores.valor).toBe("");
  });

  it("status deduzido vira 'conferir'; disponível sem venda não pede plano nem data", () => {
    const comData = montarPropostaDeUnidade(lido({ code: "A", valor: 100, dataVenda: "2026-01-10" }));
    expect(comData.valores.status).toBe("Vendido");
    expect(comData.alertas.status?.nivel).toBe("conferir");
    const semNada = montarPropostaDeUnidade(lido({ code: "A", valor: 100 }));
    expect(semNada.valores.status).toBe("Disponivel");
    expect(semNada.alertas.mesVenda).toBeUndefined();
    expect(semNada.alertas.plano).toBeUndefined();
  });

  it("fontes que não fecham com o valor viram alerta no plano; data ilegível também", () => {
    const p = montarPropostaDeUnidade(
      lido({ code: "B", valor: 100000, status: "Vendido", dataVenda: "2026-02-30", AS: { valor: 90000, parcelas: 1, primeiroVencimento: "hoje" } }),
    );
    expect(p.valores.mesVenda).toBe(""); // 30/02 não existe
    expect(p.alertas.mesVenda?.nivel).toBe("faltando");
    expect(p.alertas.plano?.motivo).toMatch(/Data ilegível em: AS/);
  });

  it("fontes que não fecham: diferença no alerta; baixa confiança marca o campo", () => {
    const p = montarPropostaDeUnidade(
      lido({ code: "C", valor: 100000, status: "Vendido", dataVenda: "2026-02-10", AS: { valor: 90000, parcelas: 1, primeiroVencimento: "2026-02-10" }, baixaConfianca: ["tipo"] , tipo: "Apto" }),
    );
    expect(p.alertas.plano?.motivo).toMatch(/somam R\$ 90\.000,00 e o valor é R\$ 100\.000,00/);
    expect(p.alertas.tipo?.nivel).toBe("conferir");
  });

  it("nunca produz status fora da lista nem valores negativos", () => {
    const p = montarPropostaDeUnidade(lido({ code: "D", valor: -5, status: "Quitada" as never, m2: -1, AS: { valor: -10, parcelas: 1, primeiroVencimento: "" } }));
    expect(p.valores.status).toBe("Disponivel");
    expect(p.valores.valor).toBe("");
    expect(p.valores.m2).toBe("");
    expect(p.valores.plan.AS.val).toBe(0);
  });
});
