import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt P, PR P-1 — validação e retorno legível do cadastro do ativo (3.1,
 * 3.2) e filtro de empresa na consulta (3.5). Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Permuta — cadastro do ativo (Prompt P, PR P-1)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addPermuta } = await import("./receitas");
  const { getPermutas } = await import("@/lib/queries");
  let tenantId = "";
  let outroTenantId = "";
  let projectId = "";
  let versionId = "";
  let tenant: unknown;
  let projects: unknown[] = [];
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const base = { unitCode: "A-1", cliente: "Maria Souza", dataRecebimento: "09/15/2026", tipo: "Imóvel", estimado: "80.000,00" };
  const comPerms = (role: string) => {
    ctxRef.current = { tenant, projects, userId: null, userEmail: "quem@teste", role, perms: defaultPermissions(role as "owner") };
  };

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "perm-P1" }).returning();
    tenantId = t.id;
    tenant = t;
    const [o] = await db.insert(schema.tenants).values({ name: "perm-P1-outro" }).returning();
    outroTenantId = o.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA P1" }).returning();
    projectId = p.id;
    projects = [p];
    const [v] = await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    versionId = v.id;
    comPerms("owner");
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    if (outroTenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, outroTenantId));
  });

  it("3.1 · recusa com mensagem: sem unidade, sem cliente, sem data de recebimento, estimado vazio/zero; vendido sem data ou valor de venda. Nada é gravado", async () => {
    const r = (c: Record<string, string>) => addPermuta(fd({ projectId, ...base, ...c }));
    expect(await r({ unitCode: "" })).toEqual({ ok: false, error: expect.stringMatching(/unidade/) });
    expect(await r({ cliente: "" })).toEqual({ ok: false, error: expect.stringMatching(/cliente/) });
    expect(await r({ dataRecebimento: "" })).toEqual({ ok: false, error: expect.stringMatching(/data de recebimento/) });
    expect(await r({ estimado: "" })).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await r({ estimado: "0" })).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await r({ estimado: "abc" })).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await r({ status: "Vendido" })).toEqual({ ok: false, error: expect.stringMatching(/data da venda/) });
    expect(await r({ status: "Vendido", dataVenda: "10/01/2026" })).toEqual({ ok: false, error: expect.stringMatching(/valor da venda/) });
    expect(await r({ status: "Outro" })).toEqual({ ok: false, error: expect.stringMatching(/Status inválido/) });
    expect(await db.select().from(schema.permutas).where(eq(schema.permutas.tenantId, tenantId))).toHaveLength(0);
  });

  it("3.2 · sem permissão de criar devolve erro legível, não silêncio; sem projeto, idem", async () => {
    comPerms("viewer");
    expect(await addPermuta(fd({ projectId, ...base }))).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    comPerms("owner");
    expect(await addPermuta(fd({ ...base }))).toEqual({ ok: false, error: expect.stringMatching(/Escolha o projeto/) });
    expect(await addPermuta(fd({ projectId: "00000000-0000-0000-0000-000000000000", ...base }))).toEqual({ ok: false, error: expect.stringMatching(/Escolha o projeto/) });
  });

  it("3.1 · cadastro em ordem grava com vírgula decimal lida certo; vendido à vista grava data e valor; auditoria permuta.create", async () => {
    const a = await addPermuta(fd({ projectId, ...base }));
    expect(a.ok).toBe(true);
    const b = await addPermuta(fd({ projectId, ...base, unitCode: "A-2", descricao: "Carro", tipo: "Veículo", estimado: "50000", status: "Vendido", dataVenda: "10/01/2026", valorVenda: "52.500,00", formaVenda: "avista" }));
    expect(b.ok).toBe(true);
    const rows = await getPermutas(tenantId, versionId);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.unitCode === "A-1")).toMatchObject({ estimado: "80000.00", valorVenda: "0.00", status: "Disponivel", cliente: "Maria Souza" });
    expect(rows.find((r) => r.unitCode === "A-2")).toMatchObject({ estimado: "50000.00", valorVenda: "52500.00", status: "Vendido", dataVenda: "10/01/2026" });
    const logs = await db.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenantId));
    expect(logs.filter((l) => l.action === "permuta.create")).toHaveLength(2);
  });

  it("3.5 · getPermutas filtra pela empresa: a versão de uma empresa não devolve ativos gravados com outro tenant", async () => {
    // Linha "errada" inserida direto, como um defeito antigo poderia ter deixado.
    await db.insert(schema.permutas).values({ tenantId: outroTenantId, versionId, unitCode: "X", tipo: "Imóvel", estimado: "1.00" });
    expect(await getPermutas(tenantId, versionId)).toHaveLength(2);
    expect(await getPermutas(outroTenantId, versionId)).toHaveLength(1);
  });
});
