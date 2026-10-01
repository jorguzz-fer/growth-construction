import { describe, expect, it } from "vitest";
import { analisarPlano, combina, contasParecidas, contasSemUso, periodoPadrao, usoDivergente, type ContaDoPlano, type LancamentoAgregado } from "./planocontas-analise";

const c = (x: Partial<ContaDoPlano> & { code: string; name: string }): ContaDoPlano => ({
  id: x.code,
  kind: "cef",
  natureza: "despesa",
  ativo: true,
  groupCode: x.code.split(".")[0],
  groupName: "Grupo",
  ...x,
});
const hoje = new Date("2026-10-15T00:00:00Z");
const periodo = periodoPadrao(hoje); // 11/2025 a 10/2026

describe("periodoPadrao (8.4.1)", () => {
  it("declara os 12 meses até o mês de hoje", () => {
    expect(periodo).toEqual({ de: "11/2025", ate: "10/2026" });
    expect(periodoPadrao(new Date("2026-01-05T00:00:00Z"), 3)).toEqual({ de: "11/2025", ate: "01/2026" });
  });
});

describe("combina — leitura, não regra", () => {
  it("receita só com Receita; CEF com custo; complementar com o resto", () => {
    expect(combina({ kind: "cef", natureza: "receita" }, "Receita")).toBe(true);
    expect(combina({ kind: "cef", natureza: "despesa" }, "Custo Variável")).toBe(true);
    expect(combina({ kind: "cef", natureza: "despesa" }, "Despesa Fixa")).toBe(false);
    expect(combina({ kind: "complementar", natureza: "despesa" }, "Despesa Fixa")).toBe(true);
    expect(combina({ kind: "complementar", natureza: "despesa" }, "Custo Fixo")).toBe(false);
    expect(combina({ kind: "complementar", natureza: "despesa" }, "Receita")).toBe(false);
  });
});

describe("contasSemUso (8.3.1)", () => {
  const contas = [c({ code: "1.1", name: "Limpeza" }), c({ code: "1.2", name: "Tapume" }), c({ code: "1.3", name: "Antiga", ativo: false }), c({ code: "1.4", name: "Velha" })];
  const lanc: LancamentoAgregado[] = [
    { code: "1.1", categoria: "Custo Variável", competencia: "09/2026", ultimaCriacao: "2026-09-10", n: 3 },
    { code: "1.4", categoria: "Custo Variável", competencia: "01/2024", ultimaCriacao: "2024-01-20", n: 1 },
  ];
  it("separa 'nunca teve lançamento' de 'teve, mas fora do período', e ignora inativas", () => {
    const r = contasSemUso(contas, lanc, periodo);
    expect(r.map((x) => [x.code, x.nunca, x.ultimo])).toEqual([
      ["1.4", false, "2024-01-20"],
      ["1.2", true, null],
    ]);
  });
  it("sem competência válida, usa o mês da criação", () => {
    const r = contasSemUso([c({ code: "2.1", name: "X" })], [{ code: "2.1", categoria: "Custo Fixo", competencia: null, ultimaCriacao: "2026-08-01", n: 1 }], periodo);
    expect(r).toEqual([]);
  });
});

describe("usoDivergente (8.3.2)", () => {
  it("mostra a categoria que não combina com a contagem, e as que combinam para contraste — sem afirmar erro", () => {
    const contas = [c({ code: "3.1", name: "Estrutura" }), c({ code: "A.1", name: "Aluguel", kind: "complementar" })];
    const lanc: LancamentoAgregado[] = [
      { code: "3.1", categoria: "Despesa Fixa", competencia: "05/2026", ultimaCriacao: "2026-05-01", n: 2 },
      { code: "3.1", categoria: "Custo Variável", competencia: "05/2026", ultimaCriacao: "2026-05-01", n: 7 },
      { code: "A.1", categoria: "Despesa Fixa", competencia: "05/2026", ultimaCriacao: "2026-05-01", n: 4 },
      { code: "3.1", categoria: "Despesa Fixa", competencia: "05/2020", ultimaCriacao: "2020-05-01", n: 9 }, // fora do período
    ];
    const r = usoDivergente(contas, lanc, periodo);
    expect(r).toHaveLength(1);
    expect(r[0].code).toBe("3.1");
    expect(r[0].categorias).toEqual([{ categoria: "Despesa Fixa", n: 2 }]);
    expect(r[0].combinam).toEqual([{ categoria: "Custo Variável", n: 7 }]);
  });
});

describe("contasParecidas (8.3.3)", () => {
  it("mesmo nome, um contém o outro, palavras em comum — só no mesmo tipo de grupo", () => {
    const contas = [
      c({ code: "1.1", name: "Limpeza do terreno" }),
      c({ code: "2.1", name: "Limpeza do Terreno" }),
      c({ code: "2.2", name: "Limpeza do terreno e tapume" }),
      c({ code: "A.1", name: "Limpeza do terreno", kind: "complementar" }),
      c({ code: "8.1", name: "Instalações elétricas prediais" }),
      c({ code: "8.2", name: "Instalações hidráulicas prediais" }),
      c({ code: "9.1", name: "Pintura" }),
    ];
    const r = contasParecidas(contas);
    expect(r.map((p) => `${p.a.code}~${p.b.code}:${p.motivo}`)).toEqual([
      "1.1~2.1:mesmo nome",
      "1.1~2.2:um contém o outro",
      "2.1~2.2:um contém o outro",
      "8.1~8.2:palavras em comum",
    ]);
  });
});

describe("analisarPlano — permissão de origem (8.5) e declarações (8.4)", () => {
  const contas = [c({ code: "1.1", name: "Limpeza" })];
  const uso = { lancamentos: [{ code: "1.1", categoria: "Despesa Fixa", competencia: "09/2026", ultimaCriacao: "2026-09-01", n: 1 }], orcamento: [{ code: "1.1", kind: "despesa", categoria: "Custo Variável", projeto: "OBRA 1" }] };
  it("sem ver Despesas não há contagem de lançamento nem divergência; o período e os projetos ficam declarados", () => {
    const r = analisarPlano(contas, uso, { projetos: ["OBRA 1"], comLancamentos: false, comOrcamento: true, hoje });
    expect(r.comLancamentos).toBe(false);
    expect(r.semUso).toEqual([]);
    expect(r.divergentes).toEqual([]);
    expect(r.onde[0].dre).toEqual([]);
    expect(r.onde[0].orcamentoEm).toEqual(["OBRA 1"]);
    expect(r.periodo).toEqual({ de: "11/2025", ate: "10/2026" });
    expect(r.projetos).toEqual(["OBRA 1"]);
  });
  it("com permissão, a divergência e o 'onde aparece' usam as contagens", () => {
    const r = analisarPlano(contas, uso, { projetos: ["OBRA 1"], comLancamentos: true, comOrcamento: false, hoje });
    expect(r.divergentes[0].categorias).toEqual([{ categoria: "Despesa Fixa", n: 1 }]);
    expect(r.onde[0].dre).toEqual([{ categoria: "Despesa Fixa", n: 1 }]);
    expect(r.onde[0].orcamentoEm).toEqual([]);
  });
});
