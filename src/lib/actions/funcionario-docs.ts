"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getObjectBytes, isR2Configured, putObject, readUrl } from "@/lib/storage/r2";
import { LIMITE_UPLOAD_BYTES, LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";
import { competenciaValida, NOMES_DOC_FUNCIONARIO, TIPO_HOLERITE, TIPOS_DOC_FOLHA, tipoEhAso } from "@/lib/funcionario-docs-regras";
import { TELA_ASO, TELA_DADOS_FUNCIONARIO, TELA_FUNCIONARIOS } from "@/lib/funcionario-regras";

/**
 * Documentos do funcionário (Prompt Z, 2.2-A) e folha por competência (2.2-B).
 * ASO: permissão própria `funcionariosaso` para anexar, listar, abrir e
 * remover; cada abertura é registrada em `aso_acesso` (7.3-A); o log nunca
 * leva conteúdo. Nenhum documento daqui vai ao assistente (6.3).
 */

export type ResultadoDocs = { ok: true; added: number } | { ok: false; error: string };
export type Resultado = { ok: true; id: string } | { ok: false; error: string };
const SEM_SESSAO = "Sessão expirada. Entre de novo.";
const texto = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;
void getObjectBytes; // os documentos daqui NUNCA são lidos para IA (6.3); a função fica para deixar explícito que não é usada

async function anexar(opts: { tenantId: string; userEmail: string | null; pasta: string; files: File[]; tipo: string; valores: Partial<typeof schema.documents.$inferInsert>; chaveVersao: { col: "funcionarioId" | "folhaId"; id: string } }): Promise<{ gravados: { filename: string; versao: number; storageKey: string }[] } | { error: string }> {
  const col = opts.chaveVersao.col === "funcionarioId" ? schema.documents.funcionarioId : schema.documents.folhaId;
  const [ultima] = await db.select({ versao: schema.documents.versao }).from(schema.documents).where(and(eq(schema.documents.tenantId, opts.tenantId), eq(col, opts.chaveVersao.id), eq(schema.documents.tipo, opts.tipo))).orderBy(desc(schema.documents.versao)).limit(1);
  let versao = ultima?.versao ?? 0;
  const gravados: { filename: string; versao: number; storageKey: string }[] = [];
  try {
    for (const file of opts.files) {
      versao += 1;
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${opts.tenantId}/${opts.pasta}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
      await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");
      await db.insert(schema.documents).values({ tenantId: opts.tenantId, storageKey: key, filename: file.name, contentType: file.type || null, size: file.size, tipo: opts.tipo, versao, uploadedBy: opts.userEmail, ...opts.valores });
      gravados.push({ filename: file.name, versao, storageKey: key });
    }
  } catch (e) {
    console.error("[pessoas] falha ao anexar:", e);
    return { error: e instanceof Error ? e.message : "Falha ao enviar os arquivos." };
  }
  return { gravados };
}
function arquivosDe(fd: FormData): File[] | { error: string } {
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Selecione ao menos um arquivo." };
  for (const f of files) if (f.size > LIMITE_UPLOAD_BYTES) return { error: `"${f.name}" excede ${LIMITE_UPLOAD_MB} MB. Fotos são comprimidas no navegador; PDF grande precisa ser reduzido antes.` };
  return files;
}

/* ───────────── documentos do funcionário ───────────── */

export async function addFuncionarioDocs(fd: FormData): Promise<ResultadoDocs> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_FUNCIONARIOS, "editar")) return { ok: false, error: "Sem permissão para anexar documentos do funcionário." };
  if (!isR2Configured()) return { ok: false, error: "Storage (R2) não configurado — defina as variáveis R2_*." };
  const funcionarioId = texto(fd.get("funcionarioId"));
  if (!funcionarioId) return { ok: false, error: "Funcionário não informado." };
  const [f] = await db.select({ id: schema.funcionarios.id, nome: schema.funcionarios.nome, projectId: schema.funcionarios.projectId }).from(schema.funcionarios).where(and(eq(schema.funcionarios.id, funcionarioId), eq(schema.funcionarios.tenantId, ctx.tenant.id))).limit(1);
  if (!f) return { ok: false, error: "Funcionário não encontrado." };
  const tipo = texto(fd.get("tipo")) ?? "";
  if (!NOMES_DOC_FUNCIONARIO.includes(tipo)) return { ok: false, error: "Escolha o tipo do documento." };
  if (tipoEhAso(tipo) && !can(ctx.perms, TELA_ASO, "editar")) return { ok: false, error: "ASO é dado de saúde: anexar exige a permissão própria \"Funcionários — ASO\"." };
  const validade = texto(fd.get("validade"));
  if (validade && !ISO.test(validade)) return { ok: false, error: "Validade inválida." };
  const files = arquivosDe(fd);
  if (!Array.isArray(files)) return { ok: false, error: files.error };
  const r = await anexar({ tenantId: ctx.tenant.id, userEmail: ctx.userEmail || ctx.userId || null, pasta: `funcionario/${f.id}`, files, tipo, valores: { funcionarioId: f.id, projectId: f.projectId, validade }, chaveVersao: { col: "funcionarioId", id: f.id } });
  if ("error" in r) return { ok: false, error: r.error };
  // 7.3-A — ASO: o log diz que um ASO foi anexado, nunca o conteúdo nem o nome do arquivo
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: tipoEhAso(tipo) ? "funcionario.aso.upload" : "funcionario.doc.upload", entity: "funcionario", entityId: f.id, meta: tipoEhAso(tipo) ? { funcionario: f.nome, tipo, arquivos: r.gravados.length } : { funcionario: f.nome, tipo, validade, arquivos: r.gravados.map((g) => ({ filename: g.filename, versao: g.versao })) } });
  revalidatePath(`/funcionarios/${f.id}`);
  return { ok: true, added: files.length };
}

export async function deleteFuncionarioDoc(documentId: string): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_FUNCIONARIOS, "editar")) return { ok: false, error: "Sem permissão para remover documentos do funcionário." };
  const [doc] = await db.select().from(schema.documents).where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, ctx.tenant.id))).limit(1);
  if (!doc || !doc.funcionarioId) return { ok: false, error: "Documento não encontrado." };
  if (tipoEhAso(doc.tipo) && !can(ctx.perms, TELA_ASO, "editar")) return { ok: false, error: "Documento não encontrado." }; // sem a permissão, nem a existência é confirmada (16c)
  await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: tipoEhAso(doc.tipo) ? "funcionario.aso.unlink" : "funcionario.doc.unlink", entity: "funcionario", entityId: doc.funcionarioId, meta: tipoEhAso(doc.tipo) ? { documentId: doc.id, tipo: doc.tipo, versao: doc.versao } : { documentId: doc.id, filename: doc.filename, storageKey: doc.storageKey, tipo: doc.tipo, versao: doc.versao } });
  revalidatePath(`/funcionarios/${doc.funcionarioId}`);
  return { ok: true, id: doc.id };
}

/** 7.3-A — abrir um ASO: exige a permissão própria, registra quem e quando, e só então devolve a URL assinada. */
export async function abrirAso(documentId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_ASO, "ver")) return { ok: false, error: "Documento não encontrado." };
  const [doc] = await db.select().from(schema.documents).where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, ctx.tenant.id))).limit(1);
  if (!doc || !doc.funcionarioId || !tipoEhAso(doc.tipo)) return { ok: false, error: "Documento não encontrado." };
  await db.insert(schema.asoAcessos).values({ tenantId: ctx.tenant.id, funcionarioId: doc.funcionarioId, documentId: doc.id, usuario: ctx.userEmail || ctx.userId || null });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "funcionario.aso.acesso", entity: "funcionario", entityId: doc.funcionarioId, meta: { documentId: doc.id, tipo: doc.tipo, versao: doc.versao } });
  return { ok: true, url: await readUrl(doc.storageKey) };
}

/* ───────────── folha por competência ───────────── */

export async function addFolha(fd: FormData): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_DADOS_FUNCIONARIO, "editar")) return { ok: false, error: "Folha de pagamento é dado sensível: exige a permissão de dados do funcionário." };
  const competencia = texto(fd.get("competencia"));
  if (!competenciaValida(competencia)) return { ok: false, error: "Informe a competência no formato MM/AAAA." };
  const despesaId = texto(fd.get("despesaId"));
  if (despesaId) {
    const [d] = await db.select({ id: schema.despesas.id }).from(schema.despesas).where(and(eq(schema.despesas.id, despesaId), eq(schema.despesas.tenantId, ctx.tenant.id))).limit(1);
    if (!d) return { ok: false, error: "Despesa não encontrada nesta empresa." };
  }
  const [ja] = await db.select({ id: schema.folhasCompetencia.id }).from(schema.folhasCompetencia).where(and(eq(schema.folhasCompetencia.tenantId, ctx.tenant.id), eq(schema.folhasCompetencia.competencia, competencia!))).limit(1);
  if (ja) return { ok: false, error: `A competência ${competencia} já tem registro de folha.` };
  const [row] = await db.insert(schema.folhasCompetencia).values({ tenantId: ctx.tenant.id, competencia: competencia!, obs: texto(fd.get("obs")), despesaId }).returning({ id: schema.folhasCompetencia.id });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "folha.create", entity: "folha_competencia", entityId: row.id, meta: { competencia, despesaId } });
  revalidatePath("/funcionarios/folha");
  return { ok: true, id: row.id };
}

/** 2.2-B.4 / 16g — vincular a folha à despesa que a pagou: o comprovante não precisa ser anexado duas vezes. */
export async function vincularFolhaDespesa(folhaId: string, despesaId: string | null): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_DADOS_FUNCIONARIO, "editar")) return { ok: false, error: "Folha de pagamento é dado sensível: exige a permissão de dados do funcionário." };
  const [folha] = await db.select().from(schema.folhasCompetencia).where(and(eq(schema.folhasCompetencia.id, folhaId), eq(schema.folhasCompetencia.tenantId, ctx.tenant.id))).limit(1);
  if (!folha) return { ok: false, error: "Registro de folha não encontrado." };
  if (despesaId) {
    const [d] = await db.select({ id: schema.despesas.id }).from(schema.despesas).where(and(eq(schema.despesas.id, despesaId), eq(schema.despesas.tenantId, ctx.tenant.id))).limit(1);
    if (!d) return { ok: false, error: "Despesa não encontrada nesta empresa." };
  }
  await db.update(schema.folhasCompetencia).set({ despesaId }).where(eq(schema.folhasCompetencia.id, folha.id));
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "folha.vincular_despesa", entity: "folha_competencia", entityId: folha.id, meta: { competencia: folha.competencia, de: folha.despesaId, para: despesaId } });
  revalidatePath("/funcionarios/folha");
  return { ok: true, id: folha.id };
}

export async function addFolhaDocs(fd: FormData): Promise<ResultadoDocs> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_DADOS_FUNCIONARIO, "editar")) return { ok: false, error: "Folha de pagamento é dado sensível: exige a permissão de dados do funcionário." };
  if (!isR2Configured()) return { ok: false, error: "Storage (R2) não configurado — defina as variáveis R2_*." };
  const folhaId = texto(fd.get("folhaId"));
  if (!folhaId) return { ok: false, error: "Folha não informada." };
  const [folha] = await db.select().from(schema.folhasCompetencia).where(and(eq(schema.folhasCompetencia.id, folhaId), eq(schema.folhasCompetencia.tenantId, ctx.tenant.id))).limit(1);
  if (!folha) return { ok: false, error: "Registro de folha não encontrado." };
  const tipo = texto(fd.get("tipo")) ?? "";
  if (!(TIPOS_DOC_FOLHA as readonly string[]).includes(tipo)) return { ok: false, error: "Escolha o tipo do documento." };
  // 2.2-B.2 — o holerite individual é o único que se vincula ao funcionário
  const funcionarioId = tipo === TIPO_HOLERITE ? texto(fd.get("funcionarioId")) : null;
  if (tipo === TIPO_HOLERITE) {
    if (!funcionarioId) return { ok: false, error: "Holerite individual: informe o funcionário." };
    const [f] = await db.select({ id: schema.funcionarios.id }).from(schema.funcionarios).where(and(eq(schema.funcionarios.id, funcionarioId), eq(schema.funcionarios.tenantId, ctx.tenant.id))).limit(1);
    if (!f) return { ok: false, error: "Funcionário não encontrado." };
  }
  const files = arquivosDe(fd);
  if (!Array.isArray(files)) return { ok: false, error: files.error };
  const r = await anexar({ tenantId: ctx.tenant.id, userEmail: ctx.userEmail || ctx.userId || null, pasta: `folha/${folha.id}`, files, tipo, valores: { folhaId: folha.id, funcionarioId }, chaveVersao: { col: "folhaId", id: folha.id } });
  if ("error" in r) return { ok: false, error: r.error };
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "folha.doc.upload", entity: "folha_competencia", entityId: folha.id, meta: { competencia: folha.competencia, tipo, arquivos: r.gravados.length, comFuncionario: !!funcionarioId } });
  revalidatePath("/funcionarios/folha");
  return { ok: true, added: files.length };
}

export async function deleteFolhaDoc(documentId: string): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_DADOS_FUNCIONARIO, "editar")) return { ok: false, error: "Folha de pagamento é dado sensível: exige a permissão de dados do funcionário." };
  const [doc] = await db.select().from(schema.documents).where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, ctx.tenant.id))).limit(1);
  if (!doc || !doc.folhaId) return { ok: false, error: "Documento não encontrado." };
  await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "folha.doc.unlink", entity: "folha_competencia", entityId: doc.folhaId, meta: { documentId: doc.id, tipo: doc.tipo, versao: doc.versao, storageKey: doc.storageKey } });
  revalidatePath("/funcionarios/folha");
  return { ok: true, id: doc.id };
}
