import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt V, V-1 — integridade da medição (seções 1, 2, 4 e 0.5):
 * 11.1 cookie em Budget → grava na Atual · 11.2 sem Atual bloqueia ·
 * 11.3 editar/excluir conferem a versão · 11.12 valor zero/negativo/vazio ·
 * 11.13 duplicidade avisa sem bloquear · 11.14 excluir exige confirmação e
 * registra competência, grupo e valor · 17d/17e/17f/17g autoria.
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

describe.skipIf(!HAS_DB)("Prompt V · V-1 integridade da medição", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addMedicao, updateMedicao, deleteMedicao } = await import("./medicao");
  const { getMedicoes } = await import("@/lib/queries");
  let tenantId = "";
  let projectId = "";
  let semAtualId = "";
  let atualId = "";
  let budgetId = "";
  let tenant: typeof schema.tenants.$inferSelect;
  let projetos: (typeof schema.projects.$inferSelect)[] = [];
  const eng1 = "eng-1-" + Date.now();
  const eng2 = "eng-2-" + Date.now();
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const como = (role: string, userId: string | null) => {
    ctxRef.current = { tenant, projects: projetos, userId, userEmail: `${userId ?? "x"}@t`, role, perms: defaultPermissions(role as "admin"), version: { id: budgetId } };
  };
  const base = () => ({ projectId, competencia: "09/2026", grupo: "1|Serviços preliminares", valor: "500" });
  const todas = () => db.select().from(schema.medicoes).where(eq(schema.medicoes.tenantId, tenantId));

  beforeAll(async () => {
    [tenant] = await db.insert(schema.tenants).values({ name: "tenant-prompt-v" }).returning();
    tenantId = tenant.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "Obra V", status: "Em andamento" }).returning();
    const [p2] = await db.insert(schema.projects).values({ tenantId, name: "Obra sem Atual", status: "Em andamento" }).returning();
    projectId = p.id;
    semAtualId = p2.id;
    projetos = [p, p2];
    const [b] = await db.insert(schema.versions).values({ tenantId, projectId, key: "budget", kind: "budget", label: "Budget", color: "#000", isDefault: true }).returning();
    budgetId = b.id;
    const [a] = await db.insert(schema.versions).values({ tenantId, projectId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    atualId = a.id;
    // só Budget na segunda obra (11.2)
    await db.insert(schema.versions).values({ tenantId, projectId: semAtualId, key: "budget", kind: "budget", label: "Budget", color: "#000", isDefault: true });
    await db.insert(schema.users).values([
      { id: eng1, name: "Engenheiro Um", email: `${eng1}@t` },
      { id: eng2, name: null, email: `${eng2}@t` },
    ]);
    como("admin", eng1);
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    await db.delete(schema.users).where(eq(schema.users.id, eng1));
    await db.delete(schema.users).where(eq(schema.users.id, eng2));
  });

  it("11.1 — com a versão do cookie em Budget (e Budget como padrão), a medição vai para a ATUAL", async () => {
    const r = await addMedicao(fd(base()));
    expect(r).toMatchObject({ ok: true });
    const rows = await todas();
    expect(rows).toHaveLength(1);
    expect(rows[0].versionId).toBe(atualId);
    expect(rows[0].createdBy).toBe(eng1);
  });

  it("11.2 — projeto sem versão Atual bloqueia com mensagem (não cai na padrão)", async () => {
    expect(await addMedicao(fd({ ...base(), projectId: semAtualId }))).toMatchObject({ ok: false, error: expect.stringMatching(/não tem versão Atual/) });
    expect(await todas()).toHaveLength(1);
  });

  it("11.12 — valor zero, negativo ou vazio é recusado; competência fora de MM/AAAA também", async () => {
    for (const valor of ["0", "-10", "", "abc"]) expect((await addMedicao(fd({ ...base(), valor }))).ok).toBe(false);
    expect((await addMedicao(fd({ ...base(), competencia: "2026-09" }))).ok).toBe(false);
    expect((await addMedicao(fd({ ...base(), grupo: "" }))).ok).toBe(false);
    expect(await todas()).toHaveLength(1);
  });

  it("11.13 — segunda medição do mesmo grupo e competência AVISA, sem bloquear", async () => {
    const r = await addMedicao(fd({ ...base(), valor: "250" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aviso).toMatch(/Já existe 1 medição do grupo 1 em 09\/2026/);
    expect(await todas()).toHaveLength(2);
    const r2 = await addMedicao(fd({ ...base(), competencia: "10/2026", valor: "1" }));
    expect(r2).toMatchObject({ ok: true });
    if (r2.ok) expect(r2.aviso).toBeUndefined();
  });

  it("11.3 — editar confere a versão do registro: medição de outra empresa não é encontrada", async () => {
    const [t2] = await db.insert(schema.tenants).values({ name: "tenant-prompt-v-2" }).returning();
    try {
      const [p2] = await db.insert(schema.projects).values({ tenantId: t2.id, name: "Outra", status: "Em andamento" }).returning();
      const [v2] = await db.insert(schema.versions).values({ tenantId: t2.id, projectId: p2.id, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
      const [alheia] = await db.insert(schema.medicoes).values({ tenantId: t2.id, versionId: v2.id, competencia: "09/2026", grupoCode: "1", grupoName: "G", valor: "9" }).returning();
      expect(await updateMedicao(alheia.id, { valor: "10" })).toEqual({ ok: false, error: "Medição não encontrada." });
      expect(await deleteMedicao(alheia.id, true)).toEqual({ ok: false, error: "Medição não encontrada." });
      // versão apontando para projeto fora da empresa do contexto (só o tenant bate): também recusa
      const [vx] = await db.insert(schema.versions).values({ tenantId, projectId, key: "x", kind: "atual", label: "X", color: "#000" }).returning();
      const [mx] = await db.insert(schema.medicoes).values({ tenantId, versionId: vx.id, competencia: "09/2026", grupoCode: "1", grupoName: "G", valor: "9" }).returning();
      ctxRef.current = { ...(ctxRef.current as object), projects: [projetos[1]] };
      expect(await updateMedicao(mx.id, { valor: "10" })).toEqual({ ok: false, error: "Medição não encontrada." });
      como("admin", eng1);
      await db.delete(schema.versions).where(eq(schema.versions.id, vx.id));
    } finally {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, t2.id));
    }
  });

  it("11.14 — excluir exige confirmação e registra competência, grupo e valor", async () => {
    const [m] = (await todas()).filter((r) => r.competencia === "10/2026");
    expect(await deleteMedicao(m.id)).toMatchObject({ ok: false, error: expect.stringMatching(/Confirme a exclusão/) });
    expect(await todas()).toHaveLength(3);
    expect(await deleteMedicao(m.id, true)).toEqual({ ok: true });
    expect(await todas()).toHaveLength(2);
    const [l] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "medicao.delete"), eq(schema.auditLog.entityId, m.id)));
    expect(l.meta).toMatchObject({ competencia: "10/2026", grupoCode: "1", valor: "1.00", versionId: atualId, autor: eng1 });
  });

  it("17d/17e/17g — engenheiro recebe da CONSULTA só as próprias e as sem autor; admin vê todas", async () => {
    // uma medição do eng2 e uma anterior à coluna (sem autor)
    como("engenheiro", eng2);
    expect((await addMedicao(fd({ ...base(), competencia: "11/2026", valor: "70" }))).ok).toBe(true);
    await db.insert(schema.medicoes).values({ tenantId, versionId: atualId, competencia: "12/2026", grupoCode: "2", grupoName: "G2", valor: "30" });
    const doEng1 = await getMedicoes(tenantId, atualId, { autor: eng1 });
    expect(doEng1.map((m) => m.createdBy)).toEqual([eng1, eng1, null]);
    expect(doEng1.find((m) => m.createdBy === null)?.autorNome).toBeNull();
    const doEng2 = await getMedicoes(tenantId, atualId, { autor: eng2 });
    expect(doEng2.map((m) => [m.createdBy, m.autorEmail])).toEqual([[eng2, `${eng2}@t`], [null, null]]);
    expect(await getMedicoes(tenantId, atualId)).toHaveLength(4);
    expect((await getMedicoes(tenantId, atualId)).find((m) => m.createdBy === eng1)?.autorNome).toBe("Engenheiro Um");
  });

  it("17f — engenheiro não edita nem exclui medição de outro autor (chamando a action direto); a sem autor, sim", async () => {
    como("engenheiro", eng2);
    const rows = await todas();
    const doEng1 = rows.find((m) => m.createdBy === eng1)!;
    const semAutor = rows.find((m) => m.createdBy === null)!;
    const propria = rows.find((m) => m.createdBy === eng2)!;
    expect(await updateMedicao(doEng1.id, { valor: "1" })).toMatchObject({ ok: false, error: expect.stringMatching(/outro usuário/) });
    expect(await deleteMedicao(doEng1.id, true)).toMatchObject({ ok: false, error: expect.stringMatching(/outro usuário/) });
    expect(await updateMedicao(propria.id, { obs: "ok" })).toEqual({ ok: true });
    expect(await updateMedicao(semAutor.id, { obs: "de todos" })).toEqual({ ok: true });
    // 17n — ninguém recebeu autor por efeito da edição
    expect((await todas()).find((m) => m.id === semAutor.id)?.createdBy).toBeNull();
    como("admin", eng1);
    expect(await updateMedicao(propria.id, { valor: "71" })).toEqual({ ok: true });
  });

  it("4.6 na edição — mudar a competência para uma já lançada do mesmo grupo avisa", async () => {
    como("admin", eng1);
    const rows = await todas();
    const m = rows.find((r) => r.competencia === "11/2026")!;
    const r = await updateMedicao(m.id, { competencia: "09/2026" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aviso).toMatch(/Já existe 2 medição/);
  });
});
