import { existsSync, globSync, readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt A, PR 8 — ações de versão sem "projeto ativo": a obra sai da própria
 * versão, validada no tenant. Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Versões com obra explícita", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { getVersionContext } = await import("@/lib/context");
  const tenants: string[] = [];
  let tA = "";
  const p: Record<string, typeof schema.projects.$inferSelect> = {};
  const v: Record<string, typeof schema.versions.$inferSelect> = {};

  async function versao(k: string, projeto: string, tenantId: string, kind: "atual" | "budget" | "forecast", isDefault = false) {
    [v[k]] = await db
      .insert(schema.versions)
      .values({ projectId: p[projeto].id, tenantId, key: kind, kind, label: `${projeto}-${kind}`, color: "#000", isDefault })
      .returning();
  }

  beforeAll(async () => {
    const [a] = await db.insert(schema.tenants).values({ name: "ver-A" }).returning();
    const [b] = await db.insert(schema.tenants).values({ name: "ver-B" }).returning();
    tA = a.id;
    tenants.push(a.id, b.id);
    for (const [k, t, nome] of [
      ["a1", a.id, "OBRA 1"],
      ["a2", a.id, "OBRA 2"],
      ["b1", b.id, "OBRA B"],
    ] as const) {
      [p[k]] = await db.insert(schema.projects).values({ tenantId: t, name: nome }).returning();
    }
    await versao("a1atual", "a1", a.id, "atual", true);
    await versao("a2atual", "a2", a.id, "atual");
    await versao("a2forecast", "a2", a.id, "forecast", true);
    await versao("b1atual", "b1", b.id, "atual", true);
    ctxRef.current = {
      tenant: a,
      projects: [p.a1, p.a2],
      userId: null,
      userEmail: null,
      role: "owner",
      perms: defaultPermissions("owner"),
    };
  });
  afterAll(async () => {
    for (const id of tenants) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });

  it("getVersionContext: a obra sai da versão; versão de outro tenant, null", async () => {
    const r = await getVersionContext(tA, v.a2forecast.id);
    expect(r?.project.id).toBe(p.a2.id);
    expect(r?.versions.map((x) => x.id).sort()).toEqual([v.a2atual.id, v.a2forecast.id].sort());
    expect(await getVersionContext(tA, v.b1atual.id)).toBeNull();
    expect(await getVersionContext(tA, "")).toBeNull();
  });

  // Prompt AP: updateVersion, setDefaultVersion e deleteVersion saíram com a
  // tela /versao (não há mais caminho de interface para renomear, marcar
  // padrão ou excluir versão). A única escrita que ficou, a trava, tem o
  // próprio teste de tenant em versao-trava.test.ts.
  it("AP: as actions de versão saíram; a duplicação (BI-3) também não existe", () => {
    expect(existsSync("src/lib/actions/versions.ts")).toBe(false);
    const fontes = globSync("src/lib/actions/*.ts").filter((f) => !f.endsWith(".test.ts")).map((f) => readFileSync(f, "utf8")).join("\n");
    for (const nome of ["duplicateVersion", "deleteVersion", "setDefaultVersion", "updateVersion"]) {
      expect(fontes, nome).not.toMatch(new RegExp(`export async function ${nome}\\b`));
    }
  });

  it("nenhuma versão mudou de rótulo, padrão, trava ou tipo por estes testes", async () => {
    const [x] = await db.select().from(schema.versions).where(eq(schema.versions.id, v.b1atual.id));
    expect({ label: x.label, isDefault: x.isDefault, locked: x.locked, kind: x.kind }).toEqual({ label: "b1-atual", isDefault: true, locked: false, kind: "atual" });
  });
});
