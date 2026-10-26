import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { lerMudancas, lerResumoDoPacote, periodosSemBackup } from "./backup-analise";

/** Prompt AO, Parte 8 — o assistente do Backup. */
describe("assistente do Backup", () => {
  it("lê o resumo do pacote em frases, sem conteúdo de linha", () => {
    const f = lerResumoDoPacote({
      totalDeLinhas: 120,
      tabelas: [
        { tabela: "cliente", familia: "Receita", camada: "cadastro", linhas: 20, semData: 0 },
        { tabela: "despesa", familia: "Despesa", camada: "movimento", linhas: 100, semData: 3 },
        { tabela: "fatura_cartao", familia: "Caixa", camada: "movimento", linhas: 0, semData: 0 },
      ],
      documentos: { noPeriodo: 10, incluidos: 9, falhos: 1, asoOmitidos: 2 },
      referenciasFora: [{ tabela: "pagamento", coluna: "despesa_id", aponta: "despesa", quantas: 4 }],
      tabelasComFalha: [],
    });
    expect(f).toEqual([
      "120 linhas em 3 tabelas (2 com dados).",
      "Cadastro inteiro: 20 linhas. Movimento do semestre: 100 linhas.",
      "Maiores: despesa (100), cliente (20).",
      "Documentos: 9 de 10; 1 não puderam ser baixados (a lista está no leia-me).",
      "2 documento(s) de ASO ficaram fora por ser dado de saúde.",
      "Linhas sem data reconhecível (entram em todo pacote): despesa (3).",
      "Apontam para outro semestre: pagamento → despesa (4). Esses registros estão no pacote do semestre deles.",
      "Nenhuma tabela falhou na leitura.",
    ]);
    expect(lerResumoDoPacote({ tabelasComFalha: ["audit_log"] }).at(-1)).toContain("audit_log");
  });

  it("períodos sem backup: encerrado com dados, nunca baixado ou baixado antes do fim", () => {
    const fim = new Date(2026, 5, 30, 23, 59, 59);
    const s = (key: string, closed: boolean, total: number, em: Date | null) => ({ key, label: key, closed, total, fim, ultimoBackup: em ? { em, por: "x" } : null });
    expect(
      periodosSemBackup([
        s("2026-H2", false, 5, null),
        s("2026-H1", true, 5, null),
        s("2025-H2", true, 5, new Date(2026, 4, 1)),
        s("2025-H1", true, 0, null),
        s("2024-H2", true, 5, new Date(2026, 7, 1)),
      ]).map((x) => [x.key, x.motivo]),
    ).toEqual([
      ["2026-H1", "nunca baixado"],
      ["2025-H2", "baixado antes do fim do semestre — incompleto"],
    ]);
  });

  it("mudanças em frases", () => {
    expect(lerMudancas([{ tabela: "despesa", criadas: 3, alteradas: 0 }, { tabela: "unit", criadas: 0, alteradas: 2 }])).toEqual(["despesa: 3 nova(s)", "unit: 2 alterada(s)"]);
    expect(lerMudancas([])).toEqual([]);
  });

  it("8.2 — o painel não gera nem baixa pacote, não chama rede nem modelo", () => {
    const src = readFileSync("src/components/app/assistente-backup.tsx", "utf8") + readFileSync("src/lib/backup-analise.ts", "utf8");
    expect(src).not.toMatch(/@\/lib\/actions/);
    expect(src).not.toMatch(/\bfetch\(|\/backup\/pacote|\/backup\/download|href=/);
    expect(src).not.toMatch(/anthropic|assistente-chat/i);
  });
});
