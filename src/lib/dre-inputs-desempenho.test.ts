import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Desempenho da DRE (27/10/2026): despesas e encargos passaram a ser somados no
 * banco e cada versão é lida uma vez por requisição. Este teste prova que os
 * NÚMEROS NÃO MUDARAM: compara com a regra antiga (linha a linha), recalculada
 * aqui a partir das mesmas tabelas. Banco real.
 */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));

describe.skipIf(!HAS_DB)("DRE · mesmos números com a leitura agrupada", async () => {
  const { db, schema } = await import("@/lib/db");
  const { versionInputsByMonth, foraDaCascataDaVersao, getEncargosPorCompetencia } = await import("./dre-inputs");
  const { getEncargosByVersion } = await import("./actions/pagamentos");
  const { getExpenseRows, getExpenseRowsAgrupadas } = await import("./queries");
  const { resumirForaDaCascata } = await import("./dre");
  let tenantId = "";
  let atual = "";
  let budget = "";
  let projectId = "";

  /** A regra ANTIGA dos encargos: pagamento a pagamento, somando em JavaScript. */
  async function encargosAntigos(versionId: string, porCompetencia: boolean) {
    const rows = await db
      .select({ data: schema.pagamentos.dataPagamento, competencia: schema.despesas.competencia, multa: schema.pagamentos.multa, juros: schema.pagamentos.juros, outros: schema.pagamentos.outrosAcrescimos, desconto: schema.pagamentos.desconto })
      .from(schema.pagamentos)
      .innerJoin(schema.despesas, eq(schema.pagamentos.despesaId, schema.despesas.id))
      .where(eq(schema.despesas.versionId, versionId));
    const out: Record<string, number> = {};
    for (const r of rows) {
      const enc = Number(r.multa) + Number(r.juros) + Number(r.outros) - Number(r.desconto);
      let mm: string | null;
      if (porCompetencia) mm = r.competencia && r.competencia.trim() ? r.competencia.trim() : "—";
      else {
        const p = (r.data ?? "").split("/");
        mm = p.length === 3 ? `${p[0]}/${p[2]}` : null;
      }
      if (mm) out[mm] = (out[mm] || 0) + enc;
    }
    return out;
  }

  const perto = (a: Record<string, number>, b: Record<string, number>) => {
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) expect(a[k], k).toBeCloseTo(b[k], 6);
  };

  beforeAll(async () => {
    tenantId = (await db.insert(schema.tenants).values({ name: "tenant-dre-desempenho" }).returning())[0].id;
    projectId = (await db.insert(schema.projects).values({ tenantId, name: "OBRA DRE" }).returning())[0].id;
    atual = (await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning())[0].id;
    budget = (await db.insert(schema.versions).values({ projectId, tenantId, key: "budget", kind: "budget", label: "Orçamento", color: "#000" }).returning())[0].id;
    const d = (valor: string, categoriaDre: string | null, competencia: string | null, contaCef: string | null, cancelado = false) =>
      ({ tenantId, versionId: atual, valor, categoriaDre, competencia, contaCef, cancelado, status: "Pago" }) as typeof schema.despesas.$inferInsert;
    const ids = await db
      .insert(schema.despesas)
      .values([
        d("100.10", "Custo Variável", "03/2026", "3.1"),
        d("0.10", "Custo Fixo", "03/2026", "3.2"),
        d("0.20", "Custo Fixo", "03/2026", "3.2"),
        d("0.70", "Custo Fixo", "3/2026", "3.2"),
        d("50", null, "04/2026", "3.3"),
        d("60", "Custo Fixo", null, "3.2"),
        d("70", "Custo Fixo", "  ", "3.2"),
        d("80", "Receita", "04/2026", "1.1"),
        d("90", "Custo Fixo", "04/2026", "3.2", true),
        d("33.33", "Despesas Financeiras", "05/2026", null),
      ])
      .returning({ id: schema.despesas.id });
    await db.insert(schema.pagamentos).values(
      ["07/09/2026", "", "7/9/2026", "lixo", "08/01/2026"].map((dataPagamento, i) => ({
        tenantId,
        despesaId: ids[i % ids.length].id,
        dataPagamento,
        valorTotalPago: "1",
        multa: "1.5",
        juros: "2.25",
        outrosAcrescimos: "0.33",
        desconto: "0.5",
      })),
    );
    await db.insert(schema.budgetLines).values([
      { tenantId, versionId: budget, kind: "despesa", rowKey: "3.1", mes: "03/2026", valor: "10", dreCategory: "Custo Fixo" },
      { tenantId, versionId: budget, kind: "despesa", rowKey: "3.2", mes: "04/2026", valor: "20.5", dreCategory: "Custo Variável" },
    ] as typeof schema.budgetLines.$inferInsert[]);
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("a leitura agrupada soma o mesmo que a linha a linha, por categoria e competência, e conta os lançamentos", async () => {
    for (const vid of [atual, budget]) {
      const linhas = await getExpenseRows(vid);
      const grupos = await getExpenseRowsAgrupadas(vid);
      const soma = (rs: { categoriaDre: string | null; competencia: string | null; valor: number }[]) => {
        const o: Record<string, number> = {};
        for (const r of rs) o[`${r.categoriaDre}|${r.competencia}`] = (o[`${r.categoriaDre}|${r.competencia}`] || 0) + r.valor;
        return o;
      };
      perto(soma(grupos), soma(linhas));
      expect(grupos.reduce((s, g) => s + g.quantidade, 0)).toBe(linhas.length);
    }
  });

  it("o rodapé (o que fica fora da cascata) é o mesmo, inclusive a quantidade de lançamentos", async () => {
    for (const receitaFora of [false, true]) {
      const antigo = resumirForaDaCascata(await getExpenseRows(atual), { receitaFora });
      const novo = await foraDaCascataDaVersao(atual, { definicaoNova: receitaFora });
      expect(novo.semCategoria.qtd).toBe(antigo.semCategoria.qtd);
      expect(novo.semCompetencia.qtd).toBe(antigo.semCompetencia.qtd);
      expect(novo.semCategoria.valor).toBeCloseTo(antigo.semCategoria.valor, 6);
      expect(novo.semCompetencia.valor).toBeCloseTo(antigo.semCompetencia.valor, 6);
      expect(novo.comoReceita?.qtd).toBe(antigo.comoReceita?.qtd);
    }
    expect((await foraDaCascataDaVersao(atual)).semCategoria.qtd).toBe(1);
    expect((await foraDaCascataDaVersao(atual)).semCompetencia.qtd).toBe(2);
  });

  it("os encargos (por pagamento e por competência) são os mesmos — datas malformadas incluídas", async () => {
    perto(await getEncargosByVersion(atual), await encargosAntigos(atual, false));
    perto(await getEncargosPorCompetencia(atual), await encargosAntigos(atual, true));
    expect(Object.keys(await getEncargosByVersion(atual)).sort()).toEqual(["07/2026", "08/2026", "7/2026"]);
  });

  it("a cascata por mês segue a regra antiga, e quem altera o resultado não contamina a próxima leitura", async () => {
    const { NO_COMP } = await import("./calc/dre-cascata");
    const linhas = await getExpenseRows(atual);
    const enc = await getEncargosByVersion(atual);
    const esperado: Record<string, Record<string, number>> = {};
    for (const r of linhas) {
      if (!r.categoriaDre) continue;
      const mm = r.competencia ?? NO_COMP; // exatamente a chave antiga
      (esperado[mm] ??= {})[r.categoriaDre] = (esperado[mm]?.[r.categoriaDre] || 0) + r.valor;
    }
    for (const [mm, v] of Object.entries(enc)) (esperado[mm] ??= {})["Despesas Financeiras"] = (esperado[mm]?.["Despesas Financeiras"] || 0) + v;
    const inp = await versionInputsByMonth(tenantId, atual, projectId);
    for (const [mm, cats] of Object.entries(esperado))
      for (const [cat, v] of Object.entries(cats)) expect(inp[mm]?.byCat[cat], `${mm} ${cat}`).toBeCloseTo(v, 6);
    // O resultado é uma cópia: mexer nele não muda a próxima leitura.
    inp["03/2026"].byCat["Custo Fixo"] = 999999;
    expect((await versionInputsByMonth(tenantId, atual, projectId))["03/2026"].byCat["Custo Fixo"]).toBeCloseTo(0.3, 6);
  });
});
