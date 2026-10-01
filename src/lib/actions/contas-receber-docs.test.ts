import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt K, PR K-3 — anexos da conta a receber (6.1–6.3). Integração: só com
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

describe.skipIf(!HAS_DB)("Contas a Receber — anexos (Prompt K, PR K-3)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { createContaReceber, addContaReceberDocs, deleteContaReceberDoc } = await import("./contas-receber");
  const { getDocumentsByContasReceber } = await import("@/lib/queries");
  let tenantId = "";
  let projectId = "";
  let contaId = "";
  const fd = (campos: Record<string, string | File | File[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) {
      if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
      else f.set(k, v);
    }
    return f;
  };
  const arquivo = (nome: string, bytes = 10) => new File([new Uint8Array(bytes)], nome, { type: "application/pdf" });

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "cr-K3" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA K3" }).returning();
    projectId = p.id;
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") };
    const r = await createContaReceber(fd({ projectId, tipo: "Sinal", valor: "100", vencimento: "10/15/2026" }));
    contaId = (r as { id: string }).id;
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("6.2 · anexa vários arquivos à conta (tipo, obra herdada), com auditoria; recusa conta alheia, sem arquivo e arquivo grande", async () => {
    expect(await addContaReceberDocs(fd({ contaReceberId: "00000000-0000-0000-0000-000000000000", file: arquivo("x.pdf") }))).toEqual({ ok: false, error: expect.stringMatching(/não encontrada/) });
    expect(await addContaReceberDocs(fd({ contaReceberId: contaId }))).toEqual({ ok: false, error: expect.stringMatching(/ao menos um arquivo/) });
    expect(await addContaReceberDocs(fd({ contaReceberId: contaId, file: arquivo("grande.pdf", 11 * 1024 * 1024) }))).toEqual({ ok: false, error: expect.stringMatching(/excede 10 MB/) });
    expect(await addContaReceberDocs(fd({ contaReceberId: contaId, tipo: "Boleto", file: [arquivo("boleto.pdf"), arquivo("comprovante.pdf")] }))).toEqual({ ok: true, added: 2 });
    const docs = await getDocumentsByContasReceber(tenantId, [contaId]);
    expect(docs.map((d) => d.filename).sort()).toEqual(["boleto.pdf", "comprovante.pdf"]);
    expect(docs.every((d) => d.contaReceberId === contaId && d.projectId === projectId && d.tipo === "Boleto")).toBe(true);
    expect(enviados).toHaveLength(2);
    const [l] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "document.upload")));
    expect(l.entity).toBe("conta_receber");
    expect(l.meta).toMatchObject({ qtd: 2, tipo: "Boleto" });
  });

  it("6.3 · remover tira só o vínculo (o objeto fica) e a auditoria guarda nome e chave; anexo de outra origem não é removido por aqui", async () => {
    const [doc] = await getDocumentsByContasReceber(tenantId, [contaId]);
    expect(await deleteContaReceberDoc(doc.id)).toEqual({ ok: true, id: doc.id });
    expect(await getDocumentsByContasReceber(tenantId, [contaId])).toHaveLength(1);
    const [l] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "document.unlink")));
    expect(l.meta).toMatchObject({ documentId: doc.id, filename: doc.filename, storageKey: doc.storageKey });
    expect(enviados).toContain(doc.storageKey); // o objeto continua "no storage"
    // Documento do projeto (sem conta) não é alvo desta action.
    const [outro] = await db.insert(schema.documents).values({ tenantId, projectId, storageKey: "k/outro", filename: "contrato-obra.pdf" }).returning();
    expect(await deleteContaReceberDoc(outro.id)).toEqual({ ok: false, error: expect.stringMatching(/não encontrado/) });
    expect(await deleteContaReceberDoc("00000000-0000-0000-0000-000000000000")).toEqual({ ok: false, error: expect.stringMatching(/não encontrado/) });
  });

  it("sem permissão de editar: recusa com mensagem", async () => {
    ctxRef.current = { ...(ctxRef.current as object), perms: { ...defaultPermissions("owner"), contasreceber: { ver: true, criar: true, editar: false, excluir: true } } };
    expect(await addContaReceberDocs(fd({ contaReceberId: contaId, file: arquivo("x.pdf") }))).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
  });
});
