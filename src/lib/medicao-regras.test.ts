import { describe, it, expect } from "vitest";
import { avisoDeDuplicidade, competenciaValida, idsDuplicados, podeTocarMedicao, recusaDaMedicao, recusaDoValor, rotuloDoAutor, textoDoVazio, veSoAsProprias } from "./medicao-regras";

const brl = (n: number) => `R$ ${n}`;

describe("Prompt V · regras da medição (4.5, 4.6, 0.5)", () => {
  it("4.5 — valor vazio, zero, negativo e inválido são recusados; positivo passa", () => {
    expect(recusaDoValor("")).toMatch(/Informe o valor/);
    expect(recusaDoValor("0")).toMatch(/maior que zero/);
    expect(recusaDoValor("-5")).toMatch(/maior que zero/);
    expect(recusaDoValor("abc")).toMatch(/válido/);
    expect(recusaDoValor("12.5")).toBeNull();
  });
  it("4.5 — competência só no formato MM/AAAA", () => {
    expect(competenciaValida("09/2026")).toBe(true);
    expect(competenciaValida("13/2026")).toBe(false);
    expect(competenciaValida("9/2026")).toBe(false);
    expect(competenciaValida("")).toBe(false);
    expect(recusaDaMedicao({ competencia: "2026-09", grupoCode: "1", valor: "1" })).toMatch(/MM\/AAAA/);
    expect(recusaDaMedicao({ competencia: "09/2026", grupoCode: "", valor: "1" })).toMatch(/grupo/);
    expect(recusaDaMedicao({ competencia: "09/2026", grupoCode: "1", valor: "1" })).toBeNull();
  });
  it("4.6 — mesma competência e grupo avisa (soma do que já existe), nunca bloqueia", () => {
    const ex = [
      { id: "a", competencia: "09/2026", grupoCode: "1", valor: 100 },
      { id: "b", competencia: "09/2026", grupoCode: "1", valor: 50 },
      { id: "c", competencia: "10/2026", grupoCode: "1", valor: 7 },
    ];
    expect(avisoDeDuplicidade(ex, { competencia: "09/2026", grupoCode: "1" }, brl)).toMatch(/2 medição do grupo 1 em 09\/2026 \(R\$ 150\)/);
    expect(avisoDeDuplicidade(ex, { competencia: "09/2026", grupoCode: "2" }, brl)).toBeNull();
    // ao editar a própria "a", ela não conta contra si mesma
    expect(avisoDeDuplicidade(ex, { competencia: "10/2026", grupoCode: "1" }, brl, "c")).toBeNull();
    expect([...idsDuplicados(ex)].sort()).toEqual(["a", "b"]);
  });
  it("0.5 — engenheiro vê só as próprias; sem autor é de todos; outro autor é recusado", () => {
    expect(veSoAsProprias("engenheiro")).toBe(true);
    expect(veSoAsProprias("admin")).toBe(false);
    const eng = { userId: "u1", role: "engenheiro" };
    expect(podeTocarMedicao({ createdBy: "u1" }, eng)).toBe(true);
    expect(podeTocarMedicao({ createdBy: null }, eng)).toBe(true);
    expect(podeTocarMedicao({ createdBy: "u2" }, eng)).toBe(false);
    expect(podeTocarMedicao({ createdBy: "u2" }, { userId: "u1", role: "admin" })).toBe(true);
    expect(podeTocarMedicao({ createdBy: "u2" }, { userId: null, role: "engenheiro" })).toBe(false);
  });
  it("rótulo do autor e estados vazios (0.4.5, 0.5.3)", () => {
    expect(rotuloDoAutor({ createdBy: null })).toBe("autor não registrado");
    expect(rotuloDoAutor({ createdBy: "u", autorNome: "Ana", autorEmail: "a@a" })).toBe("Ana");
    expect(rotuloDoAutor({ createdBy: "u", autorNome: null, autorEmail: "a@a" })).toBe("a@a");
    expect(textoDoVazio({ soAsProprias: true, filtrado: false })).toMatch(/sua/);
    expect(textoDoVazio({ soAsProprias: false, filtrado: false })).toMatch(/Nenhuma medição lançada/);
    expect(textoDoVazio({ soAsProprias: false, filtrado: true })).toMatch(/filtros/);
  });
});
