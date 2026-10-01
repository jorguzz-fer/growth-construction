import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { analisarEmpresa, conferirPreenchido, oQueFaltaParaEmitir, ONDE_ENCONTRAR } from "./empresa-analise";
import { checarProntidaoFiscal } from "./calc/emitente-fiscal";

describe("Prompt AH · assistente da Empresa (Parte 6, somente leitura)", () => {
  it("o que falta para emitir: só bloqueios, em ordem de esforço, com o que destrava e onde buscar", () => {
    const passos = oQueFaltaParaEmitir(checarProntidaoFiscal({}).filter((p) => p.severidade === "bloqueio"));
    expect(passos.length).toBeGreaterThan(5);
    const esforcos = passos.map((p) => p.esforco);
    expect([...esforcos].sort()).toEqual(esforcos);
    expect(passos[0].esforco).toBe(1);
    expect(passos.find((p) => p.campo === "inscricaoMunicipal")).toMatchObject({ esforco: 3, onde: expect.stringMatching(/prefeitura/) });
  });
  it("18 — nunca sugere valor: nenhum texto de fonte traz CNPJ, código IBGE, CNAE, item ou alíquota", () => {
    for (const o of Object.values(ONDE_ENCONTRAR)) expect(o.onde).not.toMatch(/\d{7}|\d{2}\.\d{3}|4120|7\.0\d|\d+%/);
  });
  it("conferir: município sem IBGE, alíquota < 2% fora do Simples, CNAE × item", () => {
    expect(conferirPreenchido({ municipio: "Itu", codigoMunicipio: null }).map((d) => d.campo)).toEqual(["municipio"]);
    expect(conferirPreenchido({ aliquotaIss: 1, regimeTributario: "LUCRO_REAL" }).map((d) => d.campo)).toEqual(["aliquotaIss"]);
    expect(conferirPreenchido({ aliquotaIss: 1, regimeTributario: "SIMPLES" })).toEqual([]);
    expect(conferirPreenchido({ cnae: "6201501", itemListaServico: "7.02" }).map((d) => d.campo)).toEqual(["cnae"]);
    expect(conferirPreenchido({ cnae: "4120400", itemListaServico: "1.01" }).map((d) => d.campo)).toEqual(["itemListaServico"]);
    expect(conferirPreenchido({ cnae: "4120400", itemListaServico: "7.02" })).toEqual([]);
  });
  it("6.2 — sem pendência ≠ correto; histórico passa adiante só nomes de campos", () => {
    const a = analisarEmpresa({}, [{ quando: new Date(), quem: "x@y", acao: "tenant.fiscal", campos: ["cep"] }]);
    expect(a.semPendenciaAberta).toBe(false);
    expect(a.historico[0].campos).toEqual(["cep"]);
    expect(a.avisos.map((p) => p.campo)).toEqual(expect.arrayContaining(["codigoTributarioMunicipio", "municipio"]));
  });
  it("19/20/21 — o painel não importa action nem lê variável de ambiente; o módulo de análise também não", () => {
    const painel = readFileSync("src/components/app/assistente-empresa.tsx", "utf8");
    const analise = readFileSync("src/lib/empresa-analise.ts", "utf8");
    for (const src of [painel, analise]) {
      expect(src).not.toMatch(/@\/lib\/actions\//);
      expect(src).not.toMatch(/process\.env|FOCUS_NFE_TOKEN/);
    }
    expect(painel).not.toMatch(/<input|<Input|onChange=/);
  });
});
