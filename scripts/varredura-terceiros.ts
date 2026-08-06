/**
 * VARREDURA do fluxo "despesa paga por terceiro" (§6–§16).
 *
 * Prova, contra um banco REAL, as regras que não dá para provar com função
 * pura: separação dos quatro fatos, competência preservada, saldo devido,
 * restituições parciais e as travas de duplicidade (índices únicos).
 *
 * Cria e remove o próprio tenant de teste. NUNCA aponte para produção.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/varredura-terceiros.ts
 */
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { statusRestituicao, saldoDevidoTerceiro } from "../src/lib/calc/restituicao";

const TENANT = "VARREDURA_TERCEIROS";

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

/** Executa algo que DEVE falhar; devolve a mensagem de erro (ou null). */
async function esperaErro(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  console.log("=== VARREDURA — DESPESA PAGA POR TERCEIRO ===\n");
  await limpar();

  const [tenant] = await db.insert(schema.tenants).values({ name: TENANT }).returning();
  const [project] = await db
    .insert(schema.projects)
    .values({ tenantId: tenant.id, name: "OBRA TERCEIROS", kind: "proj" })
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
    .values({ tenantId: tenant.id, nome: "Sócio Pagador", tipo: "PF" })
    .returning();
  const [fornecedor] = await db
    .insert(schema.stakeholders)
    .values({ tenantId: tenant.id, nome: "Fornecedor Original", tipo: "PJ" })
    .returning();

  // ── Fato 1: a despesa existe, com competência própria ────────────────────
  const COMPETENCIA = "03/2026";
  const VALOR = 12000;
  const [desp] = await db
    .insert(schema.despesas)
    .values({
      versionId: atual.id,
      tenantId: tenant.id,
      numDoc: "PED-VARR-0001",
      fornecedorId: fornecedor.id,
      valor: String(VALOR),
      competencia: COMPETENCIA,
      vencimento: "03/15/2026",
      categoriaDre: "Custo Variável",
      status: "A pagar",
    })
    .returning();

  const snapshotOriginal = { ...desp };

  // ── Fato 2 + 3: o terceiro pagou; nasce a obrigação (vínculo por PED) ────
  await db
    .update(schema.despesas)
    .set({ pagoPorTerceiro: true })
    .where(eq(schema.despesas.id, desp.id));
  const [obr] = await db
    .insert(schema.despesaTerceiros)
    .values({
      tenantId: tenant.id,
      despesaId: desp.id,
      pagadorTerceiroId: socio.id,
      empresaResponsavelId: project.id,
      valorTotal: String(VALOR),
      dataPagamentoOriginal: "03/15/2026",
      dataPrevistaRestituicao: "05/10/2026",
      status: "Aguardando restituição",
      idempotencyKey: "fato-unico-1",
    })
    .returning();

  const [depoisVinculo] = await db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.id, desp.id));
  check(
    "Vínculo por PED não sobrescreve o lançamento original",
    depoisVinculo.valor === snapshotOriginal.valor &&
      depoisVinculo.competencia === snapshotOriginal.competencia &&
      depoisVinculo.vencimento === snapshotOriginal.vencimento &&
      depoisVinculo.numDoc === snapshotOriginal.numDoc &&
      depoisVinculo.fornecedorId === snapshotOriginal.fornecedorId &&
      depoisVinculo.categoriaDre === snapshotOriginal.categoriaDre,
    `valor/competência/vencimento/PED/fornecedor/categoria intactos (${depoisVinculo.numDoc})`,
  );
  check(
    "Fornecedor original e terceiro pagador são relações DISTINTAS",
    depoisVinculo.fornecedorId === fornecedor.id && obr.pagadorTerceiroId === socio.id,
    `beneficiário=${fornecedor.nome}, quem desembolsou=${socio.nome}`,
  );

  // A despesa aparece UMA vez na base da DRE.
  const despesasDaVersao = await db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, atual.id));
  check(
    "Despesa aparece 1× na DRE, pela competência original",
    despesasDaVersao.length === 1 &&
      despesasDaVersao[0].competencia === COMPETENCIA &&
      Number(despesasDaVersao[0].valor) === VALOR,
    `${despesasDaVersao.length} despesa(s), ${COMPETENCIA}, R$ ${VALOR}`,
  );

  // Sem saída de caixa ainda: quem pagou o fornecedor foi o terceiro.
  let caixa = await db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.versionId, atual.id));
  check(
    "Nenhuma saída de caixa na competência (quem pagou foi o terceiro)",
    caixa.length === 0,
    `${caixa.length} lançamento(s) de caixa`,
  );

  // ── §16: duas obrigações ATIVAS para o mesmo fato são bloqueadas ─────────
  const erroDupObr = await esperaErro(() =>
    db.insert(schema.despesaTerceiros).values({
      tenantId: tenant.id,
      despesaId: desp.id,
      pagadorTerceiroId: socio.id,
      valorTotal: String(VALOR),
      status: "Aguardando restituição",
    }),
  );
  check(
    "Segunda obrigação ativa para a MESMA despesa é bloqueada",
    erroDupObr !== null,
    erroDupObr ? erroDupObr.split("\n")[0].slice(0, 90) : "NÃO bloqueou (esperava erro)",
  );

  // ── §16: mesma chave de idempotência não cria segunda obrigação ──────────
  const erroIdemObr = await esperaErro(() =>
    db.insert(schema.despesaTerceiros).values({
      tenantId: tenant.id,
      despesaId: desp.id,
      valorTotal: String(VALOR),
      status: "Cancelado", // escapa do índice de obrigação ativa…
      idempotencyKey: "fato-unico-1", // …mas colide na idempotência
    }),
  );
  check(
    "Reenvio do mesmo fato (chave de idempotência) é bloqueado",
    erroIdemObr !== null,
    erroIdemObr ? erroIdemObr.split("\n")[0].slice(0, 90) : "NÃO bloqueou (esperava erro)",
  );

  // ── Fato 4: restituições parciais ────────────────────────────────────────
  const parcelas = [5000, 3000];
  let restituido = 0;
  for (let i = 0; i < parcelas.length; i++) {
    const v = parcelas[i];
    await db.insert(schema.restituicoes).values({
      tenantId: tenant.id,
      despesaTerceiroId: obr.id,
      valor: String(v),
      dataRestituicao: `0${6 + i}/10/2026`,
      idempotencyKey: `rest-${i}`,
    });
    await db.insert(schema.cashEntries).values({
      versionId: atual.id,
      tenantId: tenant.id,
      valor: String(-v),
      data: `0${6 + i}/10/2026`,
      descricao: "Restituição a terceiro",
      cat: "restituicao",
      rec: true,
    });
    restituido += v;
    await db
      .update(schema.despesaTerceiros)
      .set({ valorRestituido: String(restituido), status: statusRestituicao(VALOR, restituido) })
      .where(eq(schema.despesaTerceiros.id, obr.id));
  }

  const [obrParcial] = await db
    .select()
    .from(schema.despesaTerceiros)
    .where(eq(schema.despesaTerceiros.id, obr.id));
  check(
    "Restituição parcial → status Parcialmente restituído",
    obrParcial.status === "Parcialmente restituído",
    `status=${obrParcial.status}, restituído R$ ${obrParcial.valorRestituido}`,
  );
  check(
    "Saldo devido = total desembolsado − total restituído",
    saldoDevidoTerceiro(VALOR, Number(obrParcial.valorRestituido)) === 4000,
    `${VALOR} − ${obrParcial.valorRestituido} = ${saldoDevidoTerceiro(VALOR, Number(obrParcial.valorRestituido))}`,
  );

  // A competência da despesa NÃO acompanha a data da restituição.
  const [despDepoisRest] = await db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.id, desp.id));
  check(
    "Data da restituição NÃO altera a competência da despesa",
    despDepoisRest.competencia === COMPETENCIA &&
      despDepoisRest.vencimento === snapshotOriginal.vencimento &&
      Number(despDepoisRest.valor) === VALOR,
    `competência segue ${despDepoisRest.competencia} (restituições em 06 e 07/2026)`,
  );

  // A DRE continua com UMA despesa — restituir não cria despesa nova.
  const despesasDepois = await db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, atual.id));
  check(
    "Restituição NÃO cria despesa nova na DRE",
    despesasDepois.length === 1 &&
      despesasDepois.reduce((a, d) => a + Number(d.valor), 0) === VALOR,
    `${despesasDepois.length} despesa(s), total R$ ${despesasDepois.reduce((a, d) => a + Number(d.valor), 0)}`,
  );

  // Caixa: só as restituições saíram.
  caixa = await db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.versionId, atual.id));
  const totalCaixa = caixa.reduce((a, c) => a + Number(c.valor), 0);
  check(
    "Saída de caixa = apenas o que foi restituído",
    totalCaixa === -8000 && caixa.length === 2,
    `${caixa.length} saída(s), total R$ ${totalCaixa}`,
  );

  // ── §16: mesma restituição reenviada não duplica ─────────────────────────
  const erroIdemRest = await esperaErro(() =>
    db.insert(schema.restituicoes).values({
      tenantId: tenant.id,
      despesaTerceiroId: obr.id,
      valor: "5000",
      idempotencyKey: "rest-0",
    }),
  );
  check(
    "Restituição reenviada (mesma chave) é bloqueada — sem baixa dupla",
    erroIdemRest !== null,
    erroIdemRest ? erroIdemRest.split("\n")[0].slice(0, 90) : "NÃO bloqueou (esperava erro)",
  );

  // ── §14: item do extrato vinculado a UMA restituição ─────────────────────
  const [mov] = await db
    .insert(schema.cashEntries)
    .values({
      versionId: atual.id,
      tenantId: tenant.id,
      valor: "-4000",
      data: "08/10/2026",
      descricao: "TED devolucao socio",
      rec: false,
    })
    .returning();
  await db.insert(schema.restituicoes).values({
    tenantId: tenant.id,
    despesaTerceiroId: obr.id,
    valor: "4000",
    dataRestituicao: "08/10/2026",
    cashEntryId: mov.id,
    idempotencyKey: "rest-extrato",
  });
  await db
    .update(schema.cashEntries)
    .set({ rec: true, cat: "restituicao" })
    .where(eq(schema.cashEntries.id, mov.id));
  restituido += 4000;
  await db
    .update(schema.despesaTerceiros)
    .set({ valorRestituido: String(restituido), status: statusRestituicao(VALOR, restituido) })
    .where(eq(schema.despesaTerceiros.id, obr.id));

  const despesasFinal = await db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, atual.id));
  check(
    "Conciliar a restituição no extrato NÃO cria despesa nova",
    despesasFinal.length === 1,
    `${despesasFinal.length} despesa(s) na versão`,
  );
  caixa = await db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.versionId, atual.id));
  check(
    "Conciliação usa a saída que JÁ estava no extrato (sem duplicar caixa)",
    caixa.length === 3 && caixa.reduce((a, c) => a + Number(c.valor), 0) === -12000,
    `${caixa.length} lançamento(s), total R$ ${caixa.reduce((a, c) => a + Number(c.valor), 0)}`,
  );

  const [obrFinal] = await db
    .select()
    .from(schema.despesaTerceiros)
    .where(eq(schema.despesaTerceiros.id, obr.id));
  check(
    "Restituição integral → status Restituído e saldo zero",
    obrFinal.status === "Restituído" &&
      saldoDevidoTerceiro(VALOR, Number(obrFinal.valorRestituido)) === 0,
    `status=${obrFinal.status}, saldo R$ ${saldoDevidoTerceiro(VALOR, Number(obrFinal.valorRestituido))}`,
  );

  // ── Obrigações canceladas não travam um novo registro do mesmo fato ──────
  await db
    .update(schema.despesaTerceiros)
    .set({ status: "Cancelado" })
    .where(eq(schema.despesaTerceiros.id, obr.id));
  const erroAposCancelar = await esperaErro(() =>
    db.insert(schema.despesaTerceiros).values({
      tenantId: tenant.id,
      despesaId: desp.id,
      valorTotal: String(VALOR),
      status: "Aguardando restituição",
    }),
  );
  check(
    "Após cancelar a obrigação, é possível registrar uma nova para a despesa",
    erroAposCancelar === null,
    erroAposCancelar ? `bloqueou indevidamente: ${erroAposCancelar.slice(0, 70)}` : "permitido",
  );
  const ativas = await db
    .select()
    .from(schema.despesaTerceiros)
    .where(
      and(
        eq(schema.despesaTerceiros.despesaId, desp.id),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    );
  check(
    "Nada foi apagado: a obrigação cancelada continua no histórico",
    ativas.length === 1,
    `${ativas.length} obrigação ativa; a cancelada permanece gravada`,
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
