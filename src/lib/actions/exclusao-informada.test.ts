import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt S, seção 2 — exclusão informada: inventário antes (2.2), PED
 * digitado (2.3), inventário no log (2.4), transação (2.5). Integração.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
const auditRef: { falhar: boolean } = { falhar: false };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("@/lib/audit", async (orig) => {
  const real = await orig<typeof import("@/lib/audit")>();
  return {
    ...real,
    logAudit: async (...args: Parameters<typeof real.logAudit>) => {
      if (auditRef.falhar) throw new Error("auditoria indisponível (teste)");
      return real.logAudit(...args);
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Exclusão informada de despesa (Prompt S, PR S-2)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addDespesa, deleteDespesa, inventarioDeExclusao } = await import("./despesas");
  let tenantId = "";
  let projectId = "";
  let fornecedorId = "";
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const nova = async (extra: Record<string, string> = {}) => {
    const r = await addDespesa(fd({ projectId, categoriaDre: "Custo Fixo", valor: "50", competencia: "09/2026", vencimento: "09/30/2026", fornecedorId, ...extra }));
    if (!r.ok) throw new Error(r.error);
    return r.id;
  };
  const linha = (id: string) => db.select().from(schema.despesas).where(eq(schema.despesas.id, id)).then((r) => r[0]);
  const log = (id: string) => db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, id)).then((r) => r.filter((l) => l.action === "despesa.delete"));

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "excl-S2" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA S2" }).returning();
    projectId = p.id;
    await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" });
    const [f] = await db.insert(schema.stakeholders).values({ tenantId, nome: "Fornecedor S2", tipo: "PJ", papeis: ["Fornecedor de Material"] }).returning();
    fornecedorId = f.id;
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "s2@teste", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("4 — o inventário vem antes de confirmar: contagens, total pago, acertos e o que impede", async () => {
    const id = await nova();
    const inv = await inventarioDeExclusao(id);
    expect(inv.ok).toBe(true);
    if (!inv.ok) return;
    expect(inv.numDoc).toBeTruthy();
    expect(inv.inventario).toMatchObject({ parcelas: 0, pagamentos: 0, totalPago: 0, acertos: 0, acertosNumDoc: [], anexos: 0, documentosFiscais: 0, caixaConciliado: 0 });
    expect(inv.bloqueios).toEqual([]);
    await db.insert(schema.documents).values({ tenantId, despesaId: id, storageKey: "k", filename: "f.pdf" });
    const inv2 = await inventarioDeExclusao(id);
    if (inv2.ok) expect(inv2.bloqueios).toEqual(["1 anexo(s)"]);
  });

  it("5 — exige o PED digitado; sem ele nada é apagado", async () => {
    const id = await nova();
    const numDoc = (await linha(id)).numDoc!;
    expect((await deleteDespesa(id)).ok).toBe(false);
    expect(((await deleteDespesa(id, "outro")) as { error: string }).error).toMatch(new RegExp(`digite o PED ${numDoc}`));
    expect(await linha(id)).toBeTruthy();
    expect((await deleteDespesa(id, numDoc.toLowerCase())).ok).toBe(true);
    expect(await linha(id)).toBeUndefined();
  });

  it("6 — a auditoria guarda fornecedor, competência, conta, categoria, valor e as contagens", async () => {
    const id = await nova({ contaCef: "1.1" });
    const numDoc = (await linha(id)).numDoc!;
    expect((await deleteDespesa(id, numDoc)).ok).toBe(true);
    const [l] = await log(id);
    const meta = l.meta as Record<string, unknown>;
    expect(meta).toMatchObject({ numDoc, fornecedor: "Fornecedor S2", competencia: "09/2026", contaCef: "1.1", categoriaDre: "Custo Fixo", valor: "50.00" });
    expect(meta.vinculos).toMatchObject({ parcelas: 0, pagamentos: 0, totalPago: 0, anexos: 0 });
  });

  it("7 — transacional: se a auditoria falhar, a despesa continua existindo", async () => {
    const id = await nova();
    const numDoc = (await linha(id)).numDoc!;
    auditRef.falhar = true;
    await expect(deleteDespesa(id, numDoc)).rejects.toThrow(/auditoria indisponível/);
    auditRef.falhar = false;
    expect(await linha(id)).toBeTruthy();
    expect(await log(id)).toHaveLength(0);
  });

  it("com dependência (anexo) continua recusada dizendo qual — Prompt I §12 mantido", async () => {
    const id = await nova();
    const numDoc = (await linha(id)).numDoc!;
    await db.insert(schema.documents).values({ tenantId, despesaId: id, storageKey: "k2", filename: "g.pdf" });
    const r = await deleteDespesa(id, numDoc);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/1 anexo\(s\)/);
    expect(await linha(id)).toBeTruthy();
  });
});
