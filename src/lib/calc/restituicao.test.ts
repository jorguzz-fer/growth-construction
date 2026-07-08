import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { statusRestituicao, saldoPendente } from "./restituicao";

describe("statusRestituicao / saldoPendente", () => {
  it("sem restituição → aguardando; saldo = total", () => {
    expect(statusRestituicao(10000, 0)).toBe("Aguardando restituição");
    expect(saldoPendente(10000, 0)).toBe(10000);
  });
  it("restituição parcial", () => {
    expect(statusRestituicao(10000, 4000)).toBe("Parcialmente restituído");
    expect(saldoPendente(10000, 4000)).toBe(6000);
  });
  it("restituição integral", () => {
    expect(statusRestituicao(10000, 10000)).toBe("Restituído");
    expect(saldoPendente(10000, 10000)).toBe(0);
  });
});

// Integração: valida as invariantes contábeis (DRE 1×, caixa só na restituição).
const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)("Restituição — invariantes contábeis (integração)", () => {
  it("despesa 1× na DRE; saída de caixa só na restituição (parcial e integral)", async () => {
    const { db, schema } = await import("../db");
    const [t] = await db.insert(schema.tenants).values({ name: "t-restituicao" }).returning();
    try {
      const [p] = await db.insert(schema.projects).values({ tenantId: t.id, name: "P" }).returning();
      const [v] = await db
        .insert(schema.versions)
        .values({ projectId: p.id, tenantId: t.id, key: "atual", kind: "atual", label: "Atual", color: "#000" })
        .returning();

      // Despesa paga por terceiro (reconhecida na DRE, categoria Custo Fixo).
      const [desp] = await db
        .insert(schema.despesas)
        .values({ versionId: v.id, tenantId: t.id, categoriaDre: "Custo Fixo", valor: "10000", competencia: "01/2026", pagoPorTerceiro: true })
        .returning();
      const [dt] = await db
        .insert(schema.despesaTerceiros)
        .values({ tenantId: t.id, despesaId: desp.id, valorTotal: "10000" })
        .returning();

      // DRE: soma de despesas por categoria = 10000 (uma vez).
      const despRows = await db.select().from(schema.despesas).where(eq(schema.despesas.versionId, v.id));
      const dreCustoFixo = despRows.reduce((a, d) => a + Number(d.valor), 0);
      expect(dreCustoFixo).toBe(10000);

      // Caixa: nenhuma saída ainda.
      let cash = await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.versionId, v.id));
      expect(cash.reduce((a, c) => a + Number(c.valor), 0)).toBe(0);

      // Restituição parcial 4000.
      await db.insert(schema.restituicoes).values({ tenantId: t.id, despesaTerceiroId: dt.id, valor: "4000", dataRestituicao: "02/10/2026" });
      await db.insert(schema.cashEntries).values({ versionId: v.id, tenantId: t.id, valor: "-4000", data: "02/10/2026", cat: "restituicao", rec: true });
      await db.update(schema.despesaTerceiros).set({ valorRestituido: "4000", status: statusRestituicao(10000, 4000) }).where(eq(schema.despesaTerceiros.id, dt.id));

      // DRE inalterada (nenhuma nova despesa).
      const despRows2 = await db.select().from(schema.despesas).where(eq(schema.despesas.versionId, v.id));
      expect(despRows2.reduce((a, d) => a + Number(d.valor), 0)).toBe(10000);
      // Caixa: saída = -4000 (só a restituição).
      cash = await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.versionId, v.id));
      expect(cash.reduce((a, c) => a + Number(c.valor), 0)).toBe(-4000);

      // Restituição integral (mais 6000).
      await db.insert(schema.cashEntries).values({ versionId: v.id, tenantId: t.id, valor: "-6000", data: "03/10/2026", cat: "restituicao", rec: true });
      await db.update(schema.despesaTerceiros).set({ valorRestituido: "10000", status: statusRestituicao(10000, 10000) }).where(eq(schema.despesaTerceiros.id, dt.id));
      cash = await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.versionId, v.id));
      expect(cash.reduce((a, c) => a + Number(c.valor), 0)).toBe(-10000);

      const [dtFinal] = await db.select().from(schema.despesaTerceiros).where(eq(schema.despesaTerceiros.id, dt.id));
      expect(dtFinal.status).toBe("Restituído");
    } finally {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, t.id));
    }
  });
});
