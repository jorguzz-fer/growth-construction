import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt I, PR I-4 — acerto contábil (§17, §18): saldo real com abatimentos
 * anteriores e pagamentos, FOR UPDATE, só Atual, conferência do rateio.
 * Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Acerto contábil — integridade (Prompt I, §17 e §18)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addDespesa, pagarDespesa } = await import("./despesas");
  const { concluirAcerto, estornarAcerto, getDespesasAbativeis, ratearEntreObras } = await import("./acerto");
  let tenantId = "";
  let projectId = "";
  let projeto2Id = "";
  let versionId = "";
  let forecastId = "";
  let n = 0;
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const base = () => ({ projectId, categoriaDre: "Custo Variável", valor: "100", competencia: "09/2026", vencimento: "09/30/2026" });
  const novaDespesa = async (extra: Record<string, string> = {}) => {
    const r = await addDespesa(fd({ ...base(), ...extra }));
    if (!r.ok) throw new Error((r as { error: string }).error);
    return (r as { id: string }).id;
  };
  const despesa = (id: string) => db.select().from(schema.despesas).where(eq(schema.despesas.id, id)).then((r) => r[0]);
  const acerto = (itens: { despesaId: string; valor: number }[], valorTransferido?: number) =>
    concluirAcerto({
      dataPagamento: "09/20/2026",
      valorTransferido: valorTransferido ?? itens.reduce((a, i) => a + i.valor, 0),
      itens,
      idempotencyKey: `ac-${++n}-${Math.random()}`,
    });
  const saldoNaTela = async (id: string) => (await getDespesasAbativeis()).find((d) => d.id === id)?.saldo ?? null;

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "acerto-I4" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA I4" }).returning();
    projectId = p.id;
    const [p2] = await db.insert(schema.projects).values({ tenantId, name: "OBRA I4-B" }).returning();
    projeto2Id = p2.id;
    for (const kind of ["atual", "forecast"] as const) {
      const [v] = await db
        .insert(schema.versions)
        .values({ projectId, tenantId, key: kind, kind, label: kind, color: "#000" })
        .returning();
      if (kind === "atual") versionId = v.id;
      else forecastId = v.id;
    }
    ctxRef.current = { tenant: t, projects: [p, p2], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("§17 — dois acertos sobre o mesmo PED: o segundo enxerga o saldo real", async () => {
    const id = await novaDespesa();
    expect(await saldoNaTela(id)).toBe(100);
    const r1 = await acerto([{ despesaId: id, valor: 60 }]);
    expect(r1.ok).toBe(true);
    expect((await despesa(id)).status).toBe("Parcialmente paga");
    expect(await saldoNaTela(id)).toBe(40);
    // 60 de novo: antes passava (saldo = valor cheio). Agora recusa.
    const r2 = await acerto([{ despesaId: id, valor: 60 }]);
    expect(r2.ok).toBe(false);
    expect(r2.error).toMatch(/excede o saldo real de 40\.00/);
    expect((await despesa(id)).status).toBe("Parcialmente paga");
    // 40 cabe: quita.
    const r3 = await acerto([{ despesaId: id, valor: 40 }]);
    expect(r3.ok).toBe(true);
    expect((await despesa(id)).status).toBe("Pago");
    expect(await saldoNaTela(id)).toBeNull();
    // Quitado: nem 1 centavo.
    const r4 = await acerto([{ despesaId: id, valor: 0.01 }]);
    expect(r4.ok).toBe(false);
    expect(r4.error).toMatch(/quitada/);
  });

  it("§17 — pagamento registrado também abate o saldo disponível ao acerto", async () => {
    const id = await novaDespesa();
    expect((await pagarDespesa({ despesaId: id, dataPagamento: "09/10/2026", valorPago: 30, idempotencyKey: `pg-${id}` })).ok).toBe(true);
    expect(await saldoNaTela(id)).toBe(70);
    const r = await acerto([{ despesaId: id, valor: 80 }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/70\.00/);
    expect((await acerto([{ despesaId: id, valor: 70 }])).ok).toBe(true);
    expect((await despesa(id)).status).toBe("Pago");
  });

  it("§17 — dois acertos simultâneos de 100 sobre um PED de 100: só um passa", async () => {
    const id = await novaDespesa();
    const [a, b] = await Promise.all([acerto([{ despesaId: id, valor: 100 }]), acerto([{ despesaId: id, valor: 100 }])]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const itens = await db.select().from(schema.acertoItens).where(eq(schema.acertoItens.despesaId, id));
    expect(itens).toHaveLength(1);
    expect((await despesa(id)).status).toBe("Pago");
  });

  it("§17 — estorno reabre o PED e devolve o saldo; estornar de novo é recusado", async () => {
    const id = await novaDespesa();
    const r = await acerto([{ despesaId: id, valor: 100 }]);
    expect(r.ok).toBe(true);
    expect(await saldoNaTela(id)).toBeNull();
    const e = await estornarAcerto(r.acertoId!, "lançado errado");
    expect(e.ok).toBe(true);
    expect((await despesa(id)).status).toBe("A pagar");
    expect(await saldoNaTela(id)).toBe(100);
    const e2 = await estornarAcerto(r.acertoId!, "de novo");
    expect(e2.ok).toBe(false);
    expect(e2.error).toMatch(/já foi estornado/);
  });

  it("§17 — PED em Orçamento/Previsão não recebe acerto; versão congelada bloqueia acerto e estorno", async () => {
    const [prev] = await db
      .insert(schema.despesas)
      .values({ tenantId, versionId: forecastId, categoriaDre: "Custo Variável", valor: "50", status: "A pagar", competencia: "09/2026" })
      .returning();
    const r = await acerto([{ despesaId: prev.id, valor: 50 }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Atual/);
    expect((await getDespesasAbativeis()).some((d) => d.id === prev.id)).toBe(false);

    const id = await novaDespesa();
    const ok = await acerto([{ despesaId: id, valor: 100 }]);
    expect(ok.ok).toBe(true);
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    const id2 = await db
      .insert(schema.despesas)
      .values({ tenantId, versionId, categoriaDre: "Custo Variável", valor: "10", status: "A pagar", competencia: "09/2026" })
      .returning()
      .then((r) => r[0].id);
    expect((await acerto([{ despesaId: id2, valor: 10 }])).error).toMatch(/congelada/);
    expect((await estornarAcerto(ok.acertoId!, "x")).error).toMatch(/congelada/);
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
    expect((await estornarAcerto(ok.acertoId!, "x")).ok).toBe(true);
  });

  it("§18 — rateio: obra repetida ou de outra empresa não passa; Atual congelada bloqueia", async () => {
    const rateio = (linhas: { projectId: string; percentual: number }[]) =>
      ratearEntreObras({
        prestadorId: null,
        valorTotal: 1000,
        dataPagamento: "09/20/2026",
        competencia: "09/2026",
        linhas,
        idempotencyKey: `rt-${++n}-${Math.random()}`,
      });
    expect((await rateio([{ projectId, percentual: 50 }, { projectId, percentual: 50 }])).error).toMatch(/duas vezes/);
    expect((await rateio([{ projectId: "00000000-0000-0000-0000-000000000000", percentual: 100 }])).error).toMatch(/não pertence/);
    // obra 2 sem Atual: bloqueia e informa.
    expect((await rateio([{ projectId, percentual: 50 }, { projectId: projeto2Id, percentual: 50 }])).error).toMatch(/não tem versão Atual/);
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    expect((await rateio([{ projectId, percentual: 100 }])).error).toMatch(/congelada/);
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
    const ok = await rateio([{ projectId, percentual: 100 }]);
    expect(ok.ok).toBe(true);
    // nada meio aplicado nas recusas: só o acerto que passou existe.
    const acertos = await db.select().from(schema.acertos).where(eq(schema.acertos.tenantId, tenantId));
    expect(acertos.filter((a) => a.obs === null && a.diferencaTipo === "NENHUMA" && Number(a.valorTransferido) === 1000)).toHaveLength(1);
  });
});
