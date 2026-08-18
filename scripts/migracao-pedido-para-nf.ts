/**
 * FASE 1 de 2 — RELATÓRIO da migração "nº do pedido → documento fiscal".
 *
 * Este script **não altera nada**. Ele só lê e gera `migracao_pedido_para_nf.csv`
 * para conferência humana.
 *
 * O problema que ele mapeia: antes de o bloco Documento Fiscal existir, o único
 * campo disponível para "número" era o do pedido. Onde o valor gravado NÃO
 * segue o padrão `PED-NNNNNN`, é forte indício de que o usuário digitou ali o
 * número da nota, por falta de lugar melhor.
 *
 * O que ele NÃO faz, de propósito:
 *   - não copia valor nenhum para `documento_fiscal`;
 *   - não altera `despesa.num_doc`;
 *   - não renumera nada.
 *
 * A cópia só acontece na FASE 2 (`--aplicar`), depois de você conferir o CSV
 * linha a linha. A fase 2 preserva o valor original em `legado_numero_pedido` e
 * registra cada alteração na auditoria.
 *
 *   # Fase 1 — só o relatório (seguro, somente leitura)
 *   DATABASE_URL=postgres://... npx tsx scripts/migracao-pedido-para-nf.ts
 *
 *   # Fase 2 — aplicar, DEPOIS de aprovar o CSV
 *   DATABASE_URL=postgres://... npx tsx scripts/migracao-pedido-para-nf.ts --aplicar
 */
import { writeFileSync } from "node:fs";
import { eq, isNotNull } from "drizzle-orm";
import { db, schema } from "../src/lib/db";

/** Padrão da numeração interna: PED- seguido de dígitos. */
const PADRAO_PED = /^PED-\d+$/i;

const APLICAR = process.argv.includes("--aplicar");
const SAIDA = "migracao_pedido_para_nf.csv";

/** Escapa um campo para CSV (o nome da obra pode ter vírgula). */
function csv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const rows = await db
    .select({
      id: schema.despesas.id,
      numDoc: schema.despesas.numDoc,
      valor: schema.despesas.valor,
      competencia: schema.despesas.competencia,
      cancelado: schema.despesas.cancelado,
      tenantId: schema.despesas.tenantId,
      tenantNome: schema.tenants.name,
      projectName: schema.projects.name,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .innerJoin(schema.tenants, eq(schema.despesas.tenantId, schema.tenants.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(isNotNull(schema.despesas.numDoc));

  // Candidatos: número que NÃO segue o padrão da numeração interna.
  const candidatos = rows.filter((r) => r.numDoc && !PADRAO_PED.test(r.numDoc.trim()));

  const linhas = [
    [
      "despesa_id",
      "empresa",
      "obra",
      "fornecedor",
      "competencia",
      "valor",
      "valor_atual_num_doc",
      "valor_proposto_documento_fiscal",
      "cancelado",
      "acao_sugerida",
    ].join(","),
    ...candidatos.map((r) =>
      [
        csv(r.id),
        csv(r.tenantNome),
        csv(r.projectName),
        csv(r.fornecedorNome ?? ""),
        csv(r.competencia ?? ""),
        csv(r.valor),
        csv(r.numDoc),
        csv(r.numDoc),
        csv(r.cancelado ? "SIM" : "não"),
        csv(
          r.cancelado
            ? "IGNORAR (lançamento cancelado)"
            : "copiar para documento_fiscal.numero e manter o original",
        ),
      ].join(","),
    ),
  ];
  writeFileSync(SAIDA, linhas.join("\n"), "utf8");

  console.log("=== MIGRAÇÃO nº do pedido → documento fiscal ===\n");
  console.log(`Despesas com número gravado ......... ${rows.length}`);
  console.log(`Já no padrão PED-NNNNNN (intocadas) . ${rows.length - candidatos.length}`);
  console.log(`Candidatas a serem nº de nota ....... ${candidatos.length}`);
  console.log(`\nRelatório gravado em: ${SAIDA}`);

  if (!APLICAR) {
    console.log(
      "\nFASE 1 concluída. NADA foi alterado no banco.\n" +
        "Confira o CSV linha a linha e, só depois de aprovar, rode com --aplicar.",
    );
    return;
  }

  // ── FASE 2 — aplicar, após aprovação humana ────────────────────────────
  console.log("\n=== FASE 2 — aplicando (após aprovação) ===");
  let criados = 0;
  let pulados = 0;
  for (const r of candidatos) {
    if (r.cancelado) {
      pulados++;
      continue;
    }
    // Não sobrescreve documento fiscal que já exista para a despesa.
    const [jaTem] = await db
      .select({ id: schema.documentosFiscais.id })
      .from(schema.documentosFiscais)
      .where(eq(schema.documentosFiscais.despesaId, r.id))
      .limit(1);
    if (jaTem) {
      pulados++;
      continue;
    }
    await db.insert(schema.documentosFiscais).values({
      tenantId: r.tenantId,
      despesaId: r.id,
      // Tipo indefinido: quem confere decide depois se é NF-e, recibo etc. O
      // script não adivinha a natureza do documento.
      tipo: "RECIBO",
      numero: r.numDoc,
      dataEmissao: r.competencia,
    });
    // O valor ORIGINAL permanece em `despesa.num_doc`. Nada é apagado: o
    // documento passa a existir nos dois lugares até que o cliente decida.
    await db.insert(schema.auditLog).values({
      tenantId: r.tenantId,
      userId: null,
      action: "documentoFiscal.migracaoPedido",
      entity: "documento_fiscal",
      entityId: r.id,
      meta: {
        origem: "scripts/migracao-pedido-para-nf.ts",
        numeroCopiado: r.numDoc,
        numDocPreservado: r.numDoc,
      },
    });
    criados++;
  }
  console.log(`Documentos fiscais criados .......... ${criados}`);
  console.log(`Pulados (cancelados ou já tinham) ... ${pulados}`);
  console.log(
    "\nNenhum `num_doc` foi alterado: o valor original permanece na despesa.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERRO:", e);
    process.exit(1);
  });
