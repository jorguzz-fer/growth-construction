import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/** Prompt AK2 — os filtros da Auditoria no banco: usuário, sistema, entidade, ação e período. Só com DATABASE_URL. */
const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)("Prompt AK2 · getAuditLog com filtros", async () => {
  const { db, schema } = await import("@/lib/db");
  const { getAuditLog, getEntidadesDaAuditoria } = await import("@/lib/queries");
  let tenantId = "";
  const U = "ak2-messias";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-ak2" }).returning();
    tenantId = t.id;
    await db.insert(schema.users).values({ id: U, email: "messias@ak2.local", name: "Messias" }).onConflictDoNothing();
    await db.insert(schema.auditLog).values([
      { tenantId, userId: U, action: "despesa.create", entity: "despesa", createdAt: new Date("2026-10-02T10:00:00") },
      { tenantId, userId: U, action: "incc.update", entity: "incc_rate", createdAt: new Date("2026-09-15T10:00:00") },
      { tenantId, userId: null, action: "despesa.sync", entity: "despesa", createdAt: new Date("2026-10-10T10:00:00") },
    ]);
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    await db.delete(schema.users).where(eq(schema.users.id, U));
  });

  const acoes = async (f: Parameters<typeof getAuditLog>[2]) => (await getAuditLog(tenantId, 50, f)).map((a) => a.action).sort();

  it("só o que o Messias lançou", async () => {
    expect(await acoes({ usuario: U })).toEqual(["despesa.create", "incc.update"]);
  });
  it("eventos do sistema (sem usuário)", async () => {
    expect(await acoes({ usuario: "sistema" })).toEqual(["despesa.sync"]);
  });
  it("por entidade, por trecho da ação e por período (inclusive)", async () => {
    expect(await acoes({ entidade: "despesa" })).toEqual(["despesa.create", "despesa.sync"]);
    expect(await acoes({ acao: "INCC" })).toEqual(["incc.update"]);
    expect(await acoes({ de: "2026-10-01", ate: "2026-10-02" })).toEqual(["despesa.create"]);
  });
  it("as entidades do log, para o filtro", async () => {
    expect(await getEntidadesDaAuditoria(tenantId)).toEqual(["despesa", "incc_rate"]);
  });
});
