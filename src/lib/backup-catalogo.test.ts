import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { FORA_DO_PACOTE, TABELAS_DO_PACOTE, ehMovimento, tabelaDoPacote, tabelaDrizzle } from "./backup-catalogo";
import { CAMPOS_SENSIVEIS_CLIENTE } from "./clientes-sensivel";

/** Prompt AO, BAO-1 — toda tabela do banco tem decisão: entra ou fica fora, com motivo. */
const TODAS = (Object.values(schema) as unknown[]).filter((t): t is PgTable => t instanceof PgTable).map((t) => getTableConfig(t).name);

describe("catálogo do pacote completo", () => {
  it("toda tabela do schema está decidida — e só uma vez (tabela nova sem decisão quebra este teste)", () => {
    const decididas = [...TABELAS_DO_PACOTE.map((t) => t.tabela), ...FORA_DO_PACOTE.map((f) => f.tabela)];
    expect(new Set(decididas).size).toBe(decididas.length);
    expect([...decididas].sort()).toEqual([...TODAS].sort());
  });

  it("as 35 tabelas da proposta entram, exceto number_sequence (que vira informação no leia-me)", () => {
    const proposta = "tenant project version unit cliente conta_receber permuta reembolso recebimento_terceiro repasse despesa despesa_parcela pagamento documento_fiscal despesa_terceiro restituicao restituicao_item compensacao acerto acerto_item rateio_obra stakeholder bank_account chart_account cash_entry daily_closing carry_over medicao servico medicao_servico incc_rate budget_line budget_account stock_item stock_movement time_entry document".split(" ");
    for (const t of proposta) expect(tabelaDoPacote(t), t).toBeDefined();
    expect(tabelaDoPacote("audit_log")).toBeDefined();
    for (const fora of ["user", "account", "session", "verificationToken", "membership", "number_sequence"]) expect(tabelaDoPacote(fora)).toBeUndefined();
  });

  it("o nome e a chave do Drizzle batem; colunas de recorte e de omissão existem", () => {
    for (const t of TABELAS_DO_PACOTE) {
      const tb = tabelaDrizzle(t);
      expect(getTableConfig(tb).name, t.tabela).toBe(t.tabela);
      const cols = getTableColumns(tb);
      const r = t.recorte;
      const usadas = r.tipo === "data" ? r.colunas : r.tipo === "competencia" || r.tipo === "instante" || r.tipo === "pai" ? [r.coluna] : [];
      for (const c of [...usadas, ...(t.omitir ?? [])]) expect(cols, `${t.tabela}.${c}`).toHaveProperty(c);
      if (r.tipo === "pai") expect(ehMovimento(tabelaDoPacote(r.pai)!), `${t.tabela} → ${r.pai}`).toBe(true);
      if (t.tabela !== "tenant") expect(cols, `${t.tabela} sem tenant_id`).toHaveProperty("tenantId");
    }
  });

  it("BAO-2: o BM-3 inteiro fica fora do cliente; salário e banco fora do funcionário; ASO fora dos documentos", () => {
    expect(tabelaDoPacote("cliente")!.omitir).toEqual(CAMPOS_SENSIVEIS_CLIENTE);
    expect(tabelaDoPacote("funcionario")!.omitir).toEqual(expect.arrayContaining(["salario", "bancoConta", "pixChave", "endereco"]));
    expect(tabelaDoPacote("document")!.semAso).toBe(true);
    // unit entra inteira: o plano de pagamento é a receita (2.4).
    expect(tabelaDoPacote("unit")!.omitir).toBeUndefined();
    expect(tabelaDoPacote("unit")!.recorte.tipo).toBe("cadastro");
  });
});
