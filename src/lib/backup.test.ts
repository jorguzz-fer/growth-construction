import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/** Prompt AO, Parte 6 — o download registrado e o que muda no aviso e na tabela. Só com DATABASE_URL. */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => false, getObjectBytes: async () => new Uint8Array() }));

describe.skipIf(!HAS_DB)("backup — histórico (Prompt AO, Parte 6)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { listSemesters, hasPendingSemesterBackup } = await import("./backup");
  const { GET } = await import("@/app/(app)/backup/download/route");
  let tenantId = "";
  const hoje = new Date(2026, 9, 2);

  beforeAll(async () => {
    tenantId = (await db.insert(schema.tenants).values({ name: "tenant-backup-ao" }).returning())[0].id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "P" }).returning();
    const [v] = await db.insert(schema.versions).values({ projectId: p.id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    await db.insert(schema.despesas).values({ tenantId, versionId: v.id, categoriaDre: "Custo Variável", valor: "10", status: "Pago", competencia: "03/2026" });
    ctxRef.current = { tenant: { id: tenantId, name: "tenant-backup-ao" }, projects: [p], userId: null, userEmail: "t@t", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("antes do download: semestre encerrado com dados é pendente e nunca foi baixado", async () => {
    const l = await listSemesters(tenantId, hoje);
    expect(l.pendingKey).toBe("2026-H1");
    expect(l.semesters.find((s) => s.key === "2026-H1")?.ultimoBackup).toBeNull();
    expect((await hasPendingSemesterBackup(tenantId, hoje)).has).toBe(true);
  });

  it("o download registra o que o pacote continha; depois dele o aviso some e a tabela mostra quem e quando", async () => {
    const res = await GET(new Request("http://x/backup/download?sem=2026-H1"));
    expect(res.status).toBe(200);
    const [a] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "backup.download")));
    expect(a.meta).toMatchObject({ semestre: "2026-H1", conteudo: { despesas: 1, contasReceber: 0, caixa: 0, documentos: 0 } });
    const l = await listSemesters(tenantId, hoje);
    expect(l.pendingKey).toBeNull();
    expect(l.semesters.find((s) => s.key === "2026-H1")?.ultimoBackup).not.toBeNull();
    expect((await hasPendingSemesterBackup(tenantId, hoje)).has).toBe(false);
  });

  it("nenhuma escrita em dado de negócio: só a linha de auditoria", async () => {
    const [d] = await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId));
    expect(d).toMatchObject({ valor: "10.00", competencia: "03/2026", status: "Pago" });
  });
});
