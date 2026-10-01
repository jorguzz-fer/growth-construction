import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt P, PR P-4 — importação do inventário (5.5): Id atualiza, sem Id
 * insere, vendido não é tocado, versão congelada recusa, exportar e
 * reimportar não duplica. Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Permuta — importação do inventário (Prompt P, PR P-4)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { importPermutas } = await import("./receitas");
  const { getPermutas } = await import("@/lib/queries");
  let tenantId = "";
  let projectId = "";
  let versionId = "";
  let clienteId = "";
  let tenant: unknown;
  let projects: unknown[] = [];
  const comPerms = (role: string) => {
    ctxRef.current = { tenant, projects, userId: null, userEmail: "quem@teste", role, perms: defaultPermissions(role as "owner") };
  };
  const linha = (p: Partial<import("@/lib/permuta-inventario").LinhaImportacaoPermuta>) => ({
    unitCode: "A-1",
    cliente: "Maria do Cadastro",
    dataRecebimento: "09/15/2026",
    tipo: "Imóvel",
    descricao: null,
    estimado: "80000",
    status: "Disponivel",
    dataVenda: null,
    valorVenda: null,
    formaVenda: null,
    tipoPermuta: null,
    obs: null,
    ...p,
  });

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "perm-P4" }).returning();
    tenantId = t.id;
    tenant = t;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA P4" }).returning();
    projectId = p.id;
    projects = [p];
    const [v] = await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    versionId = v.id;
    const [c] = await db.insert(schema.clientes).values({ tenantId, nomeCompleto: "Maria do Cadastro" }).returning();
    clienteId = c.id;
    comPerms("owner");
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("sem Id insere; o cliente que casa com o cadastro leva o id; linhas inválidas são reportadas, não gravadas como zero", async () => {
    const r = await importPermutas([linha({}), linha({ unitCode: "A-2", cliente: "Fulano Avulso", tipo: "Veículo", estimado: "50.000,00" }), linha({ unitCode: "A-3", estimado: null })], projectId);
    expect(r).toMatchObject({ ok: true, inseridas: 2, atualizadas: 0 });
    expect((r as { ignoradas: { motivo: string }[] }).ignoradas).toEqual([{ linha: "linha 3 (A-3)", motivo: expect.stringMatching(/maior que zero/) }]);
    const rows = await getPermutas(tenantId, versionId);
    expect(rows).toHaveLength(2);
    expect(rows.find((x) => x.unitCode === "A-1")).toMatchObject({ clienteId, cliente: "Maria do Cadastro", estimado: "80000.00" });
    expect(rows.find((x) => x.unitCode === "A-2")).toMatchObject({ clienteId: null, cliente: "Fulano Avulso", estimado: "50000.00" });
  });

  it("exportar e reimportar a mesma planilha (com Id) não duplica: tudo vira 'atualizada' sem mudança; Id desconhecido é ignorado", async () => {
    const antes = await getPermutas(tenantId, versionId);
    const r = await importPermutas(
      [...antes.map((p) => linha({ id: p.id, unitCode: p.unitCode, cliente: p.cliente, tipo: p.tipo, estimado: p.estimado })), linha({ id: "00000000-0000-0000-0000-000000000000", unitCode: "Z" })],
      projectId,
    );
    expect(r).toMatchObject({ ok: true, inseridas: 0, atualizadas: 2 });
    expect((r as { ignoradas: { motivo: string }[] }).ignoradas[0].motivo).toMatch(/Id não encontrado/);
    expect(await getPermutas(tenantId, versionId)).toHaveLength(2);
    const [l] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "permuta.import")));
    expect(l).toBeTruthy();
  });

  it("Id existente atualiza (com valor anterior × novo no relatório); ativo vendido não é alterado por planilha", async () => {
    const [a1] = (await getPermutas(tenantId, versionId)).filter((x) => x.unitCode === "A-1");
    const r = await importPermutas([linha({ id: a1.id, descricao: "Apto 12", estimado: "85000" })], projectId);
    expect(r).toMatchObject({ ok: true, inseridas: 0, atualizadas: 1 });
    const [dep] = await db.select().from(schema.permutas).where(eq(schema.permutas.id, a1.id));
    expect(dep).toMatchObject({ descricao: "Apto 12", estimado: "85000.00" });
    await db.update(schema.permutas).set({ status: "Vendido", dataVenda: "10/01/2026", valorVenda: "90000.00" }).where(eq(schema.permutas.id, a1.id));
    const r2 = await importPermutas([linha({ id: a1.id, estimado: "1" })], projectId);
    expect(r2).toMatchObject({ ok: true, inseridas: 0, atualizadas: 0 });
    expect((r2 as { ignoradas: { motivo: string }[] }).ignoradas[0].motivo).toMatch(/vendido/);
    const [intacto] = await db.select().from(schema.permutas).where(eq(schema.permutas.id, a1.id));
    expect(intacto.estimado).toBe("85000.00");
  });

  it("versão congelada e falta de permissão recusam com mensagem; nada é gravado", async () => {
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    expect(await importPermutas([linha({ unitCode: "B-1" })], projectId)).toEqual({ ok: false, error: expect.stringMatching(/congelada/) });
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
    comPerms("viewer");
    expect(await importPermutas([linha({ unitCode: "B-1" })], projectId)).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    comPerms("owner");
    expect(await getPermutas(tenantId, versionId)).toHaveLength(2);
  });
});
