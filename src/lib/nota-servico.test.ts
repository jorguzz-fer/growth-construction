import { describe, it, expect } from "vitest";
import type { EmitenteFiscal } from "@/lib/calc/emitente-fiscal";
import {
  conferirAntesDoEnvio,
  dadosDaEmissao,
  entradaDaNota,
  nomeDoArquivoDaNota,
  numeroBR,
  podeCancelar,
  podeEditar,
  podeEnviar,
  recusaDoTenant,
  refDaTentativa,
  situacaoDoRetorno,
  transicaoPermitida,
  type NotaParaEmissao,
} from "./nota-servico";

const emitente: EmitenteFiscal = {
  razaoSocial: "Construtora X",
  cnpj: "11222333000181",
  inscricaoMunicipal: "123",
  regimeTributario: "LUCRO_PRESUMIDO",
  itemListaServico: "7.02",
  codigoTributarioMunicipio: "1",
  cnae: "4120400",
  aliquotaIss: 3,
  logradouro: "Rua A",
  numero: "1",
  bairro: "Centro",
  codigoMunicipio: "3550308",
  municipio: "São Paulo",
  uf: "SP",
  cep: "01001000",
  email: "a@b.c",
};
const ID = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
const nota = (o: Partial<NotaParaEmissao> = {}): NotaParaEmissao => ({
  id: ID,
  discriminacao: "Administração de obra",
  competencia: "10/2026",
  itemListaServico: null,
  codigoTributarioMunicipio: null,
  valorServicos: "10000.00",
  valorDeducoes: "0",
  descontoIncondicionado: "0",
  descontoCondicionado: "0",
  aliquotaIss: "3.0000",
  issRetido: false,
  retencoes: null,
  outrasRetencoes: "0",
  tomadorCpfCnpj: "11222333000181",
  tomadorNome: "Tomador Teste",
  tomadorInscricaoMunicipal: null,
  tomadorEmail: null,
  tomadorTelefone: null,
  tomadorLogradouro: null,
  tomadorNumero: null,
  tomadorComplemento: null,
  tomadorBairro: null,
  tomadorCodigoMunicipio: null,
  tomadorUf: null,
  tomadorCep: null,
  ...o,
});
const AGORA = "2026-10-26T10:00:00-03:00";

describe("Prompt AG — ciclo de vida (seção 2)", () => {
  it("rascunho e rejeitada editam e enviam; o resto não", () => {
    for (const s of ["rascunho", "rejeitada"]) expect([podeEditar(s), podeEnviar(s)]).toEqual([true, true]);
    for (const s of ["processando", "autorizada", "cancelada"]) expect([podeEditar(s), podeEnviar(s)]).toEqual([false, false]);
  });
  it("só autorizada cancela", () => {
    expect(["rascunho", "processando", "autorizada", "rejeitada", "cancelada"].filter(podeCancelar)).toEqual(["autorizada"]);
  });
  it("nenhuma situação volta (2.4)", () => {
    expect(transicaoPermitida("autorizada", "rascunho" as never)).toBe(false);
    expect(transicaoPermitida("autorizada", "processando")).toBe(false);
    expect(transicaoPermitida("cancelada", "autorizada")).toBe(false);
    expect(transicaoPermitida("processando", "autorizada")).toBe(true);
    expect(transicaoPermitida("rejeitada", "processando")).toBe(true);
    expect(transicaoPermitida("autorizada", "cancelada")).toBe(true);
  });
  it("tradução do retorno do provedor; 'não encontrada' não muda nada", () => {
    expect(situacaoDoRetorno("autorizado")).toBe("autorizada");
    expect(situacaoDoRetorno("erro")).toBe("rejeitada");
    expect(situacaoDoRetorno("processando")).toBe("processando");
    expect(situacaoDoRetorno("cancelado")).toBe("cancelada");
    expect(situacaoDoRetorno("nao_encontrada")).toBeNull();
  });
});

describe("Prompt AG — idempotência (seção 3)", () => {
  it("a ref é estável por tentativa e muda a cada nova tentativa", () => {
    expect(refDaTentativa(ID, 1)).toBe("1b4e28ba2fa111d2883f0016d3cca427t1");
    expect(refDaTentativa(ID, 1)).toBe(refDaTentativa(ID, 1));
    expect(refDaTentativa(ID, 2)).not.toBe(refDaTentativa(ID, 1));
    expect(refDaTentativa(ID, 2)).toMatch(/^[A-Za-z0-9]{1,50}$/);
  });
});

describe("Prompt AG — um CNPJ só (BAG-3)", () => {
  it("sem NFSE_TENANT_ID ninguém emite; com ele, só aquele tenant", () => {
    expect(recusaDoTenant("t1", undefined)).toContain("não foi habilitada");
    expect(recusaDoTenant("t1", "  ")).toContain("não foi habilitada");
    expect(recusaDoTenant("t1", "t2")).toContain("outra empresa");
    expect(recusaDoTenant("t1", "t1")).toBeNull();
  });
});

describe("Prompt AG — homologação marcada (BAG-4)", () => {
  it("o nome do arquivo leva a marca em homologação; em produção, não", () => {
    expect(nomeDoArquivoDaNota({ ambiente: "homologacao", numero: "15", id: ID }, "pdf")).toBe("HOMOLOGACAO-SEM-VALOR-FISCAL-NFSe-15.pdf");
    expect(nomeDoArquivoDaNota({ ambiente: "producao", numero: "15", id: ID }, "xml")).toBe("NFSe-15.xml");
    expect(nomeDoArquivoDaNota({ ambiente: "homologacao", numero: null, id: ID }, "pdf")).toBe("HOMOLOGACAO-SEM-VALOR-FISCAL-NFSe-1b4e28ba.pdf");
  });
});

describe("Prompt AG — da nota para o cálculo e o payload", () => {
  it("retenção só entra se informada (nenhuma presumida)", () => {
    expect(entradaDaNota(nota()).retencoes).toEqual({});
    expect(entradaDaNota(nota({ retencoes: { inss: { aliquota: 11, base: 4000 }, pis: { aliquota: 0 } } })).retencoes).toEqual({ inss: { aliquota: 11, base: 4000 } });
  });
  it("o tomador sai da NOTA, como CNPJ ou CPF pelo tamanho", () => {
    expect(dadosDaEmissao(nota(), emitente, null, AGORA).tomador).toMatchObject({ cnpj: "11222333000181", cpf: null, razaoSocial: "Tomador Teste", endereco: null });
    expect(dadosDaEmissao(nota({ tomadorCpfCnpj: "529.982.247-25" }), emitente, null, AGORA).tomador).toMatchObject({ cpf: "52998224725", cnpj: null });
  });
  it("nota completa: monta o payload com o município da obra e o valor líquido", () => {
    const m = conferirAntesDoEnvio(nota({ issRetido: true }), emitente, { codigoMunicipio: "3509502" }, AGORA);
    expect(m.erros).toEqual([]);
    expect(m.payload?.natureza_operacao).toBe("2"); // obra fora da sede
    expect(m.calculo).toMatchObject({ valorIss: 300, valorIssRetido: 300, valorLiquido: 9700 });
  });
  it("4.3 — recusa antes de sair, com todos os motivos de uma vez", () => {
    const m = conferirAntesDoEnvio(
      nota({ valorServicos: "0", tomadorCpfCnpj: "111.111.111-11", tomadorNome: "", tomadorCodigoMunicipio: "355030", tomadorUf: "XX", tomadorCep: "123", tomadorLogradouro: "Rua", competencia: "13/2026", discriminacao: "" }),
      emitente,
      null,
      AGORA,
    );
    expect(m.payload).toBeUndefined();
    expect(m.erros).toEqual(
      expect.arrayContaining([
        "O valor dos serviços deve ser maior que zero.",
        "Informe a discriminação do serviço.",
        "CPF do tomador inválido.",
        "Informe o nome ou a razão social do tomador.",
        "Código IBGE do município do tomador inválido (7 dígitos).",
        "UF do tomador inválida.",
        "CEP do tomador inválido.",
        "Competência no formato MM/AAAA.",
      ]),
    );
  });
  it("emitente incompleto barra o envio", () => {
    expect(conferirAntesDoEnvio(nota(), { ...emitente, inscricaoMunicipal: "" }, null, AGORA).erros.join(" ")).toContain("Config › Empresa");
  });
});

describe("números do formulário", () => {
  it("vírgula decimal, ponto de milhar e %", () => {
    expect(numeroBR("10.000,50")).toBe(10000.5);
    expect(numeroBR("3,5%")).toBe(3.5);
    expect(numeroBR("R$ 1.200")).toBe(1200);
    expect(numeroBR("1200.75")).toBe(1200.75);
    expect(numeroBR("")).toBe(0);
  });
});
