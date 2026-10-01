import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt B, 26/29 — "Extrair dados de documentos" só lê documento cujo
 * tenant_id é o do usuário E cujo project_id é o projeto em tela, validado
 * no banco; exige `editar`; não grava nada. Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
const lidos: string[] = [];
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {}, delete: () => {} }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => true, putObject: async () => {}, readUrl: async () => "https://r2/x", getObjectBytes: async (k: string) => { lidos.push(k); return new Uint8Array([1]); } }));
vi.mock("@/lib/ai/client", () => ({ isAiConfigured: () => true }));
vi.mock("@/lib/ai/projeto-extract", () => ({
  extractProjetoFromDocuments: async () => ({ nome: "", endereco: "Av. Lida, 1", cep: "11700000", municipio: "", uf: "", dataInicio: "", dataFim: "", valorConstrucao: 500000, valorTerreno: null, custoConstrucao: null, custoTerreno: null, proprietarioTerreno: "", formaPagamentoTerreno: "", baixaConfianca: ["cep"], observacoes: [] }),
}));

describe.skipIf(!HAS_DB)("Prompt B · proposta por documento", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { proporDadosDoProjetoPorDocumento } = await import("./projetos-assistente");
  let tenantId = "";
  let outroTenantId = "";
  let projetoA: typeof schema.projects.$inferSelect;
  let projetoB: typeof schema.projects.$inferSelect;
  let docA = "";
  let docB = "";
  let docOutro = "";
  let docIlegivel = "";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-prop-b" }).returning();
    tenantId = t.id;
    const [t2] = await db.insert(schema.tenants).values({ name: "tenant-prop-b-outro" }).returning();
    outroTenantId = t2.id;
    [projetoA] = await db.insert(schema.projects).values({ tenantId, name: "Obra A", status: "Planejamento", valorConstrucao: "500000" }).returning();
    [projetoB] = await db.insert(schema.projects).values({ tenantId, name: "Obra B", status: "Planejamento" }).returning();
    const [po] = await db.insert(schema.projects).values({ tenantId: outroTenantId, name: "Obra Outro", status: "Planejamento" }).returning();
    const docs = await db.insert(schema.documents).values([
      { tenantId, projectId: projetoA.id, storageKey: "a.pdf", filename: "contrato-a.pdf", contentType: "application/pdf", tipo: "Contrato" },
      { tenantId, projectId: projetoB.id, storageKey: "b.pdf", filename: "contrato-b.pdf", contentType: "application/pdf", tipo: "Contrato" },
      { tenantId: outroTenantId, projectId: po.id, storageKey: "o.pdf", filename: "contrato-o.pdf", contentType: "application/pdf", tipo: "Contrato" },
      { tenantId, projectId: projetoA.id, storageKey: "a.docx", filename: "memorial.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", tipo: "Outros" },
    ]).returning({ id: schema.documents.id });
    [docA, docB, docOutro, docIlegivel] = docs.map((d) => d.id);
    ctxRef.current = { tenant: t, projects: [projetoA, projetoB], userId: null, userEmail: "t@t", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    for (const id of [tenantId, outroTenantId]) if (id) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });

  it("documento do projeto em tela: devolve a proposta, só com o que difere, sem gravar", async () => {
    const r = await proporDadosDoProjetoPorDocumento(projetoA.id, docA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // valorConstrucao lido = 500000 = atual → não aparece; endereco e cep aparecem; cep marcado conferir
    expect(r.proposta.campos.map((c) => `${c.campo}=${c.proposto}${c.conferir ? "!" : ""}`)).toEqual(["endereco=Av. Lida, 1", "cep=11700-000!"]);
    expect(lidos).toEqual(["a.pdf"]);
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projetoA.id));
    expect(p.endereco).toBeNull();
    expect(p.cep).toBeNull();
  });

  it("documento de OUTRO projeto do mesmo tenant é recusado; de outro tenant também", async () => {
    expect(await proporDadosDoProjetoPorDocumento(projetoA.id, docB)).toEqual({ ok: false, error: "Documento não encontrado neste projeto." });
    expect(await proporDadosDoProjetoPorDocumento(projetoA.id, docOutro)).toEqual({ ok: false, error: "Documento não encontrado neste projeto." });
    expect((await proporDadosDoProjetoPorDocumento("00000000-0000-0000-0000-000000000000", docA)).ok).toBe(false);
    expect(lidos).toEqual(["a.pdf"]);
  });

  it("documento ilegível é recusado; sem permissão de editar também", async () => {
    expect((await proporDadosDoProjetoPorDocumento(projetoA.id, docIlegivel))).toMatchObject({ ok: false, error: expect.stringMatching(/PDF ou imagem/) });
    ctxRef.current = { ...(ctxRef.current as object), perms: { ...defaultPermissions("owner"), projeto: { ver: true, criar: false, editar: false, excluir: false } } };
    expect((await proporDadosDoProjetoPorDocumento(projetoA.id, docA))).toMatchObject({ ok: false, error: expect.stringMatching(/Sem permissão/) });
    expect(lidos).toEqual(["a.pdf"]);
  });
});
