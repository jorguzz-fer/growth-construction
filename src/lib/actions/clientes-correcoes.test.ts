import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt M, 6 — correções do cadastro de clientes: nome obrigatório, conflito
 * de unidade normalizado e transacional, exclusão com travas e confirmação,
 * retorno legível. Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Clientes — correções da revisão (Prompt M, 6)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addCliente, updateCliente, deleteCliente } = await import("./clientes");
  let tenantId = "";
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const clientesDoTenant = () =>
    db.select().from(schema.clientes).where(eq(schema.clientes.tenantId, tenantId));

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "cli-M6" }).returning();
    tenantId = t.id;
    ctxRef.current = {
      tenant: t,
      projects: [],
      userId: null,
      userEmail: null,
      role: "owner",
      perms: defaultPermissions("owner"),
    };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("6.4 — sem nome, recusa com mensagem (antes: gravava 'Sem nome')", async () => {
    expect(await addCliente(fd({ nomeCompleto: "  " }))).toEqual({
      ok: false,
      error: "Informe o nome do cliente.",
    });
    expect(await clientesDoTenant()).toHaveLength(0);
  });

  let ana = "";
  it("cadastra e devolve { ok, id } (6.10)", async () => {
    const r = await addCliente(fd({ nomeCompleto: "Ana Souza", unitCode: "A-101", cpfCnpj: "123.456.789-09" }));
    expect(r.ok).toBe(true);
    ana = (r as { id: string }).id;
  });

  it("unidade com contrato ativo (status em branco) bloqueia outro comprador", async () => {
    const r = await addCliente(fd({ nomeCompleto: "Bruno", unitCode: "A-101" }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("Ana Souza");
  });

  it("6.2 — 'distratado' minúsculo libera a unidade (antes, só a grafia exata)", async () => {
    expect((await updateCliente(fd({ id: ana, nomeCompleto: "Ana Souza", unitCode: "A-101", statusContrato: "distratado" }))).ok).toBe(true);
    const r = await addCliente(fd({ nomeCompleto: "Bruno", unitCode: "A-101" }));
    expect(r.ok).toBe(true);
  });

  it("6.3 — dois cadastros simultâneos da mesma unidade: só um passa", async () => {
    const [a, b] = await Promise.all([
      addCliente(fd({ nomeCompleto: "Carla", unitCode: "B-202" })),
      addCliente(fd({ nomeCompleto: "Diego", unitCode: "B-202" })),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const naUnidade = (await clientesDoTenant()).filter((c) => c.unitCode === "B-202");
    expect(naUnidade).toHaveLength(1);
  });

  it("6.4 — editar apagando o nome é recusado e nada muda", async () => {
    expect(await updateCliente(fd({ id: ana, nomeCompleto: "" }))).toEqual({
      ok: false,
      error: "Informe o nome do cliente.",
    });
    const [c] = await db.select().from(schema.clientes).where(eq(schema.clientes.id, ana));
    expect(c.nomeCompleto).toBe("Ana Souza");
  });

  it("6.1 — exclusão exige o nome digitado", async () => {
    const r = await deleteCliente(fd({ id: ana, confirmacao: "Ana" }));
    expect(r.ok).toBe(false);
    expect(await db.select().from(schema.clientes).where(eq(schema.clientes.id, ana))).toHaveLength(1);
  });

  it("6.1 — cliente com documento não é excluído (a FK apagaria o documento junto)", async () => {
    await db.insert(schema.documents).values({
      tenantId,
      clienteId: ana,
      storageKey: "k/teste",
      filename: "contrato.pdf",
      tipo: "Contrato assinado",
      versao: 1,
    });
    const r = await deleteCliente(fd({ id: ana, confirmacao: "ana souza" }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("1 documento(s)");
    expect(await db.select().from(schema.clientes).where(eq(schema.clientes.id, ana))).toHaveLength(1);
    expect(await db.select().from(schema.documents).where(eq(schema.documents.clienteId, ana))).toHaveLength(1);
  });

  it("6.1 — unidade com contrato ativo bloqueia a exclusão", async () => {
    const [bruno] = (await clientesDoTenant()).filter((c) => c.nomeCompleto === "Bruno");
    const r = await deleteCliente(fd({ id: bruno.id, confirmacao: "Bruno" }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("A-101");
  });

  it("6.1 — sem vínculos, exclui e o log guarda nome, CPF mascarado, unidade e documentos", async () => {
    const r0 = await addCliente(fd({ nomeCompleto: "Élio Livre", cpfCnpj: "98765432100" }));
    const id = (r0 as { id: string }).id;
    expect((await deleteCliente(fd({ id, confirmacao: "elio livre" }))).ok).toBe(true);
    expect(await db.select().from(schema.clientes).where(eq(schema.clientes.id, id))).toHaveLength(0);
    const [l] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "cliente.delete")));
    expect(l.meta).toMatchObject({ nome: "Élio Livre", unitCode: null, documentos: 0 });
    expect(String((l.meta as { cpf: string }).cpf)).not.toContain("987");
  });
});
