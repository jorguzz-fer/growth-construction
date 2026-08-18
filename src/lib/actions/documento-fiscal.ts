"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { diffAudit } from "@/lib/audit-diff";
import {
  chaveDuplicidade,
  normalizarChaveAcesso,
  validarDocumentoFiscal,
  type DocumentoFiscalEntrada,
} from "@/lib/calc/documento-fiscal";

/**
 * Documento fiscal de uma despesa — item 1.2.
 *
 * O número da nota é do emitente e chega quando chega: nada aqui bloqueia o
 * lançamento. A duplicidade gera ALERTA com link para o PED anterior, nunca
 * recusa (decisão D2) — numeração de NF é sequencial por emitente e série, e
 * bloquear produziria falso positivo legítimo.
 */

export interface DocumentoFiscalRow {
  id: string;
  despesaId: string;
  tipo: string;
  numero: string | null;
  serie: string | null;
  chaveAcesso: string | null;
  dataEmissao: string | null;
}

/** Documentos fiscais de uma despesa. */
export async function getDocumentosFiscais(
  despesaId: string,
): Promise<DocumentoFiscalRow[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return [];
  const rows = await db
    .select()
    .from(schema.documentosFiscais)
    .where(
      and(
        eq(schema.documentosFiscais.tenantId, ctx.tenant.id),
        eq(schema.documentosFiscais.despesaId, despesaId),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    despesaId: r.despesaId,
    tipo: r.tipo,
    numero: r.numero,
    serie: r.serie,
    chaveAcesso: r.chaveAcesso,
    dataEmissao: r.dataEmissao,
  }));
}

export interface DuplicidadeDocumento {
  despesaId: string;
  numDoc: string | null;
  projectId: string;
  projectName: string;
  competencia: string | null;
  valor: number;
}

/**
 * Já existe este mesmo documento no tenant? (CA-04)
 *
 * Devolve o lançamento anterior para a tela mostrar o aviso com link. Não
 * decide nada: quem decide prosseguir é o usuário.
 */
export async function buscarDocumentoDuplicado(
  fornecedorId: string | null,
  doc: DocumentoFiscalEntrada,
  ignorarDespesaId?: string,
): Promise<DuplicidadeDocumento | null> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return null;
  const chave = chaveDuplicidade(fornecedorId, doc);
  if (!chave) return null;

  const rows = await db
    .select({
      df: schema.documentosFiscais,
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
    })
    .from(schema.documentosFiscais)
    .innerJoin(schema.despesas, eq(schema.documentosFiscais.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.documentosFiscais.tenantId, ctx.tenant.id),
        eq(schema.documentosFiscais.tipo, doc.tipo ?? "SEM_DOC"),
        eq(schema.documentosFiscais.numero, doc.numero?.trim() ?? ""),
        ignorarDespesaId
          ? ne(schema.documentosFiscais.despesaId, ignorarDespesaId)
          : undefined,
      ),
    )
    .limit(20);

  // A chave inclui o fornecedor, que está na despesa — por isso o filtro final
  // acontece aqui e não no SQL.
  for (const r of rows) {
    if (chaveDuplicidade(r.d.fornecedorId, r.df) === chave) {
      return {
        despesaId: r.d.id,
        numDoc: r.d.numDoc,
        projectId: r.projectId,
        projectName: r.projectName,
        competencia: r.d.competencia,
        valor: Number(r.d.valor),
      };
    }
  }
  return null;
}

export interface SalvarDocumentoResult {
  ok: boolean;
  error?: string;
  documentoId?: string;
}

/**
 * Cria ou atualiza o documento fiscal de uma despesa.
 *
 * Uma despesa tem no máximo um documento "principal" mantido por este fluxo —
 * salvar de novo atualiza o mesmo registro em vez de empilhar duplicatas. O
 * repositório continua aceitando quantos arquivos forem necessários.
 */
export async function salvarDocumentoFiscal(input: {
  despesaId: string;
  tipo: string;
  numero?: string | null;
  serie?: string | null;
  chaveAcesso?: string | null;
  dataEmissao?: string | null;
}): Promise<SalvarDocumentoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    return { ok: false, error: "Sem permissão para editar o documento fiscal." };
  }
  const erro = validarDocumentoFiscal(input);
  if (erro) return { ok: false, error: erro };

  const [desp] = await db
    .select({ id: schema.despesas.id })
    .from(schema.despesas)
    .where(
      and(
        eq(schema.despesas.id, input.despesaId),
        eq(schema.despesas.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!desp) return { ok: false, error: "Despesa não encontrada." };

  const valores = {
    tipo: input.tipo || "SEM_DOC",
    numero: input.numero?.trim() || null,
    serie: input.serie?.trim() || null,
    chaveAcesso: normalizarChaveAcesso(input.chaveAcesso),
    dataEmissao: input.dataEmissao?.trim() || null,
  };

  const [existente] = await db
    .select()
    .from(schema.documentosFiscais)
    .where(
      and(
        eq(schema.documentosFiscais.tenantId, ctx.tenant.id),
        eq(schema.documentosFiscais.despesaId, input.despesaId),
      ),
    )
    .limit(1);

  let documentoId: string;
  let changes: Record<string, { de: unknown; para: unknown }>;
  if (existente) {
    changes = diffAudit(existente as unknown as Record<string, unknown>, valores);
    if (Object.keys(changes).length === 0) {
      return { ok: true, documentoId: existente.id };
    }
    await db
      .update(schema.documentosFiscais)
      .set(valores)
      .where(eq(schema.documentosFiscais.id, existente.id));
    documentoId = existente.id;
  } else {
    const [novo] = await db
      .insert(schema.documentosFiscais)
      .values({ tenantId: ctx.tenant.id, despesaId: input.despesaId, ...valores })
      .returning();
    documentoId = novo.id;
    changes = diffAudit(null, valores);
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: existente ? "documentoFiscal.update" : "documentoFiscal.create",
    entity: "documento_fiscal",
    entityId: documentoId,
    meta: { despesaId: input.despesaId, changes },
  });
  revalidatePath("/despesas");
  return { ok: true, documentoId };
}
