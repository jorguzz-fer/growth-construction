import { describe, it, expect } from "vitest";
import {
  ajustaDiaFimDeMes,
  avancaMeses,
  carenciaDivergente,
  dataPrimeiraParcela,
  formatDataInterna,
  intervaloMeses,
  parseDataInterna,
  serieVencimentos,
  ultimoDiaDoMes,
} from "./carencia";

describe("parse e format", () => {
  it("lê e escreve MM/DD/YYYY", () => {
    expect(parseDataInterna("03/05/2026")).toEqual({ mo: 3, d: 5, yr: 2026 });
    expect(formatDataInterna({ mo: 3, d: 5, yr: 2026 })).toBe("03/05/2026");
  });
  it("recusa vazio e malformado", () => {
    for (const v of [null, undefined, "", "2026-03-05", "13/01/2026", "03/32/2026"]) {
      expect(parseDataInterna(v)).toBeNull();
    }
  });
});

describe("último dia do mês", () => {
  it("meses de 30 e 31 dias", () => {
    expect(ultimoDiaDoMes(4, 2026)).toBe(30);
    expect(ultimoDiaDoMes(12, 2026)).toBe(31);
  });
  it("fevereiro comum e bissexto", () => {
    expect(ultimoDiaDoMes(2, 2027)).toBe(28);
    expect(ultimoDiaDoMes(2, 2028)).toBe(29);
  });
});

describe("ajustaDiaFimDeMes", () => {
  it("encolhe o dia quando o mês não o tem", () => {
    expect(ajustaDiaFimDeMes(4, 2026, 31)).toEqual({ mo: 4, yr: 2026, d: 30 });
    expect(ajustaDiaFimDeMes(2, 2027, 30)).toEqual({ mo: 2, yr: 2027, d: 28 });
    expect(ajustaDiaFimDeMes(2, 2028, 30)).toEqual({ mo: 2, yr: 2028, d: 29 });
  });
  it("mantém o dia quando ele existe", () => {
    expect(ajustaDiaFimDeMes(3, 2026, 30)).toEqual({ mo: 3, yr: 2026, d: 30 });
  });
});

describe("avancaMeses", () => {
  it("vira o ano corretamente", () => {
    expect(avancaMeses({ mo: 12, d: 10, yr: 2026 }, 1)).toEqual({ mo: 1, d: 10, yr: 2027 });
    expect(avancaMeses({ mo: 1, d: 10, yr: 2026 }, 12)).toEqual({ mo: 1, d: 10, yr: 2027 });
  });
  it("encolher num mês curto NÃO contamina os meses seguintes", () => {
    // Este é o erro clássico: 31/01 → 28/02 → e daí em diante todo mês vira 28.
    const base = { mo: 1, d: 31, yr: 2027 };
    expect(formatDataInterna(avancaMeses(base, 0))).toBe("01/31/2027");
    expect(formatDataInterna(avancaMeses(base, 1))).toBe("02/28/2027");
    expect(formatDataInterna(avancaMeses(base, 2))).toBe("03/31/2027");
    expect(formatDataInterna(avancaMeses(base, 3))).toBe("04/30/2027");
  });
});

describe("serieVencimentos (CA-09)", () => {
  it('"todo dia 30" a partir de dez/2026 gera 30/12, 28/02/2027 e 30/03 — nunca 02/03', () => {
    const s = serieVencimentos("12/30/2026", 4);
    expect(s[0]).toBe("12/30/2026");
    expect(s[1]).toBe("01/30/2027");
    expect(s[2]).toBe("02/28/2027"); // 2027 não é bissexto
    expect(s[3]).toBe("03/30/2027");
    // Nenhuma data "vaza" para o mês seguinte.
    expect(s).not.toContain("03/02/2027");
  });

  it("nunca produz data fora do calendário", () => {
    const s = serieVencimentos("01/31/2026", 14);
    for (const d of s) {
      const p = parseDataInterna(d)!;
      expect(p.d).toBeLessThanOrEqual(ultimoDiaDoMes(p.mo, p.yr));
    }
  });

  it("passo semestral e anual", () => {
    expect(serieVencimentos("01/15/2026", 3, 6)).toEqual([
      "01/15/2026",
      "07/15/2026",
      "01/15/2027",
    ]);
    expect(serieVencimentos("01/15/2026", 2, 12)).toEqual(["01/15/2026", "01/15/2027"]);
  });

  it("dia de vencimento pode ser diferente do dia da data-base", () => {
    expect(serieVencimentos("01/05/2026", 2, 1, 20)).toEqual(["01/20/2026", "02/20/2026"]);
  });

  it("data-base inválida ou quantidade zero devolve lista vazia", () => {
    expect(serieVencimentos("", 5)).toEqual([]);
    expect(serieVencimentos("01/15/2026", 0)).toEqual([]);
  });
});

describe("carência (itens 6.2 e 6.3)", () => {
  it("mede o intervalo em meses, ignorando o dia", () => {
    // Caso real da OBRA 31: ato em 11/02/2026, primeira mensal em 20/01/2027.
    expect(intervaloMeses("02/11/2026", "01/20/2027")).toBe(11);
    expect(intervaloMeses("02/11/2026", "03/11/2026")).toBe(1);
    expect(intervaloMeses(null, "03/11/2026")).toBe(0);
  });

  it("carência 1 põe a primeira parcela um mês depois da data-base", () => {
    expect(dataPrimeiraParcela("02/11/2026", 1)).toBe("03/11/2026");
    expect(dataPrimeiraParcela("02/11/2026", 0)).toBe("02/11/2026");
    expect(dataPrimeiraParcela("12/11/2026", 2)).toBe("02/11/2027");
  });

  it("carência respeita o dia de vencimento escolhido e o fim de mês", () => {
    expect(dataPrimeiraParcela("01/15/2027", 1, 31)).toBe("02/28/2027");
  });

  it("alerta quando o intervalo real excede a carência configurada", () => {
    expect(carenciaDivergente("02/11/2026", "01/20/2027", 1)).toBe(true);
    expect(carenciaDivergente("02/11/2026", "03/11/2026", 1)).toBe(false);
    // 11 meses de carência configurada = combinado, não divergência.
    expect(carenciaDivergente("02/11/2026", "01/20/2027", 11)).toBe(false);
  });

  it("plano incompleto não dispara alerta", () => {
    expect(carenciaDivergente(null, "01/20/2027", 1)).toBe(false);
    expect(carenciaDivergente("02/11/2026", null, 1)).toBe(false);
  });
});
