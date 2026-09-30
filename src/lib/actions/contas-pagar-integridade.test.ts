import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt I, PR I-5 — Contas a Pagar (§10, §15): só a Atual atrás de chave,
 * saldo real como pendente. Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Contas a Pagar — integridade (Prompt I, §10 e §15)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { getContasPagar, getContasPagarEmPlanejamento } = await import("@/lib/queries");
  const { definirChave } = await import("./chaves");
  const { addDespesa, pagarDespesa } = await import("./despesas");
  const { concluirAcerto } = await import("./acerto");
  let tenantId = "";
  let projectId = "";
  let forecastId = "";
  let atualId = "";
  let previsaoId = "";
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "cp-I5" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA I5" }).returning();
    projectId = p.id;
    for (const kind of ["atual", "forecast"] as const) {
      const [v] = await db
        .insert(schema.versions)
        .values({ projectId, tenantId, key: kind, kind, label: kind === "atual" ? "Atual" : "Previsão", color: "#000" })
        .returning();
      if (kind === "forecast") forecastId = v.id;
    }
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") };
    const r = await addDespesa(fd({ projectId, categoriaDre: "Custo Variável", valor: "100", competencia: "09/2026", vencimento: "09/30/2026" }));
    atualId = (r as { id: string }).id;
    const [prev] = await db
      .insert(schema.despesas)
      .values({ tenantId, versionId: forecastId, categoriaDre: "Custo Variável", valor: "13710.98", status: "A pagar", competencia: "09/2026", vencimento: "10/10/2026" })
      .returning();
    previsaoId = prev.id;
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("§10 — chave desligada: exatamente como hoje, a despesa de Previsão conta como obrigação", async () => {
    const contas = await getContasPagar(tenantId);
    expect(ids(contas)).toEqual([atualId, previsaoId].sort());
    const prev = contas.find((c) => c.id === previsaoId)!;
    expect(prev.versionKind).toBe("forecast");
    expect(prev.versionLabel).toBe("Previsão");
    expect(prev.valor).toBe(13710.98);
  });

  it("§10 — a prévia é exatamente a linha de planejamento", async () => {
    const previa = await getContasPagarEmPlanejamento(tenantId);
    expect(ids(previa)).toEqual([previsaoId]);
  });

  it("§10 — chave ligada: só a Atual; desligada de novo, volta", async () => {
    expect(await definirChave(fd({ chave: "contas_pagar_so_atual", ligar: "1", viPrevia: "on" }))).toEqual({ ok: true });
    expect(ids(await getContasPagar(tenantId))).toEqual([atualId]);
    // A prévia continua mostrando o que ficou de fora.
    expect(ids(await getContasPagarEmPlanejamento(tenantId))).toEqual([previsaoId]);
    expect(await definirChave(fd({ chave: "contas_pagar_so_atual", ligar: "0" }))).toEqual({ ok: true });
    expect(ids(await getContasPagar(tenantId))).toEqual([atualId, previsaoId].sort());
    // A linha de Previsão continua gravada: nada foi apagado.
    expect((await db.select().from(schema.despesas).where(eq(schema.despesas.id, previsaoId))).length).toBe(1);
  });

  it("§15 — despesa de 100 com 80 pagos: saldo 20; com acerto de 20, saldo 0", async () => {
    const antes = (await getContasPagar(tenantId)).find((c) => c.id === atualId)!;
    expect(antes.saldo).toBe(100);
    expect((await pagarDespesa({ despesaId: atualId, dataPagamento: "09/10/2026", valorPago: 80, idempotencyKey: `pg-${atualId}` })).ok).toBe(true);
    const depois = (await getContasPagar(tenantId)).find((c) => c.id === atualId)!;
    expect(depois.status).toBe("Parcialmente paga");
    expect(depois.valor).toBe(100);
    expect(depois.saldo).toBe(20);
    const ac = await concluirAcerto({ dataPagamento: "09/20/2026", valorTransferido: 20, itens: [{ despesaId: atualId, valor: 20 }], idempotencyKey: `ac-${atualId}` });
    expect(ac.ok).toBe(true);
    const fim = (await getContasPagar(tenantId)).find((c) => c.id === atualId)!;
    expect(fim.status).toBe("Pago");
    expect(fim.saldo).toBe(0);
  });
});
