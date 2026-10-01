import { describe, it, expect } from "vitest";
import { estadoDaConta, indicadorSemConciliar, motivoDeRecusaDoRecebimento, ymdNumero } from "./conta-receber-estado";

const r = (valor: number, cashEntryId: string | null = null, estornado = false, data = "10/10/2026") => ({ valor, data, cashEntryId, estornado });

describe("contas a receber — estado derivado (Prompt K, 3.1/3.2) e vínculo (4.2)", () => {
  it("3.1 · os três estados: A receber → Recebida (sem extrato) → Recebida e conciliada", () => {
    expect(estadoDaConta({ valor: 324, cancelado: false, recebimentos: [] }).estado).toBe("A receber");
    const parcial = estadoDaConta({ valor: 324, cancelado: false, recebimentos: [r(100)] });
    expect(parcial).toMatchObject({ estado: "Recebida", recebido: 100, naoConciliado: 100, saldo: 224, quitada: false, statusGravado: "Parcialmente recebido" });
    const semExtrato = estadoDaConta({ valor: 324, cancelado: false, recebimentos: [r(324)] });
    expect(semExtrato).toMatchObject({ estado: "Recebida", quitada: true, naoConciliado: 324, saldo: 0, statusGravado: "Recebido" });
    const conciliada = estadoDaConta({ valor: 324, cancelado: false, recebimentos: [r(100, "m1"), r(224, "m2")] });
    expect(conciliada).toMatchObject({ estado: "Recebida e conciliada", conciliado: 324, naoConciliado: 0, statusGravado: "Recebido" });
    const mista = estadoDaConta({ valor: 324, cancelado: false, recebimentos: [r(100, "m1"), r(224)] });
    expect(mista.estado).toBe("Recebida"); // parte sem extrato: não é "conciliada"
  });

  it("BK-3 · R$ 323,97 numa conta de R$ 324,00 fecha com resíduo de 0,03 registrado (tolerância declarada de 0,05); 323,90 não fecha", () => {
    const fecha = estadoDaConta({ valor: 324, cancelado: false, recebimentos: [r(323.97, "m1")] });
    expect(fecha).toMatchObject({ quitada: true, residuo: 0.03, saldo: 0, estado: "Recebida e conciliada" });
    const aberta = estadoDaConta({ valor: 324, cancelado: false, recebimentos: [r(323.9, "m1")] });
    expect(aberta).toMatchObject({ quitada: false, residuo: 0, saldo: 0.1, estado: "Recebida" });
  });

  it("4.3 · estornado não conta; cancelada é cancelada", () => {
    expect(estadoDaConta({ valor: 100, cancelado: false, recebimentos: [r(100, "m1", true)] }).estado).toBe("A receber");
    expect(estadoDaConta({ valor: 100, cancelado: true, recebimentos: [r(100, "m1")] }).estado).toBe("Cancelada");
  });

  it("3.3/3.4/4.1/4.2 · validação da baixa: valor, data, forma, saldo, extrato obrigatório para conciliar, justificativa fora do banco, soma dos vínculos", () => {
    const ok = { valor: 100, data: "10/10/2026", forma: "Espécie", justificativa: "pago na obra", cashEntryId: null };
    expect(motivoDeRecusaDoRecebimento(ok, { saldo: 324 })).toBeNull();
    expect(motivoDeRecusaDoRecebimento({ ...ok, valor: 0 }, { saldo: 324 })).toMatch(/maior que zero/);
    expect(motivoDeRecusaDoRecebimento({ ...ok, data: null }, { saldo: 324 })).toMatch(/data/);
    expect(motivoDeRecusaDoRecebimento({ ...ok, forma: "Cheque" }, { saldo: 324 })).toMatch(/Forma/);
    expect(motivoDeRecusaDoRecebimento({ ...ok, valor: 5000 }, { saldo: 324 })).toMatch(/passa do que falta/);
    expect(motivoDeRecusaDoRecebimento({ ...ok, valor: 324.01 }, { saldo: 324 })).toBeNull(); // tolerância de 1 centavo
    expect(motivoDeRecusaDoRecebimento({ ...ok, justificativa: " " }, { saldo: 324 })).toMatch(/justificativa/);
    expect(motivoDeRecusaDoRecebimento({ ...ok, cashEntryId: "m1" }, { saldo: 324 })).toMatch(/Extrato bancário/);
    const extrato = { ...ok, forma: "Extrato bancário", justificativa: null, cashEntryId: null };
    expect(motivoDeRecusaDoRecebimento(extrato, { saldo: 324 })).toMatch(/linha do extrato/);
    expect(motivoDeRecusaDoRecebimento({ ...extrato, cashEntryId: "m1" }, { saldo: 324, disponivelNoMovimento: 60 })).toMatch(/soma dos vínculos/);
    expect(motivoDeRecusaDoRecebimento({ ...extrato, cashEntryId: "m1" }, { saldo: 324, disponivelNoMovimento: 100 })).toBeNull();
  });

  it("3.5 · indicador: recebido sem conciliar, contas e dias do mais antigo", () => {
    const hoje = ymdNumero("10/20/2026")!;
    const ind = indicadorSemConciliar(
      [
        { recebimentos: [r(100, null, false, "10/02/2026"), r(50, "m1")] },
        { recebimentos: [r(30, null, false, "10/15/2026")] },
        { recebimentos: [r(10, null, true, "09/01/2026")] }, // estornado não conta
        { recebimentos: [r(99, "m2")] }, // conciliado não conta
      ],
      hoje,
    );
    expect(ind).toEqual({ valor: 130, contas: 2, diasMaisAntigo: 18 });
    expect(indicadorSemConciliar([], hoje)).toEqual({ valor: 0, contas: 0, diasMaisAntigo: null });
  });
});
