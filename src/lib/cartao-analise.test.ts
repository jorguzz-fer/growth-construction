import { describe, expect, it } from "vitest";
import { analisarCartoes, comprasSemObra, limitesDosCartoes, projecoesDosCartoes } from "./cartao-analise";

const HOJE = "2026-09-30"; // ciclo aberto: fecha 10/10, vence 10/20
const cartao = { id: "C1", apelido: "Itaú", ultimos4: "1234", limite: 10000, diaFechamento: 10, diaVencimento: 20, taxaRotativo: 10, ativo: true };
const fat = (id: string, fechamento: string, over: Partial<{ valorCompras: number; valorPago: number; valorNovas: number; valorParceladas: number; creditos: number }> = {}) => ({
  id, cartaoId: "C1", cartaoNome: "Itaú •••• 1234", fechamento, vencimento: fechamento.replace("/10/", "/20/"), valorCompras: 0, valorPago: 0, qtdCompras: 1, valorNovas: 0, valorParceladas: 0, creditos: 0, ...over,
});

describe("assistente de Cartões (Prompt U, 7) — puro, somente leitura", () => {
  const faturas = [
    fat("F8", "08/10/2026", { valorCompras: 1200, valorPago: 700 }), // parcial → rotativo 500 para setembro
    fat("F9", "09/10/2026", { valorCompras: 0 }), // fechada, traz 500 e não pagou → não rola
    fat("F10", "10/10/2026", { valorCompras: 900, valorNovas: 600, valorParceladas: 300 }), // ciclo aberto
    fat("F11", "11/10/2026", { valorCompras: 300, valorParceladas: 300 }), // ainda cai
  ];
  it("projeção do ciclo: o que já caiu, o que ainda cai, total esperado; juro só estimativa", () => {
    const [p] = projecoesDosCartoes([cartao], faturas, HOJE);
    expect(p.fechamento).toBe("10/10/2026");
    expect(p.projecao).toMatchObject({ comprasDoCiclo: 600, parcelasAnteriores: 300, rotativoAnterior: 0, totalPrevisto: 900, juroEstimado: 0 });
    expect(p.aindaCai).toBe(300);
    expect(p.totalEsperado).toBe(1200);
    expect(projecoesDosCartoes([{ ...cartao, taxaRotativo: null }], faturas, HOJE)[0].projecao.juroEstimado).toBeNull();
  });
  it("limite: comprometido = em aberto até o ciclo (inclusive faturas fechadas sem pagar) + parcelas futuras", () => {
    const [l] = limitesDosCartoes([cartao], faturas, HOJE);
    // agosto (parcial) não conta pelo próprio saldo: os 500 moram em setembro como rotativo; outubro 900; futuras 300
    expect(l.cicloAberto).toBe(1400);
    expect(l.parcelasFuturas).toBe(300);
    expect(l.comprometido).toBe(1700);
    expect(l.disponivel).toBe(8300);
    expect(l.pct).toBe(17);
  });
  it("compras sem obra e análise completa", () => {
    const compras = [
      { despesaId: "D1", numDoc: "PED-1", descricao: "x", projectId: null, projectName: null, fornecedorNome: null, valor: 100, numero: 1, total: 3, faturaFechamento: "10/10/2026", cartaoId: "C1" },
      { despesaId: "D1", numDoc: "PED-1", descricao: "x", projectId: null, projectName: null, fornecedorNome: null, valor: 100, numero: 2, total: 3, faturaFechamento: "11/10/2026", cartaoId: "C1" },
      { despesaId: "D2", numDoc: "PED-2", descricao: "y", projectId: "P", projectName: "Obra", fornecedorNome: null, valor: 50, numero: 1, total: 1, faturaFechamento: "10/10/2026", cartaoId: "C1" },
    ];
    expect(comprasSemObra(compras, [cartao])).toEqual([{ despesaId: "D1", numDoc: "PED-1", descricao: "x", valor: 300, cartao: "Itaú •••• 1234" }]);
    const a = analisarCartoes([cartao], faturas, compras, { cartao: "Itaú", resultado: { casados: [], semLancamento: [{ id: "i", data: null, descricao: null, valor: 120 }], semExtrato: [], divergentes: [], creditos: [{ item: { id: "c", data: null, descricao: null, valor: -5 }, estorno: null, vinculado: false }], faturasCobertas: [] } }, HOJE);
    expect(a.extrato).toEqual({ cartao: "Itaú", semLancamento: 1, semExtrato: 0, divergentes: 0, creditosSemEstorno: 1, valorSemLancamento: 120 });
    expect(a.totalCartoes).toBe(1);
    expect(JSON.stringify(a)).not.toMatch(/\d{16}/);
  });
});
