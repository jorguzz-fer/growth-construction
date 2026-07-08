"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { gerarParcelas } from "@/lib/calc";
import type { CategoriaDRE } from "@/lib/calc/constants";
import { getChartAccounts, getStakeholders, getAtualVersion } from "@/lib/queries";
import {
  AI_ACCEPTED_MIME,
  extractDespesaFromDocument,
  isAiConfigured,
  type ExtractedDespesa,
} from "@/lib/ai/despesa-extract";
import {
  extractFornecedorFromDocument,
  type ExtractedFornecedor,
} from "@/lib/ai/fornecedor-extract";

export async function addStakeholder(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) return;
  const papeis = formData.getAll("papeis").map(String).filter(Boolean);
  await db.insert(schema.stakeholders).values({
    tenantId: ctx.tenant.id,
    nome: (formData.get("nome") as string) || "Sem nome",
    tipo: (formData.get("tipo") as "PJ" | "PF") || "PJ",
    doc: (formData.get("doc") as string) || null,
    papeis,
    email: (formData.get("email") as string) || null,
    tel: (formData.get("tel") as string) || null,
  });
  revalidatePath("/fornecedores");
}

/**
 * Lê um documento (PDF/imagem) com IA e devolve os dados do fornecedor para o
 * cliente pré-preencher o formulário (o usuário revisa antes de cadastrar).
 */
export async function extractFornecedorFromDoc(
  formData: FormData,
): Promise<ExtractedFornecedor> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) {
    throw new Error("Sem permissão.");
  }
  if (!isAiConfigured()) {
    throw new Error("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo deve ter até 10 MB.");
  const mime = file.type || "";
  if (!(AI_ACCEPTED_MIME as readonly string[]).includes(mime)) {
    throw new Error("Envie um PDF ou imagem (PNG, JPG ou WebP).");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return extractFornecedorFromDocument(bytes, mime);
}

export async function addBankAccount(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) return;
  await db.insert(schema.bankAccounts).values({
    tenantId: ctx.tenant.id,
    banco: (formData.get("banco") as string) || "Banco",
    ag: (formData.get("ag") as string) || null,
    op: (formData.get("op") as string) || null,
    cc: (formData.get("cc") as string) || null,
    tipo:
      (formData.get("tipo") as "Imobiliária" | "Construtora") || "Construtora",
  });
  revalidatePath("/fornecedores");
}

/** owner/admin podem definir/alterar o número da despesa manualmente. */
function canEditNumero(role: string): boolean {
  return role === "owner" || role === "admin";
}

/** Verifica se um número de documento já existe no tenant (evita duplicidade). */
async function numDocExists(
  tenantId: string,
  numDoc: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.despesas.id })
    .from(schema.despesas)
    .where(and(eq(schema.despesas.tenantId, tenantId), eq(schema.despesas.numDoc, numDoc)));
  return rows.some((r) => r.id !== exceptId);
}

export async function addDespesa(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar")) return;
  // Sem "projeto ativo": a despesa é associada ao projeto escolhido no
  // formulário e gravada na versão Atual daquele projeto.
  const projectId = (formData.get("projectId") as string) || ctx.project.id;
  const version = await getAtualVersion(ctx.tenant.id, projectId);
  if (!version) throw new Error("Projeto sem versão Atual.");
  if (version.locked) throw new Error("Versão congelada — lançamentos bloqueados.");

  // Número gerado automaticamente (atômico no banco). Só owner/admin podem
  // informar um número manual — com checagem de duplicidade.
  const provided = ((formData.get("numDoc") as string) || "").trim();
  let numDoc: string;
  if (provided && canEditNumero(ctx.role)) {
    if (await numDocExists(ctx.tenant.id, provided)) {
      throw new Error(`O número "${provided}" já existe.`);
    }
    numDoc = provided;
  } else {
    numDoc = await reserveDespesaNumber(ctx.tenant.id);
  }
  const s = (k: string) => (formData.get(k) as string) || null;
  const [row] = await db
    .insert(schema.despesas)
    .values({
      versionId: version.id,
      tenantId: ctx.tenant.id,
      numDoc,
      fornecedorId: s("fornecedorId"),
      bancoId: s("bancoId"),
      contaCef: s("contaCef"),
      categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
      competencia: s("competencia"),
      vencimento: s("vencimento"),
      valor: (formData.get("valor") as string) || "0",
      status: s("status") || "A pagar",
      // Fase 2 — forma/condição de pagamento
      formaPagamento: s("formaPagamento"),
      formaPagamentoDesc: s("formaPagamentoDesc"),
      condicaoPagamento: s("condicaoPagamento"),
      qtdParcelas: formData.get("qtdParcelas") ? Number(formData.get("qtdParcelas")) : null,
      dataEmissao: s("dataEmissao"),
      boletoLinhaDigitavel: s("boletoLinhaDigitavel"),
      boletoCodigoBarras: s("boletoCodigoBarras"),
      boletoBanco: s("boletoBanco"),
      chequeNumero: s("chequeNumero"),
      chequeBanco: s("chequeBanco"),
      chequeAg: s("chequeAg"),
      chequeConta: s("chequeConta"),
      chequeEmitente: s("chequeEmitente"),
      chequeDataEmissao: s("chequeDataEmissao"),
      chequeDataCompensacao: s("chequeDataCompensacao"),
      chequeStatus: s("chequeStatus"),
    })
    .returning();

  // Parcelas (Fase 2): usa o preview enviado pelo formulário (editável) ou
  // gera pela condição. Sem forma/condição → sem parcelas (comporta como antes).
  const parcelasJson = formData.get("parcelasJson") as string | null;
  const valorTotal = Number(row.valor);
  const condicao = row.condicaoPagamento;
  let parcelas: { vencimento: string | null; valor: number }[] = [];
  if (parcelasJson) {
    try {
      const arr = JSON.parse(parcelasJson) as { vencimento: string; valor: number }[];
      parcelas = arr
        .filter((p) => Number(p.valor) > 0)
        .map((p) => ({ vencimento: p.vencimento || null, valor: Number(p.valor) }));
    } catch {
      parcelas = [];
    }
  } else if (condicao) {
    parcelas = gerarParcelas({
      valorTotal,
      condicao,
      dataBase: row.vencimento || row.dataEmissao || row.competencia || "",
      qtd: row.qtdParcelas ?? undefined,
    }).map((p) => ({ vencimento: p.vencimento, valor: p.valor }));
  }
  if (parcelas.length > 0) {
    await db.insert(schema.despesaParcelas).values(
      parcelas.map((p, i) => ({
        tenantId: ctx.tenant.id,
        despesaId: row.id,
        numeroParcela: i + 1,
        vencimento: p.vencimento,
        valorOriginal: String(p.valor),
        formaPagamento: row.formaPagamento,
        status: "Pendente",
      })),
    );
  }

  // Documento anexado (opcional): armazena no R2 e vincula à despesa criada.
  const file = formData.get("file") as File | null;
  if (file && file.size > 0 && isR2Configured()) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `tenants/${ctx.tenant.id}/docs/${Date.now()}_${safe}`;
    await putObject(
      key,
      new Uint8Array(await file.arrayBuffer()),
      file.type || "application/octet-stream",
    );
    await db.insert(schema.documents).values({
      tenantId: ctx.tenant.id,
      despesaId: row.id,
      storageKey: key,
      filename: file.name,
      contentType: file.type || null,
      size: file.size,
    });
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.create",
    entity: "despesa",
    entityId: row.id,
    meta: { valor: row.valor, contaCef: row.contaCef },
  });
  revalidatePath("/despesas");
}

/** Campos editáveis de uma despesa já lançada. */
export interface DespesaPatch {
  fornecedorId?: string | null;
  bancoId?: string | null;
  contaCef?: string | null;
  categoriaDre?: string | null;
  numDoc?: string | null;
  competencia?: string | null;
  vencimento?: string | null;
  valor?: string;
  status?: string | null;
}

/** Edita uma despesa já lançada (mesma versão/tenant do contexto ativo). */
export async function updateDespesa(id: string, patch: DespesaPatch) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) return;
  if (ctx.version.locked) throw new Error("Versão congelada — edição bloqueada.");

  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(eq(schema.despesas.id, id), eq(schema.despesas.versionId, ctx.version.id)),
    )
    .limit(1);
  if (!existing) return;

  const set: Partial<typeof schema.despesas.$inferInsert> = {};
  if (patch.fornecedorId !== undefined) set.fornecedorId = patch.fornecedorId || null;
  if (patch.bancoId !== undefined) set.bancoId = patch.bancoId || null;
  if (patch.contaCef !== undefined) set.contaCef = patch.contaCef || null;
  if (patch.categoriaDre !== undefined)
    set.categoriaDre = (patch.categoriaDre || null) as CategoriaDRE | null;
  // Número da despesa: só owner/admin pode alterar, e sem duplicar.
  if (patch.numDoc !== undefined) {
    const novo = patch.numDoc?.trim() || null;
    if (novo !== existing.numDoc) {
      if (!canEditNumero(ctx.role)) {
        throw new Error("Apenas administradores podem alterar o número da despesa.");
      }
      if (novo && (await numDocExists(ctx.tenant.id, novo, id))) {
        throw new Error(`O número "${novo}" já existe.`);
      }
      set.numDoc = novo;
    }
  }
  if (patch.competencia !== undefined) set.competencia = patch.competencia || null;
  if (patch.vencimento !== undefined) set.vencimento = patch.vencimento || null;
  if (patch.valor !== undefined) set.valor = patch.valor.trim() || "0";
  if (patch.status !== undefined) set.status = patch.status || null;
  if (Object.keys(set).length === 0) return;

  await db.update(schema.despesas).set(set).where(eq(schema.despesas.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.update",
    entity: "despesa",
    entityId: id,
    meta: set,
  });
  revalidatePath("/despesas");
}

/** Exclui uma despesa já lançada (documentos vinculados caem em cascata). */
export async function deleteDespesa(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) return;
  if (ctx.version.locked) throw new Error("Versão congelada — exclusão bloqueada.");

  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(eq(schema.despesas.id, id), eq(schema.despesas.versionId, ctx.version.id)),
    )
    .limit(1);
  if (!existing) return;

  await db.delete(schema.despesas).where(eq(schema.despesas.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.delete",
    entity: "despesa",
    entityId: id,
    meta: { valor: existing.valor, numDoc: existing.numDoc },
  });
  revalidatePath("/despesas");
}

/**
 * Lê um documento (PDF/imagem) com IA e devolve os campos da despesa para o
 * cliente pré-preencher o formulário (o usuário revisa antes de lançar).
 */
export async function extractDespesaFromDoc(
  formData: FormData,
): Promise<ExtractedDespesa> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar")) {
    throw new Error("Sem permissão.");
  }
  if (!isAiConfigured()) {
    throw new Error("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo deve ter até 10 MB.");
  const mime = file.type || "";
  if (!(AI_ACCEPTED_MIME as readonly string[]).includes(mime)) {
    throw new Error("Envie um PDF ou imagem (PNG, JPG ou WebP).");
  }

  const [fornecedores, contas] = await Promise.all([
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
  ]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return extractDespesaFromDocument(bytes, mime, {
    fornecedores: fornecedores.map((f) => ({ nome: f.nome, doc: f.doc })),
    contas: contas.map((c) => ({ code: c.code, name: c.name })),
  });
}

/** Anexa um documento (NF/contrato) a uma despesa, no R2. */
export async function uploadDespesaDoc(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar")) {
    throw new Error("Sem permissão.");
  }
  if (!isR2Configured()) {
    throw new Error("Storage (R2) não configurado — defina as variáveis R2_*.");
  }
  const despesaId = (formData.get("despesaId") as string) || null;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo deve ter até 10 MB.");

  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const key = `tenants/${ctx.tenant.id}/docs/${Date.now()}_${safe}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");

  await db.insert(schema.documents).values({
    tenantId: ctx.tenant.id,
    despesaId,
    storageKey: key,
    filename: file.name,
    contentType: file.type || null,
    size: file.size,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.upload",
    entity: "document",
    meta: { filename: file.name, despesaId },
  });
  revalidatePath("/despesas");
}
