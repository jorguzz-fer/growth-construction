import { describe, it, expect } from "vitest";
import { montarContaCorrente, rotuloDoMovimento, type FontesContaCorrente } from "./conta-corrente";

const vazio: FontesContaCorrente = { obrigacoes: [], restituicoes: [], recebimentos: [], repasses: [], compensacoes: [] };
const socio = { pagadorId: "s1", pagador: "Sócio" };

describe("conta corrente de terceiros — uma lógica só (Prompt I, §26)", () => {
  it("desembolso, restituição e compensação batem com valorTotal − valorRestituido", () => {
    const cc = montarContaCorrente({
      ...vazio,
      obrigacoes: [
        { id: "o1", ...socio, valorTotal: 100, data: "01/10/2026", numDoc: "P1", cancelada: false },
        { id: "o2", ...socio, valorTotal: 50, data: "02/10/2026", numDoc: "P2", cancelada: false },
      ],
      restituicoes: [{ id: "r1", despesaTerceiroId: "o1", valor: 30, data: "03/10/2026", cancelada: false, canceladaEm: null, conciliada: false }],
      recebimentos: [{ id: "c1", recebedorId: "s1", recebedor: "Sócio", valorTotal: 80, data: "01/15/2026", cancelado: false }],
      repasses: [{ id: "p1", recebimentoId: "c1", valor: 20, data: "02/15/2026" }],
      compensacoes: [{ id: "k1", terceiroId: "s1", valor: 40, data: "04/10/2026", numDoc: "K1" }],
    });
    expect(cc).toHaveLength(1);
    const c = cc[0];
    // a restituir: 150 − 30 − 40 = 80 (o mesmo que valorRestituido = 30 + 40 nas obrigações)
    expect(c.saldoDevido).toBe(80);
    // a repassar: 80 − 20 − 40 = 20
    expect(c.saldoARepassar).toBe(20);
    expect(c.totalCompensado).toBe(40);
    expect(c.movimentos.map((m) => m.tipo)).toEqual(["desembolso", "recebimento", "desembolso", "repasse", "restituicao", "compensacao"]);
    const ultimo = c.movimentos[c.movimentos.length - 1];
    expect(ultimo.saldoAcumulado).toBe(80);
    expect(ultimo.saldoRepassarAcumulado).toBe(20);
  });

  it("restituição cancelada aparece como par (saída e estorno) com efeito líquido zero", () => {
    const c = montarContaCorrente({
      ...vazio,
      obrigacoes: [{ id: "o1", ...socio, valorTotal: 100, data: "01/10/2026", numDoc: "P1", cancelada: false }],
      restituicoes: [{ id: "r1", despesaTerceiroId: "o1", valor: 100, data: "02/10/2026", cancelada: true, canceladaEm: "02/20/2026", conciliada: false }],
    })[0];
    expect(c.totalRestituido).toBe(0);
    expect(c.saldoDevido).toBe(100);
    expect(c.movimentos.map((m) => [m.tipo, m.saldoAcumulado])).toEqual([
      ["desembolso", 100],
      ["restituicao", 0],
      ["estorno", 100],
    ]);
  });

  it("obrigação cancelada, recebimento cancelado e compensação sem terceiro ficam de fora", () => {
    const cc = montarContaCorrente({
      ...vazio,
      obrigacoes: [{ id: "o1", ...socio, valorTotal: 100, data: null, numDoc: null, cancelada: true }],
      restituicoes: [{ id: "r1", despesaTerceiroId: "o1", valor: 10, data: null, cancelada: false, canceladaEm: null, conciliada: false }],
      recebimentos: [{ id: "c1", recebedorId: "s1", recebedor: "Sócio", valorTotal: 80, data: null, cancelado: true }],
      compensacoes: [{ id: "k1", terceiroId: "zz", valor: 40, data: null, numDoc: null }],
    });
    expect(cc).toHaveLength(0);
  });

  it("ordena por data; sem data vai para o fim; centavos exatos", () => {
    const c = montarContaCorrente({
      ...vazio,
      obrigacoes: [
        { id: "o1", ...socio, valorTotal: 0.1, data: null, numDoc: null, cancelada: false },
        { id: "o2", ...socio, valorTotal: 0.2, data: "12/31/2025", numDoc: null, cancelada: false },
        { id: "o3", ...socio, valorTotal: 0.3, data: "01/01/2026", numDoc: null, cancelada: false },
      ],
    })[0];
    expect(c.movimentos.map((m) => m.id)).toEqual(["o2", "o3", "o1"]);
    expect(c.saldoDevido).toBe(0.6);
  });

  it("rótulos", () => {
    expect(rotuloDoMovimento("compensacao").rotulo).toBe("Compensação");
    expect(rotuloDoMovimento("estorno").tom).toBe("danger");
  });
});
