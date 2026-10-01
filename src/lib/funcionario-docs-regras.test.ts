import { describe, expect, it } from "vitest";
import { avisoDeValidade, checklistDeAdmissao, competenciaValida, conferenciaDaFolha, NOMES_DOC_FUNCIONARIO, tipoEhAso, TIPOS_DOC_FUNCIONARIO } from "./funcionario-docs-regras";

describe("Documentos do funcionário e folha (Prompt Z, 2.2-A / 2.2-B)", () => {
  it("2.2-A.2 / 7.3-C — os 18 tipos, com prazo de guarda por tipo marcado para confirmar com o contador", () => {
    expect(NOMES_DOC_FUNCIONARIO).toHaveLength(18);
    expect(TIPOS_DOC_FUNCIONARIO.every((t) => /contador/.test(t.guarda))).toBe(true);
    expect(tipoEhAso("ASO — exame admissional")).toBe(true);
    expect(tipoEhAso("CNH")).toBe(false);
  });
  it("16d / 2.2-A.5 — checklist aponta o que falta sem bloquear, com o ASO destacado", () => {
    const c = checklistDeAdmissao(["CPF", "CTPS"]);
    expect(c.completo).toBe(false);
    expect(c.faltaAso).toBe(true);
    expect(c.faltantes).toContain("ASO — exame admissional");
    expect(c.faltantes).not.toContain("CPF");
    expect(checklistDeAdmissao(TIPOS_DOC_FUNCIONARIO.filter((t) => t.admissao).map((t) => t.nome))).toMatchObject({ completo: true, faltaAso: false });
  });
  it("16e / 2.2-A.7 — validade avisa a 30 dias e marca vencido", () => {
    expect(avisoDeValidade("2026-10-20", "2026-10-01")).toEqual({ estado: "vencendo", dias: 19 });
    expect(avisoDeValidade("2026-09-20", "2026-10-01")).toEqual({ estado: "vencido", dias: -11 });
    expect(avisoDeValidade("2027-10-01", "2026-10-01")?.estado).toBe("ok");
    expect(avisoDeValidade(null, "2026-10-01")).toBeNull();
  });
  it("16f / 16g / 2.2-B.5 — competência válida; conferência: folha sem despesa, despesa que parece folha sem registro, folha sem documento", () => {
    expect(competenciaValida("09/2026")).toBe(true);
    expect(competenciaValida("13/2026")).toBe(false);
    const r = conferenciaDaFolha(
      [{ competencia: "08/2026", despesaId: "d1", documentos: 2 }, { competencia: "09/2026", despesaId: null, documentos: 0 }],
      [{ id: "d1", numDoc: "PED-1", competencia: "08/2026", valor: 10000, texto: "Folha de pagamento agosto" }, { id: "d2", numDoc: "PED-2", competencia: "07/2026", valor: 9000, texto: "Salários julho" }, { id: "d3", numDoc: "PED-3", competencia: "07/2026", valor: 500, texto: "Cimento" }],
    );
    expect(r.folhaSemDespesa).toEqual(["09/2026"]);
    expect(r.despesaSemFolha.map((d) => d.id)).toEqual(["d2"]);
    expect(r.folhaSemDocumento).toEqual(["09/2026"]);
  });
});
