import { describe, it, expect } from "vitest";
import { calcProjection } from "./projection";
import { emptyUnit } from "./__fixtures__";
import type { InccRow } from "./types";

/**
 * CA-31 — REGRESSÃO da regra de INCC.
 *
 * A correção de datas do Módulo 6 mexeu no expansor de recebíveis. Estes testes
 * existem para garantir que a regra de correção monetária, que é anterior e
 * está correta, continue exatamente como está:
 *
 *   INCIDE     → financiamento parcelado do cliente (mensais, semestrais,
 *                anuais), a partir da 5ª parcela;
 *   NÃO INCIDE → entrada/ato, sinais, FGTS, subsídio e permuta física.
 *
 * Se algum dia alguém "melhorar" isso, o teste quebra antes de o cliente
 * descobrir pela fatura do comprador.
 */

/** INCC fixo de 10% acumulado em todo mês — facilita ver se aplicou ou não. */
const INCC_10: InccRow[] = Array.from({ length: 60 }, (_, i) => {
  const mo = (i % 12) + 1;
  const yr = 2026 + Math.floor(i / 12);
  return { m: `${String(mo).padStart(2, "0")}/${yr}`, mo: 0, ac: 10 } as InccRow;
});

const vendida = () => {
  const u = emptyUnit("APT-101", 500000);
  u.status = "Vendido";
  return u;
};

describe("INCC — onde INCIDE", () => {
  it("mensais recebem correção a partir da 5ª parcela", () => {
    const u = vendida();
    u.S3.usarMens = true;
    u.Mensais = { val: 1000, venc: "01/10/2026", n: 6, usarSem: false };
    const p = calcProjection(u, INCC_10);
    // Parcelas 1 a 4 sem correção…
    expect(p["01/2026"]).toBe(1000);
    expect(p["04/2026"]).toBe(1000);
    // …da 5ª em diante, corrigidas.
    expect(p["05/2026"]).toBe(1100);
    expect(p["06/2026"]).toBe(1100);
  });

  it("semestrais e anuais seguem a mesma regra", () => {
    const u = vendida();
    u.Mensais.usarSem = true;
    u.Semestrais = { val: 2000, venc: "01/10/2026", n: 6, usarAnu: false };
    const p = calcProjection(u, INCC_10);
    // Série: 01/26 (1ª) · 07/26 (2ª) · 01/27 (3ª) · 07/27 (4ª) · 01/28 (5ª).
    expect(p["01/2026"]).toBe(2000); // 1ª — sem correção
    expect(p["07/2027"]).toBe(2000); // 4ª — ainda sem correção
    expect(p["01/2028"]).toBe(2200); // 5ª — a partir daqui, corrigida
  });
});

describe("INCC — onde NÃO INCIDE", () => {
  it("entrada/ato não é corrigida, nem em parcelas avançadas", () => {
    const u = vendida();
    u.usarAS = true;
    u.AS = { val: 5000, venc: "01/10/2026", n: 8, usarS1: false };
    const p = calcProjection(u, INCC_10);
    for (const mm of ["01/2026", "05/2026", "08/2026"]) {
      expect(p[mm], `entrada corrigida em ${mm}`).toBe(5000);
    }
  });

  it("sinais (S1, S2, S3) não são corrigidos", () => {
    const u = vendida();
    u.AS.usarS1 = true;
    u.S1 = { val: 3000, venc: "01/10/2026", n: 8, usarS2: false };
    const p = calcProjection(u, INCC_10);
    expect(p["01/2026"]).toBe(3000);
    expect(p["06/2026"]).toBe(3000);
  });

  it("FGTS não é corrigido", () => {
    const u = vendida();
    u.Anuais.usarFGTS = true;
    u.FGTS = { val: 20000, dataPrev: "06/10/2026", usarSub: false };
    expect(calcProjection(u, INCC_10)["06/2026"]).toBe(20000);
  });

  it("subsídio não é corrigido", () => {
    const u = vendida();
    u.FGTS.usarSub = true;
    u.Subsidio = {
      val: 15000,
      dataPrev: "06/10/2026",
      statusSub: "Recebido",
      usarPer: false,
    };
    expect(calcProjection(u, INCC_10)["06/2026"]).toBe(15000);
  });

  it("permuta física não é corrigida", () => {
    const u = vendida();
    u.Subsidio.usarPer = true;
    u.Permuta = { desc: "Terreno", val: 80000, dataPrev: "06/10/2026", usarFinanc: false };
    expect(calcProjection(u, INCC_10)["06/2026"]).toBe(80000);
  });
});

describe("INCC — invariantes gerais", () => {
  it("unidade não vendida não projeta nada", () => {
    const u = emptyUnit("APT-102");
    u.usarAS = true;
    u.AS = { val: 5000, venc: "01/10/2026", n: 3, usarS1: false };
    expect(calcProjection(u, INCC_10)).toEqual({});
  });

  it("sem tabela INCC, nada é corrigido", () => {
    const u = vendida();
    u.S3.usarMens = true;
    u.Mensais = { val: 1000, venc: "01/10/2026", n: 6, usarSem: false };
    const p = calcProjection(u, []);
    expect(p["06/2026"]).toBe(1000);
  });

  it("entrada e mensais juntas: só as mensais são corrigidas", () => {
    const u = vendida();
    u.usarAS = true;
    u.AS = { val: 5000, venc: "01/10/2026", n: 1, usarS1: false };
    u.S3.usarMens = true;
    u.Mensais = { val: 1000, venc: "02/10/2026", n: 6, usarSem: false };
    const p = calcProjection(u, INCC_10);
    expect(p["01/2026"]).toBe(5000); // entrada, sem correção
    expect(p["06/2026"]).toBe(1100); // 5ª mensal, corrigida
  });
});
