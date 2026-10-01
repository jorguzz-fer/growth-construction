"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { LIMITE_UPLOAD_BYTES, LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";
import { logAudit } from "@/lib/audit";
import { diffAudit, houveMudanca } from "@/lib/audit-diff";
import { DEFAULT_INCC } from "@/lib/calc/constants";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { normalizarCodigoMunicipio } from "@/lib/calc/emitente-fiscal";
import { getInventarioDoProjeto } from "@/lib/queries";
import {
  INVENTARIO_VAZIO,
  normalizarCep,
  normalizarCoordenada,
  recusaDaExclusao,
  recusaDasCoordenadas,
  recusaDasDatas,
  recusaDoCep,
  TELA_PROJETO,
  type InventarioDoProjeto,
} from "@/lib/projeto-regras";

/**
 * Toda action desta tela devolve `{ ok, error }` (Prompt B, 38): antes,
 * `updateProject` e `deleteProject` faziam `return` silencioso sem permissão e
 * as outras faziam `throw`, cuja mensagem o Next esconde em produção. Agora a
 * tela mostra sucesso e erro. `id` volta na criação; `aviso` é informativo.
 */
export type ResultadoProjeto = { ok: true; id?: string; aviso?: string } | { ok: false; error: string };

const SEM_SESSAO = "Sessão expirada. Entre de novo.";

/** Versões padrão criadas junto com um projeto novo (ver seed.ts). */
const DEFAULT_VERSIONS = [
  { key: "budget", kind: "budget" as const, label: "Budget / Orçamento", color: "#6366f1", isDefault: false },
  { key: "forecast", kind: "forecast" as const, label: "Previsto / Forecast", color: "#10b981", isDefault: true },
  { key: "atual", kind: "atual" as const, label: "Atual — caixa real", color: "#f59e0b", isDefault: false },
];

type ProjectKind = "proj" | "office";
type ProjectStatus = "Em andamento" | "Planejamento";

/** Normaliza a duração (meses): inteiro positivo ou null. */
function normDuration(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const normStatus = (s: unknown): ProjectStatus =>
  s === "Em andamento" ? "Em andamento" : "Planejamento";

/** Normaliza um id de cliente vindo do formulário (vazio = próprio). */
const normClienteId = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};
const normDate = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};
/** Normaliza uma competência "MM/YYYY" (ou null). */
const normMonth = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return /^\d{1,2}\/\d{4}$/.test(s)
    ? `${s.split("/")[0].padStart(2, "0")}/${s.split("/")[1]}`
    : null;
};
/** Converte string/number em texto numérico (ou null) para colunas numeric. */
function normValor(v: string | number | null | undefined): string | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? String(n) : null;
}

/**
 * Cria um projeto (empreendimento) ou uma unidade/escritório (centro de custo)
 * e já provisiona as três versões padrão (budget/forecast/atual) e a tabela
 * INCC, de modo que todas as telas vinculadas funcionem imediatamente
 * (preservado, Prompt B, 30). Não grava projeto ativo nem cookie (Prompt A).
 * Projeto novo nasce Ativo. Data de fim anterior à de início é recusada
 * (gravação nova, seção 9). `kind = "office"` cria matriz/filiais (sem
 * duração, datas nem cliente).
 */
export async function createProject(
  name: string,
  durationMonths: number | null,
  opts?: {
    kind?: ProjectKind;
    status?: ProjectStatus;
    startDate?: string | null;
    endDate?: string | null;
    mesInicial?: string | null;
    mesFinal?: string | null;
    clienteId?: string | null;
  },
): Promise<ResultadoProjeto> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_PROJETO, "criar")) return { ok: false, error: "Sem permissão para criar projetos." };
  const clean = (name || "").trim();
  if (!clean) return { ok: false, error: "Informe o nome do projeto." };

  const tenantId = ctx.tenant.id;
  const kind: ProjectKind = opts?.kind === "office" ? "office" : "proj";
  // Escritórios/unidades são centros de custo — não têm cronograma de obra.
  const duration = kind === "office" ? null : normDuration(durationMonths);
  const status = normStatus(opts?.status);
  const startDate = kind === "office" ? null : normDate(opts?.startDate);
  const endDate = kind === "office" ? null : normDate(opts?.endDate);
  const recusaDatas = recusaDasDatas(startDate, endDate);
  if (recusaDatas) return { ok: false, error: recusaDatas };

  const projectId = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(schema.projects)
      .values({
        tenantId,
        name: clean,
        kind,
        status,
        // Projeto novo nasce Ativo (Prompt A, 24).
        situacao: "Ativo",
        durationMonths: duration,
        startDate,
        endDate,
        mesInicial: kind === "office" ? null : normMonth(opts?.mesInicial),
        mesFinal: kind === "office" ? null : normMonth(opts?.mesFinal),
        clienteId: kind === "office" ? null : normClienteId(opts?.clienteId),
      })
      .returning();

    await tx
      .insert(schema.versions)
      .values(DEFAULT_VERSIONS.map((v) => ({ ...v, projectId: project.id, tenantId })));

    await tx.insert(schema.inccRates).values(
      DEFAULT_INCC.map((r, i) => ({
        projectId: project.id,
        tenantId,
        mes: r.m,
        monthly: r.mo.toString(),
        accumulated: r.ac.toString(),
        ordem: i,
      })),
    );

    return project.id;
  });

  // Criar NÃO muda contexto (Prompt A, 9): não há mais projeto ativo global.

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "project.create",
    entity: "project",
    entityId: projectId,
    meta: { name: clean, kind, status, durationMonths: duration },
  });
  revalidatePath("/", "layout");
  return { ok: true, id: projectId };
}

export type SituacaoProjeto = "Ativo" | "Finalizado";

/**
 * Classifica o projeto como Ativo ou Finalizado (Prompt A, 25–27). Grava
 * SOMENTE a coluna `situacao` — não toca datas, versões, lançamentos, nem o
 * `status` (fase da obra). Finalizar não bloqueia nada nem esconde o projeto
 * de relatório algum (seções 5 e 28). Log `project.status.change { from, to }`.
 */
export async function setProjectSituacao(
  projectId: string,
  situacao: SituacaoProjeto,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, TELA_PROJETO, "editar")) {
    return { ok: false, error: "Sem permissão para editar projetos." };
  }
  if (situacao !== "Ativo" && situacao !== "Finalizado") {
    return { ok: false, error: "Situação inválida." };
  }
  // `ctx.projects` é filtrado pelo tenant: é a garantia de escopo.
  const antes = ctx.projects.find((p) => p.id === projectId);
  if (!antes) return { ok: false, error: "Projeto não encontrado." };
  const from = antes.situacao ?? null;
  if (from === situacao) return { ok: true };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.projects)
      .set({ situacao })
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.tenantId, ctx.tenant.id)));
    await logAudit(
      {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "project.status.change",
        entity: "project",
        entityId: projectId,
        meta: { projeto: antes.name, from, to: situacao },
      },
      tx,
    );
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export interface PatchDoProjeto {
  name?: string;
  durationMonths?: number | null;
  status?: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  mesInicial?: string | null;
  mesFinal?: string | null;
  clienteId?: string | null;
  custoConstrucao?: string | number | null;
  custoTerreno?: string | number | null;
  valorConstrucao?: string | number | null;
  valorTerreno?: string | number | null;
  formaPagamentoTerreno?: string | null;
  proprietarioTerreno?: string | null;
  terrenoForaCaixa?: boolean;
  financiamentoConstrucao?: string | number | null;
  financiamentoTerreno?: string | number | null;
  recursosProprios?: string | number | null;
  // Localização (Prompt B, 17).
  endereco?: string | null;
  cep?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  // Dados fiscais da obra (emissão de NFS-e — ver docs/EMISSAO-NF.md).
  codigoMunicipioObra?: string | null;
  municipioObra?: string | null;
  ufObra?: string | null;
  codigoObra?: string | null;
  art?: string | null;
}

/**
 * Atualiza o cadastro do projeto (ou escritório). Só os campos presentes no
 * patch entram no `set`. Datas: fim antes do início é recusado apenas quando
 * o patch mexe em alguma das duas (gravação nova); cadastro antigo que viole
 * a regra continua editável nos demais campos. `origem: "assistente"` marca
 * no log que os valores vieram de uma proposta da IA aceita pelo usuário
 * (Prompt B, 26) — a permissão é a mesma, verificada aqui.
 */
export async function updateProject(
  projectId: string,
  patch: PatchDoProjeto,
  opcoes?: { origem?: "assistente" },
): Promise<ResultadoProjeto> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_PROJETO, "editar")) return { ok: false, error: "Sem permissão para editar projetos." };
  // `ctx.projects` já vem filtrado pelo tenant — é essa a garantia de escopo
  // aqui, e é também o estado ANTERIOR usado na auditoria abaixo.
  const antes = ctx.projects.find((p) => p.id === projectId);
  if (!antes) return { ok: false, error: "Projeto não encontrado." };

  const set: Partial<typeof schema.projects.$inferInsert> = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { ok: false, error: "Informe o nome do projeto." };
    set.name = patch.name.trim();
  }
  if (patch.durationMonths !== undefined) set.durationMonths = normDuration(patch.durationMonths);
  if (patch.status !== undefined) set.status = normStatus(patch.status);
  if (patch.startDate !== undefined) set.startDate = normDate(patch.startDate);
  if (patch.endDate !== undefined) set.endDate = normDate(patch.endDate);
  if (patch.startDate !== undefined || patch.endDate !== undefined) {
    const inicio = patch.startDate !== undefined ? set.startDate : antes.startDate;
    const fim = patch.endDate !== undefined ? set.endDate : antes.endDate;
    const mudou = inicio !== (antes.startDate ?? null) || fim !== (antes.endDate ?? null);
    const recusa = mudou ? recusaDasDatas(inicio, fim) : null;
    if (recusa) return { ok: false, error: recusa };
  }
  if (patch.mesInicial !== undefined) set.mesInicial = normMonth(patch.mesInicial);
  if (patch.mesFinal !== undefined) set.mesFinal = normMonth(patch.mesFinal);
  if (patch.clienteId !== undefined) set.clienteId = normClienteId(patch.clienteId);
  if (patch.custoConstrucao !== undefined) set.custoConstrucao = normValor(patch.custoConstrucao);
  if (patch.custoTerreno !== undefined) set.custoTerreno = normValor(patch.custoTerreno);
  if (patch.valorConstrucao !== undefined) set.valorConstrucao = normValor(patch.valorConstrucao);
  if (patch.valorTerreno !== undefined) set.valorTerreno = normValor(patch.valorTerreno);
  if (patch.formaPagamentoTerreno !== undefined)
    set.formaPagamentoTerreno = patch.formaPagamentoTerreno?.trim() || null;
  if (patch.proprietarioTerreno !== undefined)
    set.proprietarioTerreno = patch.proprietarioTerreno?.trim() || null;
  if (patch.terrenoForaCaixa !== undefined) set.terrenoForaCaixa = patch.terrenoForaCaixa;
  if (patch.financiamentoConstrucao !== undefined)
    set.financiamentoConstrucao = normValor(patch.financiamentoConstrucao);
  if (patch.financiamentoTerreno !== undefined)
    set.financiamentoTerreno = normValor(patch.financiamentoTerreno);
  if (patch.recursosProprios !== undefined)
    set.recursosProprios = normValor(patch.recursosProprios);
  // Localização (17): CEP com 8 dígitos, coordenadas dentro da faixa.
  if (patch.endereco !== undefined) set.endereco = patch.endereco?.trim() || null;
  if (patch.cep !== undefined) {
    const recusa = recusaDoCep(patch.cep);
    if (recusa) return { ok: false, error: recusa };
    set.cep = normalizarCep(patch.cep) ?? null;
  }
  if (patch.latitude !== undefined || patch.longitude !== undefined) {
    const recusa = recusaDasCoordenadas(patch.latitude, patch.longitude);
    if (recusa) return { ok: false, error: recusa };
    if (patch.latitude !== undefined) {
      const lat = normalizarCoordenada(patch.latitude, 90);
      set.latitude = lat == null ? null : String(lat);
    }
    if (patch.longitude !== undefined) {
      const lng = normalizarCoordenada(patch.longitude, 180);
      set.longitude = lng == null ? null : String(lng);
    }
  }
  // Fiscais da obra: o código IBGE é gravado só com dígitos porque é ele, e não
  // o nome da cidade, que a API de emissão usa para achar o município. `codigo_obra`
  // (CNO/CEI) e `art` são limitados a 15 caracteres pela NFS-e — cortar aqui evita
  // que a nota seja recusada depois, no meio da emissão.
  if (patch.codigoMunicipioObra !== undefined)
    set.codigoMunicipioObra = normalizarCodigoMunicipio(patch.codigoMunicipioObra);
  if (patch.municipioObra !== undefined)
    set.municipioObra = patch.municipioObra?.trim() || null;
  if (patch.ufObra !== undefined)
    set.ufObra = patch.ufObra?.trim().toUpperCase().slice(0, 2) || null;
  if (patch.codigoObra !== undefined)
    set.codigoObra = patch.codigoObra?.trim().slice(0, 15) || null;
  if (patch.art !== undefined) set.art = patch.art?.trim().slice(0, 15) || null;
  if (Object.keys(set).length === 0) return { ok: true, aviso: "Nada para salvar." };

  // A tela manda o formulário inteiro a cada Salvar, então `set` está sempre
  // cheio — mesmo quando nada mudou. O diff é o que separa alteração real de
  // salvamento à toa, e registra de → para em vez do valor novo solto.
  const changes = diffAudit(antes as unknown as Record<string, unknown>, set);
  if (!houveMudanca(changes)) return { ok: true, aviso: "Nada mudou." };

  // Tenant também no `where` (Prompt A, 38), além da guarda em memória acima.
  await db
    .update(schema.projects)
    .set(set)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "project.update",
    entity: "project",
    entityId: projectId,
    meta: opcoes?.origem === "assistente" ? { changes, origem: "assistente" } : { changes },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Inventário do que a exclusão leva junto (Prompt B, 37): o diálogo mostra
 * antes de pedir o nome. Só leitura; o projeto é validado contra o tenant.
 */
export async function inventarioDoProjeto(projectId: string): Promise<{ ok: true; inventario: InventarioDoProjeto } | { ok: false; error: string }> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_PROJETO, "ver")) return { ok: false, error: "Sem permissão." };
  if (!ctx.projects.some((p) => p.id === projectId)) return { ok: false, error: "Projeto não encontrado." };
  return { ok: true, inventario: await getInventarioDoProjeto(ctx.tenant.id, projectId) };
}

/**
 * Exclui um projeto e, em cascata, todas as suas versões e dados de movimento
 * (regra preservada, Prompt B, 37/49). O que muda é a proteção: o nome do
 * projeto digitado é conferido AQUI, não só na tela, e o log guarda o
 * inventário do que foi destruído. Não é permitido excluir o último projeto
 * do tenant. Não há projeto ativo a limpar (Prompt A, 34).
 */
export async function deleteProject(projectId: string, nomeDigitado: string): Promise<ResultadoProjeto> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_PROJETO, "excluir")) return { ok: false, error: "Sem permissão para excluir projetos." };
  const target = ctx.projects.find((p) => p.id === projectId);
  if (!target) return { ok: false, error: "Projeto não encontrado." };
  const recusa = recusaDaExclusao(target, nomeDigitado ?? "", ctx.projects.length);
  if (recusa) return { ok: false, error: recusa };

  const inventario = await getInventarioDoProjeto(ctx.tenant.id, projectId).catch(() => INVENTARIO_VAZIO);

  // Tenant também no `where` (Prompt A, 38), além da guarda em memória acima.
  await db
    .delete(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.tenantId, ctx.tenant.id)));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "project.delete",
    entity: "project",
    entityId: projectId,
    meta: { name: target.name, kind: target.kind, inventario },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Anexa um arquivo (contrato, proposta, documento jurídico, etc.) ao cadastro do
 * projeto. Reusa a tabela `documents` (vínculo por project_id) e o armazenamento
 * R2. Múltiplos arquivos por projeto; os documentos são preservados em edições
 * posteriores do projeto. Requer permissão de edição de projeto.
 */
export async function uploadProjetoDoc(formData: FormData): Promise<ResultadoProjeto> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_PROJETO, "editar")) return { ok: false, error: "Sem permissão para anexar documentos ao projeto." };
  if (!isR2Configured()) return { ok: false, error: "Storage (R2) não configurado — defina as variáveis R2_*." };
  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId || !ctx.projects.some((p) => p.id === projectId)) return { ok: false, error: "Projeto inválido." };
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "Selecione um arquivo." };
  // Limite real (Prompt M, 6.9.4): o corpo da Server Action é 12 MB.
  if (file.size > LIMITE_UPLOAD_BYTES) return { ok: false, error: `Arquivo deve ter até ${LIMITE_UPLOAD_MB} MB.` };

  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const key = `tenants/${ctx.tenant.id}/projetos/${projectId}/${Date.now()}_${safe}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");

  const tipo = ((formData.get("tipo") as string) || "").trim() || "Documento do projeto";
  const [doc] = await db
    .insert(schema.documents)
    .values({
      tenantId: ctx.tenant.id,
      projectId,
      storageKey: key,
      filename: file.name,
      contentType: file.type || null,
      size: file.size,
      tipo,
      uploadedBy: ctx.userEmail || ctx.userId || null,
    })
    .returning({ id: schema.documents.id });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "projeto.doc.upload",
    entity: "document",
    entityId: projectId,
    meta: { documentId: doc.id, filename: file.name, tipo, storageKey: key },
  });
  revalidatePath("/projeto");
  return { ok: true, id: doc.id };
}

/**
 * Remove um documento anexado ao projeto (registro; o objeto R2 fica órfão —
 * fora do escopo, Prompt B, 13). O log guarda `filename` e `storageKey`, para
 * que a exclusão tenha rastro do que saiu.
 */
export async function deleteProjetoDoc(formData: FormData): Promise<ResultadoProjeto> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_PROJETO, "editar")) return { ok: false, error: "Sem permissão." };
  const id = (formData.get("id") as string) || "";
  if (!id) return { ok: false, error: "Documento inválido." };
  const [doc] = await db
    .select({ id: schema.documents.id, projectId: schema.documents.projectId, filename: schema.documents.filename, storageKey: schema.documents.storageKey, tipo: schema.documents.tipo })
    .from(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!doc || !doc.projectId) return { ok: false, error: "Documento não encontrado." };
  await db
    .delete(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "projeto.doc.delete",
    entity: "document",
    entityId: id,
    meta: { projectId: doc.projectId, filename: doc.filename, storageKey: doc.storageKey, tipo: doc.tipo },
  });
  revalidatePath("/projeto");
  return { ok: true };
}
