/**
 * VARREDURA da baixa (confirmação de recebimento) em Contas a Receber.
 *
 * Prova contra banco REAL, do lado do dado e não só do cálculo:
 *  · a baixa cria UMA entrada de caixa positiva e nada mais;
 *  · a baixa NÃO cria linha de receita em lugar nenhum (RG-01);
 *  · baixa parcial e baixa total levam a conta ao status certo;
 *  · baixa acima do saldo é recusada;
 *  · o estorno devolve a conta exatamente ao estado anterior;
 *  · a conciliação feita no Caixa Diário aparece aqui como "recebida",
 *    e NÃO pode ser estornada por esta tela;
 *  · conta cancelada não recebe baixa.
 *
 * Cria e remove o próprio tenant de teste. NUNCA aponte para produção.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/varredura-baixa-receber.ts
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import {
  CAT_BAIXA_RECEBER,
  aposEstorno,
  baixaCabe,
  conciliadaNoCaixa,
  origemDaBaixa,
  podeBaixar,
  saldoAReceber,
  statusAposBaixa,
  totalBaixado,
} from "../src/lib/calc/baixa-receber";

const TENANT = "VARREDURA_BAIXA_RECEBER";

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

async function main() {
  console.log("=== VARREDURA — BAIXA EM CONTAS A RECEBER ===\n");
  await limpar();

  const [tenant] = await db.insert(schema.tenants).values({ name: TENANT }).returning();
  const [projeto] = await db
    .insert(schema.projects)
    .values({ tenantId: tenant.id, name: "OBRA BAIXA", kind: "proj" })
    .returning();
  const [versao] = await db
    .insert(schema.versions)
    .values({
      tenantId: tenant.id,
      projectId: projeto.id,
      key: "atual",
      label: "Atual",
      color: "#f59e0b",
      kind: "atual",
    })
    .returning();
  const [banco] = await db
    .insert(schema.bankAccounts)
    .values({ tenantId: tenant.id, banco: "Banco Teste", cc: "12345-6" })
    .returning();

  const criarConta = async (descricao: string, valor: number) => {
    const [cr] = await db
      .insert(schema.contasReceber)
      .values({
        tenantId: tenant.id,
        projectId: projeto.id,
        descricao,
        tipo: "Parcela mensal",
        valor: String(valor),
        vencimento: "03/10/2026",
        status: "A receber",
      })
      .returning();
    return cr;
  };

  /**
   * Reproduz o EFEITO da server action `baixarContaReceber` direto no banco.
   * A action não roda fora do request do Next (depende de sessão/cookies), então
   * a varredura executa a mesma sequência e confere o estado resultante.
   */
  const baixar = async (
    contaId: string,
    valor: number,
    data: string,
  ): Promise<{ ok: boolean; error?: string; cashEntryId?: string }> => {
    const [cr] = await db
      .select()
      .from(schema.contasReceber)
      .where(eq(schema.contasReceber.id, contaId));
    const permitido = podeBaixar(Number(cr.valor), Number(cr.valorRecebido), cr.cancelado);
    if (!permitido.ok) return { ok: false, error: permitido.motivo };
    if (!baixaCabe(Number(cr.valor), Number(cr.valorRecebido), valor)) {
      return { ok: false, error: "Valor acima do saldo em aberto." };
    }
    const novo = Math.round((Number(cr.valorRecebido) + valor) * 100) / 100;
    const [mov] = await db
      .insert(schema.cashEntries)
      .values({
        versionId: versao.id,
        tenantId: tenant.id,
        bankAccountId: banco.id,
        data,
        descricao: `Recebimento: ${cr.descricao}`,
        valor: String(Math.abs(valor)),
        cat: CAT_BAIXA_RECEBER,
        rec: true,
        conciliadoContaReceberId: cr.id,
        conciliadoPor: "varredura@teste",
        conciliadoEm: new Date().toISOString(),
      })
      .returning();
    await db
      .update(schema.contasReceber)
      .set({
        valorRecebido: String(novo),
        status: statusAposBaixa(Number(cr.valor), novo),
        dataRecebimento: data,
        bancoId: banco.id,
      })
      .where(eq(schema.contasReceber.id, cr.id));
    return { ok: true, cashEntryId: mov.id };
  };

  const estornar = async (contaId: string, cashEntryId: string) => {
    const [mov] = await db
      .select()
      .from(schema.cashEntries)
      .where(eq(schema.cashEntries.id, cashEntryId));
    if (origemDaBaixa(mov.cat) !== "manual") {
      return { ok: false, error: "Movimento do extrato: desfaça no Caixa Diário." };
    }
    const [cr] = await db
      .select()
      .from(schema.contasReceber)
      .where(eq(schema.contasReceber.id, contaId));
    const est = aposEstorno(Number(cr.valor), Number(cr.valorRecebido), Number(mov.valor));
    await db.delete(schema.cashEntries).where(eq(schema.cashEntries.id, cashEntryId));
    await db
      .update(schema.contasReceber)
      .set({
        valorRecebido: String(est.valorRecebido),
        status: est.status,
        dataRecebimento: est.valorRecebido <= 0 ? null : cr.dataRecebimento,
      })
      .where(eq(schema.contasReceber.id, cr.id));
    return { ok: true };
  };

  const lerConta = async (id: string) => {
    const [cr] = await db
      .select()
      .from(schema.contasReceber)
      .where(eq(schema.contasReceber.id, id));
    return cr;
  };
  const lerBaixas = async (id: string) => {
    const movs = await db
      .select()
      .from(schema.cashEntries)
      .where(
        and(
          eq(schema.cashEntries.tenantId, tenant.id),
          eq(schema.cashEntries.conciliadoContaReceberId, id),
        ),
      );
    return movs.map((m) => ({
      cashEntryId: m.id,
      data: m.data,
      valor: Math.abs(Number(m.valor)),
      cat: m.cat,
    }));
  };

  // ── 1. BAIXA PARCIAL ────────────────────────────────────────────────────
  const c1 = await criarConta("Sinal do apto 101", 10000);
  const b1 = await baixar(c1.id, 4000, "03/10/2026");
  check("Baixa parcial é aceita", b1.ok, b1.error ?? "registrada");
  let cr1 = await lerConta(c1.id);
  check(
    "Conta fica 'Parcialmente recebido' após baixa parcial",
    cr1.status === "Parcialmente recebido",
    `status ${cr1.status}`,
  );
  check(
    "Valor recebido acumula 4.000 dos 10.000",
    Number(cr1.valorRecebido) === 4000,
    `recebido ${cr1.valorRecebido}`,
  );
  check(
    "Saldo em aberto cai para 6.000",
    saldoAReceber(Number(cr1.valor), Number(cr1.valorRecebido)) === 6000,
    `saldo ${saldoAReceber(Number(cr1.valor), Number(cr1.valorRecebido))}`,
  );
  check(
    "Data do recebimento é gravada na conta",
    cr1.dataRecebimento === "03/10/2026",
    `data ${cr1.dataRecebimento}`,
  );

  // ── 2. A BAIXA É EVENTO DE CAIXA, NÃO DE RESULTADO ──────────────────────
  const movs1 = await lerBaixas(c1.id);
  check("A baixa cria exatamente UMA entrada de caixa", movs1.length === 1, `${movs1.length} movimento(s)`);
  check(
    "A entrada de caixa é POSITIVA e do valor recebido",
    movs1[0].valor === 4000,
    `valor ${movs1[0].valor}`,
  );
  const [movRaw] = await db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.id, movs1[0].cashEntryId));
  check(
    "O sinal gravado é positivo (entrada, não saída)",
    Number(movRaw.valor) > 0,
    `valor bruto ${movRaw.valor}`,
  );
  check(
    "A entrada nasce já conciliada e vinculada à conta",
    movRaw.rec === true && movRaw.conciliadoContaReceberId === c1.id,
    `rec=${movRaw.rec} vinculo=${movRaw.conciliadoContaReceberId === c1.id}`,
  );
  check(
    "A baixa NÃO cria nova conta a receber (não duplica a receita)",
    (await db.select().from(schema.contasReceber).where(eq(schema.contasReceber.tenantId, tenant.id)))
      .length === 1,
    "apenas a conta original existe",
  );
  check(
    "A baixa NÃO cria despesa nem linha de orçamento",
    (await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tenant.id))).length === 0,
    "nenhuma despesa criada",
  );

  // ── 3. BAIXA ACIMA DO SALDO É RECUSADA ──────────────────────────────────
  const excesso = await baixar(c1.id, 6500, "04/10/2026");
  check("Baixa acima do saldo é recusada", !excesso.ok, excesso.error ?? "aceitou indevidamente");
  cr1 = await lerConta(c1.id);
  check(
    "A recusa não altera o valor recebido",
    Number(cr1.valorRecebido) === 4000,
    `recebido ${cr1.valorRecebido}`,
  );
  check(
    "A recusa não cria movimento de caixa",
    (await lerBaixas(c1.id)).length === 1,
    "continua com 1 movimento",
  );

  // ── 4. BAIXA QUE FECHA A CONTA ──────────────────────────────────────────
  const b2 = await baixar(c1.id, 6000, "04/10/2026");
  check("Baixa do saldo restante é aceita", b2.ok, b2.error ?? "registrada");
  cr1 = await lerConta(c1.id);
  check("Conta fica 'Recebido'", cr1.status === "Recebido", `status ${cr1.status}`);
  check("Saldo zera", saldoAReceber(Number(cr1.valor), Number(cr1.valorRecebido)) === 0, "saldo 0");
  const movs2 = await lerBaixas(c1.id);
  check("Duas baixas somam o valor da conta", totalBaixado(movs2) === 10000, `soma ${totalBaixado(movs2)}`);
  check(
    "Conta quitada não aceita nova baixa",
    !podeBaixar(Number(cr1.valor), Number(cr1.valorRecebido), cr1.cancelado).ok,
    "bloqueada",
  );

  // ── 5. ESTORNO DEVOLVE AO ESTADO ANTERIOR ───────────────────────────────
  const est = await estornar(c1.id, b2.cashEntryId!);
  check("Estorno da baixa manual é aceito", est.ok, est.error ?? "estornada");
  cr1 = await lerConta(c1.id);
  check(
    "Após estorno a conta volta a 'Parcialmente recebido' com 4.000",
    cr1.status === "Parcialmente recebido" && Number(cr1.valorRecebido) === 4000,
    `status ${cr1.status} · recebido ${cr1.valorRecebido}`,
  );
  check(
    "O movimento de caixa estornado some do caixa",
    (await lerBaixas(c1.id)).length === 1,
    "1 movimento restante",
  );

  // ── 6. CONCILIAÇÃO VINDA DO CAIXA DIÁRIO ────────────────────────────────
  const c2 = await criarConta("Parcela do apto 202", 5000);
  const [movExtrato] = await db
    .insert(schema.cashEntries)
    .values({
      versionId: versao.id,
      tenantId: tenant.id,
      bankAccountId: banco.id,
      data: "05/12/2026",
      descricao: "TED CLIENTE",
      valor: "5000",
      cat: "extrato",
      rec: true,
      conciliadoContaReceberId: c2.id,
      conciliadoPor: "caixa@teste",
      conciliadoEm: new Date().toISOString(),
    })
    .returning();
  await db
    .update(schema.contasReceber)
    .set({ valorRecebido: "5000", status: "Recebido", dataRecebimento: "05/12/2026" })
    .where(eq(schema.contasReceber.id, c2.id));
  const baixasC2 = await lerBaixas(c2.id);
  check(
    "Receita conciliada no Caixa Diário aparece como baixada em Contas a Receber",
    baixasC2.length === 1 && conciliadaNoCaixa(baixasC2),
    `${baixasC2.length} baixa(s), origem ${baixasC2[0] ? origemDaBaixa(baixasC2[0].cat) : "—"}`,
  );
  const estExtrato = await estornar(c2.id, movExtrato.id);
  check(
    "Movimento do extrato NÃO pode ser estornado por esta tela",
    !estExtrato.ok,
    estExtrato.error ?? "estornou indevidamente",
  );
  check(
    "O movimento do extrato continua intacto após a tentativa",
    (await lerBaixas(c2.id)).length === 1,
    "movimento preservado",
  );

  // ── 7. CONTA CANCELADA ──────────────────────────────────────────────────
  const c3 = await criarConta("Conta cancelada", 3000);
  await db
    .update(schema.contasReceber)
    .set({ cancelado: true, status: "Cancelada" })
    .where(eq(schema.contasReceber.id, c3.id));
  const bCancel = await baixar(c3.id, 1000, "06/10/2026");
  check("Conta cancelada não recebe baixa", !bCancel.ok, bCancel.error ?? "aceitou indevidamente");
  check(
    "A recusa não cria movimento de caixa para a conta cancelada",
    (await lerBaixas(c3.id)).length === 0,
    "nenhum movimento",
  );

  // ── 8. FLUXO DE CAIXA REALIZADO ─────────────────────────────────────────
  const todos = await db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.tenantId, tenant.id));
  const entradas = todos.filter((m) => Number(m.valor) > 0);
  check(
    "Todas as baixas entram no caixa como ENTRADA (nenhuma vira saída)",
    entradas.length === todos.length,
    `${entradas.length} de ${todos.length} movimentos são entradas`,
  );
  const soma = entradas.reduce((a, m) => a + Number(m.valor), 0);
  check(
    "Total no caixa = 4.000 (baixa parcial) + 5.000 (extrato) = 9.000",
    soma === 9000,
    `soma ${soma}`,
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
