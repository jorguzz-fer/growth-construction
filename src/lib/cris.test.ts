import { describe, it, expect } from "vitest";
import {
  MAX_DADOS_DA_TELA,
  anexoValido,
  blocoDaTela,
  contextoValido,
  dadosParaOModelo,
  historicoDaCris,
  propostaValida,
  regrasDaCris,
  sanitizarDados,
  trechosDaCris,
  type FormularioDaTela,
} from "./cris";

const FORM: FormularioDaTela = {
  id: "despesa",
  titulo: "Nova despesa",
  campos: [
    { nome: "valor", rotulo: "Valor", tipo: "numero" },
    { nome: "vencimento", rotulo: "Vencimento", tipo: "data", dica: "MM/DD/YYYY" },
    { nome: "status", rotulo: "Status", tipo: "opcao", opcoes: ["A pagar", "Pago"] },
    { nome: "obs", rotulo: "Observação", tipo: "texto" },
  ],
};

describe("Prompt E2 — Cris, regras puras", () => {
  it("o resumo da tela perde dado pessoal, função e excesso", () => {
    const limpo = sanitizarDados({ receita: 1000.456, cpf: "123", clienteEmail: "a@b", contas: [{ banco: "X", agencia: "1", saldo: 5 }], f: () => 1 }) as Record<string, unknown>;
    expect(limpo).toEqual({ receita: 1000.46, contas: [{ banco: "X", saldo: 5 }] });
    const grande = { linhas: Array.from({ length: 120 }, (_, i) => ({ item: "x".repeat(200), i })) };
    expect(dadosParaOModelo(grande)!.length).toBeLessThanOrEqual(MAX_DADOS_DA_TELA + 40);
    expect(dadosParaOModelo({})).toBeNull();
  });

  it("contexto só de rota conhecida; formulário só com campos válidos", () => {
    expect(contextoValido({ rota: "/inexistente", titulo: "x" })).toBeNull();
    const c = contextoValido({ rota: "/despesas?proj=1", titulo: "Despesas", formulario: { ...FORM, campos: [...FORM.campos, { nome: 1 }] } })!;
    expect(c.rota).toBe("/despesas");
    expect(c.formulario!.campos.map((x) => x.nome)).toEqual(["valor", "vencimento", "status", "obs"]);
    expect(contextoValido({ rota: "/dre", titulo: "DRE", sugestoes: ["a", 2] })!.sugestoes).toEqual(["a"]);
  });

  it("histórico: começa e termina pela pessoa, sem falas vazias", () => {
    expect(historicoDaCris([{ de: "cris", texto: "oi" }])).toBeNull();
    expect(historicoDaCris([{ de: "cris", texto: "oi" }, { de: "usuario", texto: " quanto? " }])).toEqual([{ de: "usuario", texto: "quanto?" }]);
    expect(historicoDaCris([{ de: "hacker", texto: "x" }])).toBeNull();
  });

  it("anexo: só PDF e imagem, base64 válido e até 4 MB", () => {
    expect(anexoValido({ tipo: "application/pdf", base64: "JVBERi0=", nome: "nota.pdf" })).toMatchObject({ tipo: "application/pdf" });
    expect(anexoValido({ tipo: "text/html", base64: "PGh0bWw+" })).toBeNull();
    expect(anexoValido({ tipo: "image/png", base64: "não é base64!" })).toBeNull();
    expect(anexoValido({ tipo: "image/png", base64: "A".repeat(6 * 1024 * 1024) })).toBeNull();
  });

  it("proposta: só campos do formulário, opção aceita, número normalizado", () => {
    const p = propostaValida(
      { valores: { valor: "R$ 1.234,50", status: "pago", vencimento: "10/20/2026", inventado: "x", obs: "" }, conferir: { vencimento: "deduzi do boleto", fora: "x" }, observacao: "ok" },
      FORM,
    )!;
    expect(p.valores).toEqual({ valor: "1234.5", status: "Pago", vencimento: "10/20/2026" });
    expect(p.conferir).toEqual({ vencimento: "deduzi do boleto" });
    expect(propostaValida({ valores: { status: "Talvez" } }, FORM)).toBeNull();
    expect(propostaValida({ valores: { valor: "10" } }, null)).toBeNull();
  });

  it("bloco da tela: números só com permissão; o formulário vai junto", () => {
    const ctx = { rota: "/despesas", titulo: "Despesas", dados: { total: 10 }, formulario: FORM };
    expect(blocoDaTela(ctx, true)).toContain('"total":10');
    expect(blocoDaTela(ctx, false)).not.toContain('"total"');
    expect(blocoDaTela(ctx, false)).toContain('<formulario id="despesa"');
    expect(blocoDaTela(null, true)).toContain("não está numa tela registrada");
  });

  it("links só para rotas que existem; as regras dizem que a Cris não grava", () => {
    const t = trechosDaCris("Veja [Despesas](/despesas?tab=semnf) e [Nada](/nao-existe).");
    expect(t).toContainEqual({ tipo: "link", texto: "Despesas", href: "/despesas?tab=semnf" });
    expect(t).toContainEqual({ tipo: "texto", texto: "Nada" });
    expect(regrasDaCris()).toMatch(/não grava/);
    expect(regrasDaCris()).toMatch(/Nunca invente número/);
  });
});
