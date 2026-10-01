import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt I, PR I-7a — terceiros e restituições (§20, §22, §23, 11.7, §27).
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

describe.skipIf(!HAS_DB)("Terceiros e restituições — integridade (Prompt I, PR I-7a)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addDespesa } = await import("./despesas");
  const { criarDespesaTerceiro, registrarRestituicao, cancelarRestituicao, getObrigacoesTerceiroPendentes } = await import("./restituicoes");
  const { confirmarRestituicaoLote } = await import("./restituicao-lote");
  const { registrarRepasse } = await import("./recebimento-terceiro");
  const { vinculosDaDespesa } = await import("@/lib/despesa-vinculos");
  const { getContasPagar } = await import("@/lib/queries");
  const { totalPendente } = await import("@/lib/contas-pagar-regras");
  let tenantId = "";
  let outroTenantId = "";
  let projectId = "";
  let versionId = "";
  let forecastId = "";
  let socioId = "";
  let n = 0;
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const novaDespesa = async (valor: string) => {
    const r = await addDespesa(fd({ projectId, categoriaDre: "Custo Variável", valor, competencia: "09/2026", vencimento: "09/30/2026" }));
    if (!r.ok) throw new Error((r as { error: string }).error);
    return (r as { id: string }).id;
  };
  const despesa = (id: string) => db.select().from(schema.despesas).where(eq(schema.despesas.id, id)).then((r) => r[0]);
  const obrigacao = (id: string) => db.select().from(schema.despesaTerceiros).where(eq(schema.despesaTerceiros.id, id)).then((r) => r[0]);
  const vincular = async (despesaId: string) => {
    const r = await criarDespesaTerceiro(fd({ projectId, despesaId, pagadorTerceiroId: socioId, dataPagamentoOriginal: "09/01/2026", idempotencyKey: `ob-${++n}` }));
    if (!r.ok) throw new Error(r.error);
    return r.obrigacaoId!;
  };

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "terc-I7a" }).returning();
    tenantId = t.id;
    const [t2] = await db.insert(schema.tenants).values({ name: "terc-I7a-outro" }).returning();
    outroTenantId = t2.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA I7" }).returning();
    projectId = p.id;
    for (const kind of ["atual", "forecast"] as const) {
      const [v] = await db
        .insert(schema.versions)
        .values({ projectId, tenantId, key: kind, kind, label: kind, color: "#000" })
        .returning();
      if (kind === "atual") versionId = v.id;
      else forecastId = v.id;
    }
    const [s] = await db.insert(schema.stakeholders).values({ tenantId, nome: "Sócio I7", papeis: ["Sócio/Quotista"] }).returning();
    socioId = s.id;
    ctxRef.current = { tenant: t, projects: [p], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    for (const id of [tenantId, outroTenantId]) if (id) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });

  it("§20 — vincular PED a terceiro: fornecedor pago; a despesa sai do pendente e a obrigação entra como 'a restituir'", async () => {
    const id = await novaDespesa("100");
    expect((await despesa(id)).status).toBe("A pagar");
    const obId = await vincular(id);
    const d = await despesa(id);
    expect(d.pagoPorTerceiro).toBe(true);
    expect(d.status).toBe("Pago");
    expect(d.valor).toBe("100.00");
    const contas = await getContasPagar(tenantId);
    expect(totalPendente(contas.filter((c) => c.id === id))).toBe(0);
    const obrig = (await getObrigacoesTerceiroPendentes(tenantId)).find((o) => o.obrigacaoId === obId)!;
    expect(obrig.valorSaldo).toBe(100);
    const [l] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, obId));
    expect(l.meta).toMatchObject({ vinculadoPorPed: true, statusAnterior: "A pagar" });
  });

  it("11.7 — PED de Previsão ou de versão congelada não recebe obrigação", async () => {
    const [prev] = await db
      .insert(schema.despesas)
      .values({ tenantId, versionId: forecastId, categoriaDre: "Custo Variável", valor: "50", status: "A pagar", competencia: "09/2026" })
      .returning();
    const r = await criarDespesaTerceiro(fd({ projectId, despesaId: prev.id, pagadorTerceiroId: socioId, idempotencyKey: `ob-${++n}` }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Atual/);
    const id = await novaDespesa("10");
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    const r2 = await criarDespesaTerceiro(fd({ projectId, despesaId: id, pagadorTerceiroId: socioId, idempotencyKey: `ob-${++n}` }));
    expect(r2.error).toMatch(/congelada/);
    expect((await despesa(id)).status).toBe("A pagar");
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
  });

  it("§22 — item do extrato de outra empresa é recusado; o desta empresa é conciliado", async () => {
    const id = await novaDespesa("40");
    const obId = await vincular(id);
    const [pOutro] = await db.insert(schema.projects).values({ tenantId: outroTenantId, name: "X" }).returning();
    const [vOutro] = await db.insert(schema.versions).values({ projectId: pOutro.id, tenantId: outroTenantId, key: "atual", kind: "atual", label: "A", color: "#000" }).returning();
    const [alheio] = await db.insert(schema.cashEntries).values({ tenantId: outroTenantId, versionId: vOutro.id, data: "09/15/2026", valor: "-40" }).returning();
    const r = await registrarRestituicao({ despesaTerceiroId: obId, projectId, valor: 40, dataRestituicao: "09/15/2026", cashEntryId: alheio.id, idempotencyKey: `rs-${++n}` });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/não encontrado/);
    const [alheioDepois] = await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.id, alheio.id));
    expect(alheioDepois.rec).toBe(false);
    const [meu] = await db.insert(schema.cashEntries).values({ tenantId, versionId, data: "09/15/2026", valor: "-40" }).returning();
    const r2 = await registrarRestituicao({ despesaTerceiroId: obId, projectId, valor: 40, dataRestituicao: "09/15/2026", cashEntryId: meu.id, idempotencyKey: `rs-${++n}` });
    expect(r2.ok).toBe(true);
    const [meuDepois] = await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.id, meu.id));
    expect(meuDepois.rec).toBe(true);
    expect(meuDepois.cat).toBe("restituicao");
    // §23 — a avulsa conta como vínculo da despesa.
    expect((await vinculosDaDespesa(db, tenantId, id)).restituicoes).toBe(1);
  });

  it("§23 — lote 100 = A 30 + B 70: cancelar devolve 30 a A e 70 a B, nunca 100 à âncora", async () => {
    const a = await vincular(await novaDespesa("30"));
    const b = await vincular(await novaDespesa("70"));
    const r = await confirmarRestituicaoLote({ terceiroId: socioId, projectId, valor: 100, dataRestituicao: "09/20/2026", manuais: [{ id: a, valor: 30 }, { id: b, valor: 70 }], idempotencyKey: `lt-${++n}` });
    expect(r.ok).toBe(true);
    expect(r.abatidos).toBe(2);
    expect((await obrigacao(a)).valorRestituido).toBe("30.00");
    expect((await obrigacao(b)).valorRestituido).toBe("70.00");
    const c = await cancelarRestituicao(r.restituicaoId!, projectId, "errado");
    expect(c).toEqual({ ok: true });
    expect((await obrigacao(a)).valorRestituido).toBe("0.00");
    expect((await obrigacao(a)).status).toBe("Aguardando restituição");
    expect((await obrigacao(b)).valorRestituido).toBe("0.00");
    const [rest] = await db.select().from(schema.restituicoes).where(eq(schema.restituicoes.id, r.restituicaoId!));
    expect(rest.cancelada).toBe(true);
  });

  it("11.7 — versão congelada bloqueia restituição avulsa, em lote e repasse", async () => {
    const obId = await vincular(await novaDespesa("20"));
    const [rec] = await db.insert(schema.recebimentosTerceiros).values({ tenantId, recebedorTerceiroId: socioId, projectId, valorTotal: "50" }).returning();
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versionId));
    expect((await registrarRestituicao({ despesaTerceiroId: obId, projectId, valor: 20, dataRestituicao: "09/21/2026", idempotencyKey: `rs-${++n}` })).error).toMatch(/congelada/);
    expect((await confirmarRestituicaoLote({ terceiroId: socioId, projectId, valor: 20, dataRestituicao: "09/21/2026", idempotencyKey: `lt-${++n}` })).error).toMatch(/congelada/);
    expect((await registrarRepasse({ recebimentoTerceiroId: rec.id, projectId, valor: 50, dataRepasse: "09/21/2026", idempotencyKey: `rp-${++n}` })).error).toMatch(/congelada/);
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versionId));
    expect((await registrarRepasse({ recebimentoTerceiroId: rec.id, projectId, valor: 50, dataRepasse: "09/21/2026", idempotencyKey: `rp-${++n}` })).ok).toBe(true);
  });
});
