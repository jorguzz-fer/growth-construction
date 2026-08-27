import { describe, it, expect } from "vitest";
import { mensagemDeErroIa } from "./erros";

/** Corpo real devolvido pela API quando a conta fica sem saldo. */
const SEM_CREDITO =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CeTcu7wVEbvJ5rdyr5Z8D"}';

describe("mensagem de erro da IA", () => {
  it("saldo insuficiente: diz que é crédito, não chave nem modelo", () => {
    const m = mensagemDeErroIa({ status: 400, mensagem: SEM_CREDITO });
    expect(m).toContain("sem créditos");
    expect(m).toContain("Plans & Billing");
    // O ponto da tradução: não mandar o usuário mexer na chave/modelo, que
    // estão certos.
    expect(m).toContain("estão corretos");
    expect(m).not.toContain("credit balance");
  });

  it("chave inválida (401/403) manda conferir a ANTHROPIC_API_KEY", () => {
    for (const status of [401, 403]) {
      expect(mensagemDeErroIa({ status, mensagem: "401 unauthorized" })).toContain(
        "ANTHROPIC_API_KEY",
      );
    }
  });

  it("modelo inexistente (404) aponta o identificador, que é o erro típico", () => {
    const m = mensagemDeErroIa({ status: 404, mensagem: "404 not_found" });
    expect(m).toContain("ANTHROPIC_MODEL");
    expect(m).toContain("claude-sonnet-5");
    expect(m).toContain("nome comercial");
  });

  it("limite de uso (429) sugere tentar de novo", () => {
    expect(mensagemDeErroIa({ status: 429, mensagem: "429" })).toContain("Limite de uso");
  });

  it("falha de rede aponta egress do servidor, por status ou por texto", () => {
    expect(mensagemDeErroIa({ mensagem: "boom", semConexao: true })).toContain("rede/egress");
    expect(mensagemDeErroIa({ mensagem: "fetch failed" })).toContain("rede/egress");
    expect(mensagemDeErroIa({ mensagem: "ECONNREFUSED 1.2.3.4:443" })).toContain(
      "rede/egress",
    );
  });

  it("erro desconhecido preserva o texto original para investigação", () => {
    const m = mensagemDeErroIa({ status: 500, mensagem: "overloaded_error" });
    expect(m).toContain("overloaded_error");
  });
});
