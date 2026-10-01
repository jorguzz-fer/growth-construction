import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt P, PR P-2 — editar (2.2), cancelar (2.3), consultas sem cancelados
 * (2.4), cliente por id (3.6). Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Permuta — editar, cancelar e cliente por id (Prompt P, PR P-2)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addPermuta, updatePermuta, cancelarPermuta } = await import("./receitas");
  const { getPermutas, getPermutasDaTela, permToCalc, permToResale } = await import("@/lib/queries");
  const { calcTotals, permutaCashByMonth, permutaRevenueByMonth } = await import("@/lib/calc");
  let tenantId = "";
  let projectId = "";
  let versionId = "";
  let clienteId = "";
  let tenant: unknown;
  let projects: unknown[] = [];
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const comPerms = (role: string) => {
    ctxRef.current = { tenant, projects, userId: null, userEmail: "quem@teste", role, perms: defaultPermissions(role as "owner") };
  };
  const logs = (action: string) => db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, action)));

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "perm-P2" }).returning();
    tenantId = t.id;
    tenant = t;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA P2" }).returning();
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

  const base = { projectId, unitCode: "A-1", dataRecebimento: "09/15/2026", tipo: "Imóvel", estimado: "80000" };

  it("3.6 · cliente por id grava o id E o nome do cadastro; id de outra empresa é recusado; sem id vale o nome (registro antigo)", async () => {
    const r = await addPermuta(fd({ ...base, projectId, clienteId }));
    expect(r.ok).toBe(true);
    const [p] = await getPermutas(tenantId, versionId);
    expect(p).toMatchObject({ clienteId, cliente: "Maria do Cadastro" });
    expect(await addPermuta(fd({ ...base, projectId, clienteId: "00000000-0000-0000-0000-000000000000" }))).toEqual({ ok: false, error: expect.stringMatching(/Cliente não encontrado/) });
    const r2 = await addPermuta(fd({ ...base, projectId, unitCode: "A-2", cliente: "Só o nome" }));
    expect(r2.ok).toBe(true);
    const tela = await getPermutasDaTela(tenantId, versionId);
    expect(tela.map((x) => x.clienteNome).sort()).toEqual(["Maria do Cadastro", "Só o nome"]);
  });

  it("2.2 · editar valida como o cadastro, grava todos os campos e registra valor anterior × novo; sem mudança não há linha de log", async () => {
    const [p] = await getPermutas(tenantId, versionId);
    const campos = { id: p.id, projectId, unitCode: "A-1", clienteId, dataRecebimento: "09/15/2026", tipo: "Imóvel", estimado: "80000" };
    expect(await updatePermuta(fd({ ...campos, estimado: "0" }))).toEqual({ ok: false, error: expect.stringMatching(/maior que zero/) });
    expect(await updatePermuta(fd({ ...campos, status: "Vendido" }))).toEqual({ ok: false, error: expect.stringMatching(/data da venda/) });
    expect(await updatePermuta(fd({ ...campos, status: "Vendido", dataVenda: "10/01/2026", valorVenda: "82.000,00", descricao: "Apto 12" }))).toEqual({ ok: true, id: p.id });
    const [depois] = await db.select().from(schema.permutas).where(eq(schema.permutas.id, p.id));
    expect(depois).toMatchObject({ status: "Vendido", dataVenda: "10/01/2026", valorVenda: "82000.00", descricao: "Apto 12", estimado: "80000.00" });
    const [l] = await logs("permuta.update");
    expect(l.entityId).toBe(p.id);
    const changes = (l.meta as { changes: Record<string, { de: unknown; para: unknown }> }).changes;
    expect(changes.status).toEqual({ de: "Disponivel", para: "Vendido" });
    expect(changes.valorVenda).toEqual({ de: 0, para: 82000 });
    expect(changes.descricao).toEqual({ de: null, para: "Apto 12" });
    expect(changes.estimado).toBeUndefined();
    // Salvar de novo sem mudar nada: nenhuma linha nova.
    expect((await updatePermuta(fd({ ...campos, status: "Vendido", dataVenda: "10/01/2026", valorVenda: "82000", descricao: "Apto 12" }))).ok).toBe(true);
    expect(await logs("permuta.update")).toHaveLength(1);
    // Sem permissão de editar: erro legível.
    comPerms("viewer");
    expect(await updatePermuta(fd(campos))).toEqual({ ok: false, error: expect.stringMatching(/permissão/) });
    comPerms("owner");
  });

  it("2.3/2.4 · cancelar exige motivo, preserva o registro, grava quem/quando/por quê e tira o ativo de getPermutas, dos totais, da receita e do caixa", async () => {
    const [vendido] = (await getPermutas(tenantId, versionId)).filter((x) => x.status === "Vendido");
    const antes = await getPermutas(tenantId, versionId);
    expect(permutaRevenueByMonth(permToResale(antes))["10/2026"]).toBe(82000);
    expect(permutaCashByMonth(permToResale(antes))["10/2026"]).toBe(82000);
    expect(calcTotals([], permToCalc(antes), []).permVend).toBe(82000);
    expect(await cancelarPermuta(vendido.id, "  ")).toEqual({ ok: false, error: expect.stringMatching(/motivo/) });
    expect(await cancelarPermuta(vendido.id, "lançado em duplicidade")).toEqual({ ok: true, id: vendido.id });
    expect(await cancelarPermuta(vendido.id, "de novo")).toEqual({ ok: false, error: expect.stringMatching(/já cancelado/) });
    expect(await updatePermuta(fd({ id: vendido.id, projectId, unitCode: "A-1", clienteId, dataRecebimento: "09/15/2026", tipo: "Imóvel", estimado: "1" }))).toEqual({ ok: false, error: expect.stringMatching(/cancelado/) });
    const [row] = await db.select().from(schema.permutas).where(eq(schema.permutas.id, vendido.id));
    expect(row).toMatchObject({ cancelado: true, canceladoPor: "quem@teste", motivoCancelamento: "lançado em duplicidade", estimado: "80000.00", valorVenda: "82000.00" });
    expect(row.canceladoEm).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const depois = await getPermutas(tenantId, versionId);
    expect(depois.map((x) => x.id)).not.toContain(vendido.id);
    expect(permutaRevenueByMonth(permToResale(depois))).toEqual({});
    expect(permutaCashByMonth(permToResale(depois))).toEqual({});
    expect(calcTotals([], permToCalc(depois), []).permVend).toBe(0);
    // A lista da tela continua mostrando o cancelado, marcado.
    const tela = await getPermutasDaTela(tenantId, versionId);
    expect(tela.find((x) => x.id === vendido.id)?.cancelado).toBe(true);
    const [l] = await logs("permuta.cancel");
    expect(l.meta).toMatchObject({ motivo: "lançado em duplicidade", unidade: "A-1", valorVenda: "82000.00" });
  });

  it("versão congelada recusa editar e cancelar com mensagem", async () => {
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    const [p] = await getPermutas(tenantId, versionId);
    expect(await updatePermuta(fd({ id: p.id, projectId, unitCode: "A-2", cliente: "Só o nome", dataRecebimento: "09/15/2026", tipo: "Imóvel", estimado: "80000" }))).toEqual({ ok: false, error: expect.stringMatching(/congelada/) });
    expect(await cancelarPermuta(p.id, "x")).toEqual({ ok: false, error: expect.stringMatching(/congelada/) });
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
  });
});
