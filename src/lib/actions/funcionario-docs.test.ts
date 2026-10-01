import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/** Prompt Z, PR Z-2 — documentos do funcionário, ASO e folha. Integração (DATABASE_URL); R2 substituído. */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
const enviados: string[] = [];
vi.mock("@/lib/context", async (orig) => ({ ...(await orig<typeof import("@/lib/context")>()), getTenantContext: async () => ctxRef.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {}, notFound: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => true, putObject: async (key: string) => void enviados.push(key), readUrl: async (key: string) => `https://r2.local/${key}`, getObjectBytes: async () => new Uint8Array() }));

describe.skipIf(!HAS_DB)("Documentos do funcionário, ASO e folha (Prompt Z, 2.2-A / 2.2-B)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addFuncionarioDocs, deleteFuncionarioDoc, abrirAso, addFolha, addFolhaDocs, vincularFolhaDespesa } = await import("./funcionario-docs");
  const { getDocumentsByFuncionario, getFolhas, getDocumentsByFolhas } = await import("@/lib/queries");
  let tenant: typeof schema.tenants.$inferSelect;
  let projectId = "";
  let fid = "";
  let despesaId = "";
  const fd = (campos: Record<string, string | File | File[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) {
      if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
      else f.set(k, v);
    }
    return f;
  };
  const arquivo = (nome: string, type = "application/pdf") => new File([new Uint8Array(10)], nome, { type });
  const ctxDe = (perms: ReturnType<typeof defaultPermissions>) => ({ tenant, projects: [{ id: projectId }], userId: null, userEmail: "z2@teste", role: "owner", perms });
  const semAso = () => {
    const p = defaultPermissions("owner");
    p.funcionariosaso = { ver: false, criar: false, editar: false, excluir: false };
    return p;
  };
  const logs = (action: string) => db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenant.id), eq(schema.auditLog.action, action)));

  beforeAll(async () => {
    [tenant] = await db.insert(schema.tenants).values({ name: "pessoas-Z2" }).returning();
    const [p] = await db.insert(schema.projects).values({ tenantId: tenant.id, name: "OBRA Z2" }).returning();
    projectId = p.id;
    const [v] = await db.insert(schema.versions).values({ projectId, tenantId: tenant.id, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    const [f] = await db.insert(schema.funcionarios).values({ tenantId: tenant.id, nome: "Carlos Lima", cpf: "52998224725" }).returning();
    fid = f.id;
    const [d] = await db.insert(schema.despesas).values({ versionId: v.id, tenantId: tenant.id, valor: "12000", categoriaDre: "Custo Fixo", competencia: "09/2026", vencimento: "10/05/2026", status: "A pagar", obs: "Folha de pagamento setembro", numDoc: "PED-F1" }).returning();
    despesaId = d.id;
    ctxRef.current = ctxDe(defaultPermissions("owner"));
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  });

  it("12 / 13b / 2.2-A.7 — várias imagens de uma vez; versão por tipo; validade gravada", async () => {
    expect(await addFuncionarioDocs(fd({ funcionarioId: fid, tipo: "Diploma", file: arquivo("x.pdf") }))).toEqual({ ok: false, error: expect.stringMatching(/tipo do documento/) });
    expect(await addFuncionarioDocs(fd({ funcionarioId: fid, tipo: "Documento de identidade", file: [arquivo("rg-frente.jpg", "image/jpeg"), arquivo("rg-verso.jpg", "image/jpeg")] }))).toEqual({ ok: true, added: 2 });
    expect(await addFuncionarioDocs(fd({ funcionarioId: fid, tipo: "CNH", validade: "2027-03-01", file: arquivo("cnh.pdf") }))).toEqual({ ok: true, added: 1 });
    expect(await addFuncionarioDocs(fd({ funcionarioId: fid, tipo: "CNH", validade: "2029-03-01", file: arquivo("cnh-nova.pdf") }))).toEqual({ ok: true, added: 1 });
    const docs = await getDocumentsByFuncionario(tenant.id, fid, true);
    const porNome = Object.fromEntries(docs.map((d) => [d.filename, [d.tipo, d.versao, d.validade]]));
    expect(porNome).toEqual({ "rg-frente.jpg": ["Documento de identidade", 1, null], "rg-verso.jpg": ["Documento de identidade", 2, null], "cnh.pdf": ["CNH", 1, "2027-03-01"], "cnh-nova.pdf": ["CNH", 2, "2029-03-01"] });
    expect(enviados.every((k) => k.startsWith(`tenants/${tenant.id}/funcionario/${fid}/`))).toBe(true);
  });

  it("16b / 16c / 7.3-A — ASO exige permissão própria para anexar; sem ela, o servidor não devolve nem a existência; abrir registra o acesso; o log não tem nome de arquivo", async () => {
    ctxRef.current = ctxDe(semAso());
    expect(await addFuncionarioDocs(fd({ funcionarioId: fid, tipo: "ASO — exame admissional", validade: "2027-09-01", file: arquivo("aso.pdf") }))).toEqual({ ok: false, error: expect.stringMatching(/permissão própria/) });
    ctxRef.current = ctxDe(defaultPermissions("owner"));
    expect(await addFuncionarioDocs(fd({ funcionarioId: fid, tipo: "ASO — exame admissional", validade: "2027-09-01", file: arquivo("aso.pdf") }))).toEqual({ ok: true, added: 1 });
    const comAso = await getDocumentsByFuncionario(tenant.id, fid, true);
    const aso = comAso.find((d) => d.filename === "aso.pdf")!;
    expect(aso).toBeTruthy();
    const semPermissao = await getDocumentsByFuncionario(tenant.id, fid, false);
    expect(semPermissao.some((d) => d.filename === "aso.pdf")).toBe(false); // 16c
    expect(semPermissao).toHaveLength(4);
    ctxRef.current = ctxDe(semAso());
    expect(await abrirAso(aso.id)).toEqual({ ok: false, error: "Documento não encontrado." });
    expect(await deleteFuncionarioDoc(aso.id)).toEqual({ ok: false, error: "Documento não encontrado." });
    ctxRef.current = ctxDe(defaultPermissions("owner"));
    const r = await abrirAso(aso.id);
    expect(r).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/r2\.local\//) });
    const acessos = await db.select().from(schema.asoAcessos).where(eq(schema.asoAcessos.funcionarioId, fid));
    expect(acessos).toHaveLength(1);
    expect(acessos[0]).toMatchObject({ documentId: aso.id, usuario: "z2@teste" });
    const [up] = await logs("funcionario.aso.upload");
    expect(JSON.stringify(up.meta)).not.toMatch(/aso\.pdf|tenants\//);
    expect((await logs("funcionario.aso.acesso")).length).toBe(1);
  });

  it("13d — remover desfaz só o vínculo e registra nome e chave (não ASO); arquivo não é apagado", async () => {
    const antes = enviados.length;
    const rg = (await getDocumentsByFuncionario(tenant.id, fid, true)).find((d) => d.filename === "rg-frente.jpg")!;
    expect(await deleteFuncionarioDoc(rg.id)).toEqual({ ok: true, id: rg.id });
    expect(enviados.length).toBe(antes);
    const [l] = await logs("funcionario.doc.unlink");
    expect(l.meta).toMatchObject({ filename: "rg-frente.jpg", storageKey: rg.storageKey, tipo: "Documento de identidade", versao: 1 });
  });

  it("16f / 16g — folha por competência (uma por mês), holerite por funcionário, vínculo com a despesa", async () => {
    expect(await addFolha(fd({ competencia: "13/2026" }))).toEqual({ ok: false, error: expect.stringMatching(/MM\/AAAA/) });
    const r = await addFolha(fd({ competencia: "09/2026" }));
    expect(r).toMatchObject({ ok: true });
    const folhaId = (r as { ok: true; id: string }).id;
    expect(await addFolha(fd({ competencia: "09/2026" }))).toEqual({ ok: false, error: expect.stringMatching(/já tem registro/) });
    expect(await addFolhaDocs(fd({ folhaId, tipo: "Folha de pagamento", file: arquivo("folha-09.pdf") }))).toEqual({ ok: true, added: 1 });
    expect(await addFolhaDocs(fd({ folhaId, tipo: "Holerite individual", file: arquivo("holerite.pdf") }))).toEqual({ ok: false, error: expect.stringMatching(/informe o funcionário/) });
    expect(await addFolhaDocs(fd({ folhaId, tipo: "Holerite individual", funcionarioId: fid, file: arquivo("holerite.pdf") }))).toEqual({ ok: true, added: 1 });
    const docs = await getDocumentsByFolhas(tenant.id, [folhaId]);
    expect(docs.find((d) => d.filename === "holerite.pdf")?.funcionarioId).toBe(fid);
    expect(docs.find((d) => d.filename === "folha-09.pdf")?.funcionarioId).toBeNull();
    expect(await vincularFolhaDespesa(folhaId, despesaId)).toMatchObject({ ok: true });
    const [folha] = await getFolhas(tenant.id);
    expect(folha).toMatchObject({ competencia: "09/2026", documentos: 2, despesaNumDoc: "PED-F1", despesaValor: 12000 });
    // a despesa não foi tocada
    const [d] = await db.select().from(schema.despesas).where(eq(schema.despesas.id, despesaId));
    expect(d.valor).toBe("12000.00");
    expect(d.status).toBe("A pagar");
  });

  it("14 — sem a permissão de dados do funcionário, folha e documentos de folha não são gravados", async () => {
    const p = defaultPermissions("owner");
    p.funcionariosdados = { ver: false, criar: false, editar: false, excluir: false };
    ctxRef.current = ctxDe(p);
    expect(await addFolha(fd({ competencia: "10/2026" }))).toEqual({ ok: false, error: expect.stringMatching(/dado sensível/) });
    ctxRef.current = ctxDe(defaultPermissions("owner"));
  });
});
