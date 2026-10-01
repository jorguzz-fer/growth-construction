import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt AL, Partes 2 a 4 — contador configurável com teto de leitura,
 * chamando as actions direto (teste 11). Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Prompt AL — contador configurável, teto de leitura", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions, effectivePermissions } = await import("@/lib/permissions");
  const { setMemberPermissions, changeRole } = await import("./users");
  let tenantId = "";
  const ids: string[] = [];
  const sufixo = Math.random().toString(36).slice(2, 8);
  const vinculo = async (userId: string) =>
    (await db.select().from(schema.memberships).where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, tenantId))))[0];
  const novoUsuario = async (nome: string, role: "owner" | "contador" | "membro", permissions: Record<string, unknown> | null = null) => {
    const [u] = await db.insert(schema.users).values({ email: `${nome}-${sufixo}@al.test`, name: nome }).returning();
    ids.push(u.id);
    await db.insert(schema.memberships).values({ userId: u.id, tenantId, role, permissions: permissions as never });
    return u.id;
  };
  let dono = "";
  let contador = "";
  let contadorComEscrita = "";
  let membro = "";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: `al-${sufixo}` }).returning();
    tenantId = t.id;
    dono = await novoUsuario("dono", "owner");
    contador = await novoUsuario("contador", "contador");
    contadorComEscrita = await novoUsuario("contador2", "contador", { despesas: { ver: true, criar: true, editar: true, excluir: false } });
    membro = await novoUsuario("membro", "membro", { caixa: { ver: true, criar: true, editar: false, excluir: false } });
    ctxRef.current = { tenant: { id: tenantId }, userId: dono, role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    for (const id of ids) await db.delete(schema.users).where(eq(schema.users.id, id));
  });

  it("11 — a action recusa criar/editar/excluir para o contador, com o motivo, e não grava nada", async () => {
    const matriz = defaultPermissions("contador");
    matriz.despesas = { ver: true, criar: true, editar: false, excluir: false };
    const r = await setMemberPermissions(contador, matriz);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/somente leitura/);
    expect((await vinculo(contador)).permissions).toBeNull();
  });

  it("7/8/9 — owner edita a linha do contador: concede Ver fora do padrão e revoga dentro", async () => {
    const matriz = defaultPermissions("contador");
    matriz.caixa = { ver: true, criar: false, editar: false, excluir: false };
    matriz.acoes = { ver: false, criar: false, editar: false, excluir: false };
    const r = await setMemberPermissions(contador, matriz);
    expect(r).toEqual({ ok: true });
    const v = await vinculo(contador);
    expect(Object.keys(v.permissions ?? {}).sort()).toEqual(["acoes", "caixa"]);
    const e = effectivePermissions("contador", v.permissions);
    expect(e.caixa.ver).toBe(true);
    expect(e.acoes.ver).toBe(false);
    expect(v.role).toBe("contador");
  });

  it("4.3/16 — override de escrita já gravado fica no banco; o teto o nega no efetivo", async () => {
    const v = await vinculo(contadorComEscrita);
    expect(v.permissions).toEqual({ despesas: { ver: true, criar: true, editar: true, excluir: false } });
    expect(effectivePermissions("contador", v.permissions).despesas).toEqual({ ver: true, criar: false, editar: false, excluir: false });
  });

  it("10 — trocar alguém para contador aplica o padrão do papel (com o teto sobre o override mantido)", async () => {
    const r = await changeRole(membro, "contador", { manterPersonalizacoes: true });
    expect(r).toEqual({ ok: true });
    const v = await vinculo(membro);
    expect(v.role).toBe("contador");
    const e = effectivePermissions("contador", v.permissions);
    expect(e.dre.ver).toBe(true);
    expect(e.caixa).toEqual({ ver: true, criar: false, editar: false, excluir: false });
  });
});
