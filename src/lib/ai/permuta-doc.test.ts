import { describe, it, expect } from "vitest";
import { casarCliente, casarTipo, casarUnidade, montarPropostaDeAtivo, type DadosAtivoLidos } from "./permuta-doc";
import { brl } from "@/lib/utils";

const opcoes = {
  unidades: ["101", "102", "Casa 12", "A-1"],
  clientes: [
    { id: "c1", nome: "Maria da Silva Souza" },
    { id: "c2", nome: "João Pedro Lima" },
    { id: "c3", nome: "Maria Aparecida" },
  ],
  tipos: ["Imóvel", "Veículo", "Materiais", "Serviços", "Equipamentos", "Máquinas"],
};
const lido = (o: Partial<DadosAtivoLidos> = {}): DadosAtivoLidos => ({ unitCode: "", cliente: "", dataRecebimento: "", tipo: "", descricao: "", estimado: null, baixaConfianca: [], observacoes: [], ...o });

describe("proposta de ativo de permuta a partir do texto (Prompt P, 7.3) — regra pura", () => {
  it("casa unidade, cliente e tipo com o que a tela oferece; o resto fica com alerta", () => {
    expect(casarUnidade("casa 12", opcoes.unidades)).toBe("Casa 12");
    expect(casarUnidade("apto 101", opcoes.unidades)).toBe("101");
    expect(casarUnidade("a1", opcoes.unidades)).toBe("A-1");
    expect(casarUnidade("999", opcoes.unidades)).toBeNull();
    expect(casarCliente("maria souza", opcoes.clientes)).toEqual({ id: "c1", nome: "Maria da Silva Souza" });
    expect(casarCliente("Maria", opcoes.clientes)).toBeNull(); // duas Marias: não adivinha
    expect(casarCliente("joão pedro lima", opcoes.clientes)?.id).toBe("c2");
    expect(casarTipo("um carro", opcoes.tipos)).toBe("Veículo");
    expect(casarTipo("apartamento", opcoes.tipos)).toBe("Imóvel");
    expect(casarTipo("Máquinas", opcoes.tipos)).toBe("Máquinas");
    expect(casarTipo("ações", opcoes.tipos)).toBeNull();
    expect(casarTipo("aço para laje", opcoes.tipos)).toBe("Materiais");
  });

  it("'recebi um carro de 50 mil da maria souza pela casa 12 em 15/09': preenche tudo, nada falta", () => {
    const p = montarPropostaDeAtivo(lido({ unitCode: "casa 12", cliente: "maria souza", dataRecebimento: "2026-09-15", tipo: "carro", descricao: "Corolla 2020", estimado: 50000 }), opcoes);
    expect(p.valores).toEqual({ unitCode: "Casa 12", clienteId: "c1", clienteNome: "Maria da Silva Souza", dataRecebimento: "09/15/2026", tipo: "Veículo", descricao: "Corolla 2020", estimado: "50000" });
    expect(p.alertas).toEqual({});
    expect(p.preenchidos).toEqual(["Unidade de origem", "Cliente", "Data de recebimento", "Tipo do bem", "Descrição", "Valor estimado"]);
    expect(p.resumo).toBe(`Ativo recebido em permuta: Veículo, "Corolla 2020", avaliado em ${brl(50000)}, da unidade Casa 12, entregue por Maria da Silva Souza. Entra no inventário pelo valor estimado; não é receita.`);
    expect(p.resumo).toMatch(/não é receita/);
  });

  it("o que a descrição não diz fica 'faltando'; o que não casa com a tela fica 'conferir'; baixa confiança marca o campo", () => {
    const p = montarPropostaDeAtivo(lido({ unitCode: "casa 99", cliente: "Fulano de Tal", tipo: "ações", estimado: 0, baixaConfianca: ["estimado"] }), opcoes);
    expect(p.valores).toMatchObject({ unitCode: "", clienteId: "", clienteNome: "Fulano de Tal", tipo: "", estimado: "" });
    expect(p.alertas.unitCode).toMatchObject({ nivel: "conferir" });
    expect(p.alertas.cliente).toMatchObject({ nivel: "conferir", motivo: expect.stringMatching(/não está no cadastro/) });
    expect(p.alertas.dataRecebimento).toMatchObject({ nivel: "faltando" });
    expect(p.alertas.tipo).toMatchObject({ nivel: "conferir" });
    expect(p.alertas.estimado).toMatchObject({ nivel: "faltando" });
    expect(p.preenchidos).toEqual([]);
    const q = montarPropostaDeAtivo(lido({ unitCode: "101", cliente: "joão pedro lima", dataRecebimento: "2026-09-15", tipo: "Imóvel", estimado: 80000, baixaConfianca: ["estimado"] }), opcoes);
    expect(q.alertas).toEqual({ estimado: { nivel: "conferir", motivo: expect.stringMatching(/pouca certeza/) } });
  });
});
