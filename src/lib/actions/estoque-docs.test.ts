import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/** Prompt Y, PR Y-2 — documentos do movimento (4-A). Integração: só com DATABASE_URL. O R2 é substituído. */
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

describe.skipIf(!HAS_DB)("Estoque — documentos do movimento (Prompt Y, 4-A)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addStockItem, addStockMovement, addStockMovementDocs, deleteStockMovementDoc, estornarMovimento } = await import("./estoque");
  const { getDocumentsByStockMovements } = await import("@/lib/queries");
  let tenant: typeof schema.tenants.$inferSelect;
  let projectId = "";
  let movId = "";
  const fd = (campos: Record<string, string | File | File[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) {
      if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
      else f.set(k, v);
    }
    return f;
  };
  const arquivo = (nome: string, type = "application/pdf", bytes = 10) => new File([new Uint8Array(bytes)], nome, { type });
  const docsDo = (id: string) => getDocumentsByStockMovements(tenant.id, [id]);

  beforeAll(async () => {
    [tenant] = await db.insert(schema.tenants).values({ name: "estoque-Y2" }).returning();
    const [p] = await db.insert(schema.projects).values({ tenantId: tenant.id, name: "OBRA Y2" }).returning();
    const [v] = await db.insert(schema.versions).values({ projectId: p.id, tenantId: tenant.id, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    projectId = p.id;
    const [d] = await db.insert(schema.despesas).values({ versionId: v.id, tenantId: tenant.id, valor: "500", categoriaDre: "Custo Variável", competencia: "09/2026", vencimento: "09/10/2026", status: "A pagar", numDoc: "PED-Y2" }).returning();
    ctxRef.current = { tenant, projects: [{ id: projectId }], userId: null, userEmail: "y2@teste", role: "owner", perms: defaultPermissions("owner") };
    const item = await addStockItem(fd({ nome: "Tijolo", unidade: "un", custoUnit: "1.2" }));
    const r = await addStockMovement(fd({ itemId: (item as { ok: true; id: string }).id, tipo: "entrada", quantidade: "100", despesaId: d.id, origem: "Compra" }));
    movId = (r as { ok: true; id: string }).id;
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  });

  it("4-A.4 / 4-A.5 — tipo da lista, arquivo obrigatório, limite; várias imagens de uma vez", async () => {
    expect(await addStockMovementDocs(fd({ movimentoId: movId, tipo: "Contrato", file: arquivo("x.pdf") }))).toEqual({ ok: false, error: expect.stringMatching(/tipo do documento/) });
    expect(await addStockMovementDocs(fd({ movimentoId: movId, tipo: "Foto do recebimento" }))).toEqual({ ok: false, error: expect.stringMatching(/ao menos um arquivo/) });
    expect(await addStockMovementDocs(fd({ movimentoId: movId, tipo: "Foto do recebimento", file: arquivo("grande.jpg", "image/jpeg", 11 * 1024 * 1024) }))).toEqual({ ok: false, error: expect.stringMatching(/excede 10 MB/) });
    expect(await addStockMovementDocs(fd({ movimentoId: movId, tipo: "Foto do recebimento", file: [arquivo("a.jpg", "image/jpeg"), arquivo("b.jpg", "image/jpeg"), arquivo("c.jpg", "image/jpeg")] }))).toEqual({ ok: true, added: 3 }); // 13c
    const docs = await docsDo(movId);
    expect(docs.map((d) => [d.filename, d.versao, d.contentType]).sort()).toEqual([["a.jpg", 1, "image/jpeg"], ["b.jpg", 2, "image/jpeg"], ["c.jpg", 3, "image/jpeg"]]);
    expect(docs.every((d) => d.stockMovementId === movId)).toBe(true);
    expect(enviados.every((k) => k.startsWith(`tenants/${tenant.id}/estoque/${movId}/`))).toBe(true);
  });

  it("13b / 4-A.7 — mesmo tipo gera versão nova e preserva a anterior; tipo diferente não herda", async () => {
    expect(await addStockMovementDocs(fd({ movimentoId: movId, tipo: "Nota do fornecedor", file: arquivo("nf.pdf") }))).toEqual({ ok: true, added: 1 });
    expect(await addStockMovementDocs(fd({ movimentoId: movId, tipo: "Nota do fornecedor", file: arquivo("nf-corrigida.pdf") }))).toEqual({ ok: true, added: 1 });
    expect(await addStockMovementDocs(fd({ movimentoId: movId, tipo: "Romaneio ou canhoto de entrega", file: arquivo("canhoto.pdf") }))).toEqual({ ok: true, added: 1 });
    const porNome = Object.fromEntries((await docsDo(movId)).map((d) => [d.filename, d.versao]));
    expect(porNome).toMatchObject({ "nf.pdf": 1, "nf-corrigida.pdf": 2, "canhoto.pdf": 1 });
  });

  it("13d / 4-A.8 — remover desfaz só o vínculo, registra nome e chave, e não apaga o arquivo", async () => {
    const antes = enviados.length;
    const nf = (await docsDo(movId)).find((d) => d.filename === "nf.pdf")!;
    expect(await deleteStockMovementDoc(nf.id)).toEqual({ ok: true, id: nf.id });
    expect(await deleteStockMovementDoc(nf.id)).toEqual({ ok: false, error: expect.stringMatching(/não encontrado/) });
    expect((await docsDo(movId)).some((d) => d.id === nf.id)).toBe(false);
    expect(enviados.length).toBe(antes); // nada apagado do storage (o mock nem tem remoção)
    const [l] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenant.id), eq(schema.auditLog.action, "estoque.doc.unlink")));
    expect(l.meta).toMatchObject({ documentId: nf.id, filename: "nf.pdf", storageKey: nf.storageKey, tipo: "Nota do fornecedor", versao: 1 });
  });

  it("13a / 4-A.9 — estornar o movimento não remove os documentos; eles seguem no original", async () => {
    const r = await estornarMovimento(movId, "nota lançada em duplicidade");
    expect(r).toMatchObject({ ok: true });
    expect((await docsDo(movId)).length).toBe(5);
    expect((await docsDo((r as { ok: true; id: string }).id)).length).toBe(0);
  });
});
