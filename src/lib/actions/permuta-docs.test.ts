import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, asc, eq } from "drizzle-orm";

/**
 * Prompt P, PR P-5 — documentos do ativo (6.2–6.7). Integração: só com
 * DATABASE_URL. O R2 é substituído: nenhum arquivo sai daqui.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
const enviados: string[] = [];
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/r2", () => ({
  isR2Configured: () => true,
  putObject: async (key: string) => void enviados.push(key),
  readUrl: async (key: string) => `https://r2.local/${key}`,
}));

describe.skipIf(!HAS_DB)("Permuta — documentos do ativo (Prompt P, PR P-5)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addPermuta, addPermutaDocs, deletePermutaDoc } = await import("./receitas");
  const { getDocumentsByPermuta } = await import("@/lib/queries");
  let tenantId = "";
  let outroTenantId = "";
  let projectId = "";
  let permutaId = "";
  let tenant: unknown;
  let projects: unknown[] = [];
  const fd = (campos: Record<string, string | File | File[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) {
      if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
      else f.set(k, v);
    }
    return f;
  };
  const arquivo = (nome: string, bytes = 10) => new File([new Uint8Array(bytes)], nome, { type: "application/pdf" });
  const comPerms = (role: string) => {
    ctxRef.current = { tenant, projects, userId: null, userEmail: "quem@teste", role, perms: defaultPermissions(role as "owner") };
  };
  const TIPO = "Contrato de permuta";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "perm-P5" }).returning();
    tenantId = t.id;
    tenant = t;
    const [o] = await db.insert(schema.tenants).values({ name: "perm-P5-outro" }).returning();
    outroTenantId = o.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA P5" }).returning();
    projectId = p.id;
    projects = [p];
    await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" });
    comPerms("owner");
    const r = await addPermuta(fd({ projectId, unitCode: "A-1", cliente: "Maria", dataRecebimento: "09/15/2026", tipo: "Imóvel", estimado: "80000" }));
    permutaId = (r as { id: string }).id;
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    if (outroTenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, outroTenantId));
  });

  it("6.6/6.7 · tipo obrigatório da lista, arquivo obrigatório, tamanho máximo, ativo da empresa, permissão de editar no servidor", async () => {
    expect(await addPermutaDocs(fd({ permutaId, tipo: "Foto", file: arquivo("x.pdf") }))).toEqual({ ok: false, error: expect.stringMatching(/tipo do documento/) });
    expect(await addPermutaDocs(fd({ permutaId, tipo: TIPO }))).toEqual({ ok: false, error: expect.stringMatching(/ao menos um arquivo/) });
    expect(await addPermutaDocs(fd({ permutaId, tipo: TIPO, file: arquivo("grande.pdf", 11 * 1024 * 1024) }))).toEqual({ ok: false, error: expect.stringMatching(/excede 10 MB/) });
    expect(await addPermutaDocs(fd({ permutaId: "00000000-0000-0000-0000-000000000000", tipo: TIPO, file: arquivo("x.pdf") }))).toEqual({ ok: false, error: expect.stringMatching(/não encontrado/) });
    comPerms("viewer");
    expect(await addPermutaDocs(fd({ permutaId, tipo: TIPO, file: arquivo("x.pdf") }))).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    comPerms("owner");
    expect(await getDocumentsByPermuta(tenantId, permutaId)).toHaveLength(0);
    expect(enviados).toHaveLength(0);
  });

  it("6.4 · mesmo tipo gera versão nova e preserva a anterior; tipo diferente NÃO herda a versão; obra e unidade vão no documento", async () => {
    expect(await addPermutaDocs(fd({ permutaId, tipo: TIPO, file: arquivo("contrato-v1.pdf") }))).toEqual({ ok: true, added: 1 });
    expect(await addPermutaDocs(fd({ permutaId, tipo: TIPO, file: arquivo("contrato-v2.pdf") }))).toEqual({ ok: true, added: 1 });
    expect(await addPermutaDocs(fd({ permutaId, tipo: "Recibo", file: arquivo("recibo.pdf") }))).toEqual({ ok: true, added: 1 });
    expect(await addPermutaDocs(fd({ permutaId, tipo: "Laudo de avaliação", file: [arquivo("laudo-a.pdf"), arquivo("laudo-b.pdf")] }))).toEqual({ ok: true, added: 2 });
    const docs = await getDocumentsByPermuta(tenantId, permutaId);
    const porNome = Object.fromEntries(docs.map((d) => [d.filename, d.versao]));
    expect(porNome).toEqual({ "contrato-v1.pdf": 1, "contrato-v2.pdf": 2, "recibo.pdf": 1, "laudo-a.pdf": 1, "laudo-b.pdf": 2 });
    expect(docs.every((d) => d.permutaId === permutaId && d.projectId === projectId && d.unitCode === "A-1")).toBe(true);
    expect(enviados).toHaveLength(5);
    expect(enviados.every((k) => k.startsWith(`tenants/${tenantId}/permuta/${permutaId}/`))).toBe(true);
    // ordem explícita: sem ORDER BY, `logs[0]` variava sob carga (intermitente)
    const logs = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "permuta.doc.upload"))).orderBy(asc(schema.auditLog.createdAt), asc(schema.auditLog.id));
    expect(logs).toHaveLength(4);
    expect(logs[0].meta).toMatchObject({ tipo: TIPO, arquivos: [{ filename: "contrato-v1.pdf", versao: 1 }] });
  });

  it("6.5 · remover desfaz só o vínculo (a linha sai, o storage não é tocado) e registra nome, chave, tipo e versão; documento de outra empresa não é alcançado", async () => {
    const docs = await getDocumentsByPermuta(tenantId, permutaId);
    const v1 = docs.find((d) => d.filename === "contrato-v1.pdf")!;
    expect(await deletePermutaDoc(v1.id)).toEqual({ ok: true, id: v1.id });
    expect(await deletePermutaDoc(v1.id)).toEqual({ ok: false, error: expect.stringMatching(/não encontrado/) });
    const restantes = await getDocumentsByPermuta(tenantId, permutaId);
    expect(restantes.map((d) => d.filename).sort()).toEqual(["contrato-v2.pdf", "laudo-a.pdf", "laudo-b.pdf", "recibo.pdf"]);
    const [l] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "permuta.doc.unlink")));
    expect(l.meta).toMatchObject({ documentId: v1.id, filename: "contrato-v1.pdf", storageKey: v1.storageKey, tipo: TIPO, versao: 1 });
    // Documento gravado em outra empresa, ligado a este ativo por engano: a action não o alcança.
    const [alheio] = await db.insert(schema.documents).values({ tenantId: outroTenantId, permutaId, storageKey: "k/alheio", filename: "alheio.pdf", tipo: TIPO }).returning();
    expect(await deletePermutaDoc(alheio.id)).toEqual({ ok: false, error: expect.stringMatching(/não encontrado/) });
    expect(await getDocumentsByPermuta(tenantId, permutaId)).toHaveLength(4);
    // A próxima versão do contrato continua contando a partir da que ficou (v2 → v3).
    expect(await addPermutaDocs(fd({ permutaId, tipo: TIPO, file: arquivo("contrato-v3.pdf") }))).toEqual({ ok: true, added: 1 });
    expect((await getDocumentsByPermuta(tenantId, permutaId)).find((d) => d.filename === "contrato-v3.pdf")?.versao).toBe(3);
  });
});
