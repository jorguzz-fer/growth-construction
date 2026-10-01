import { describe, it, expect } from "vitest";
import { defaultPermissions } from "./permissions";
import { abaInicial, abasPermitidas, filtrarMedicoes, filtroAtivo, hrefDaAba, ordenarPorCompetenciaDesc, ABAS } from "./medicao-abas";

describe("Prompt V · abas da Medição de Obra (seção 0)", () => {
  it("0.3 — engenheiro: Nova e Lançadas, nunca o Relatório; contador: só o Relatório; admin: as três", () => {
    expect(abasPermitidas(defaultPermissions("engenheiro")).map((a) => a.id)).toEqual(["nova", "lancadas"]);
    expect(abasPermitidas(defaultPermissions("contador")).map((a) => a.id)).toEqual(["relatorio"]);
    expect(abasPermitidas(defaultPermissions("admin")).map((a) => a.id)).toEqual(["nova", "lancadas", "relatorio"]);
  });
  it("17b/17c — a rota de origem define a aba inicial; aba sem permissão nunca é devolvida", () => {
    const eng = defaultPermissions("engenheiro");
    const adm = defaultPermissions("admin");
    const con = defaultPermissions("contador");
    expect(abaInicial("/medicao", adm, null)).toBe("relatorio");
    expect(abaInicial("/medicao", eng, null)).toBeNull();
    expect(abaInicial("/medicao", eng, "nova")).toBeNull();
    expect(abaInicial("/medicaolanc", adm, null)).toBe("nova");
    expect(abaInicial("/medicaolanc", adm, "lancadas")).toBe("lancadas");
    expect(abaInicial("/medicaolanc", eng, "relatorio")).toBe("nova");
    expect(abaInicial("/medicaolanc", con, null)).toBeNull();
    // quem vê mas não cria cai em Lançadas
    const soVer = { ...adm, medicaolanc: { ver: true, criar: false, editar: false, excluir: false } };
    expect(abaInicial("/medicaolanc", soVer, null)).toBe("lancadas");
  });
  it("href das abas preserva o projeto", () => {
    expect(hrefDaAba(ABAS[0], "p1")).toBe("/medicaolanc?aba=nova&project=p1");
    expect(hrefDaAba(ABAS[2], "p1")).toBe("/medicao?project=p1");
  });
  it("0.4.1/0.4.2 — ordem por competência decrescente e filtros", () => {
    const rows = [
      { id: "a", competencia: "09/2026", grupoCode: "2", createdBy: "u1" },
      { id: "b", competencia: "10/2026", grupoCode: "1", createdBy: null },
      { id: "c", competencia: "09/2026", grupoCode: "10", createdBy: "u2" },
      { id: "d", competencia: "09/2026", grupoCode: "1", createdBy: "u2" },
    ];
    expect(ordenarPorCompetenciaDesc(rows).map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
    expect(filtrarMedicoes(rows, { competencia: "09/2026" }).map((r) => r.id)).toEqual(["a", "c", "d"]);
    expect(filtrarMedicoes(rows, { grupo: "1" }).map((r) => r.id)).toEqual(["b", "d"]);
    expect(filtrarMedicoes(rows, { autor: "u2" }).map((r) => r.id)).toEqual(["c", "d"]);
    expect(filtrarMedicoes(rows, { autor: "sem" }).map((r) => r.id)).toEqual(["b"]);
    expect(filtrarMedicoes(rows, {})).toHaveLength(4);
    expect(filtroAtivo({})).toBe(false);
    expect(filtroAtivo({ grupo: "1" })).toBe(true);
  });
});
