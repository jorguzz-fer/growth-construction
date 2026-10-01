import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/** Prompt S, 6.1 / BS-3 — o Repositório não multiplica a linha do arquivo. Integração. */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Repositório sem linha duplicada (Prompt S, PR S-4)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { getRepositorio } = await import("@/lib/queries");
  let tenantId = "";
  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "repo-S4" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA S4" }).returning();
    const [v] = await db.insert(schema.versions).values({ projectId: p.id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    const [d] = await db.insert(schema.despesas).values({ tenantId, versionId: v.id, valor: "10", categoriaDre: "Custo Fixo", numDoc: "PED-S4" }).returning();
    await db.insert(schema.documentosFiscais).values([
      { tenantId, despesaId: d.id, tipo: "NFE", numero: "111" },
      { tenantId, despesaId: d.id, tipo: "NFE", numero: "222" },
    ]);
    await db.insert(schema.documents).values({ tenantId, despesaId: d.id, storageKey: "k", filename: "nota.pdf" });
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });
  it("13 — uma despesa com duas notas e um arquivo gera UMA linha, e o contador confere", async () => {
    const rows = await getRepositorio(tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0].filename).toBe("nota.pdf");
    expect(["111", "222"]).toContain(rows[0].numeroDocumentoFiscal);
  });
});
