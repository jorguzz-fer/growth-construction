import { describe, it, expect } from "vitest";
import {
  chaveAcessoValida,
  chaveDuplicidade,
  ehTipoDocumento,
  exigeNumero,
  normalizarChaveAcesso,
  pendenteDeDocumento,
  rotuloTipoDocumento,
  validarDocumentoAoPagar,
  validarDocumentoFiscal,
} from "./documento-fiscal";

const CHAVE = "1".repeat(44);

describe("tipos de documento", () => {
  it("reconhece os tipos aceitos e rejeita o resto", () => {
    expect(ehTipoDocumento("NFE")).toBe(true);
    expect(ehTipoDocumento("SEM_DOC")).toBe(true);
    expect(ehTipoDocumento("BOLETO")).toBe(false);
    expect(ehTipoDocumento(null)).toBe(false);
  });

  it('"Sem documento" não exige número; os demais tipos exigem', () => {
    expect(exigeNumero("SEM_DOC")).toBe(false);
    expect(exigeNumero(null)).toBe(false);
    for (const t of ["NFE", "NFSE", "NFCE", "RECIBO", "CUPOM", "CONTRATO"]) {
      expect(exigeNumero(t)).toBe(true);
    }
  });

  it("rotula para a tela", () => {
    expect(rotuloTipoDocumento("NFSE")).toBe("NFS-e");
    expect(rotuloTipoDocumento(null)).toBe("Sem documento");
  });
});

describe("chave de acesso", () => {
  it("44 dígitos é válida", () => {
    expect(chaveAcessoValida(CHAVE)).toBe(true);
  });

  it("vazio é válido — o campo é opcional", () => {
    expect(chaveAcessoValida("")).toBe(true);
    expect(chaveAcessoValida(null)).toBe(true);
    expect(chaveAcessoValida("   ")).toBe(true);
  });

  it("recusa comprimento errado e caracteres não numéricos", () => {
    expect(chaveAcessoValida("1".repeat(43))).toBe(false);
    expect(chaveAcessoValida("1".repeat(45))).toBe(false);
    expect(chaveAcessoValida("A".repeat(44))).toBe(false);
  });

  it("ignora separadores colados da DANFE", () => {
    const comEspacos = CHAVE.match(/.{1,4}/g)!.join(" ");
    expect(chaveAcessoValida(comEspacos)).toBe(true);
    expect(normalizarChaveAcesso(comEspacos)).toBe(CHAVE);
    expect(normalizarChaveAcesso("")).toBeNull();
  });
});

describe("validação no lançamento", () => {
  it("lançar SEM documento é permitido — a nota chega depois (CA-03)", () => {
    expect(validarDocumentoFiscal({})).toBeNull();
    expect(validarDocumentoFiscal({ tipo: "NFE" })).toBeNull();
    expect(validarDocumentoFiscal({ tipo: "SEM_DOC" })).toBeNull();
  });

  it("recusa tipo inválido e chave malformada", () => {
    expect(validarDocumentoFiscal({ tipo: "XPTO" })).toBe("Tipo de documento inválido.");
    expect(validarDocumentoFiscal({ tipo: "NFE", chaveAcesso: "123" })).toBe(
      "A chave de acesso deve ter 44 dígitos.",
    );
  });
});

describe("validação ao marcar como Pago", () => {
  it("exige o número quando o usuário declarou que existe documento", () => {
    const erro = validarDocumentoAoPagar({ tipo: "NFE" });
    expect(erro).toContain("Informe o número do documento");
    expect(erro).toContain("NF-e");
  });

  it('aceita "Sem documento" — RPA e acerto informal são legítimos', () => {
    expect(validarDocumentoAoPagar({ tipo: "SEM_DOC" })).toBeNull();
    expect(validarDocumentoAoPagar({})).toBeNull();
  });

  it("aceita quando o número foi informado", () => {
    expect(validarDocumentoAoPagar({ tipo: "NFE", numero: "12345" })).toBeNull();
  });
});

describe("chave de duplicidade (CA-04)", () => {
  it("mesma nota do mesmo fornecedor gera a mesma chave", () => {
    const a = chaveDuplicidade("forn-1", { tipo: "NFE", serie: "1", numero: "12345" });
    const b = chaveDuplicidade("forn-1", { tipo: "NFE", serie: "1", numero: "12345" });
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it("mesmo número em FORNECEDORES diferentes NÃO colide", () => {
    // Numeração de NF é sequencial por emitente: dois fornecedores podem ter a
    // NF 1234 legitimamente. Por isso é alerta, e por fornecedor.
    const a = chaveDuplicidade("forn-1", { tipo: "NFE", serie: "1", numero: "1234" });
    const b = chaveDuplicidade("forn-2", { tipo: "NFE", serie: "1", numero: "1234" });
    expect(a).not.toBe(b);
  });

  it("séries diferentes do mesmo fornecedor não colidem", () => {
    const a = chaveDuplicidade("forn-1", { tipo: "NFE", serie: "1", numero: "1234" });
    const b = chaveDuplicidade("forn-1", { tipo: "NFE", serie: "2", numero: "1234" });
    expect(a).not.toBe(b);
  });

  it("sem número não há duplicidade a apontar", () => {
    expect(chaveDuplicidade("forn-1", { tipo: "NFE" })).toBeNull();
    expect(chaveDuplicidade("forn-1", { tipo: "SEM_DOC", numero: "123" })).toBeNull();
  });
});

describe("pendência de documento fiscal", () => {
  it("despesa sem nenhum documento está pendente", () => {
    expect(pendenteDeDocumento([])).toBe(true);
  });

  it("documento com número resolve a pendência", () => {
    expect(pendenteDeDocumento([{ tipo: "NFE", numero: "123" }])).toBe(false);
  });

  it('declarar "Sem documento" resolve a pendência — é uma resposta', () => {
    expect(pendenteDeDocumento([{ tipo: "SEM_DOC", numero: null }])).toBe(false);
  });

  it("tipo escolhido mas número ainda em branco continua pendente", () => {
    expect(pendenteDeDocumento([{ tipo: "NFE", numero: null }])).toBe(true);
    expect(pendenteDeDocumento([{ tipo: "NFE", numero: "  " }])).toBe(true);
  });

  it("basta um documento completo entre vários", () => {
    expect(
      pendenteDeDocumento([
        { tipo: "NFE", numero: null },
        { tipo: "RECIBO", numero: "99" },
      ]),
    ).toBe(false);
  });
});
