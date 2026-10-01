import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt AH, AH-1 — validação no servidor (Parte 2), `renameTenant` auditado
 * e falante (Parte 3), gravação parcial preservada, dado inválido já gravado
 * intocado (9, 10), isolamento por tenant (22). Integração: só com DATABASE_URL.
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
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => false, putObject: async () => {}, readUrl: async () => "" }));

describe.skipIf(!HAS_DB)("Prompt AH · AH-1 cadastro da empresa", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { salvarDadosFiscais, renameTenant, uploadLogo } = await import("./empresa");
  let tenantId = "";
  let outroId = "";
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const linha = async (id = tenantId) => (await db.select().from(schema.tenants).where(eq(schema.tenants.id, id)))[0];
  const como = async (role: string) => {
    const t = await linha();
    ctxRef.current = { tenant: t, projects: [], userId: null, userEmail: "t@t", role, perms: defaultPermissions(role as "admin") };
  };

  beforeAll(async () => {
    // Dado INVÁLIDO já gravado (BAH-1): CEP com 6 dígitos e IBGE com 2 — fica como está.
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-prompt-ah", cep: "123456", codigoMunicipio: "99", uf: "SP" }).returning();
    tenantId = t.id;
    const [o] = await db.insert(schema.tenants).values({ name: "tenant-prompt-ah-outro", cnpj: "11222333000181" }).returning();
    outroId = o.id;
    await como("admin");
  });
  afterAll(async () => {
    for (const id of [tenantId, outroId]) if (id) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });

  it("4/5/6/8 — CEP curto, IBGE fora de 7 dígitos e UF inválida são recusados na action, com o campo e o porquê", async () => {
    expect(await salvarDadosFiscais(fd({ cep: "1234567" }))).toMatchObject({ ok: false, error: expect.stringMatching(/^CEP:/) });
    expect(await salvarDadosFiscais(fd({ codigoMunicipio: "355030" }))).toMatchObject({ ok: false, error: expect.stringMatching(/^Código IBGE/) });
    expect(await salvarDadosFiscais(fd({ uf: "XX" }))).toMatchObject({ ok: false, error: expect.stringMatching(/^UF:/) });
    expect(await salvarDadosFiscais(fd({ cnpj: "11222333000100" }))).toMatchObject({ ok: false, error: expect.stringMatching(/^CNPJ:/) });
    expect(await salvarDadosFiscais(fd({ aliquotaIss: "7" }))).toMatchObject({ ok: false, error: expect.stringMatching(/^Alíquota/) });
  });

  it("9 — a recusa não toca no que já estava gravado (dado inválido antigo permanece)", async () => {
    const t = await linha();
    expect([t.cep, t.codigoMunicipio, t.uf]).toEqual(["123456", "99", "SP"]);
  });

  it("7/10 — gravação parcial: com os campos inválidos VAZIOS no formulário, os demais gravam; vazio vira null", async () => {
    const r = await salvarDadosFiscais(fd({ nomeFantasia: "Fantasia", inscricaoMunicipal: "555", regimeTributario: "LUCRO_PRESUMIDO" }));
    expect(r).toEqual({ ok: true });
    const t = await linha();
    expect(t.nomeFantasia).toBe("Fantasia");
    expect(t.inscricaoMunicipal).toBe("555");
    expect(t.regimeTributario).toBe("LUCRO_PRESUMIDO");
    // o formulário completo é gravado inteiro (comportamento de sempre): o que não veio fica null
    expect(t.cep).toBeNull();
    // e campos válidos preenchidos gravam normalizados
    expect(await salvarDadosFiscais(fd({ nomeFantasia: "Fantasia", cep: "01001-000", codigoMunicipio: "3550308", uf: "sp" }))).toEqual({ ok: true });
    const t2 = await linha();
    expect([t2.cep, t2.codigoMunicipio, t2.uf]).toEqual(["01001000", "3550308", "SP"]);
    const [log] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "tenant.fiscal")));
    expect(log).toBeDefined();
  });

  it("11/12 — renameTenant: sem permissão devolve erro; nome vazio devolve erro; troca grava de/para", async () => {
    await como("membro");
    expect(await renameTenant(fd({ name: "X" }))).toMatchObject({ ok: false, error: expect.stringMatching(/permissão/) });
    await como("admin");
    expect(await renameTenant(fd({ name: "  " }))).toMatchObject({ ok: false, error: expect.stringMatching(/razão social/) });
    expect(await renameTenant(fd({ name: "tenant-prompt-ah" }))).toEqual({ ok: true }); // igual: nada grava, nada loga
    expect(await renameTenant(fd({ name: "Nome Novo AH" }))).toEqual({ ok: true });
    expect((await linha()).name).toBe("Nome Novo AH");
    const logs = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "tenant.rename")));
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toMatchObject({ changes: { name: { de: "tenant-prompt-ah", para: "Nome Novo AH" } } });
    await como("admin");
  });

  it("uploadLogo devolve { ok, error } legível em vez de lançar", async () => {
    expect(await uploadLogo(fd({}))).toMatchObject({ ok: false, error: expect.stringMatching(/R2/) });
    await como("contador");
    expect(await uploadLogo(fd({}))).toMatchObject({ ok: false, error: expect.stringMatching(/permissão/) });
    await como("admin");
  });

  it("22 — as operações filtram por tenants.id = ctx.tenant.id: o outro tenant não muda", async () => {
    const antes = await linha(outroId);
    await salvarDadosFiscais(fd({ nomeFantasia: "Z" }));
    await renameTenant(fd({ name: "Outro nome" }));
    const depois = await linha(outroId);
    expect(depois).toEqual(antes);
  });
});
