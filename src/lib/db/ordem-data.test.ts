import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

/**
 * Prompt I, PR I-6 — ordenação cronológica sobre data em texto (§25, §37).
 * Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("ordem cronológica sobre data em texto (Prompt I, §37)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { chaveCompetencia, chaveDataBR } = await import("./ordem-data");
  const { getCash, getDespesas, getMedicoes, getContasReceber } = await import("@/lib/queries");
  let tenantId = "";
  let projectId = "";
  let versionId = "";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "ordem-I6" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA I6" }).returning();
    projectId = p.id;
    const [v] = await db
      .insert(schema.versions)
      .values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" })
      .returning();
    versionId = v.id;
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("chaves em SQL: virada de ano, dia sem zero à esquerda, inválida e nula vão para o fim", async () => {
    const datas = ["01/01/2026", "12/31/2025", "2/5/2026", "bobagem", null, "11/30/2025"];
    for (const d of datas) {
      await db.insert(schema.cashEntries).values({ tenantId, versionId, data: d, descricao: `d:${d}`, valor: "1" });
    }
    const rows = await db
      .select({ data: schema.cashEntries.data, chave: chaveDataBR(schema.cashEntries.data) })
      .from(schema.cashEntries)
      .where(eq(schema.cashEntries.tenantId, tenantId))
      .orderBy(asc(chaveDataBR(schema.cashEntries.data)), asc(schema.cashEntries.id));
    expect(rows.slice(0, 4).map((r) => r.data)).toEqual(["11/30/2025", "12/31/2025", "01/01/2026", "2/5/2026"]);
    expect(rows.slice(0, 4).map((r) => r.chave)).toEqual(["20251130", "20251231", "20260101", "20260205"]);
    // As duas sem data válida ficam por último, com chave nula.
    expect(rows.slice(4).map((r) => r.chave)).toEqual([null, null]);
    expect(new Set(rows.slice(4).map((r) => r.data))).toEqual(new Set(["bobagem", null]));
    // O leitor de caixa devolve a mesma ordem.
    expect((await getCash(versionId)).slice(0, 3).map((r) => r.data)).toEqual(["11/30/2025", "12/31/2025", "01/01/2026"]);
  });

  it("competência MM/YYYY: dezembro de 2025 antes de janeiro de 2026 (despesas e medições)", async () => {
    for (const c of ["01/2026", "12/2025", "1/2025"]) {
      await db.insert(schema.despesas).values({ tenantId, versionId, categoriaDre: "Custo Fixo", valor: "1", status: "A pagar", competencia: c });
      await db.insert(schema.medicoes).values({ tenantId, versionId, competencia: c, grupoCode: "1", grupoName: "G", valor: "1" });
    }
    const [s] = await db
      .select({ chave: chaveCompetencia(schema.despesas.competencia) })
      .from(schema.despesas)
      .where(eq(schema.despesas.competencia, "1/2025"));
    expect(s.chave).toBe("202501");
    expect((await getDespesas(versionId)).map((d) => d.competencia)).toEqual(["1/2025", "12/2025", "01/2026"]);
    expect((await getMedicoes(tenantId, versionId)).map((m) => m.competencia)).toEqual(["1/2025", "12/2025", "01/2026"]);
  });

  it("contas a receber por vencimento real", async () => {
    for (const v of ["01/15/2026", "12/20/2025"]) {
      await db.insert(schema.contasReceber).values({ tenantId, projectId, valor: "1", vencimento: v });
    }
    expect((await getContasReceber(tenantId)).map((c) => c.vencimento)).toEqual(["12/20/2025", "01/15/2026"]);
  });
});
