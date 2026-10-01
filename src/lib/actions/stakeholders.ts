"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { logAudit } from "@/lib/audit";
import { diffAudit, houveMudanca } from "@/lib/audit-diff";
import { mascararDocumento } from "@/lib/clientes-sensivel";
import {
  avisoDeDuplicidade,
  avisoDeTipoIncompativel,
  duplicatasDoDocumento,
  exigeEndereco,
  motivoDeRecusaDoDocumento,
  semEndereco,
} from "@/lib/stakeholder-regras";
import { AI_ACCEPTED_MIME, isAiConfigured } from "@/lib/ai/despesa-extract";
import { extractFornecedorFromDocument, type ExtractedFornecedor } from "@/lib/ai/fornecedor-extract";

/**
 * Actions do cadastro de Fornecedores & Stakeholders (Prompt W).
 *
 * Vieram de `actions/despesas.ts` (5.4) sem mudar o que fazem; o que mudou:
 * toda action devolve `{ ok, error }` em vez de lançar ou calar (5.2), com
 * `avisos` para o que não bloqueia (3.4 tipo × documento, 3.5 duplicidade);
 * nome é obrigatório (5.3); documento é validado e gravado sem espaços nas
 * duas actions (3.3); PF com papel de serviço ou mão de obra exige endereço
 * ao criar, ou quando a edição é que cria essa condição (3-A.3) — cadastro
 * antigo nessa situação continua editável, sinalizado na lista (3-A.4).
 *
 * Nenhum registro existente é normalizado, nem `doc`, nem `papeis` (9).
 */

export type ResultadoStakeholder = { ok: true; id: string; avisos: string[] } | { ok: false; error: string };

const texto = (fd: FormData, k: string) => ((fd.get(k) as string) ?? "").trim();
const ouNulo = (v: string) => v || null;
const CAMPOS_ENDERECO = ["endereco", "numero", "complemento", "bairro", "cidade", "estado", "cep"] as const;

async function outrosCadastros(tenantId: string, ignorarId?: string) {
  return db
    .select({ id: schema.stakeholders.id, nome: schema.stakeholders.nome, doc: schema.stakeholders.doc })
    .from(schema.stakeholders)
    .where(ignorarId ? and(eq(schema.stakeholders.tenantId, tenantId), ne(schema.stakeholders.id, ignorarId)) : eq(schema.stakeholders.tenantId, tenantId));
}

function avisosDoDocumento(tipo: string, doc: string | null, outros: { id: string; nome: string; doc: string | null }[]): string[] {
  const avisos: string[] = [];
  const t = avisoDeTipoIncompativel(tipo, doc);
  if (t) avisos.push(t);
  const d = avisoDeDuplicidade(duplicatasDoDocumento(doc, outros));
  if (d) avisos.push(d);
  return avisos;
}

export async function addStakeholder(formData: FormData): Promise<ResultadoStakeholder> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) return { ok: false, error: "Sem permissão para cadastrar fornecedores." };
  const nome = texto(formData, "nome");
  if (!nome) return { ok: false, error: "Informe o nome do cadastro." };
  const tipo = texto(formData, "tipo") === "PF" ? "PF" : "PJ";
  const doc = ouNulo(texto(formData, "doc"));
  const recusa = motivoDeRecusaDoDocumento(doc);
  if (recusa) return { ok: false, error: recusa };
  const papeis = [...new Set(formData.getAll("papeis").map((p) => String(p).trim()).filter(Boolean))];
  const endereco = texto(formData, "endereco");
  if (exigeEndereco(tipo, papeis) && semEndereco(endereco)) {
    return { ok: false, error: "Pessoa física com papel de prestação de serviço ou mão de obra precisa de endereço residencial (RPA e recibo). Se emite nota, prefira cadastrar como PJ com CNPJ." };
  }
  const avisos = avisosDoDocumento(tipo, doc, await outrosCadastros(ctx.tenant.id));

  const [row] = await db
    .insert(schema.stakeholders)
    .values({
      tenantId: ctx.tenant.id,
      nome,
      tipo,
      doc,
      papeis,
      email: ouNulo(texto(formData, "email")),
      tel: ouNulo(texto(formData, "tel")),
      obs: ouNulo(texto(formData, "obs")),
      // Dados complementares (cadastro inteligente por imagem/PDF — Seção 1).
      nomeFantasia: ouNulo(texto(formData, "nomeFantasia")),
      contato: ouNulo(texto(formData, "contato")),
      whatsapp: ouNulo(texto(formData, "whatsapp")),
      site: ouNulo(texto(formData, "site")),
      endereco: ouNulo(endereco),
      numero: ouNulo(texto(formData, "numero")),
      complemento: ouNulo(texto(formData, "complemento")),
      bairro: ouNulo(texto(formData, "bairro")),
      cidade: ouNulo(texto(formData, "cidade")),
      estado: ouNulo(texto(formData, "estado")),
      cep: ouNulo(texto(formData, "cep")),
    })
    .returning();

  // O arquivo original permanece anexado ao cadastro do fornecedor (auditoria).
  const file = formData.get("file") as File | null;
  if (file && file.size > 0 && isR2Configured()) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `tenants/${ctx.tenant.id}/fornecedores/${Date.now()}_${safe}`;
    await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");
    await db.insert(schema.documents).values({
      tenantId: ctx.tenant.id,
      stakeholderId: row.id,
      storageKey: key,
      filename: file.name,
      contentType: file.type || null,
      size: file.size,
      tipo: "Cadastro de fornecedor",
      uploadedBy: ctx.userEmail || ctx.userId || null,
    });
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "stakeholder.create",
    entity: "stakeholder",
    entityId: row.id,
    meta: { nome: row.nome, tipo, doc: mascararDocumento(doc), papeis, comDocumento: !!(file && file.size > 0), avisos },
  });
  revalidatePath("/fornecedores");
  return { ok: true, id: row.id, avisos };
}

/**
 * Edita um cadastro de pessoa (fornecedor/prestador/corretor…). Permite ajustar
 * os múltiplos papéis sem perder o histórico e os vínculos (mesma id).
 *
 * Os campos de endereço só são gravados quando o formulário os envia — a
 * edição antiga (6 campos) não os apaga.
 */
export async function updateStakeholder(formData: FormData): Promise<ResultadoStakeholder> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "editar")) return { ok: false, error: "Sem permissão para editar cadastros." };
  const id = texto(formData, "id");
  if (!id) return { ok: false, error: "Cadastro inválido." };
  const [atual] = await db
    .select()
    .from(schema.stakeholders)
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!atual) return { ok: false, error: "Cadastro não encontrado." };

  const nome = texto(formData, "nome");
  if (!nome) return { ok: false, error: "Informe o nome do cadastro." };
  const tipo = texto(formData, "tipo") === "PF" ? "PF" : "PJ";
  const doc = ouNulo(texto(formData, "doc"));
  // 3.6 — documento antigo fora do padrão continua editável: só se recusa o
  // que foi DIGITADO agora (diferente do gravado).
  if (doc !== (atual.doc ?? null)) {
    const recusa = motivoDeRecusaDoDocumento(doc);
    if (recusa) return { ok: false, error: recusa };
  }
  const papeis = [...new Set(formData.getAll("papeis").map((p) => String(p).trim()).filter(Boolean))];
  const enderecoEnviado = formData.has("endereco");
  const endereco = enderecoEnviado ? texto(formData, "endereco") : (atual.endereco ?? "");
  // 3-A.3 — exige endereço quando a edição CRIA a condição (ou apaga o endereço
  // de quem está nela); cadastro antigo já na condição segue editável (3-A.4).
  const condicaoAntes = exigeEndereco(atual.tipo, atual.papeis ?? []);
  const condicaoDepois = exigeEndereco(tipo, papeis);
  const apagouEndereco = enderecoEnviado && !semEndereco(atual.endereco) && semEndereco(endereco);
  if (condicaoDepois && semEndereco(endereco) && (!condicaoAntes || apagouEndereco)) {
    return { ok: false, error: "Pessoa física com papel de prestação de serviço ou mão de obra precisa de endereço residencial (RPA e recibo)." };
  }
  const avisos = avisosDoDocumento(tipo, doc, await outrosCadastros(ctx.tenant.id, id));

  const novo: Partial<typeof schema.stakeholders.$inferInsert> = {
    nome,
    tipo,
    doc,
    papeis,
    email: ouNulo(texto(formData, "email")),
    tel: ouNulo(texto(formData, "tel")),
    obs: ouNulo(texto(formData, "obs")),
  };
  if (enderecoEnviado) for (const k of CAMPOS_ENDERECO) novo[k] = ouNulo(texto(formData, k));
  for (const k of ["nomeFantasia", "contato", "whatsapp", "site"] as const) if (formData.has(k)) novo[k] = ouNulo(texto(formData, k));

  const antesAud = Object.fromEntries(Object.keys(novo).map((k) => [k, (atual as Record<string, unknown>)[k] ?? null]));
  const changes = diffAudit(antesAud, novo as Record<string, unknown>);
  if (houveMudanca(changes)) {
    await db
      .update(schema.stakeholders)
      .set(novo)
      .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
    // Documento no log: só mascarado (regra global 3).
    if (changes.doc) changes.doc = { de: mascararDocumento(atual.doc), para: mascararDocumento(doc) };
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "stakeholder.update",
      entity: "stakeholder",
      entityId: id,
      meta: { nome, papeis, changes, avisos },
    });
  }
  revalidatePath("/fornecedores");
  return { ok: true, id, avisos };
}

/** Inativa/reativa (exclusão lógica) um cadastro, preservando vínculos. */
export async function setStakeholderAtivo(id: string, ativo: boolean): Promise<ResultadoStakeholder> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "editar")) return { ok: false, error: "Sem permissão para editar cadastros." };
  const [atual] = await db
    .select({ nome: schema.stakeholders.nome, ativo: schema.stakeholders.ativo })
    .from(schema.stakeholders)
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!atual) return { ok: false, error: "Cadastro não encontrado." };
  if (atual.ativo === ativo) return { ok: true, id, avisos: [] };
  await db
    .update(schema.stakeholders)
    .set({ ativo })
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: ativo ? "stakeholder.reactivate" : "stakeholder.deactivate",
    entity: "stakeholder",
    entityId: id,
    meta: { nome: atual.nome },
  });
  revalidatePath("/fornecedores");
  return { ok: true, id, avisos: [] };
}

/**
 * Exclusão física de um cadastro — só quando não há despesas vinculadas. Caso
 * haja histórico, oriente a inativar (exclusão lógica) em vez de excluir.
 * (As seis checagens, a confirmação pelo nome e o inventário na auditoria
 * entram na PR W-2.)
 */
export async function deleteStakeholder(id: string): Promise<ResultadoStakeholder> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "excluir")) return { ok: false, error: "Sem permissão para excluir cadastros." };
  const [vinc] = await db
    .select({ id: schema.despesas.id })
    .from(schema.despesas)
    .where(and(eq(schema.despesas.fornecedorId, id), eq(schema.despesas.tenantId, ctx.tenant.id)))
    .limit(1);
  if (vinc) {
    return { ok: false, error: "Este cadastro possui despesas vinculadas — inative-o (exclusão lógica) para preservar o histórico." };
  }
  await db
    .delete(schema.stakeholders)
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "stakeholder.delete",
    entity: "stakeholder",
    entityId: id,
  });
  revalidatePath("/fornecedores");
  return { ok: true, id, avisos: [] };
}

/**
 * Lê um documento (PDF/imagem) com IA e devolve os dados do fornecedor para o
 * cliente pré-preencher o formulário (o usuário revisa antes de cadastrar).
 *
 * Erros são RETORNADOS (não lançados): em produção o Next.js esconde a
 * mensagem de erro lançado por Server Action — ver `extractDespesaFromDoc`.
 * Não mudou no Prompt W (7: "a leitura por documento não se altera").
 */
export async function extractFornecedorFromDoc(formData: FormData): Promise<{ ok: true; data: ExtractedFornecedor } | { ok: false; error: string }> {
  const falha = (error: string) => ({ ok: false as const, error });
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) {
    return falha("Sem permissão para cadastrar fornecedores.");
  }
  if (!isAiConfigured()) {
    return falha("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return falha("Selecione um arquivo.");
  if (file.size > 10 * 1024 * 1024) return falha("Arquivo deve ter até 10 MB.");
  const mime = file.type || "";
  if (!(AI_ACCEPTED_MIME as readonly string[]).includes(mime)) {
    return falha("Envie um PDF ou imagem (PNG, JPG ou WebP).");
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { ok: true, data: await extractFornecedorFromDocument(bytes, mime) };
  } catch (e) {
    console.error("[fornecedor] falha na leitura por IA:", e);
    return falha(e instanceof Error ? e.message : "Falha ao ler o documento.");
  }
}
