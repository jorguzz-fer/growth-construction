import { describe, it, expect } from "vitest";
import { ativosParados, cadastroIncompleto, duplicidadeComPlano, vendaAbaixoDaEntrada, type AtivoParaAnalise } from "./permuta-analise";
import type { LinhaDoInventario } from "./permuta-inventario";

const linha = (p: Partial<LinhaDoInventario> & { id: string }): LinhaDoInventario => ({ tipo: "Imóvel", descricao: null, unitCode: "A-1", clienteNome: "x", dataRecebimento: "01/01/2026", estimado: 1000, diasEmEstoque: 10, noEstoque: false, ...p });
const ativo = (p: Partial<AtivoParaAnalise> & { id: string }): AtivoParaAnalise => ({ unitCode: "A-1", clienteNome: "Maria", tipo: "Imóvel", descricao: null, estimado: 80000, status: "Disponivel", dataVenda: null, valorVenda: 0, cancelado: false, ...p });

describe("Assistente de Permuta — análises puras (Prompt P, 7.5)", () => {
  it("ativos parados: acima de 1,5× a mediana do tipo (com 2+ no tipo) ou acima de 180 dias; sem data não entra", () => {
    const r = ativosParados([
      linha({ id: "a", diasEmEstoque: 10 }),
      linha({ id: "b", diasEmEstoque: 20 }),
      linha({ id: "c", diasEmEstoque: 40 }), // mediana Imóvel = 20 → 40 > 30
      linha({ id: "v", tipo: "Veículo", diasEmEstoque: 200 }), // sozinho no tipo, mas > 180
      linha({ id: "m", tipo: "Materiais", diasEmEstoque: 100 }), // sozinho e < 180
      linha({ id: "s", diasEmEstoque: null }),
    ]);
    expect(r.map((x) => [x.id, x.normalDoTipo])).toEqual([
      ["v", 200],
      ["c", 20],
    ]);
  });

  it("cadastro incompleto: sem estimado, sem unidade, sem cliente, vendido sem data ou valor; cancelado não entra", () => {
    const r = cadastroIncompleto([
      ativo({ id: "ok" }),
      ativo({ id: "a", estimado: 0, unitCode: "", clienteNome: null }),
      ativo({ id: "b", status: "Vendido" }),
      ativo({ id: "c", status: "Vendido", dataVenda: "10/01/2026", valorVenda: 1 }),
      ativo({ id: "canc", estimado: 0, cancelado: true }),
    ]);
    expect(r.map((x) => [x.id, x.faltas])).toEqual([
      ["a", ["sem_estimado", "sem_unidade", "sem_cliente"]],
      ["b", ["vendido_sem_data", "vendido_sem_valor"]],
    ]);
  });

  it("venda abaixo da entrada: só vendidos com valor menor que o estimado, com o resultado, da maior perda para a menor", () => {
    const r = vendaAbaixoDaEntrada([
      ativo({ id: "ganho", status: "Vendido", dataVenda: "10/01/2026", valorVenda: 82000 }),
      ativo({ id: "perda1", status: "Vendido", dataVenda: "10/01/2026", valorVenda: 70000 }),
      ativo({ id: "perda2", status: "Vendido", dataVenda: "10/01/2026", valorVenda: 79000 }),
      ativo({ id: "canc", status: "Vendido", valorVenda: 1, cancelado: true }),
      ativo({ id: "disp", valorVenda: 1 }),
    ]);
    expect(r.map((x) => [x.id, x.resultado])).toEqual([
      ["perda1", -10000],
      ["perda2", -1000],
    ]);
  });

  it("duplicidade com o plano: unidade com 'Permuta' no plano E ativo nesta tela, com os dois valores lado a lado", () => {
    const r = duplicidadeComPlano(
      [ativo({ id: "x", unitCode: "A-1", estimado: 80000 }), ativo({ id: "y", unitCode: "a-1", estimado: 5000 }), ativo({ id: "z", unitCode: "B-2" }), ativo({ id: "c", unitCode: "C-3", cancelado: true })],
      [
        { code: "A-1", permutaNoPlano: 90000 },
        { code: "B-2", permutaNoPlano: 0 },
        { code: "C-3", permutaNoPlano: 1000 },
        { code: "D-4", permutaNoPlano: 500 },
      ],
    );
    expect(r).toEqual([{ unitCode: "A-1", permutaNoPlano: 90000, ativos: [{ id: "x", rotulo: "Un. A-1 · Imóvel", estimado: 80000 }, { id: "y", rotulo: "Un. a-1 · Imóvel", estimado: 5000 }], somaDosAtivos: 85000 }]);
  });
});
