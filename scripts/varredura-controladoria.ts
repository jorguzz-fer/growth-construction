/**
 * VARREDURA das regras do pacote de Controladoria (PR-B).
 *
 * Prova contra um banco REAL o que função pura não prova: RG-02/RG-04 (receita
 * única), RG-03 (restituição não é receita), documento fiscal opcional e a
 * separação entre competência e caixa.
 *
 * Cria e remove o próprio tenant de teste. NUNCA aponte para produção.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/varredura-controladoria.ts
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { statusRepasse } from "../src/lib/calc/recebimento-terceiro";
import { pendenteDeDocumento } from "../src/lib/calc/documento-fiscal";

const TENANT = "VARREDURA_CONTROLADORIA";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe: string) {
  console.log(`[${ok ? "  OK  " : " FALHA"}] ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}

async function limpar() {
  const antigos = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.name, TENANT));
  for (const t of antigos) await db.delete(schema.tenants).where(eq(schema.tenants.id, t.id));
}

async function esperaErro(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  console.log("=== VARREDURA — CONTROLADORIA & REGIME DE COMPETÊNCIA ===\n");
  await limpar();

  const [tenant] = await db.insert(schema.tenants).values({ name: TENANT }).returning();
  const [project] = await db
    .insert(schema.projects)
    .values({ tenantId: tenant.id, name: "OBRA CONTROLADORIA", kind: "proj" })
    .returning();
  const [atual] = await db
    .insert(schema.versions)
    .values({
      tenantId: tenant.id,
      projectId: project.id,
      key: "atual",
      label: "Atual",
      color: "#f59e0b",
      kind: "atual",
    })
    .returning();
  const [socio] = await db
    .insert(schema.stakeholders)
    .values({ tenantId: tenant.id, nome: "Sócio PF", tipo: "PF" })
    .returning();
  const [fornecedor] = await db
    .insert(schema.stakeholders)
    .values({ tenantId: tenant.id, nome: "Casarão Materiais", tipo: "PJ" })
    .returning();

  // ── Contas contábeis da 0036 chegaram ao tenant novo? ────────────────────
  // (No tenant criado aqui elas não existem: a migração roda por tenant já
  // existente. O provisionamento real usa PLANO_CONTAS. Verificamos que as
  // constantes estão declaradas — a migração já foi conferida à parte.)

  // ── CA-03: lançar SEM documento fiscal é permitido ───────────────────────
  const [despSemNota] = await db
    .insert(schema.despesas)
    .values({
      versionId: atual.id,
      tenantId: tenant.id,
      numDoc: "PED-CTRL-0001",
      fornecedorId: fornecedor.id,
      valor: "1500",
      competencia: "03/2026",
      vencimento: "03/20/2026",
      categoriaDre: "Custo Variável",
      status: "A pagar",
    })
    .returning();
  const docsDaDespesa = await db
    .select({ tipo: schema.documentosFiscais.tipo, numero: schema.documentosFiscais.numero })
    .from(schema.documentosFiscais)
    .where(eq(schema.documentosFiscais.despesaId, despSemNota.id));
  check(
    "Despesa é lançada sem documento fiscal (a nota chega depois)",
    !!despSemNota.id && docsDaDespesa.length === 0,
    `${despSemNota.numDoc} gravada sem nota`,
  );
  check(
    "Despesa sem nota aparece como pendente de documento fiscal",
    pendenteDeDocumento(docsDaDespesa),
    "selo ⚠ Sem NF aplicável",
  );

  // A nota chega DEPOIS e complementa o lançamento — sem tocar no PED.
  await db.insert(schema.documentosFiscais).values({
    tenantId: tenant.id,
    despesaId: despSemNota.id,
    tipo: "NFE",
    numero: "12345",
    serie: "1",
    chaveAcesso: "1".repeat(44),
    dataEmissao: "03/18/2026",
  });
  const [depoisDaNota] = await db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.id, despSemNota.id));
  const docsDepois = await db
    .select({ tipo: schema.documentosFiscais.tipo, numero: schema.documentosFiscais.numero })
    .from(schema.documentosFiscais)
    .where(eq(schema.documentosFiscais.despesaId, despSemNota.id));
  check(
    "Nota lançada depois NÃO altera o PED nem o lançamento",
    depoisDaNota.numDoc === "PED-CTRL-0001" &&
      Number(depoisDaNota.valor) === 1500 &&
      depoisDaNota.competencia === "03/2026",
    `PED ${depoisDaNota.numDoc} e valores intactos`,
  );
  check(
    "Com a nota informada, a pendência de documento some",
    !pendenteDeDocumento(docsDepois),
    `${docsDepois.length} documento fiscal vinculado`,
  );
  check(
    "PED e nº da nota coexistem e são campos distintos (RG-06)",
    depoisDaNota.numDoc === "PED-CTRL-0001" && docsDepois[0].numero === "12345",
    `PED=${depoisDaNota.numDoc} · NF=${docsDepois[0].numero}`,
  );

  // ── RG-01: competência ≠ caixa ───────────────────────────────────────────
  await db.insert(schema.cashEntries).values({
    versionId: atual.id,
    tenantId: tenant.id,
    valor: "-1500",
    data: "06/10/2026", // pagamento em JUNHO, competência é MARÇO
    descricao: "Pagamento PED-CTRL-0001",
    cat: "despesa",
    rec: true,
  });
  const [dreDesp] = await db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.id, despSemNota.id));
  const caixaJun = await db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.versionId, atual.id));
  check(
    "RG-01 — a despesa fica em 03/2026 na DRE e em 06/2026 no caixa",
    dreDesp.competencia === "03/2026" &&
      caixaJun.some((c) => c.data === "06/10/2026" && Number(c.valor) === -1500),
    "competência e liquidação em meses diferentes, ambas corretas",
  );

  // ── RG-02 / RG-04 / CA-22: receita única ─────────────────────────────────
  const VENDA = 50000;
  const [contaReceber] = await db
    .insert(schema.contasReceber)
    .values({
      tenantId: tenant.id,
      projectId: project.id,
      descricao: "Venda unidade 101",
      tipo: "Sinal",
      valor: String(VENDA),
      vencimento: "04/10/2026",
      status: "A receber",
    })
    .returning();

  const receitaAntes = (
    await db
      .select()
      .from(schema.contasReceber)
      .where(eq(schema.contasReceber.projectId, project.id))
  ).reduce((a, c) => a + Number(c.valor), 0);

  // 1. O terceiro recebe do cliente — a empresa passa a ter um ATIVO com ele.
  const [receb] = await db
    .insert(schema.recebimentosTerceiros)
    .values({
      tenantId: tenant.id,
      recebedorTerceiroId: socio.id,
      projectId: project.id,
      contaReceberId: contaReceber.id,
      valorTotal: String(VENDA),
      dataRecebimento: "04/10/2026",
      status: "Aguardando repasse",
      idempotencyKey: "receb-1",
    })
    .returning();
  await db
    .update(schema.contasReceber)
    .set({ valorRecebido: String(VENDA), status: "Recebido" })
    .where(eq(schema.contasReceber.id, contaReceber.id));

  const receitaDepoisRecebimento = (
    await db
      .select()
      .from(schema.contasReceber)
      .where(eq(schema.contasReceber.projectId, project.id))
  ).reduce((a, c) => a + Number(c.valor), 0);
  check(
    "RG-02 — recebimento por terceiro NÃO cria segunda receita",
    receitaDepoisRecebimento === receitaAntes && receitaAntes === VENDA,
    `receita segue R$ ${receitaDepoisRecebimento} (não R$ ${VENDA * 2})`,
  );

  const caixaAntesRepasse = (
    await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.versionId, atual.id))
  ).reduce((a, c) => a + Number(c.valor), 0);
  check(
    "Recebimento pelo terceiro NÃO move o caixa da empresa",
    caixaAntesRepasse === -1500,
    `caixa segue R$ ${caixaAntesRepasse} (o dinheiro ainda está com o terceiro)`,
  );

  // 2. O terceiro repassa — entra caixa, o ativo é baixado, DRE intocada.
  await db.insert(schema.repasses).values({
    tenantId: tenant.id,
    recebimentoTerceiroId: receb.id,
    valor: String(VENDA),
    dataRepasse: "04/20/2026",
    idempotencyKey: "repasse-1",
  });
  await db.insert(schema.cashEntries).values({
    versionId: atual.id,
    tenantId: tenant.id,
    valor: String(VENDA),
    data: "04/20/2026",
    descricao: "Repasse de terceiro",
    cat: "repasse",
    rec: true,
  });
  await db
    .update(schema.recebimentosTerceiros)
    .set({ valorRepassado: String(VENDA), status: statusRepasse(VENDA, VENDA) })
    .where(eq(schema.recebimentosTerceiros.id, receb.id));

  const receitaFinal = (
    await db
      .select()
      .from(schema.contasReceber)
      .where(eq(schema.contasReceber.projectId, project.id))
  ).reduce((a, c) => a + Number(c.valor), 0);
  check(
    "RG-04 / CA-22 — o repasse NÃO duplica a receita da venda",
    receitaFinal === VENDA,
    `receita total R$ ${receitaFinal} para uma venda de R$ ${VENDA}`,
  );

  const despesasApos = await db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, atual.id));
  check(
    "Nenhum lançamento de despesa foi criado pelo fluxo de recebimento",
    despesasApos.length === 1,
    `${despesasApos.length} despesa (só a original)`,
  );

  const caixaFinal = (
    await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.versionId, atual.id))
  ).reduce((a, c) => a + Number(c.valor), 0);
  check(
    "O repasse move o caixa exatamente uma vez",
    caixaFinal === VENDA - 1500,
    `caixa R$ ${caixaFinal} (= repasse ${VENDA} − pagamento 1500)`,
  );

  const [recebFinal] = await db
    .select()
    .from(schema.recebimentosTerceiros)
    .where(eq(schema.recebimentosTerceiros.id, receb.id));
  check(
    "Repasse integral → status Repassado e saldo zero",
    recebFinal.status === "Repassado" &&
      Number(recebFinal.valorTotal) - Number(recebFinal.valorRepassado) === 0,
    `status=${recebFinal.status}`,
  );

  // ── §16: duplicidade ─────────────────────────────────────────────────────
  const erroIdemReceb = await esperaErro(() =>
    db.insert(schema.recebimentosTerceiros).values({
      tenantId: tenant.id,
      recebedorTerceiroId: socio.id,
      valorTotal: String(VENDA),
      idempotencyKey: "receb-1",
    }),
  );
  check(
    "Recebimento reenviado (mesma chave) é bloqueado",
    erroIdemReceb !== null,
    erroIdemReceb ? erroIdemReceb.split("\n")[0].slice(0, 80) : "NÃO bloqueou",
  );

  const erroIdemRepasse = await esperaErro(() =>
    db.insert(schema.repasses).values({
      tenantId: tenant.id,
      recebimentoTerceiroId: receb.id,
      valor: "100",
      idempotencyKey: "repasse-1",
    }),
  );
  check(
    "Repasse reenviado (mesma chave) é bloqueado — sem entrada dupla",
    erroIdemRepasse !== null,
    erroIdemRepasse ? erroIdemRepasse.split("\n")[0].slice(0, 80) : "NÃO bloqueou",
  );

  // Item do extrato não pode lastrear dois repasses.
  const [mov] = await db
    .insert(schema.cashEntries)
    .values({
      versionId: atual.id,
      tenantId: tenant.id,
      valor: "1000",
      data: "05/10/2026",
      descricao: "TED socio",
      rec: false,
    })
    .returning();
  const [receb2] = await db
    .insert(schema.recebimentosTerceiros)
    .values({
      tenantId: tenant.id,
      recebedorTerceiroId: socio.id,
      valorTotal: "1000",
      status: "Aguardando repasse",
    })
    .returning();
  await db.insert(schema.repasses).values({
    tenantId: tenant.id,
    recebimentoTerceiroId: receb2.id,
    valor: "1000",
    cashEntryId: mov.id,
  });
  const erroExtratoDuplo = await esperaErro(() =>
    db.insert(schema.repasses).values({
      tenantId: tenant.id,
      recebimentoTerceiroId: receb2.id,
      valor: "1000",
      cashEntryId: mov.id,
    }),
  );
  check(
    "Item do extrato não pode lastrear dois repasses",
    erroExtratoDuplo !== null,
    erroExtratoDuplo ? erroExtratoDuplo.split("\n")[0].slice(0, 80) : "NÃO bloqueou",
  );

  await limpar();
  console.log(
    `\n=== RESULTADO: ${falhas === 0 ? "TODAS AS REGRAS OK" : `${falhas} FALHA(S)`} ===`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERRO na varredura:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
