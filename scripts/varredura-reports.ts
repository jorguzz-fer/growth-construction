/**
 * VARREDURA end-to-end dos relatórios.
 *
 * Semeia dados CONHECIDOS na versão Atual de um projeto de teste (uma despesa e
 * uma venda com plano de pagamento) e verifica se cada relatório os enxerga.
 * Serve para provar a regra: "despesas e receitas lançadas devem aparecer na
 * versão atual de TODOS os reports".
 *
 * É destrutivo apenas do próprio tenant de teste, que é criado e removido pelo
 * script. NUNCA aponte para o banco de produção.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/varredura-reports.ts
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import {
  getDespesas,
  getContasPagar,
  getMonthlyRevenue,
  getUnits,
  getReceivables,
  getExpenseRows,
} from "../src/lib/queries";
import { flowMaps } from "../src/lib/fluxo-caixa";

const TENANT = "VARREDURA_TESTE";
const VALOR_DESPESA = 1234.56;
const VALOR_PARCELA = 5000;
const COMPETENCIA = "07/2026";
const VENC_DESPESA = "07/15/2026";
const DIA_PARCELA = "07/20/2026";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe: string) {
  const tag = ok ? "  OK  " : " FALHA";
  console.log(`[${tag}] ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}

async function limpar() {
  const antigos = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.name, TENANT));
  for (const t of antigos) {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  }
}

async function main() {
  console.log("=== VARREDURA DE RELATÓRIOS — versão Atual ===\n");
  await limpar();

  // ── Semeadura ────────────────────────────────────────────────────────────
  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: TENANT })
    .returning();
  const [project] = await db
    .insert(schema.projects)
    .values({ tenantId: tenant.id, name: "OBRA VARREDURA", kind: "proj" })
    .returning();
  const [atual] = await db
    .insert(schema.versions)
    .values({
      tenantId: tenant.id,
      projectId: project.id,
      key: "atual",
      label: "Atual",
      color: "#3b82f6",
      kind: "atual",
      isDefault: true,
    })
    .returning();

  // Uma DESPESA lançada na versão Atual.
  await db.insert(schema.despesas).values({
    versionId: atual.id,
    tenantId: tenant.id,
    numDoc: "PED-VARREDURA",
    valor: String(VALOR_DESPESA),
    status: "A pagar",
    competencia: COMPETENCIA,
    vencimento: VENC_DESPESA,
    categoriaDre: "Custo Fixo",
  });

  // Uma VENDA (unidade vendida) com plano de pagamento — origem da receita.
  await db.insert(schema.units).values({
    versionId: atual.id,
    tenantId: tenant.id,
    code: "APT-101",
    status: "Vendido",
    // Formato real do plano: `venc` (data da 1ª parcela) e `n` (quantidade).
    // O cast evita repetir aqui todo o shape do PaymentPlan; expandUnitReceivables
    // lê o plano de forma tolerante.
    paymentPlan: {
      AS: { venc: DIA_PARCELA, val: VALOR_PARCELA, n: 1, usarS1: false },
    } as never,
  });

  console.log(
    `Semeado: despesa R$ ${VALOR_DESPESA} (${COMPETENCIA}) e venda com parcela ` +
      `R$ ${VALOR_PARCELA} (${DIA_PARCELA}) na versão ATUAL.\n`,
  );

  // ── Verificações ─────────────────────────────────────────────────────────

  // 1. Despesas / Lançamentos
  const despesas = await getDespesas(atual.id);
  check(
    "Despesas / Lançamentos",
    despesas.length === 1 && Number(despesas[0].valor) === VALOR_DESPESA,
    `${despesas.length} despesa(s), total R$ ${despesas.reduce((a, d) => a + Number(d.valor), 0)}`,
  );

  // 2. Contas a Pagar
  const cp = await getContasPagar(tenant.id);
  check(
    "Contas a Pagar",
    cp.length === 1 && cp[0].valor === VALOR_DESPESA,
    `${cp.length} conta(s), total R$ ${cp.reduce((a, r) => a + r.valor, 0)}`,
  );

  // 3. Unidades / Vendas
  const units = await getUnits(atual.id);
  check("Unidades / Vendas", units.length === 1, `${units.length} unidade(s)`);

  // 4. Contas a Receber (recebíveis derivados do plano)
  const receb = await getReceivables(tenant.id);
  const totalReceb = receb.reduce((a, r) => a + r.valor, 0);
  check(
    "Contas a Receber (recebíveis)",
    receb.length > 0 && totalReceb === VALOR_PARCELA,
    `${receb.length} recebível(is), total R$ ${totalReceb}`,
  );

  // 5. RECEITA da versão Atual — base de DRE, Fluxo de Caixa e Dashboard.
  const receita = await getMonthlyRevenue(atual.id, project.id);
  const totalReceita = Object.values(receita).reduce((a, v) => a + v, 0);
  check(
    "Receita da versão Atual (DRE / Fluxo / Dashboard)",
    totalReceita === VALOR_PARCELA,
    `total R$ ${totalReceita} em ${JSON.stringify(receita)}`,
  );
  check(
    "Receita cai na competência correta",
    (receita["07/2026"] ?? 0) === VALOR_PARCELA,
    `07/2026 = R$ ${receita["07/2026"] ?? 0}`,
  );

  // 6. DESPESA vista pelos relatórios (mesma fonte usada por Fluxo e DRE).
  const expRows = await getExpenseRows(atual.id);
  const totalExp = expRows.reduce((a, r) => a + Number(r.valor), 0);
  check(
    "Despesa vista pelos relatórios (Fluxo / DRE)",
    totalExp === VALOR_DESPESA,
    `total R$ ${totalExp} em ${expRows.length} linha(s)`,
  );

  // 7. Coerência entre telas: o recebível exibido em Contas a Receber precisa
  //    ser exatamente a receita usada nos relatórios (fonte única).
  check(
    "Coerência Contas a Receber × relatórios",
    totalReceb === totalReceita,
    `Contas a Receber R$ ${totalReceb} × relatórios R$ ${totalReceita}`,
  );

  // 8. Coerência entre telas: Contas a Pagar × Despesas.
  check(
    "Coerência Contas a Pagar × Despesas",
    cp.reduce((a, r) => a + r.valor, 0) ===
      despesas.reduce((a, d) => a + Number(d.valor), 0),
    "totais iguais nas duas telas",
  );

  // ── 9. CONTA A RECEBER lançada compõe a projeção da versão Atual ─────────
  // A projeção de receita futura da Atual depende das contas a receber
  // lançadas — não só dos planos de pagamento das vendas.
  const VALOR_CR = 2500;
  await db.insert(schema.contasReceber).values({
    tenantId: tenant.id,
    projectId: project.id,
    descricao: "Receita avulsa lançada",
    tipo: "Outros",
    valor: String(VALOR_CR),
    vencimento: VENC_DESPESA, // 07/15/2026 → competência 07/2026
    status: "A receber",
  });
  const receitaComCR = await getMonthlyRevenue(atual.id, project.id);
  check(
    "Conta a receber lançada entra na projeção da Atual",
    (receitaComCR["07/2026"] ?? 0) === VALOR_PARCELA + VALOR_CR,
    `07/2026 = R$ ${receitaComCR["07/2026"] ?? 0} (venda ${VALOR_PARCELA} + conta ${VALOR_CR})`,
  );

  // ── 9b. Recebível FUTURO cai no mês do vencimento (Fluxo de Caixa) ───────
  // Uma parcela com vencimento em 2027 precisa aparecer em 2027 — não sumir.
  await db.insert(schema.units).values({
    versionId: atual.id,
    tenantId: tenant.id,
    code: "APT-202",
    status: "Vendido",
    paymentPlan: {
      Mensais: { venc: "01/20/2027", val: 324, n: 6, usarS1: false },
    } as never,
  });
  const receitaFut = await getMonthlyRevenue(atual.id, project.id);
  const meses2027 = ["01/2027", "02/2027", "03/2027", "04/2027", "05/2027", "06/2027"];
  const todosMeses = meses2027.every((m) => (receitaFut[m] ?? 0) === 324);
  check(
    "Parcelas futuras aparecem em CADA mês de vencimento",
    todosMeses,
    `${meses2027.map((m) => `${m}=${receitaFut[m] ?? 0}`).join(" ")}`,
  );

  // ── 10. VERSÕES Budget e Forecast: fonte diferente da Atual ──────────────
  // Atual  → despesas (tabela despesa) + recebíveis do plano de venda.
  // Budget/Forecast → budget_line (kind receita/despesa). São planejamento; NÃO
  // devem enxergar as despesas/vendas lançadas na Atual.
  const versoesPlan: Record<string, typeof schema.versions.$inferSelect> = {};
  for (const kind of ["budget", "forecast"] as const) {
    const [v] = await db
      .insert(schema.versions)
      .values({
        tenantId: tenant.id,
        projectId: project.id,
        key: kind,
        label: kind,
        color: "#888888",
        kind,
      })
      .returning();
    versoesPlan[kind] = v;

    // Sem budget_line, a versão de planejamento nasce zerada — e não pode
    // "vazar" os lançamentos da Atual.
    const semLinhas = await getMonthlyRevenue(v.id, project.id);
    check(
      `Receita ${kind} = 0 sem planejamento (não herda venda nem conta a receber)`,
      Object.values(semLinhas).reduce((a, x) => a + x, 0) === 0,
      `total R$ ${Object.values(semLinhas).reduce((a, x) => a + x, 0)}`,
    );

    // Com uma linha de receita planejada, a versão passa a mostrá-la.
    await db.insert(schema.budgetLines).values({
      versionId: v.id,
      tenantId: tenant.id,
      kind: "receita",
      rowKey: "R1",
      mes: COMPETENCIA,
      valor: "7777",
      pct: "100",
    });
    const comLinhas = await getMonthlyRevenue(v.id, project.id);
    check(
      `Receita ${kind} vem de budget_line`,
      (comLinhas[COMPETENCIA] ?? 0) === 7777,
      `${COMPETENCIA} = R$ ${comLinhas[COMPETENCIA] ?? 0}`,
    );

    // A Atual não pode ser contaminada pelo planejamento. O esperado é a soma
    // do que foi lançado NA ATUAL: recebível da venda + conta a receber.
    const esperadoAtual = VALOR_PARCELA + VALOR_CR;
    const atualDepois = await getMonthlyRevenue(atual.id, project.id);
    check(
      `Atual não é afetada pelo ${kind}`,
      (atualDepois[COMPETENCIA] ?? 0) === esperadoAtual,
      `Atual ${COMPETENCIA} = R$ ${atualDepois[COMPETENCIA] ?? 0} (esperado ${esperadoAtual})`,
    );
  }

  // ── 11. FLUXO DE CAIXA: números reais lançados em CADA versão ────────────
  console.log("\n--- Fluxo de Caixa por versão ---");

  // (a) Versão ATUAL: entradas = receita lançada; saídas = despesa lançada,
  //     no mês do VENCIMENTO (07/15/2026 → 07/2026).
  const fxAtual = await flowMaps(atual, project.id);
  check(
    "Fluxo Atual — entradas = receita lançada",
    (fxAtual.entradas["07/2026"] ?? 0) === VALOR_PARCELA + VALOR_CR,
    `07/2026 entradas = R$ ${fxAtual.entradas["07/2026"] ?? 0}`,
  );
  check(
    "Fluxo Atual — saídas = despesa lançada (mês do vencimento)",
    (fxAtual.saidas["07/2026"] ?? 0) === VALOR_DESPESA,
    `07/2026 saídas = R$ ${fxAtual.saidas["07/2026"] ?? 0}`,
  );
  check(
    "Fluxo Atual — parcelas futuras nos meses corretos",
    ["01/2027", "02/2027", "06/2027"].every((m) => (fxAtual.entradas[m] ?? 0) === 324),
    `01/2027=${fxAtual.entradas["01/2027"] ?? 0} 06/2027=${fxAtual.entradas["06/2027"] ?? 0}`,
  );

  // (b) Despesa CANCELADA não pode gerar saída.
  const [despCancel] = await db
    .insert(schema.despesas)
    .values({
      versionId: atual.id,
      tenantId: tenant.id,
      numDoc: "PED-CANCELADA",
      valor: "9999",
      status: "A pagar",
      competencia: COMPETENCIA,
      vencimento: VENC_DESPESA,
      categoriaDre: "Custo Fixo",
      cancelado: true,
    })
    .returning();
  const fxCancel = await flowMaps(atual, project.id);
  check(
    "Fluxo Atual — despesa CANCELADA não vira saída",
    (fxCancel.saidas["07/2026"] ?? 0) === VALOR_DESPESA,
    `07/2026 saídas = R$ ${fxCancel.saidas["07/2026"] ?? 0} (cancelada de 9.999 fora)`,
  );
  await db.delete(schema.despesas).where(eq(schema.despesas.id, despCancel.id));

  // (c) Budget/Forecast: o Fluxo traz o PLANEJAMENTO da versão, não os
  //     lançamentos da Atual.
  for (const kind of ["budget", "forecast"] as const) {
    const v = versoesPlan[kind];
    const fx = await flowMaps(v, project.id);
    check(
      `Fluxo ${kind} — entradas vêm do planejamento da própria versão`,
      (fx.entradas[COMPETENCIA] ?? 0) === 7777,
      `${COMPETENCIA} entradas = R$ ${fx.entradas[COMPETENCIA] ?? 0}`,
    );
    check(
      `Fluxo ${kind} — não herda as saídas lançadas na Atual`,
      (fx.saidas["07/2026"] ?? 0) === 0,
      `07/2026 saídas = R$ ${fx.saidas["07/2026"] ?? 0}`,
    );
  }

  // ── Encerramento ─────────────────────────────────────────────────────────
  await limpar();
  console.log(
    `\n=== RESULTADO: ${falhas === 0 ? "TODOS OS RELATÓRIOS OK" : `${falhas} FALHA(S)`} ===`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERRO na varredura:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
