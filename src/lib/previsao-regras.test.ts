import { describe, it, expect } from "vitest";
import { avisoDeDivergencia, diferenca, isoParaInterna, recusaDoLimite, recusaDoNome, rotuloDaOrigem, tomDaVariacao, vagasRestantes, valorOuAusente, variacaoPct } from "./previsao-regras";

const sem = (s: string | null) => (s ?? "").replace(/ /g, " ");

describe("Prompt F · identificação e limite (2, 3)", () => {
  it("nome obrigatório", () => {
    expect(recusaDoNome("")).toMatch(/nome/);
    expect(recusaDoNome("  ")).toMatch(/nome/);
    expect(recusaDoNome("Revisão 01")).toBeNull();
  });
  it("limite de 12 com aviso perto do teto", () => {
    expect(vagasRestantes(0)).toEqual({ vagas: 12, aviso: null });
    expect(vagasRestantes(10).aviso).toMatch(/restam 2 vaga/);
    expect(vagasRestantes(12).aviso).toMatch(/atingido/);
    expect(recusaDoLimite(11)).toBeNull();
    expect(recusaDoLimite(12)).toMatch(/Limite de 12/);
  });
  it("rótulo da origem com data", () => {
    expect(rotuloDaOrigem({ sourceLabel: "Budget / Orçamento", sourceKind: "budget", createdAt: "2026-05-10T12:00:00.000Z" })).toBe("Base: Orçamento “Budget / Orçamento” · criada em 10/05/2026");
    expect(rotuloDaOrigem({ sourceLabel: null, sourceKind: null, createdAt: null })).toBe("Sem Orçamento de origem registrado");
    expect(isoParaInterna("2026-05-10")).toBe("05/10/2026");
  });
});

describe("Prompt F · totais herdados e comparação (5, 6)", () => {
  it("divergência só quando difere e há orçamento", () => {
    expect(avisoDeDivergencia(100, 100)).toBeNull();
    expect(avisoDeDivergencia(100, null)).toBeNull();
    expect(sem(avisoDeDivergencia(70000, 204140.4))).toBe("Orçamento hoje: R$ 204.140 (previsão herdou R$ 70.000)");
  });
  it("cor pelo significado: despesa acima do orçado é alerta", () => {
    expect(tomDaVariacao("despesa", 100)).toBe("alerta");
    expect(tomDaVariacao("despesa", -100)).toBe("bom");
    expect(tomDaVariacao("receita", 100)).toBe("bom");
    expect(tomDaVariacao("receita", -100)).toBe("alerta");
    expect(tomDaVariacao("receita", 0)).toBe("neutro");
  });
  it("ausente não é zero", () => {
    expect(valorOuAusente(null, (n) => `R$ ${n}`)).toBe("ausente");
    expect(valorOuAusente(0, (n) => `R$ ${n}`)).toBe("R$ 0");
    expect(variacaoPct(null, 10)).toBe("—");
    expect(variacaoPct(0, 10)).toBe("novo");
    expect(variacaoPct(100, 130)).toBe("30.0%");
    expect(diferenca(null, 10)).toBeNull();
    expect(diferenca(100, 130.004)).toBe(30);
  });
});
