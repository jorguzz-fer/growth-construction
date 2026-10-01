import { describe, it, expect } from "vitest";
import {
  avisoDeCoordenada,
  avisoDeDuracao,
  avisoDeFunding,
  avisoDeMunicipio,
  descreverInventario,
  duracaoDerivada,
  entradaFinanceira,
  INVENTARIO_VAZIO,
  normalizarCep,
  normalizarCoordenada,
  recusaDaExclusao,
  recusaDasCoordenadas,
  recusaDasDatas,
  recusaDoCep,
  rotuloDaSituacao,
  totalDoInventario,
  valorGlobal,
} from "./projeto-regras";

const semNbsp = (s: string | null) => (s ?? "").replace(/ /g, " ");

describe("Prompt B · duração derivada das datas (seção 9; Prompt I, 55)", () => {
  it("conta competências inclusive: 10/12/2025 → 10/12/2026 = 13", () => {
    expect(duracaoDerivada("12/10/2025", "12/10/2026")).toBe(13);
  });
  it("06/07/2026 → 10/02/2027 = 8 (o caso da OBRA 32)", () => {
    expect(duracaoDerivada("07/06/2026", "02/10/2027")).toBe(8);
  });
  it("sem uma das datas não há janela (null, nunca zero)", () => {
    expect(duracaoDerivada("07/06/2026", null)).toBeNull();
    expect(duracaoDerivada("", "")).toBeNull();
    expect(duracaoDerivada("02/10/2027", "07/06/2026")).toBeNull();
  });
  it("aviso só quando o gravado difere da janela; informativo", () => {
    expect(avisoDeDuracao(13, "12/10/2025", "12/10/2026")).toBeNull();
    expect(avisoDeDuracao(12, "12/10/2025", "12/10/2026")).toMatch(/12 meses.*13 competências/);
    expect(avisoDeDuracao(6, "07/06/2026", null)).toMatch(/sem as duas datas/);
    expect(avisoDeDuracao(null, "07/06/2026", "02/10/2027")).toBeNull();
  });
});

describe("Prompt B · datas (fim antes do início só em gravação nova)", () => {
  it("recusa fim < início; aceita igual; ignora vazio", () => {
    expect(recusaDasDatas("12/25/2026", "12/24/2026")).toMatch(/anterior/);
    expect(recusaDasDatas("12/25/2026", "12/25/2026")).toBeNull();
    expect(recusaDasDatas("12/25/2026", "")).toBeNull();
    expect(recusaDasDatas(null, "12/25/2026")).toBeNull();
  });
  it("compara pela data, não pelo texto (dia 25 não vira mês)", () => {
    expect(recusaDasDatas("01/25/2026", "02/01/2026")).toBeNull();
  });
});

describe("Prompt B · valores e funding (seções 10–12)", () => {
  it("valor global e entrada financeira seguem a regra atual", () => {
    const p = { valorConstrucao: "300000", valorTerreno: "75000", terrenoForaCaixa: true };
    expect(valorGlobal(p)).toBe(375000);
    expect(entradaFinanceira(p)).toBe(300000);
    expect(entradaFinanceira({ ...p, terrenoForaCaixa: false })).toBe(375000);
    expect(valorGlobal({ valorConstrucao: "", valorTerreno: null })).toBe(0);
  });
  it("funding nunca informado é dito como tal, não como zero", () => {
    expect(semNbsp(avisoDeFunding({ valorConstrucao: 100000, valorTerreno: 0 }))).toMatch(/não informadas.*R\$ 100\.000,00/);
  });
  it("funding abaixo do global diz a diferença; igual ou acima não avisa", () => {
    expect(semNbsp(avisoDeFunding({ valorConstrucao: 100000, financiamentoConstrucao: 60000, recursosProprios: "" }))).toMatch(/somam R\$ 60\.000,00; faltam R\$ 40\.000,00/);
    expect(avisoDeFunding({ valorConstrucao: 100000, financiamentoConstrucao: 60000, recursosProprios: 40000 })).toBeNull();
    expect(avisoDeFunding({ valorConstrucao: 100000, financiamentoConstrucao: 160000 })).toBeNull();
  });
  it("sem valor global não há o que comparar", () => {
    expect(avisoDeFunding({ financiamentoConstrucao: 10 })).toBeNull();
  });
});

describe("Prompt B · localização (seção 17)", () => {
  it("município sem IBGE avisa; IBGE inválido avisa; completo não avisa; vazio não avisa", () => {
    expect(avisoDeMunicipio("Praia Grande", "SP", "")).toMatch(/sem código IBGE/);
    expect(avisoDeMunicipio("", "SP", null)).toMatch(/sem código IBGE/);
    expect(avisoDeMunicipio("Praia Grande", "SP", "123")).toMatch(/inválido/);
    expect(avisoDeMunicipio("Praia Grande", "SP", "3541000")).toBeNull();
    expect(avisoDeMunicipio("", "", "")).toBeNull();
  });
  it("CEP: formata 8 dígitos, vazio vira null, tamanho errado recusa", () => {
    expect(normalizarCep("01310100")).toBe("01310-100");
    expect(normalizarCep("01310-100")).toBe("01310-100");
    expect(normalizarCep("")).toBeNull();
    expect(normalizarCep("1234")).toBeUndefined();
    expect(recusaDoCep("1234")).toMatch(/8 dígitos/);
    expect(recusaDoCep("")).toBeNull();
  });
  it("coordenadas: vírgula aceita, fora da faixa recusa, vazio é null", () => {
    expect(normalizarCoordenada("-23,6018", 90)).toBe(-23.6018);
    expect(normalizarCoordenada("", 90)).toBeNull();
    expect(normalizarCoordenada("95", 90)).toBeUndefined();
    expect(recusaDasCoordenadas("95", "0")).toMatch(/Latitude/);
    expect(recusaDasCoordenadas("0", "-200")).toMatch(/Longitude/);
    expect(recusaDasCoordenadas("", "")).toBeNull();
  });
  it("aviso de coordenada só quando a obra tem ponto registrado", () => {
    expect(avisoDeCoordenada(0)).toBeNull();
    expect(avisoDeCoordenada(3)).toMatch(/3 registro/);
  });
});

describe("Prompt B · exclusão protegida (seção 37)", () => {
  it("exige o nome digitado igual ao cadastro e nunca o último projeto", () => {
    expect(recusaDaExclusao({ name: "OBRA 28" }, "obra 28", 2)).toBeNull();
    expect(recusaDaExclusao({ name: "OBRA 28" }, "OBRA 2", 2)).toMatch(/digite o nome/);
    expect(recusaDaExclusao({ name: "OBRA 28" }, "OBRA 28", 1)).toMatch(/ao menos um/);
  });
  it("o inventário lista só o que existe", () => {
    expect(descreverInventario(INVENTARIO_VAZIO)).toEqual([]);
    const inv = { ...INVENTARIO_VAZIO, unidades: 2, despesas: 75, documentos: 1 };
    expect(descreverInventario(inv)).toEqual(["2 unidade(s)", "75 despesa(s)", "1 documento(s)"]);
    expect(totalDoInventario(inv)).toBe(78);
  });
  it("situação nula aparece como —, não como Ativo", () => {
    expect(rotuloDaSituacao(null)).toBe("—");
    expect(rotuloDaSituacao("Finalizado")).toBe("Finalizado");
  });
});
