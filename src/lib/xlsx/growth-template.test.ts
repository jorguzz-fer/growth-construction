import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildTemplateBuffer, parseWorkbook, SHEETS } from "./growth-template";
import type { InccRow } from "@/lib/calc/types";

const incc: InccRow[] = [
  { m: "05/2025", mo: 0.26, ac: 0.26 },
  { m: "06/2025", mo: 0.96, ac: 1.222 },
];

/** Lê a 1ª linha (cabeçalho) de uma aba do template. */
function headers(tmpl: XLSX.WorkBook, sheet: string): string[] {
  return (XLSX.utils.sheet_to_json(tmpl.Sheets[sheet], { header: 1 })[0] as string[]);
}
function rowFor(hs: string[], obj: Record<string, unknown>): unknown[] {
  return hs.map((h) => obj[h] ?? "");
}

/** Gera o template, preenche uma linha por aba e serializa de volta. */
function filledWorkbook(): Buffer {
  const tmpl = XLSX.read(buildTemplateBuffer(incc), { type: "buffer" });
  const wb = XLSX.utils.book_new();

  // Parametros: reutiliza o do template
  XLSX.utils.book_append_sheet(wb, tmpl.Sheets[SHEETS.parametros], SHEETS.parametros);

  const vH = headers(tmpl, SHEETS.vendas);
  const unit = rowFor(vH, {
    Unidade: "BLA 999", "Valor R$": 500000, Status: "Vendido",
    "Usar AS?": "Sim", "AS Valor": 5000, "AS Venc": "02/27/2026", "AS Nr": 1, "AS->S1?": "Nao",
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([vH, unit]), SHEETS.vendas);

  const rH = headers(tmpl, SHEETS.reembolso);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([rH, rowFor(rH, { "Data (DD/MM/AAAA)": "01/27/2026", Origem: "X", "Valor R$": 50000 })]),
    SHEETS.reembolso,
  );

  const pH = headers(tmpl, SHEETS.permuta);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([pH, rowFor(pH, { Unidade: "BLA 999", Tipo: "Carro", "Valor Estimado R$": 40000, Status: "Vendido", "Valor Venda R$": 35000 })]),
    SHEETS.permuta,
  );

  // Despesas: coloca 125000 no Jan/Ano1 do 1º subitem (Serviços técnicos → 1.1)
  const despAoa = XLSX.utils.sheet_to_json(tmpl.Sheets[SHEETS.despesas], { header: 1 }) as unknown[][];
  despAoa[1][2] = 125000;
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(despAoa), SHEETS.despesas);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("growth-template", () => {
  it("gera um workbook com as 5 abas padrão", () => {
    const wb = XLSX.read(buildTemplateBuffer(incc), { type: "buffer" });
    expect(wb.SheetNames).toEqual([
      "Parametros", "Dados_de_Venda", "Reembolso", "Permuta", "Despesas_CEF",
    ]);
  });

  it("Despesas_CEF traz os 91 subitens do plano de contas", () => {
    const wb = XLSX.read(buildTemplateBuffer(incc), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEETS.despesas], { header: 1 });
    expect(rows.length).toBe(1 + 91); // cabeçalho + subitens
  });

  it("round-trip: parseia unidade + plano de pagamento", () => {
    const p = parseWorkbook(filledWorkbook());
    expect(p.units).toHaveLength(1);
    const u = p.units[0];
    expect(u.code).toBe("BLA 999");
    expect(u.status).toBe("Vendido");
    expect(u.valor).toBe(500000);
    expect(u.plan.usarAS).toBe(true);
    expect(u.plan.AS).toMatchObject({ val: 5000, venc: "02/27/2026", n: 1, usarS1: false });
  });

  it("round-trip: reembolsos, permutas e INCC", () => {
    const p = parseWorkbook(filledWorkbook());
    expect(p.reembolsos).toHaveLength(1);
    expect(p.reembolsos[0].valor).toBe(50000);
    expect(p.permutas).toHaveLength(1);
    expect(p.permutas[0]).toMatchObject({ unitCode: "BLA 999", status: "Vendido", valorVenda: 35000 });
    expect(p.incc).toHaveLength(2);
    expect(p.incc[0]).toMatchObject({ mes: "05/2025", accumulated: 0.26 });
  });

  it("round-trip: despesa da matriz vira lançamento com conta e competência", () => {
    const p = parseWorkbook(filledWorkbook());
    expect(p.despesas).toHaveLength(1);
    // 1º subitem = "Serviços técnicos (...)" → código 1.1 ; Jan/Ano1 com base 2025
    expect(p.despesas[0]).toMatchObject({ contaCef: "1.1", competencia: "01/2025", valor: 125000 });
  });
});
