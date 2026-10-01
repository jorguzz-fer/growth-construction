import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt V, V-4 — documentos da medição (seção 5) e assistente (seção 6):
 * 11.15 anexar do mesmo tipo gera versão nova, tipo diferente não herda;
 * 5.5 remover desfaz o vínculo e preserva registro e arquivo; 0.5.5 quem só
 * vê as próprias só anexa nas próprias; 11.16 o assistente não grava.
 * Integração: só com DATABASE_URL. R2 e IA simulados.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
const enviados: string[] = [];
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {}, delete: () => {} }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/r2", () => ({
  isR2Configured: () => true,
  putObject: async (key: string) => void enviados.push(key),
  getObjectBytes: async () => new Uint8Array([1, 2, 3]),
  readUrl: async (key: string) => `https://r2.local/${key}`,
}));
vi.mock("@/lib/ai/client", () => ({ isAiConfigured: () => false, aiClient: () => null, createMessageWithFallback: async () => null }));

describe.skipIf(!HAS_DB)("Prompt V · V-4 documentos da medição e assistente", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { uploadMedicaoDoc, unlinkMedicaoDoc } = await import("./medicao-docs");
  const { lerLaudoDaMedicao } = await import("./medicao-assistente");
  const { getDocumentosDasMedicoes } = await import("@/lib/queries");
  let tenantId = "";
  let atualId = "";
  let medicaoId = "";
  let tenant: typeof schema.tenants.$inferSelect;
  let projetos: (typeof schema.projects.$inferSelect)[] = [];
  const u1 = "eng-doc-1-" + Date.now();
  const u2 = "eng-doc-2-" + Date.now();
  const como = (role: string, userId: string) => {
    ctxRef.current = { tenant, projects: projetos, userId, userEmail: `${userId}@t`, role, perms: defaultPermissions(role as "admin") };
  };
  const fd = (campos: Record<string, string>, nome = "laudo.pdf") => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    f.set("file", new File([new Uint8Array([37, 80, 68, 70])], nome, { type: "application/pdf" }));
    return f;
  };
  const docs = () => db.select().from(schema.documents).where(eq(schema.documents.tenantId, tenantId)).orderBy(schema.documents.uploadedAt);

  beforeAll(async () => {
    [tenant] = await db.insert(schema.tenants).values({ name: "tenant-prompt-v4" }).returning();
    tenantId = tenant.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "Obra V4", status: "Em andamento" }).returning();
    projetos = [p];
    const [a] = await db.insert(schema.versions).values({ tenantId, projectId: p.id, key: "atual", kind: "atual", label: "Atual", color: "#000", isDefault: true }).returning();
    atualId = a.id;
    await db.insert(schema.users).values([{ id: u1, name: "Eng Um", email: `${u1}@t` }, { id: u2, name: "Eng Dois", email: `${u2}@t` }]);
    const [m] = await db.insert(schema.medicoes).values({ tenantId, versionId: atualId, competencia: "09/2026", grupoCode: "1", grupoName: "G1", valor: "100", createdBy: u1 }).returning();
    medicaoId = m.id;
    como("admin", u1);
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    await db.delete(schema.users).where(eq(schema.users.id, u1));
    await db.delete(schema.users).where(eq(schema.users.id, u2));
  });

  it("11.15 — mesmo tipo gera versão nova; tipo diferente não herda; tipo inválido recusa", async () => {
    expect(await uploadMedicaoDoc(fd({ medicaoId, tipo: "Laudo de medição" }))).toMatchObject({ ok: true, versao: 1 });
    expect(await uploadMedicaoDoc(fd({ medicaoId, tipo: "Laudo de medição" }, "laudo2.pdf"))).toMatchObject({ ok: true, versao: 2 });
    expect(await uploadMedicaoDoc(fd({ medicaoId, tipo: "PLS" }, "pls.pdf"))).toMatchObject({ ok: true, versao: 1 });
    expect(await uploadMedicaoDoc(fd({ medicaoId, tipo: "Contrato" }))).toMatchObject({ ok: false, error: expect.stringMatching(/tipo/) });
    const lista = (await getDocumentosDasMedicoes(tenantId, atualId)).get(medicaoId) ?? [];
    expect(lista.map((d) => [d.tipo, d.versao])).toEqual([["Laudo de medição", 1], ["Laudo de medição", 2], ["PLS", 1]]);
    expect(enviados).toHaveLength(3);
    expect(lista.every((d) => d.projectId === projetos[0].id)).toBe(true);
  });

  it("5.5 — remover desfaz o vínculo: registro e arquivo ficam; auditoria com nome e chave", async () => {
    const [laudo1] = await docs();
    expect(await unlinkMedicaoDoc(laudo1.id)).toEqual({ ok: true, id: laudo1.id });
    const [depois] = await db.select().from(schema.documents).where(eq(schema.documents.id, laudo1.id));
    expect(depois).toBeDefined();
    expect(depois.medicaoId).toBeNull();
    expect(depois.storageKey).toBe(laudo1.storageKey);
    expect((await getDocumentosDasMedicoes(tenantId, atualId)).get(medicaoId)).toHaveLength(2);
    const [l] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "medicao.doc.unlink")));
    expect(l.meta).toMatchObject({ filename: laudo1.filename, storageKey: laudo1.storageKey, tipo: "Laudo de medição", versao: 1 });
    // segunda remoção do mesmo: já não está na medição
    expect((await unlinkMedicaoDoc(laudo1.id)).ok).toBe(false);
    // a próxima versão do laudo continua contando a partir da maior que FICOU (v2) → v3
    expect(await uploadMedicaoDoc(fd({ medicaoId, tipo: "Laudo de medição" }, "laudo3.pdf"))).toMatchObject({ ok: true, versao: 3 });
  });

  it("0.5.5 — engenheiro só anexa/remove nas próprias medições", async () => {
    como("engenheiro", u2);
    expect(await uploadMedicaoDoc(fd({ medicaoId, tipo: "PLS" }))).toMatchObject({ ok: false, error: expect.stringMatching(/outro usuário/) });
    const [, laudo2] = await docs();
    expect(await unlinkMedicaoDoc(laudo2.id)).toMatchObject({ ok: false, error: expect.stringMatching(/outro usuário/) });
    como("engenheiro", u1);
    expect(await uploadMedicaoDoc(fd({ medicaoId, tipo: "ART/RRT" }, "art.pdf"))).toMatchObject({ ok: true, versao: 1 });
    como("admin", u1);
  });

  it("11.16 — ler o laudo não grava: sem IA devolve erro e nada muda; engenheiro sem o relatório é recusado", async () => {
    const antes = await db.select().from(schema.medicoes).where(eq(schema.medicoes.tenantId, tenantId));
    const [, laudo2] = await docs();
    expect(await lerLaudoDaMedicao(medicaoId, laudo2.id)).toMatchObject({ ok: false, error: expect.stringMatching(/IA não configurado/) });
    expect(await lerLaudoDaMedicao(medicaoId, "00000000-0000-0000-0000-000000000000")).toMatchObject({ ok: false, error: expect.stringMatching(/não encontrado/) });
    como("engenheiro", u1);
    expect(await lerLaudoDaMedicao(medicaoId, laudo2.id)).toMatchObject({ ok: false, error: expect.stringMatching(/Relatório CEF/) });
    como("admin", u1);
    expect(await db.select().from(schema.medicoes).where(eq(schema.medicoes.tenantId, tenantId))).toEqual(antes);
  });
});
