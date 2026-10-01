import { describe, it, expect } from "vitest";
import {
  detalheDaConciliacao,
  recusaDeStatusDespesa,
  statusDespesaValido,
  coreDaReplica,
  recusaDeEdicao,
  recusaDeParcelas,
  recusaDeStatusParcela,
  recusaDeValor,
  type VinculosDaDespesa,
} from "./despesa-regras";

const semVinculo: VinculosDaDespesa = {
  parcelas: 0,
  parcelasPagas: 0,
  pagamentos: 0,
  acertos: 0,
  restituicoes: 0,
  caixaConciliado: 0,
  terceiros: 0,
  documentosFiscais: 0,
  anexos: 0,
};

describe("despesa — regras de integridade (Prompt I, §11)", () => {
  it("11.1 valor: zero, negativo, NaN e infinito são recusados", () => {
    expect(recusaDeValor(100)).toBeNull();
    expect(recusaDeValor(0.01)).toBeNull();
    for (const v of [0, -1, NaN, Infinity, -Infinity]) expect(recusaDeValor(v), String(v)).not.toBeNull();
  });

  it("11.3 parcelas: a soma fecha com o total, com tolerância de 1 centavo", () => {
    expect(recusaDeParcelas(100, [{ valor: 40 }, { valor: 60 }])).toBeNull();
    expect(recusaDeParcelas(100, [{ valor: 33.33 }, { valor: 33.33 }, { valor: 33.34 }])).toBeNull();
    expect(recusaDeParcelas(100, [{ valor: 40 }, { valor: 40 }])).toMatch(/não fecha/); // §47.9
    expect(recusaDeParcelas(100, [{ valor: 100 }, { valor: 0 }])).toMatch(/maior que zero/);
    expect(recusaDeParcelas(100, [])).toBeNull(); // sem parcelas: nada a conferir
  });

  it("11.4 status de parcela: só da lista", () => {
    expect(recusaDeStatusParcela([{ status: "Pendente" }, { status: "Pago" }])).toBeNull();
    expect(recusaDeStatusParcela([{ status: "Pendente" }, { status: "Quitadíssima" }])).toMatch(/Quitadíssima/);
  });

  it("11.5 réplica recorrente: sem estado de pagamento nem instrumento", () => {
    const core = {
      valor: "100",
      status: "Pago",
      pagoPorTerceiro: true,
      dataCaixa: "09/01/2026",
      formaPagamento: "Boleto",
      condicaoPagamento: "30/60",
      qtdParcelas: 2,
      boletoLinhaDigitavel: "123",
      chequeNumero: "77",
      obs: "aluguel",
      fornecedorId: "f1",
    };
    const r = coreDaReplica(core);
    expect(r).toMatchObject({
      valor: "100",
      status: "A pagar",
      pagoPorTerceiro: false,
      dataCaixa: null,
      formaPagamento: "Boleto",
      condicaoPagamento: null,
      qtdParcelas: null,
      boletoLinhaDigitavel: null,
      chequeNumero: null,
      obs: "aluguel",
      fornecedorId: "f1",
    });
    expect(core.status).toBe("Pago"); // o original não é tocado
  });

  it("11.6 edição: sem vínculo, tudo pode", () => {
    expect(recusaDeEdicao(semVinculo, ["valor", "status", "obs"])).toBeNull();
  });

  it("11.6 edição: com pagamento, valor/status/datas/forma travam; obs e fornecedor passam", () => {
    const v = { ...semVinculo, pagamentos: 1 };
    expect(recusaDeEdicao(v, ["obs", "fornecedorId", "contaCef"])).toBeNull();
    expect(recusaDeEdicao(v, ["valor"])).toMatch(/1 pagamento\(s\)/);
    expect(recusaDeEdicao(v, ["status"])).toMatch(/status/);
    expect(recusaDeEdicao(v, ["competencia"])).not.toBeNull();
    expect(recusaDeEdicao({ ...semVinculo, acertos: 2 }, ["vencimento"])).toMatch(/acerto/);
    expect(recusaDeEdicao({ ...semVinculo, caixaConciliado: 1 }, ["formaPagamento"])).toMatch(/caixa/);
    expect(recusaDeEdicao({ ...semVinculo, terceiros: 1 }, ["valor"])).toMatch(/terceiro/);
  });

  it("11.6 edição: só parcelas em aberto travam o valor, e nada mais", () => {
    const v = { ...semVinculo, parcelas: 3 };
    expect(recusaDeEdicao(v, ["valor"])).toMatch(/3 parcela/);
    expect(recusaDeEdicao(v, ["status", "competencia", "obs"])).toBeNull();
  });
});

describe("status da despesa (Prompt S, 3.2)", () => {
  it("só 'A pagar' e 'Pago' passam; vazio cai no default; o resto é recusado com a mensagem", () => {
    expect(statusDespesaValido("A pagar")).toBe(true);
    expect(statusDespesaValido("Pago")).toBe(true);
    expect(statusDespesaValido("Parcialmente paga")).toBe(false);
    expect(recusaDeStatusDespesa("")).toBeNull();
    expect(recusaDeStatusDespesa(null)).toBeNull();
    expect(recusaDeStatusDespesa("Quitado")).toMatch(/Status inválido: "Quitado"/);
  });
});

describe("trava de conciliação — mensagem (Prompt S, 1.2 e 1.3)", () => {
  const v: VinculosDaDespesa = { parcelasPagas: 0, pagamentos: 0, acertos: 0, restituicoes: 0, caixaConciliado: 1, terceiros: 0, parcelas: 0, documentosFiscais: 0, anexos: 0 };
  const mov = [{ data: "09/05/2026", valor: -1234.56, descricao: "PIX FORNECEDOR" }];
  it("1 — diz qual movimento está vinculado e que desfazer vem antes", () => {
    const m = recusaDeEdicao(v, ["valor"], { movimentos: mov, podeDesfazerConciliacao: true })!;
    expect(m).toMatch(/09\/05\/2026 · -R\$\s?1\.234,56 · PIX FORNECEDOR/);
    expect(m).toMatch(/Desfazer a conciliação, no Caixa, vem antes/);
    expect(m).not.toMatch(/não tem/);
  });
  it("2 — descrição, fornecedor, conta e categoria seguem editáveis", () => {
    expect(recusaDeEdicao(v, ["obs", "fornecedorId", "contaCef", "categoriaDre"], { movimentos: mov })).toBeNull();
  });
  it("3 — sem a permissão de desfazer, a mensagem diz com todas as letras", () => {
    const m = recusaDeEdicao(v, ["competencia"], { movimentos: mov, podeDesfazerConciliacao: false })!;
    expect(m).toMatch(/exige a permissão de excluir no Caixa, que o seu usuário não tem/);
  });
  it("sem caixa conciliado, nada do complemento entra", () => {
    const semCaixa = { ...v, caixaConciliado: 0, pagamentos: 1 };
    expect(recusaDeEdicao(semCaixa, ["valor"], { movimentos: mov, podeDesfazerConciliacao: false })).not.toMatch(/extrato/);
    expect(detalheDaConciliacao(undefined)).toBe("");
  });
});
