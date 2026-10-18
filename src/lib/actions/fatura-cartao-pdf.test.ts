import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt U2 — a fatura do cartão em PDF é lida por IA e volta como PRÉVIA:
 * nada é gravado até a pessoa confirmar. A leitura usa a convenção do cartão
 * (positivo = compra). Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
const lido = vi.fn();
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/client", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/client")>()), isAiConfigured: () => true }));
vi.mock("@/lib/ai/extrato-extract", () => ({ extractExtratoFromDocument: (...a: unknown[]) => lido(...a) }));
vi.mock("@/lib/ai/uso", () => ({ comUsoDeIa: (_: unknown, fn: () => unknown) => fn() }));

describe.skipIf(!HAS_DB)("Prompt U2 · fatura do cartão em PDF", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { lerFaturaCartaoPdf } = await import("./cartao-extrato");
  let tenantId = "";
  const pdf = () => {
    const f = new FormData();
    f.set("file", new File([new Uint8Array([37, 80, 68, 70])], "fatura.pdf", { type: "application/pdf" }));
    return f;
  };

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "fatura-pdf-U2" }).returning();
    tenantId = t.id;
    ctxRef.current = { tenant: t, projects: [], userId: null, userEmail: "u2@teste", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("lê como cartão e devolve a prévia, sem gravar o extrato", async () => {
    lido.mockResolvedValueOnce({ movimentos: [{ data: "03/05/2026", descricao: "CIMENTO", doc: "", valor: 300 }, { data: "03/09/2026", descricao: "ESTORNO", doc: "", valor: -50 }, { data: "", descricao: "sem data", doc: "", valor: 10 }], saldoFinal: null });
    const r = await lerFaturaCartaoPdf(pdf());
    expect(r).toEqual({ ok: true, itens: [{ data: "03/05/2026", descricao: "CIMENTO", valor: 300 }, { data: "03/09/2026", descricao: "ESTORNO", valor: -50 }] });
    expect(lido.mock.calls[0][2]).toBe("cartao");
    expect(await db.select().from(schema.extratoCartao).where(eq(schema.extratoCartao.tenantId, tenantId))).toEqual([]);
  });

  it("sem permissão de editar cartões, recusa sem ler", async () => {
    lido.mockClear();
    ctxRef.current = { ...(ctxRef.current as object), perms: { ...defaultPermissions("owner"), cartoes: { ver: true, criar: false, editar: false, excluir: false } } };
    expect(await lerFaturaCartaoPdf(pdf())).toMatchObject({ ok: false, error: expect.stringMatching(/Sem permissão/) });
    expect(lido).not.toHaveBeenCalled();
  });

  it("arquivo que não é PDF nem imagem é recusado", async () => {
    ctxRef.current = { ...(ctxRef.current as object), perms: defaultPermissions("owner") };
    const f = new FormData();
    f.set("file", new File(["a;b"], "x.txt", { type: "text/plain" }));
    expect(await lerFaturaCartaoPdf(f)).toMatchObject({ ok: false });
  });
});
