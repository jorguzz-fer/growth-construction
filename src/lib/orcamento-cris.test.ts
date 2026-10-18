import { describe, it, expect } from "vitest";
import { aplicarNaGrade, assinaturaDaGrade, distribuicaoDosMeses, formularioDoOrcamento, type LinhaDaGrade } from "./orcamento-cris";
import { propostaValida } from "./cris";
import { repartirProposta, unirFormularios } from "./cris-formularios";

const MESES = ["01/2026", "02/2026", "03/2026", "04/2026"];
const linhas: LinhaDaGrade[] = [
  { rowKey: "__receitas_projeto__", label: "Receitas do Projeto", total: "1000", pct: { "01/2026": "100" }, fixa: true },
  { rowKey: "1", label: "Preliminares", total: "", pct: {} },
  { rowKey: "3", label: "Supraestrutura", total: "200", pct: { "02/2026": "100" } },
];

describe("Prompt D2 — a Cris preenche a grade do Orçamento", () => {
  it("o formulário: total e meses por linha; a linha fixa e a Previsão não oferecem o total", () => {
    const f = formularioDoOrcamento("despesa", linhas, MESES);
    expect(f.id).toBe("orcamento-despesa");
    expect(f.titulo).toContain("01/2026 a 04/2026");
    expect(f.campos.map((c) => c.nome)).toEqual(["meses:__receitas_projeto__", "total:1", "meses:1", "total:3", "meses:3"]);
    expect(formularioDoOrcamento("despesa", linhas, MESES, { totalSoLeitura: true }).campos.every((c) => c.nome.startsWith("meses:"))).toBe(true);
  });

  it("distribuição: intervalo igual (fecha 100), lista explícita, e recusa fora da grade", () => {
    expect(distribuicaoDosMeses("de 01/2026 a 03/2026", MESES)).toEqual({ pct: { "01/2026": 33.33, "02/2026": 33.33, "03/2026": 33.34, "04/2026": 0 } });
    expect(distribuicaoDosMeses("2/2026=40; 04/2026 = 60%", MESES)).toEqual({ pct: { "01/2026": 0, "02/2026": 40, "03/2026": 0, "04/2026": 60 } });
    expect(distribuicaoDosMeses("05/2026 a 06/2026", MESES)).toEqual({ erro: "05/2026 não está nos meses da grade." });
    expect(distribuicaoDosMeses("logo", MESES)).toEqual({ erro: "Diga os meses (MM/AAAA)." });
  });

  it("aplicar só preenche o estado da grade e diz o que mudou e o que não deu", () => {
    const r = aplicarNaGrade(linhas, MESES, { "total:1": "500000", "meses:1": "03/2026 a 04/2026", "meses:3": "09/2030 a 10/2030", "total:__receitas_projeto__": "9" });
    expect(r.linhas[1]).toMatchObject({ total: "500000", pct: { "01/2026": "", "02/2026": "", "03/2026": "50", "04/2026": "50" } });
    expect(r.linhas[0].total).toBe("1000"); // fixa: o total vem do cadastro
    expect(r.alteradas).toEqual(["Preliminares"]);
    expect(r.avisos).toEqual(["Supraestrutura: 09/2030 não está nos meses da grade."]);
    expect(assinaturaDaGrade(r.linhas)).not.toBe(assinaturaDaGrade(linhas));
  });

  it("a proposta do modelo passa pela validação do formulário (campo inventado cai)", () => {
    const f = formularioDoOrcamento("despesa", linhas, MESES);
    const p = propostaValida({ valores: { "total:1": "R$ 1.234,50", "total:99": "1", "meses:1": "01/2026 a 02/2026" } }, f)!;
    expect(p.valores).toEqual({ "total:1": "1234.5", "meses:1": "01/2026 a 02/2026" });
  });

  it("dois formulários na tela viram um para a Cris, e a proposta volta repartida", () => {
    const rec = formularioDoOrcamento("receita", [linhas[0]], MESES);
    const desp = formularioDoOrcamento("despesa", [linhas[1]], MESES);
    const u = unirFormularios([rec, desp])!;
    expect(u.id).toBe("tela");
    expect(u.campos.map((c) => c.nome)).toEqual(["orcamento-receita|meses:__receitas_projeto__", "orcamento-despesa|total:1", "orcamento-despesa|meses:1"]);
    expect(unirFormularios([desp])).toBe(desp);
    const partes = repartirProposta({ formulario: "tela", valores: { "orcamento-despesa|total:1": "10" }, conferir: {}, observacao: null }, [rec, desp]);
    expect(partes).toEqual([{ formulario: "orcamento-despesa", valores: { "total:1": "10" }, conferir: {}, observacao: null }]);
  });
});

describe("Prompt F2 — na Previsão, a Cris só mexe nos meses futuros", () => {
  it("o intervalo reparte o que sobra; os passados ficam", () => {
    expect(distribuicaoDosMeses("01/2026 a 04/2026", MESES, { "01/2026": 30, "02/2026": 20 })).toEqual({ pct: { "01/2026": 30, "02/2026": 20, "03/2026": 25, "04/2026": 25 } });
    expect(distribuicaoDosMeses("02/2026=10", MESES, { "02/2026": 20 })).toEqual({ erro: "02/2026 já passou: vem da Atual e não muda aqui." });
    expect(distribuicaoDosMeses("03/2026=60; 04/2026=60", MESES, { "01/2026": 10 })).toEqual({ erro: "A soma passaria de 100%." });
    expect(distribuicaoDosMeses("01/2026 a 02/2026", MESES, { "01/2026": 50, "02/2026": 50 })).toEqual({ erro: "Esses meses já passaram: vêm da Atual." });
  });

  it("aplicar na grade usa o % atual dos meses fixos de cada linha", () => {
    const r = aplicarNaGrade([{ rowKey: "1", label: "Prel", total: "100", pct: { "01/2026": "40", "02/2026": "" } }], MESES, { "meses:1": "02/2026 a 04/2026" }, { mesesFixos: ["01/2026"] });
    expect(r.linhas[0].pct).toEqual({ "01/2026": "40", "02/2026": "20", "03/2026": "20", "04/2026": "20" });
    expect(formularioDoOrcamento("despesa", [], MESES, { mesesFixos: ["01/2026"] }).titulo).toContain("meses editáveis: 02/2026 a 04/2026");
  });
});
