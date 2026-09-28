import { describe, it, expect } from "vitest";
import {
  CAMPOS_PROTEGIDOS,
  MARCA_PROTEGIDO,
  campoProtegido,
  ehAlteracaoProtegida,
  mascararMeta,
  metaVisivel,
  podeVerDadoProtegido,
} from "./audit-mask";

/**
 * O formato real que `cliente.update` grava hoje (loop sobre `readCliente`,
 * src/lib/actions/clientes.ts). Valores sintéticos.
 *
 * Os valores sensíveis são sentinelas (`SENS-…`) de propósito: a verificação
 * "nenhum valor sensível sobra" procura por substring, e um número comum como
 * "8000" colidiria com qualquer telefone — falso negativo num teste que existe
 * para provar ausência de vazamento.
 */
const META_CLIENTE_UPDATE = {
  changes: {
    nomeCompleto: { de: "Fulano", para: "Fulano de Tal" },
    cpfCnpj: { de: "SENS-CPF-ANTES", para: "SENS-CPF-DEPOIS" },
    rendaBruta: { de: "SENS-RENDA-ANTES", para: "SENS-RENDA-DEPOIS" },
    scoreCredito: { de: "SENS-SCORE-ANTES", para: "SENS-SCORE-DEPOIS" },
    restricoes: { de: null, para: "SENS-RESTRICAO" },
    celular: { de: "11999990000", para: "11988880000" },
  },
};

describe("campoProtegido", () => {
  it("reconhece os oito campos aprovados", () => {
    for (const c of CAMPOS_PROTEGIDOS) expect(campoProtegido(c)).toBe(true);
    expect(CAMPOS_PROTEGIDOS).toHaveLength(8);
  });

  it("não depende da grafia: camelCase, snake_case e maiúsculas", () => {
    expect(campoProtegido("cpf_cnpj")).toBe(true);
    expect(campoProtegido("CPF-CNPJ")).toBe(true);
    expect(campoProtegido("renda_bruta")).toBe(true);
    expect(campoProtegido("SALDOFGTS")).toBe(true);
  });

  it("não protege o que não está na lista", () => {
    expect(campoProtegido("nomeCompleto")).toBe(false);
    expect(campoProtegido("celular")).toBe(false);
    expect(campoProtegido("valor")).toBe(false);
  });
});

describe("podeVerDadoProtegido", () => {
  it("owner e admin veem; contador, membro e engenheiro não", () => {
    expect(podeVerDadoProtegido("owner")).toBe(true);
    expect(podeVerDadoProtegido("admin")).toBe(true);
    expect(podeVerDadoProtegido("contador")).toBe(false);
    expect(podeVerDadoProtegido("membro")).toBe(false);
    expect(podeVerDadoProtegido("engenheiro")).toBe(false);
  });
});

describe("mascararMeta — o caso real de cliente.update", () => {
  const m = mascararMeta(META_CLIENTE_UPDATE) as typeof META_CLIENTE_UPDATE;

  it("troca de → para por 'alterado' nos campos protegidos", () => {
    for (const c of ["cpfCnpj", "rendaBruta", "scoreCredito", "restricoes"] as const) {
      expect(ehAlteracaoProtegida(m.changes[c])).toBe(true);
      expect(m.changes[c].de).toBe(MARCA_PROTEGIDO);
      expect(m.changes[c].para).toBe(MARCA_PROTEGIDO);
    }
  });

  it("nenhum valor sensível sobra em lugar nenhum da cópia", () => {
    expect(JSON.stringify(m)).not.toContain("SENS-");
  });

  it("o resto do log continua integral", () => {
    expect(m.changes.nomeCompleto).toEqual({ de: "Fulano", para: "Fulano de Tal" });
    expect(m.changes.celular).toEqual({ de: "11999990000", para: "11988880000" });
  });
});

describe("mascararMeta — formatos que o log não controla", () => {
  it("mascara campo protegido fora de `changes` (caminho do JSON.stringify)", () => {
    const m = mascararMeta({ nome: "Fulano", cpfCnpj: "SENS-CPF" }) as Record<string, unknown>;
    expect(m.cpfCnpj).toBe(MARCA_PROTEGIDO);
    expect(m.nome).toBe("Fulano");
  });

  it("varre em profundidade e dentro de listas", () => {
    const m = mascararMeta({
      lote: [{ id: 1, renda_liquida: "SENS-A" }, { id: 2, renda_liquida: "SENS-B" }],
      nivel: { mais: { fundo: { saldoFgts: "SENS-C" } } },
    });
    const texto = JSON.stringify(m);
    expect(texto).not.toContain("SENS-");
    expect(texto).toContain('"id":1');
  });

  it("aceita meta nulo e primitivo sem quebrar", () => {
    expect(mascararMeta(null)).toBeNull();
    expect(mascararMeta(undefined)).toBeUndefined();
    expect(mascararMeta("texto")).toBe("texto");
    expect(mascararMeta(42)).toBe(42);
  });

  it("nunca altera o objeto recebido — o dado do banco segue intacto (regra 3.4)", () => {
    const original = structuredClone(META_CLIENTE_UPDATE);
    mascararMeta(META_CLIENTE_UPDATE);
    expect(META_CLIENTE_UPDATE).toEqual(original);
  });
});

describe("metaVisivel", () => {
  it("owner e admin recebem o meta sem mudança", () => {
    expect(metaVisivel(META_CLIENTE_UPDATE, "owner")).toBe(META_CLIENTE_UPDATE);
    expect(metaVisivel(META_CLIENTE_UPDATE, "admin")).toBe(META_CLIENTE_UPDATE);
  });

  it("o contador recebe a cópia mascarada", () => {
    const texto = JSON.stringify(metaVisivel(META_CLIENTE_UPDATE, "contador"));
    expect(texto).not.toContain("SENS-");
    expect(texto).toContain("Fulano de Tal");
  });
});
