import { describe, it, expect } from "vitest";
import { execucao, ladoDe, montarCard, tomDaLinha } from "./orcado-realizado";
import { waterfall, type Inputs } from "./dre-cascata";

const inp = (receita: number, custoVar: number, byCat: Record<string, number>): Inputs => ({ receita, custoVar, byCat });

describe("Prompt B · Orçado x Realizado (19–21)", () => {
  it("receita, custo e resultado batem com a cascata da DRE", () => {
    const i = inp(1000, 100, { "Custo Variável": 100, "Despesa Fixa": 50, Investimento: 20, "Despesas Financeiras": 5 });
    const lado = ladoDe(i);
    const wf = waterfall([i]);
    expect(lado.receita).toBe(wf.R);
    expect(lado.resultado).toBe(wf.rows.find((r) => r.kind === "final")!.value);
    expect(lado.custo).toBe(175);
    expect(lado.receita - lado.custo).toBe(lado.resultado);
  });

  it("% de execução só com orçado diferente de zero e realizado presente", () => {
    expect(execucao(1000, 850)).toBe(85);
    expect(execucao(300, 321)).toBe(107);
    expect(execucao(0, 10)).toBeNull();
    expect(execucao(null, 10)).toBeNull();
    expect(execucao(100, null)).toBeNull();
  });

  it("a cor segue o significado: custo acima de 100% é alerta, receita acima é bom", () => {
    expect(tomDaLinha("custo", 107, 321)).toBe("alerta");
    expect(tomDaLinha("custo", 85, 255)).toBe("bom");
    expect(tomDaLinha("receita", 107, 321)).toBe("bom");
    expect(tomDaLinha("receita", 85, 255)).toBe("neutro");
    expect(tomDaLinha("resultado", 120, 50)).toBe("bom");
    expect(tomDaLinha("resultado", 40, -10)).toBe("alerta");
    expect(tomDaLinha("resultado", null, null)).toBe("neutro");
  });

  it("sem orçamento e sem lançamentos são estados, não zeros", () => {
    const c = montarCard(null, null);
    expect(c.semOrcamento).toBe(true);
    expect(c.semLancamentos).toBe(true);
    expect(c.linhas.map((l) => [l.orcado, l.realizado, l.execucao, l.tom])).toEqual([
      [null, null, null, "neutro"],
      [null, null, null, "neutro"],
      [null, null, null, "neutro"],
    ]);
    expect(c.regime).toMatch(/competência/);
  });

  it("card completo com execução por linha", () => {
    const c = montarCard(inp(1000, 0, { "Custo Fixo": 400 }), inp(850, 0, { "Custo Fixo": 428 }));
    expect(c.linhas.map((l) => `${l.rotulo}:${l.orcado}/${l.realizado}=${l.execucao}%:${l.tom}`)).toEqual([
      "Receita:1000/850=85%:neutro",
      "Custos e despesas:400/428=107%:alerta",
      "Resultado:600/422=70.3%:neutro",
    ]);
  });
});
