import { describe, it, expect } from "vitest";
import { semestrePendente, semestreSalvo } from "./backup-historico";

const fimH1 = new Date(2026, 5, 30, 23, 59, 59);
const fimH2 = new Date(2025, 11, 31, 23, 59, 59);

describe("Prompt AO, Parte 6 — histórico de backup e o aviso", () => {
  it("só conta como salvo o backup baixado DEPOIS do fim do semestre", () => {
    expect(semestreSalvo(fimH1, null)).toBe(false);
    expect(semestreSalvo(fimH1, { em: new Date(2026, 4, 1), por: "x" })).toBe(false);
    expect(semestreSalvo(fimH1, { em: new Date(2026, 6, 2), por: "x" })).toBe(true);
  });

  it("o aviso vai para o encerrado mais recente com dados e ainda não salvo", () => {
    const sems = [
      { key: "2026-H2", closed: false, total: 5, fim: new Date(2026, 11, 31) },
      { key: "2026-H1", closed: true, total: 3, fim: fimH1 },
      { key: "2025-H2", closed: true, total: 2, fim: fimH2 },
    ];
    expect(semestrePendente(sems, new Map())).toBe("2026-H1");
    expect(semestrePendente(sems, new Map([["2026-H1", { em: new Date(2026, 6, 10), por: "x" }]]))).toBe("2025-H2");
    expect(
      semestrePendente(
        sems,
        new Map([
          ["2026-H1", { em: new Date(2026, 6, 10), por: "x" }],
          ["2025-H2", { em: new Date(2026, 0, 5), por: "x" }],
        ]),
      ),
    ).toBeNull();
  });

  it("semestre em andamento nunca é pendente, mesmo sem backup", () => {
    expect(semestrePendente([{ key: "2026-H2", closed: false, total: 9, fim: new Date(2026, 11, 31) }], new Map())).toBeNull();
  });
});

describe("Prompt AO, 4.3 — situação do pacote completo", async () => {
  const { situacaoDoPacote } = await import("./backup-historico");
  const { emParalelo } = await import("./em-paralelo");
  const agora = new Date("2026-10-26T12:00:00Z");
  const min = (m: number) => new Date(agora.getTime() - m * 60_000);
  it("gerando sem sinal há mais de 15 min = interrompido", () => {
    expect(situacaoDoPacote({ status: "gerando", atualizadoEm: min(2) }, agora)).toBe("gerando");
    expect(situacaoDoPacote({ status: "gerando", atualizadoEm: min(16) }, agora)).toBe("interrompido");
    expect(situacaoDoPacote({ status: "pronto", atualizadoEm: min(999) }, agora)).toBe("pronto");
    expect(situacaoDoPacote({ status: "falhou", atualizadoEm: min(1) }, agora)).toBe("falhou");
  });
  it("emParalelo respeita o limite e passa por todos", async () => {
    let ativos = 0;
    let max = 0;
    const vistos: number[] = [];
    await emParalelo([...Array(30).keys()], 6, async (x) => {
      ativos++;
      max = Math.max(max, ativos);
      await new Promise((ok) => setTimeout(ok, 1));
      vistos.push(x);
      ativos--;
    });
    expect(max).toBe(6);
    expect(vistos.sort((a, b) => a - b)).toEqual([...Array(30).keys()]);
  });
});
