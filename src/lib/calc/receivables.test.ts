import { describe, it, expect } from "vitest";
import { expandUnitReceivables } from "./receivables";
import { parseDataInterna, ultimoDiaDoMes } from "./carencia";
import type { PaymentPlan } from "./types";

/** Monta um plano parcial — o expansor lê de forma tolerante. */
const plano = (secoes: Record<string, unknown>) => secoes as unknown as PaymentPlan;

describe("expandUnitReceivables — datas de vencimento (item 6.2 / 2.4)", () => {
  it("só gera recebíveis para unidade VENDIDA", () => {
    const p = plano({ Mensais: { venc: "01/10/2026", val: 1000, n: 3 } });
    expect(expandUnitReceivables(p, "Disponivel")).toEqual([]);
    expect(expandUnitReceivables(p, "Vendido").length).toBe(3);
  });

  it("mensais avançam mês a mês preservando o dia", () => {
    const r = expandUnitReceivables(
      plano({ Mensais: { venc: "01/10/2026", val: 1000, n: 3 } }),
      "Vendido",
    );
    expect(r.map((x) => x.dia)).toEqual(["01/10/2026", "02/10/2026", "03/10/2026"]);
  });

  it("dia 31 NUNCA produz data inexistente — o bug corrigido", () => {
    // Antes: "04/31/2026". Agora encolhe para o último dia do mês.
    const r = expandUnitReceivables(
      plano({ Mensais: { venc: "01/31/2026", val: 1000, n: 12 } }),
      "Vendido",
    );
    for (const x of r) {
      const d = parseDataInterna(x.dia);
      expect(d, `data inválida: ${x.dia}`).not.toBeNull();
      expect(d!.d).toBeLessThanOrEqual(ultimoDiaDoMes(d!.mo, d!.yr));
    }
    expect(r[3].dia).toBe("04/30/2026"); // abril tem 30
    expect(r[1].dia).toBe("02/28/2026"); // 2026 não é bissexto
  });

  it("encolher em fevereiro não contamina março", () => {
    const r = expandUnitReceivables(
      plano({ Mensais: { venc: "01/31/2027", val: 100, n: 3 } }),
      "Vendido",
    );
    expect(r.map((x) => x.dia)).toEqual(["01/31/2027", "02/28/2027", "03/31/2027"]);
  });

  it("fevereiro de ano bissexto usa o dia 29", () => {
    const r = expandUnitReceivables(
      plano({ Mensais: { venc: "01/31/2028", val: 100, n: 2 } }),
      "Vendido",
    );
    expect(r[1].dia).toBe("02/29/2028");
  });

  it("semestrais e anuais respeitam o passo", () => {
    const semestral = expandUnitReceivables(
      plano({ Semestrais: { venc: "01/15/2026", val: 500, n: 3 } }),
      "Vendido",
    );
    expect(semestral.map((x) => x.dia)).toEqual([
      "01/15/2026",
      "07/15/2026",
      "01/15/2027",
    ]);
    const anual = expandUnitReceivables(
      plano({ Anuais: { venc: "01/15/2026", val: 500, n: 2 } }),
      "Vendido",
    );
    expect(anual.map((x) => x.dia)).toEqual(["01/15/2026", "01/15/2027"]);
  });

  it("blocos com valor zero ou sem data são ignorados", () => {
    expect(
      expandUnitReceivables(
        plano({ Mensais: { venc: "01/10/2026", val: 0, n: 3 }, AS: { venc: "", val: 100, n: 1 } }),
        "Vendido",
      ),
    ).toEqual([]);
  });

  it("cada bloco tem sua PRÓPRIA data de início — o intervalo é dado, não bug", () => {
    // Caso OBRA 31: ato em 11/02/2026, primeira mensal em 20/01/2027. O
    // expansor não gera essa distância — ela vem digitada no plano.
    const r = expandUnitReceivables(
      plano({
        AS: { venc: "02/11/2026", val: 10000, n: 1 },
        Mensais: { venc: "01/20/2027", val: 1000, n: 8 },
      }),
      "Vendido",
    );
    expect(r[0].dia).toBe("02/11/2026");
    expect(r[1].dia).toBe("01/20/2027");
    expect(r.filter((x) => x.label.startsWith("Mensal")).length).toBe(8);
  });

  it("entradas de parcela única (FGTS, subsídio, permuta, financiamento)", () => {
    const r = expandUnitReceivables(
      plano({
        FGTS: { dataPrev: "03/10/2026", val: 20000 },
        Subsidio: { dataPrev: "04/10/2026", val: 15000 },
        Permuta: { dataPrev: "05/10/2026", val: 30000 },
        Banco: { dataPrimParc: "06/10/2026", valFinanc: 200000 },
      }),
      "Vendido",
    );
    expect(r.map((x) => x.label).sort()).toEqual([
      "FGTS",
      "Financiamento",
      "Permuta",
      "Subsídio",
    ]);
    expect(r.reduce((a, x) => a + x.valor, 0)).toBe(265000);
  });
});
