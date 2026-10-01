import { describe, it, expect } from "vitest";
import { dataDaCelula, inventario, numeroDaCelula, prepararImportacaoDePermutas, totaisPorTipo, type AtivoParaInventario, type LinhaImportacaoPermuta } from "./permuta-inventario";

const HOJE = 20261001;
const ativo = (p: Partial<AtivoParaInventario> & { id: string }): AtivoParaInventario => ({
  tipo: "Imóvel",
  descricao: null,
  unitCode: "A-1",
  clienteNome: "Maria",
  dataRecebimento: "09/01/2026",
  estimado: "80000.00",
  status: "Disponivel",
  cancelado: false,
  ...p,
});

describe("Permuta — inventário (Prompt P, 5.2/5.3)", () => {
  it("lista só o que está em estoque (não vendido, não cancelado), com o tempo em estoque, do mais parado ao mais novo", () => {
    const l = inventario(
      [
        ativo({ id: "a", dataRecebimento: "09/01/2026" }),
        ativo({ id: "b", dataRecebimento: "03/15/2026", tipo: "Veículo", estimado: 50000 }),
        ativo({ id: "vendido", status: "Vendido" }),
        ativo({ id: "cancelado", cancelado: true }),
        ativo({ id: "semdata", dataRecebimento: null, tipo: "" }),
      ],
      HOJE,
    );
    expect(l.map((x) => [x.id, x.diasEmEstoque, x.tipo])).toEqual([
      ["b", 200, "Veículo"],
      ["a", 30, "Imóvel"],
      ["semdata", null, "Sem tipo"],
    ]);
    expect(totaisPorTipo(l)).toEqual([
      { tipo: "Imóvel", quantidade: 1, estimado: 80000 },
      { tipo: "Sem tipo", quantidade: 1, estimado: 80000 },
      { tipo: "Veículo", quantidade: 1, estimado: 50000 },
    ]);
  });
});

describe("Permuta — importação por planilha (Prompt P, 5.5)", () => {
  it("célula numérica: vírgula decimal lida certo; ilegível é NaN (reportada), nunca zero; vazia é null", () => {
    expect(numeroDaCelula("1.234,56")).toBe(1234.56);
    expect(numeroDaCelula(1234.56)).toBe(1234.56);
    expect(numeroDaCelula("R$ 80.000,00")).toBe(80000);
    expect(numeroDaCelula("abc")).toBeNaN();
    expect(numeroDaCelula("")).toBeNull();
    expect(numeroDaCelula(null)).toBeNull();
  });

  it("célula de data: DD/MM/AAAA, AAAA-MM-DD, serial do Excel e o formato gravado", () => {
    expect(dataDaCelula("15/09/2026")).toBe("09/15/2026");
    expect(dataDaCelula("2026-09-15")).toBe("09/15/2026");
    expect(dataDaCelula(46280)).toBe("09/15/2026");
    expect(dataDaCelula("09/15/2026")).toBe("09/15/2026");
    expect(dataDaCelula("05/10/2026")).toBe("10/05/2026"); // ambígua: planilha brasileira
    expect(dataDaCelula("")).toBe("");
    expect(dataDaCelula("31/13/2026")).toBeNull();
    expect(dataDaCelula("ontem")).toBeNull();
  });

  it("Id existente atualiza; sem Id insere; vendido, cancelado e Id desconhecido são ignorados com motivo; cada linha passa pela validação do cadastro", () => {
    const linha = (p: Partial<LinhaImportacaoPermuta>): LinhaImportacaoPermuta => ({
      unitCode: "A-1",
      cliente: "Maria",
      dataRecebimento: "09/15/2026",
      tipo: "Imóvel",
      descricao: null,
      estimado: "80000",
      status: "Disponivel",
      dataVenda: null,
      valorVenda: null,
      formaVenda: null,
      tipoPermuta: null,
      obs: null,
      ...p,
    });
    const r = prepararImportacaoDePermutas(
      [
        linha({}),
        linha({ id: "ex-1", descricao: "atualiza" }),
        linha({ id: "ex-1", descricao: "repetida" }),
        linha({ id: "vend" }),
        linha({ id: "canc" }),
        linha({ id: "nada" }),
        linha({ estimado: "" }),
        linha({ estimado: "NaN" }),
        linha({ unitCode: "" }),
        linha({ status: "Vendido", dataVenda: "10/01/2026", valorVenda: "82000" }),
      ],
      [
        { id: "ex-1", status: "Disponivel", cancelado: false },
        { id: "vend", status: "Vendido", cancelado: false },
        { id: "canc", status: "Disponivel", cancelado: true },
      ],
    );
    expect(r.validas.map((v) => [v.acao, v.id ?? null, v.descricao])).toEqual([
      ["inserir", null, null],
      ["atualizar", "ex-1", "atualiza"],
      ["inserir", null, null],
    ]);
    expect(r.ignoradas.map((i) => i.motivo)).toEqual([
      "Id repetido na planilha (a primeira linha vale)",
      "ativo vendido não é alterado por planilha",
      "ativo cancelado não é alterado por planilha",
      "Id não encontrado nesta versão",
      "O valor estimado deve ser maior que zero.",
      "O valor estimado deve ser maior que zero.",
      "Informe a unidade de origem do bem.",
    ]);
  });
});
