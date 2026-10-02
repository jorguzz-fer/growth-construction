import { describe, it, expect } from "vitest";
import { emptyInputs, type Inputs } from "@/lib/calc/dre-cascata";
import { alertaDeDesvio, alertaDeVencidos, custoAteOMes, parametrosDeAlerta, textoDosLimites } from "./resumo-blocos";
import { lerLimitesDeAlerta } from "./empresa-regras";

/** BAE-1 (decisão de 01/10/2026): desvio > 10% E > R$ 5.000; vencido > 15 dias. */
const P = parametrosDeAlerta({ alertaDesvioPct: "10.00", alertaDesvioValor: "5000.00", alertaVencidoDias: 15 });
const obra = { obra: "Obra X", projectId: "p1", ate: "10/2026" };
const sp = (t: string | undefined) => t?.replace(/\u00a0/g, " ");
const mes = (custoVar: number, fixo = 0, outras: Record<string, number> = {}): Inputs => ({ ...emptyInputs(), custoVar, byCat: { "Custo Fixo": fixo, ...outras } });

describe("BAE-1 · desvio de custo", () => {
  it("os parâmetros vêm do tenant (numeric chega como texto)", () => {
    expect(P).toEqual({ desvioPct: 10, desvioValor: 5000, vencidoDias: 15 });
    expect(textoDosLimites(P)).toContain("10,0%");
  });

  it("custo = Custo Variável + Custo Fixo, só até o mês; sem competência e meses futuros ficam fora", () => {
    const porMes = { "09/2026": mes(100, 50, { "Despesa Fixa": 999 }), "10/2026": mes(10), "11/2026": mes(1000), "": mes(7) };
    expect(custoAteOMes(porMes, "10/2026")).toBe(160);
    expect(custoAteOMes({ "12/2025": mes(5) }, "01/2026")).toBe(5);
  });

  it("alerta só com os DOIS limites passados", () => {
    // 20% acima, mas só R$ 2.000: não alerta.
    expect(alertaDeDesvio({ ...obra, orcado: 10_000, realizado: 12_000 }, P)).toBeNull();
    // R$ 6.000 acima, mas só 6%: não alerta.
    expect(alertaDeDesvio({ ...obra, orcado: 100_000, realizado: 106_000 }, P)).toBeNull();
    // 12% e R$ 6.000: alerta, com o quê, onde e quanto.
    const a = alertaDeDesvio({ ...obra, orcado: 50_000, realizado: 56_000 }, P);
    expect(sp(a?.texto)).toBe("Custo 12,0% acima do orçado até 10/2026: R$ 56.000,00 realizados contra R$ 50.000,00 (R$ 6.000,00 a mais) — Obra X.");
    expect(a?.href).toBe("/projeto?proj=p1");
  });

  it("no limite exato não alerta (é \"acima de\")", () => {
    expect(alertaDeDesvio({ ...obra, orcado: 50_000, realizado: 55_000 }, P)).toBeNull();
  });

  it("abaixo do orçado não é alerta", () => {
    expect(alertaDeDesvio({ ...obra, orcado: 100_000, realizado: 10_000 }, P)).toBeNull();
  });

  it("sem Orçamento: diz que não calcula; orçado zero com custo acima do valor: alerta sem percentual", () => {
    expect(alertaDeDesvio({ ...obra, orcado: null, realizado: 1 }, P)?.texto).toBe("Obra X sem Orçamento lançado: o desvio de custo não é calculado.");
    expect(alertaDeDesvio({ ...obra, orcado: null, semOrcamento: "fora_dos_relatorios", realizado: 1 }, P)?.texto).toContain("não está Aprovado");
    expect(sp(alertaDeDesvio({ ...obra, orcado: 0, realizado: 6_000 }, P)?.texto)).toBe("Custo realizado de R$ 6.000,00 até 10/2026 sem custo orçado nessas competências — Obra X.");
    expect(alertaDeDesvio({ ...obra, orcado: 0, realizado: 4_000 }, P)).toBeNull();
  });

  it("outros limites, outro resultado: o número vem do parâmetro", () => {
    const solto = { desvioPct: 5, desvioValor: 1_000, vencidoDias: 30 };
    expect(alertaDeDesvio({ ...obra, orcado: 10_000, realizado: 12_000 }, solto)).not.toBeNull();
  });
});

describe("BAE-1 · recebível vencido", () => {
  const base = { obra: "Obra X", projectId: "p1", hoje: "10/20/2026" };
  it("conta só o saldo em aberto vencido há MAIS de 15 dias", () => {
    const a = alertaDeVencidos(
      {
        ...base,
        contas: [
          { saldo: 1_000, vencimento: "10/04/2026" }, // 16 dias: entra
          { saldo: 2_000, vencimento: "10/05/2026" }, // 15 dias: não entra
          { saldo: 0, vencimento: "01/01/2026" }, // quitada
          { saldo: 500, vencimento: null }, // sem vencimento
          { saldo: 300, vencimento: "09/01/2026" }, // entra
        ],
      },
      P,
    );
    expect({ ...a, texto: sp(a?.texto) }).toEqual({ texto: "2 recebível(is) vencido(s) há mais de 15 dias, R$ 1.300,00 em aberto — Obra X.", href: "/contasreceber?proj=p1" });
  });
  it("nada vencido além do prazo: sem linha", () => {
    expect(alertaDeVencidos({ ...base, contas: [{ saldo: 10, vencimento: "10/19/2026" }] }, P)).toBeNull();
  });
  it("virada de ano conta dias corridos", () => {
    expect(alertaDeVencidos({ ...base, hoje: "01/10/2027", contas: [{ saldo: 10, vencimento: "12/20/2026" }] }, P)).not.toBeNull();
  });
});

describe("BAE-1 · leitura dos limites na tela Empresa", () => {
  it("aceita vírgula e milhar com ponto", () => {
    expect(lerLimitesDeAlerta({ desvioPct: "10,5", desvioValor: "5.000,00", vencidoDias: "15" })).toEqual({ ok: true, desvioPct: 10.5, desvioValor: 5000, vencidoDias: 15 });
    expect(lerLimitesDeAlerta({ desvioPct: "10", desvioValor: "5000.5", vencidoDias: "0" })).toEqual({ ok: true, desvioPct: 10, desvioValor: 5000.5, vencidoDias: 0 });
    expect(lerLimitesDeAlerta({ desvioPct: "10", desvioValor: "R$ 5.000", vencidoDias: "15" })).toMatchObject({ ok: true, desvioValor: 5000 });
  });
  it("recusa com o campo e o porquê", () => {
    expect(lerLimitesDeAlerta({ desvioPct: "0", desvioValor: "1", vencidoDias: "1" })).toMatchObject({ ok: false, error: expect.stringMatching(/^Desvio de custo \(%\)/) });
    expect(lerLimitesDeAlerta({ desvioPct: "10", desvioValor: "abc", vencidoDias: "1" })).toMatchObject({ ok: false, error: expect.stringMatching(/^Desvio de custo \(R\$\)/) });
    expect(lerLimitesDeAlerta({ desvioPct: "10", desvioValor: "1", vencidoDias: "1,5" })).toMatchObject({ ok: false, error: expect.stringMatching(/^Recebível vencido/) });
    expect(lerLimitesDeAlerta({ desvioPct: null, desvioValor: "1", vencidoDias: "1" }).ok).toBe(false);
  });
});
