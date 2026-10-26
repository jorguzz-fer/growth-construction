import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { count, eq } from "drizzle-orm";

/** Prompt AO, Partes 1, 2 e 5 — a extração do pacote completo. Banco real. */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt AO · extração do pacote completo", async () => {
  const { db, schema } = await import("@/lib/db");
  const { extrairDados, mudancasDesde } = await import("./backup-dados");
  const { TABELAS_DO_PACOTE, tabelaDrizzle } = await import("./backup-catalogo");
  const { semesterInfo } = await import("./semester");
  let tenantId = "";
  let outroId = "";
  const ids: Record<string, string> = {};
  const H1 = semesterInfo("2026-H1")!;
  const H2 = semesterInfo("2026-H2")!;

  /** Linhas do tenant em todas as tabelas do pacote — para provar que nada é escrito. */
  const contagem = async () => {
    const out: Record<string, number> = {};
    for (const t of TABELAS_DO_PACOTE) {
      const tb = tabelaDrizzle(t) as unknown as typeof schema.despesas;
      const col = t.tabela === "tenant" ? (tb as unknown as typeof schema.tenants).id : tb.tenantId;
      out[t.tabela] = Number((await db.select({ n: count() }).from(tb).where(eq(col, tenantId)))[0].n);
    }
    return out;
  };

  beforeAll(async () => {
    tenantId = (await db.insert(schema.tenants).values({ name: "tenant-backup-completo" }).returning())[0].id;
    outroId = (await db.insert(schema.tenants).values({ name: "tenant-backup-outro" }).returning())[0].id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA BK" }).returning();
    const [v] = await db.insert(schema.versions).values({ projectId: p.id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    const plano = { parcelas: [{ n: 1, valor: 1000 }] } as unknown as typeof schema.units.$inferInsert["paymentPlan"];
    ids.unit = (await db.insert(schema.units).values({ tenantId, versionId: v.id, code: "U-1", valor: "250000", paymentPlan: plano }).returning())[0].id;
    ids.cliente = (await db.insert(schema.clientes).values({ tenantId, nomeCompleto: "Maria Compradora", cpfCnpj: "12345678909", rendaBruta: "9000", estadoCivil: "Casada" }).returning())[0].id;
    const desp = async (competencia: string | null, valor: string) =>
      (await db.insert(schema.despesas).values({ tenantId, versionId: v.id, valor, categoriaDre: "Custo Variável", status: "Pago", competencia }).returning())[0].id;
    ids.despH1 = await desp("03/2026", "100.10");
    ids.despH2 = await desp("08/2026", "200.20");
    ids.despSemData = await desp(null, "5");
    await db.insert(schema.despesaParcelas).values({ tenantId, despesaId: ids.despH1, numeroParcela: 1, vencimento: "03/10/2026", valorOriginal: "100.10" } as typeof schema.despesaParcelas.$inferInsert);
    // Despesa de março paga em agosto: a referência sai do recorte de H2.
    await db.insert(schema.pagamentos).values({ tenantId, despesaId: ids.despH1, dataPagamento: "08/05/2026", valorTotalPago: "100.10" });
    await db.insert(schema.cashEntries).values({ tenantId, versionId: v.id, data: "02/15/2026", descricao: "entrada", valor: "50" } as typeof schema.cashEntries.$inferInsert);
    await db.insert(schema.documents).values({ tenantId, storageKey: "k/nota", filename: "nota.pdf", tipo: "Nota Fiscal", uploadedAt: new Date(2026, 2, 5) });
    await db.insert(schema.documents).values({ tenantId, storageKey: "k/aso", filename: "aso.pdf", tipo: "ASO — exame admissional", uploadedAt: new Date(2026, 2, 6) });
    await db.insert(schema.numberSequences).values({ tenantId, entity: "despesa", prefix: "PED", digits: 6, nextNumber: 42 });
    await db.insert(schema.auditLog).values({ tenantId, action: "teste", entity: "x", createdAt: new Date(2026, 3, 1) } as typeof schema.auditLog.$inferInsert);
    // Outra empresa: nada dela pode aparecer.
    const [po] = await db.insert(schema.projects).values({ tenantId: outroId, name: "OBRA ALHEIA" }).returning();
    const [vo] = await db.insert(schema.versions).values({ projectId: po.id, tenantId: outroId, key: "atual", kind: "atual", label: "A", color: "#000" }).returning();
    await db.insert(schema.despesas).values({ tenantId: outroId, versionId: vo.id, valor: "999", categoriaDre: "Custo Variável", status: "Pago", competencia: "03/2026" });
  });
  afterAll(async () => {
    for (const id of [tenantId, outroId]) if (id) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });

  it("todas as tabelas do catálogo saem, cada uma no seu arquivo — vazia também", async () => {
    const d = await extrairDados(tenantId, H1);
    expect(d.tabelas.map((t) => t.tabela)).toEqual(TABELAS_DO_PACOTE.map((t) => t.tabela));
    expect(d.tabelas.filter((t) => t.erro)).toEqual([]);
    expect(d.tabelas.find((t) => t.tabela === "fatura_cartao")!.linhas).toEqual([]);
  });

  it("movimento pelo semestre (sem data entra e é contada); cadastro inteiro; nada de outra empresa", async () => {
    const d = await extrairDados(tenantId, H1);
    const t = (n: string) => d.tabelas.find((x) => x.tabela === n)!;
    expect(t("despesa").linhas.map((l) => l.id).sort()).toEqual([ids.despH1, ids.despSemData].sort());
    expect(t("despesa").semData).toBe(1);
    expect(t("despesa").somas.valor).toBe("105.1");
    expect(t("despesa_parcela").linhas).toHaveLength(1);
    expect(t("cash_entry").linhas).toHaveLength(1);
    expect(t("pagamento").linhas).toHaveLength(0);
    expect(t("audit_log").linhas.length).toBeGreaterThanOrEqual(1);
    expect(t("tenant").linhas.map((l) => l.id)).toEqual([tenantId]);
    expect(t("project").linhas).toHaveLength(1);
    // As chaves estão lá, com o nome da coluna do banco.
    expect(t("despesa").linhas[0]).toHaveProperty("tenant_id", tenantId);
    expect(t("despesa").linhas[0]).toHaveProperty("version_id");

    const d2 = await extrairDados(tenantId, H2);
    const t2 = (n: string) => d2.tabelas.find((x) => x.tabela === n)!;
    expect(t2("despesa").linhas.map((l) => l.id).sort()).toEqual([ids.despH2, ids.despSemData].sort());
    expect(t2("despesa_parcela").linhas).toHaveLength(0);
    expect(t2("pagamento").linhas).toHaveLength(1);
    // 2.5 — o pagamento de agosto aponta para a despesa de março, que não está aqui.
    expect(d2.referenciasFora).toContainEqual({ tabela: "pagamento", coluna: "despesa_id", aponta: "despesa", quantas: 1 });
    expect(t2("unit").linhas).toHaveLength(1);
  });

  it("unit sai com o plano de pagamento íntegro (2.4)", async () => {
    const d = await extrairDados(tenantId, H2);
    expect(d.tabelas.find((t) => t.tabela === "unit")!.linhas[0].payment_plan).toEqual({ parcelas: [{ n: 1, valor: 1000 }] });
  });

  it("BAO-2: renda e estado civil fora do cliente; CPF entra; ASO fora dos documentos, contado", async () => {
    const d = await extrairDados(tenantId, H1);
    const c = d.tabelas.find((t) => t.tabela === "cliente")!;
    expect(c.linhas[0]).not.toHaveProperty("renda_bruta");
    expect(c.linhas[0]).not.toHaveProperty("estado_civil");
    expect(c.linhas[0]).toHaveProperty("cpf_cnpj", "12345678909");
    expect(c.colunasOmitidas).toEqual(expect.arrayContaining(["renda_bruta", "estado_civil"]));
    expect(d.documentos.map((x) => x.filename)).toEqual(["nota.pdf"]);
    expect(d.asoOmitidos).toBe(1);
    expect(d.sequencias).toEqual([{ entidade: "despesa", prefixo: "PED", usaPrefixo: true, digitos: 6, proximo: 42 }]);
  });

  it("nenhuma escrita: a contagem de todas as tabelas do pacote é a mesma antes e depois", async () => {
    const antes = await contagem();
    const progresso: number[] = [];
    await extrairDados(tenantId, H1, (feitas) => void progresso.push(feitas));
    expect(await contagem()).toEqual(antes);
    expect(progresso.at(-1)).toBe(TABELAS_DO_PACOTE.length);
  });

  it("8.1 — o que mudou depois do último backup: só contagem, só do semestre", async () => {
    const corte = new Date();
    await new Promise((ok) => setTimeout(ok, 20));
    const [v] = await db.select().from(schema.versions).where(eq(schema.versions.tenantId, tenantId));
    await db.insert(schema.despesas).values({ tenantId, versionId: v.id, valor: "7", categoriaDre: "Custo Variável", status: "Pago", competencia: "04/2026" });
    await db.insert(schema.despesas).values({ tenantId, versionId: v.id, valor: "8", categoriaDre: "Custo Variável", status: "Pago", competencia: "09/2026" });
    const m = await mudancasDesde(tenantId, H1, corte);
    expect(m).toContainEqual({ tabela: "despesa", criadas: 1, alteradas: 0 });
    expect(m.find((x) => x.tabela === "cliente")).toBeUndefined();
  });
});
