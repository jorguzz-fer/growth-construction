import { describe, it, expect } from "vitest";
import { proximaSelecao, rotuloDaVersao, selecaoDoDashboard, textoDoRecorte } from "./dashboard-tela";

/** Prompt AA, Parte 1 — nomes, seleção padrão e recorte declarado. */
const v = (id: string, kind: string, dia: number, sourceVersionId: string | null = null) => ({
  id,
  kind,
  label: `rótulo ${id}`,
  color: "#000",
  isDefault: false,
  sourceVersionId,
  createdAt: new Date(2026, 0, dia),
});

describe("1.1 — natureza como rótulo, nome digitado como complemento", () => {
  it("Atual, Orçamento, Previsão Atualizada; o rótulo do usuário fica intacto", () => {
    expect(rotuloDaVersao(v("a", "atual", 1))).toEqual({ titulo: "Atual", complemento: "rótulo a", copia: false });
    expect(rotuloDaVersao(v("b", "budget", 1)).titulo).toBe("Orçamento");
    expect(rotuloDaVersao(v("f", "forecast", 1)).titulo).toBe("Previsão Atualizada");
  });
  it("cópia é identificada por source_version_id, não pelo texto", () => {
    expect(rotuloDaVersao(v("c", "forecast", 1, "a"))).toMatchObject({ titulo: "Previsão Atualizada (cópia)", copia: true });
    expect(rotuloDaVersao({ ...v("x", "budget", 1), label: "cópia de algo" }).copia).toBe(false);
  });
});

describe("1.2 — o padrão deixa de ser as três mais antigas", () => {
  const versoes = [v("b-velho", "budget", 1), v("f-velho", "forecast", 2), v("copia", "budget", 3, "b-velho"), v("atual", "atual", 4), v("b-novo", "budget", 5), v("f-novo", "forecast", 6)];
  it("Atual + o Orçamento e a Previsão mais recentes, sem cópia", () => {
    const { selecionadas } = selecaoDoDashboard(versoes, []);
    expect(selecionadas.map((x) => x.id).sort()).toEqual(["atual", "b-novo", "f-novo"]);
  });
  it("antes eram as três mais antigas (inclusive a cópia na fila)", () => {
    expect(versoes.slice(0, 3).map((x) => x.id)).toEqual(["b-velho", "f-velho", "copia"]);
  });
  it("a cópia continua selecionável pela URL; ids de outro projeto são ignorados", () => {
    expect(selecaoDoDashboard(versoes, ["copia", "de-outro-projeto"]).selecionadas.map((x) => x.id)).toEqual(["copia"]);
  });
  it("mais de três na URL: as que passam são CONTADAS, não somem em silêncio", () => {
    expect(selecaoDoDashboard(versoes, versoes.map((x) => x.id)).descartadas).toBe(3);
  });
  it("projeto sem versões: nada selecionado (nenhuma de outro projeto)", () => {
    expect(selecaoDoDashboard([], ["x"]).selecionadas).toEqual([]);
  });
});

describe("1.4 — a quarta é informada, não trocada", () => {
  it("no limite, a seleção fica e vem o aviso", () => {
    const r = proximaSelecao(["a", "b", "c"], "d", 3);
    expect(r.proxima).toEqual(["a", "b", "c"]);
    expect(r.aviso).toContain("No máximo 3");
  });
  it("abaixo do limite, marca; desmarcar a última é recusado com aviso", () => {
    expect(proximaSelecao(["a"], "b", 3)).toEqual({ proxima: ["a", "b"], aviso: null });
    expect(proximaSelecao(["a"], "a", 3).proxima).toEqual(["a"]);
  });
});

describe("1.6 — o cabeçalho declara o recorte", () => {
  it("projeto, versões e período", () => {
    expect(textoDoRecorte({ projetos: 1, nomeDoProjeto: "OBRA", versoes: ["Atual (“A”)"], de: "2026-01-01", ate: "2026-06-30" })).toBe(
      "Projeto OBRA · versões: Atual (“A”) · período de 01/01/2026 a 30/06/2026",
    );
    expect(textoDoRecorte({ projetos: 3, versoes: [], de: "", ate: "" })).toBe("3 projeto(s) somado(s) · nenhuma versão · todo o período");
  });
});
