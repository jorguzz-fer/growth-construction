import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, desc, eq } from "drizzle-orm";

/**
 * Prompt B, B-1 — as actions de Projetos devolvem `{ ok, error }` (38), a
 * data de fim antes do início é recusada só em gravação nova (9), a exclusão
 * exige o nome digitado e grava o inventário (37), a remoção de documento
 * guarda filename/storageKey (13) e a data com dia 25 volta igual (44).
 * Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {}, delete: () => {} }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => true, putObject: async () => {}, readUrl: async () => "https://r2/x", getObjectBytes: async () => new Uint8Array() }));

describe.skipIf(!HAS_DB)("Prompt B · actions de Projetos", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { createProject, updateProject, deleteProject, deleteProjetoDoc, inventarioDoProjeto } = await import("./projects");
  const { getDocumentsByProjects, getInventarioDoProjeto } = await import("@/lib/queries");
  let tenantId = "";
  let tenant: typeof schema.tenants.$inferSelect;
  const base = (projects: unknown[], role = "owner") => ({
    tenant, projects, userId: null, userEmail: "t@t", role, perms: defaultPermissions(role as "owner"),
  });
  const projetosDoTenant = () => db.select().from(schema.projects).where(eq(schema.projects.tenantId, tenantId));
  const recarregar = async () => {
    ctxRef.current = base(await projetosDoTenant());
  };

  beforeAll(async () => {
    [tenant] = await db.insert(schema.tenants).values({ name: "tenant-prompt-b" }).returning();
    tenantId = tenant.id;
    ctxRef.current = base([]);
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("criar com dia 25 no início e no fim devolve { ok, id } e as datas voltam iguais (44)", async () => {
    const r = await createProject("Obra Dia 25", null, { kind: "proj", startDate: "01/25/2026", endDate: "03/25/2026" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, r.id!));
    expect(p.startDate).toBe("01/25/2026");
    expect(p.endDate).toBe("03/25/2026");
    expect(p.situacao).toBe("Ativo");
    expect(p.durationMonths).toBeNull();
    const versoes = await db.select().from(schema.versions).where(eq(schema.versions.projectId, p.id));
    expect(versoes.map((v) => v.kind).sort()).toEqual(["atual", "budget", "forecast"]);
    await recarregar();
  });

  it("criar com fim antes do início é recusado, sem gravar", async () => {
    const antes = (await projetosDoTenant()).length;
    const r = await createProject("Obra Errada", null, { kind: "proj", startDate: "12/25/2026", endDate: "12/24/2026" });
    expect(r).toEqual({ ok: false, error: "A data de fim não pode ser anterior à data de início." });
    expect((await projetosDoTenant()).length).toBe(antes);
  });

  it("sem permissão, salvar devolve erro visível em vez de silêncio (38)", async () => {
    const projs = await projetosDoTenant();
    ctxRef.current = { ...base(projs, "membro"), perms: { ...defaultPermissions("owner"), projeto: { ver: true, criar: false, editar: false, excluir: false } } };
    const r = await updateProject(projs[0].id, { name: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sem permissão/);
    await recarregar();
  });

  it("cadastro antigo com fim < início continua editável nos outros campos; mexer nas datas aplica a regra", async () => {
    const [velho] = await db
      .insert(schema.projects)
      .values({ tenantId, name: "Obra Antiga", status: "Planejamento", startDate: "12/25/2026", endDate: "12/24/2026" })
      .returning();
    await recarregar();
    const r1 = await updateProject(velho.id, { name: "Obra Antiga 2", startDate: "12/25/2026", endDate: "12/24/2026", cep: "01310100", latitude: "-23,6", longitude: "-46.6" });
    expect(r1.ok).toBe(true);
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, velho.id));
    expect(p.name).toBe("Obra Antiga 2");
    expect(p.endDate).toBe("12/24/2026");
    expect(p.cep).toBe("01310-100");
    expect(Number(p.latitude)).toBe(-23.6);
    await recarregar();
    const r2 = await updateProject(velho.id, { startDate: "12/26/2026" });
    expect(r2).toEqual({ ok: false, error: "A data de fim não pode ser anterior à data de início." });
    const r3 = await updateProject(velho.id, { cep: "123" });
    expect(r3).toEqual({ ok: false, error: "CEP deve ter 8 dígitos." });
    const r4 = await updateProject(velho.id, { latitude: "95" });
    expect(r4.ok).toBe(false);
    const r5 = await updateProject(velho.id, { name: "Obra Antiga 2" });
    expect(r5).toEqual({ ok: true, aviso: "Nada mudou." });
  });

  it("origem assistente fica no log (26)", async () => {
    const projs = await projetosDoTenant();
    const alvo = projs.find((p) => p.name === "Obra Dia 25")!;
    const r = await updateProject(alvo.id, { endereco: "Rua A, 1" }, { origem: "assistente" });
    expect(r.ok).toBe(true);
    const [l] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "project.update")))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(1);
    expect(l.meta).toMatchObject({ origem: "assistente", changes: { endereco: { de: null, para: "Rua A, 1" } } });
    await recarregar();
  });

  it("documentos: só os de projeto, e a remoção guarda filename e storageKey (13)", async () => {
    const projs = await projetosDoTenant();
    const alvo = projs[0];
    await db.insert(schema.documents).values([
      { tenantId, projectId: alvo.id, storageKey: "tenants/x/projetos/a.pdf", filename: "contrato.pdf", tipo: "Contrato" },
      { tenantId, storageKey: "tenants/x/despesas/b.pdf", filename: "nota.pdf", tipo: "NF" },
    ]);
    const docs = await getDocumentsByProjects(tenantId);
    expect(docs.map((d) => d.filename)).toEqual(["contrato.pdf"]);
    const fd = new FormData();
    fd.set("id", docs[0].id);
    expect(await deleteProjetoDoc(fd)).toEqual({ ok: true });
    const [l] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "projeto.doc.delete")));
    expect(l.meta).toMatchObject({ filename: "contrato.pdf", storageKey: "tenants/x/projetos/a.pdf", projectId: alvo.id });
    // documento de outra entidade não é removido por esta action
    const outros = await db.select().from(schema.documents).where(eq(schema.documents.tenantId, tenantId));
    expect(outros.map((d) => d.filename)).toEqual(["nota.pdf"]);
    const fd2 = new FormData();
    fd2.set("id", outros[0].id);
    expect((await deleteProjetoDoc(fd2)).ok).toBe(false);
  });

  it("excluir: inventário, nome digitado conferido no servidor, nunca o último (37)", async () => {
    const projs = await projetosDoTenant();
    const alvo = projs.find((p) => p.name === "Obra Dia 25")!;
    const atual = (await db.select().from(schema.versions).where(and(eq(schema.versions.projectId, alvo.id), eq(schema.versions.kind, "atual"))))[0];
    await db.insert(schema.despesas).values([
      { tenantId, versionId: atual.id, valor: "10", competencia: "01/2026" },
      { tenantId, versionId: atual.id, valor: "20", competencia: "02/2026" },
    ]);
    await db.insert(schema.documents).values({ tenantId, projectId: alvo.id, storageKey: "k", filename: "f.pdf" });
    const inv = await getInventarioDoProjeto(tenantId, alvo.id);
    expect(inv).toMatchObject({ despesas: 2, documentos: 1, versoes: 3, unidades: 0 });
    const viaAction = await inventarioDoProjeto(alvo.id);
    expect(viaAction.ok && viaAction.inventario.despesas).toBe(2);
    // outro tenant: zeros
    expect(await getInventarioDoProjeto("00000000-0000-0000-0000-000000000000", alvo.id)).toMatchObject({ despesas: 0, documentos: 0, versoes: 0 });

    expect(await deleteProject(alvo.id, "obra dia 2")).toEqual({ ok: false, error: "Para excluir, digite o nome do projeto exatamente como está no cadastro." });
    expect(await deleteProject(alvo.id, "obra dia 25")).toEqual({ ok: true });
    expect((await db.select().from(schema.projects).where(eq(schema.projects.id, alvo.id))).length).toBe(0);
    const [l] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "project.delete")));
    expect(l.meta).toMatchObject({ name: "Obra Dia 25", inventario: { despesas: 2, documentos: 1 } });

    await recarregar();
    const resto = await projetosDoTenant();
    expect(resto.length).toBe(1);
    expect(await deleteProject(resto[0].id, resto[0].name)).toEqual({ ok: false, error: "É preciso manter ao menos um projeto ou unidade na empresa." });
  });
});
