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
  const g = (k: string) => ((formData.get(k) as string) || "").trim() || null;
  const [row] = await db
    .insert(schema.stakeholders)
    .values({
      tenantId: ctx.tenant.id,
      nome: (formData.get("nome") as string) || "Sem nome",
      tipo: (formData.get("tipo") as "PJ" | "PF") || "PJ",
      doc: g("doc"),
      papeis,
      email: g("email"),
      tel: g("tel"),
      obs: g("obs"),
      // Dados complementares (cadastro inteligente por imagem/PDF — Seção 1).
      nomeFantasia: g("nomeFantasia"),
      contato: g("contato"),
      whatsapp: g("whatsapp"),
      site: g("site"),
      endereco: g("endereco"),
      numero: g("numero"),
      complemento: g("complemento"),
      bairro: g("bairro"),
      cidade: g("cidade"),
      estado: g("estado"),
      cep: g("cep"),
    })
    .returning();

  // O arquivo original permanece anexado ao cadastro do fornecedor (auditoria).
  const file = formData.get("file") as File | null;
  if (file && file.size > 0 && isR2Configured()) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `tenants/${ctx.tenant.id}/fornecedores/${Date.now()}_${safe}`;
    await putObject(
      key,
      new Uint8Array(await file.arrayBuffer()),
      file.type || "application/octet-stream",
    );
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
    meta: { nome: row.nome, papeis, comDocumento: !!(file && file.size > 0) },
  });
  revalidatePath("/fornecedores");
}

/**
 * Edita um cadastro de pessoa (fornecedor/prestador/corretor…). Permite ajustar
 * os múltiplos papéis sem perder o histórico e os vínculos (mesma id).
 */
export async function updateStakeholder(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "editar")) {
    throw new Error("Sem permissão para editar cadastros.");
  }
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  const papeis = formData.getAll("papeis").map(String).filter(Boolean);
  await db
    .update(schema.stakeholders)
    .set({
      nome: (formData.get("nome") as string) || "Sem nome",
      tipo: (formData.get("tipo") as "PJ" | "PF") || "PJ",
      doc: (formData.get("doc") as string) || null,
      papeis,
      email: (formData.get("email") as string) || null,
      tel: (formData.get("tel") as string) || null,
      obs: (formData.get("obs") as string) || null,
    })
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "stakeholder.update",
    entity: "stakeholder",
    entityId: id,
    meta: { papeis },
  });
  revalidatePath("/fornecedores");
}

/** Inativa/reativa (exclusão lógica) um cadastro, preservando vínculos. */
export async function setStakeholderAtivo(id: string, ativo: boolean) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "editar")) {
    throw new Error("Sem permissão.");
  }
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
  });
  revalidatePath("/fornecedores");
}

/**
 * Exclusão física de um cadastro — só quando não há despesas vinculadas. Caso
 * haja histórico, oriente a inativar (exclusão lógica) em vez de excluir.
 */
export async function deleteStakeholder(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "excluir")) {
    throw new Error("Sem permissão.");
  }
  const [vinc] = await db
    .select({ id: schema.despesas.id })
    .from(schema.despesas)
    .where(and(eq(schema.despesas.fornecedorId, id), eq(schema.despesas.tenantId, ctx.tenant.id)))
    .limit(1);
  if (vinc) {
    throw new Error(
      "Este cadastro possui despesas vinculadas — inative-o (exclusão lógica) para preservar o histórico.",
    );
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
  // Trava contra lançamentos de valor ZERO. Antes, um valor vazio virava "0" e,
  // com a opção "recorrente" ligada, era replicado em até 60 cópias — cada uma
  // consumindo um número de pedido (PED) sequencial e poluindo os relatórios com
  // lançamentos fantasma. Um lançamento sem valor não tem justificativa de
  // negócio e passa a ser recusado na origem.
  const valorNum = Number((formData.get("valor") as string) || "0");
  if (!Number.isFinite(valorNum) || valorNum === 0) {
    throw new Error("Informe um valor maior que zero para lançar a despesa.");
  }

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
  // Despesa paga por sócio (Seção 3): a despesa é reconhecida normalmente na DRE
  // e no projeto, mas NÃO gera saída de caixa da empresa. A obrigação com o
  // sócio é registrada em despesa_terceiro; o caixa só se move no reembolso
  // (restituição). Se não houver reembolso, a obrigação já nasce quitada.
  const pagoPorSocioId = s("pagoPorSocioId");
  const socioReembolsavel = !!formData.get("socioReembolsavel");
  const socioDataPagamento = s("socioDataPagamento");
  const core = {
    versionId: version.id,
    tenantId: ctx.tenant.id,
    fornecedorId: s("fornecedorId"),
    bancoId: s("bancoId"),
    contaCef: s("contaCef"),
    categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
    competencia: s("competencia"),
    vencimento: pagoPorSocioId ? socioDataPagamento : s("vencimento"),
    valor: (formData.get("valor") as string) || "0",
    // Descrição/observação da compra — campo PRÓPRIO, separado do nº do pedido
    // (numDoc). O objeto da compra não deve ser guardado no número do pedido.
    obs: s("obs"),
    status: pagoPorSocioId ? "Pago" : s("status") || "A pagar",
    // Não gera saída de caixa da empresa no momento do cadastro.
    pagoPorTerceiro: !!pagoPorSocioId,
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
  };
  const [row] = await db
    .insert(schema.despesas)
    .values({ ...core, numDoc })
    .returning();

  // Parcelas (Fase 2): usa o preview enviado pelo formulário (editável) ou
  // gera pela condição. Sem forma/condição → sem parcelas (comporta como antes).
  const parcelasJson = formData.get("parcelasJson") as string | null;
  const valorTotal = Number(row.valor);
  const condicao = row.condicaoPagamento;
  let parcelas: { vencimento: string | null; valor: number }[] = [];
  // Despesa paga por sócio já está quitada pelo sócio — não gera parcelas/contas
  // a pagar da empresa.
  if (pagoPorSocioId) {
    parcelas = [];
  } else if (parcelasJson) {
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

  // Documentos anexados (opcional): VÁRIOS arquivos podem ser enviados já no
  // lançamento inicial (boleto, nota fiscal, comprovante, foto...). Cada um vira
  // uma linha em `document` vinculada à mesma despesa — a existência de um anexo
  // nunca impede os demais.
  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 0 && isR2Configured()) {
    for (const file of files) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${ctx.tenant.id}/docs/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}_${safe}`;
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
        uploadedBy: ctx.userEmail || ctx.userId || null,
      });
    }
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.create",
    entity: "despesa",
    entityId: row.id,
    meta: { valor: row.valor, contaCef: row.contaCef },
  });

  // Despesa paga por sócio: registra a obrigação empresa↔sócio (reusa a infra de
  // "pago por terceiro"). Reembolsável → obrigação PENDENTE (o caixa só se move
  // no reembolso, feito na tela de Restituições). Sem reembolso → obrigação já
  // QUITADA (saldo 0), sem movimento de caixa e sem duplicar despesa na DRE.
  if (pagoPorSocioId) {
    await db.insert(schema.despesaTerceiros).values({
      tenantId: ctx.tenant.id,
      despesaId: row.id,
      pagadorTerceiroId: pagoPorSocioId,
      empresaResponsavelId: projectId,
      valorTotal: row.valor,
      valorRestituido: socioReembolsavel ? "0" : row.valor,
      dataPagamentoOriginal: socioDataPagamento,
      status: socioReembolsavel ? "Aguardando restituição" : "Sem reembolso",
      obs: socioReembolsavel
        ? "Despesa paga por sócio — a reembolsar"
        : "Despesa paga por sócio — sem reembolso",
    });
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "despesa.pagaPorSocio",
      entity: "despesa",
      entityId: row.id,
      meta: {
        socioId: pagoPorSocioId,
        valor: row.valor,
        reembolsavel: socioReembolsavel,
        dataPagamento: socioDataPagamento,
      },
    });
  }

  // Despesa recorrente: replica o lançamento nos próximos meses (competência e
  // vencimento avançam 1 mês a cada repetição). Cada réplica recebe seu próprio
  // número automático; parcelas/anexo ficam só no lançamento original.
  if (formData.get("recorrente")) {
    const meses = Math.min(60, Math.max(2, Number(formData.get("recorrenciaMeses")) || 0));
    for (let i = 1; i < meses; i++) {
      const numDocRec = await reserveDespesaNumber(ctx.tenant.id);
      await db.insert(schema.despesas).values({
        ...core,
        numDoc: numDocRec,
        competencia: addMonthsCompetencia(core.competencia, i),
        vencimento: addMonthsDate(core.vencimento, i),
      });
    }
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "despesa.recorrente",
      entity: "despesa",
      entityId: row.id,
      meta: { meses, competencia: core.competencia },
    });
  }

  revalidatePath("/despesas");
}

/** Avança `add` meses numa competência "MM/YYYY". */
function addMonthsCompetencia(mm: string | null, add: number): string | null {
  if (!mm) return mm;
  const m = mm.trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return mm;
  const idx = Number(m[2]) * 12 + (Number(m[1]) - 1) + add;
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  return `${String(mo).padStart(2, "0")}/${y}`;
}

/** Avança `add` meses numa data interna "MM/DD/YYYY", limitando o dia ao mês. */
function addMonthsDate(d: string | null, add: number): string | null {
  if (!d) return d;
  const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return d;
  const day = Number(m[2]);
  const idx = Number(m[3]) * 12 + (Number(m[1]) - 1) + add;
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  const lastDay = new Date(y, mo, 0).getDate();
  const dd = Math.min(day, lastDay);
  return `${String(mo).padStart(2, "0")}/${String(dd).padStart(2, "0")}/${y}`;
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
  obs?: string | null;
  formaPagamento?: string | null;
}

/** Edita uma despesa já lançada (mesma versão/tenant do contexto ativo). */
export async function updateDespesa(id: string, patch: DespesaPatch) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) return;

  // Escopo por tenant: a despesa pode pertencer a qualquer projeto do tenant
  // (a lista opera por projeto selecionado, não pela versão do contexto).
  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(eq(schema.despesas.id, id), eq(schema.despesas.tenantId, ctx.tenant.id)),
    )
    .limit(1);
  if (!existing) return;
  if (existing.cancelado) throw new Error("Despesa cancelada não pode ser editada.");

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
  if (patch.obs !== undefined) set.obs = patch.obs || null;
  if (patch.formaPagamento !== undefined) set.formaPagamento = patch.formaPagamento || null;
  if (Object.keys(set).length === 0) return;

  // Auditoria campo a campo: valor anterior × novo.
  const changes: Record<string, { de: unknown; para: unknown }> = {};
  for (const k of Object.keys(set)) {
    const antes = (existing as Record<string, unknown>)[k];
    const depois = (set as Record<string, unknown>)[k];
    if (antes !== depois) changes[k] = { de: antes ?? null, para: depois ?? null };
  }

  await db.update(schema.despesas).set(set).where(eq(schema.despesas.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.update",
    entity: "despesa",
    entityId: id,
    meta: { changes },
  });
  revalidatePath("/despesas");
}

/** Exclui uma despesa já lançada (documentos vinculados caem em cascata). */
export async function deleteDespesa(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) return;

  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(eq(schema.despesas.id, id), eq(schema.despesas.tenantId, ctx.tenant.id)),
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
 * Cancelamento lógico de uma despesa: preserva o histórico para auditoria, mas
 * a remove de saldos, relatórios, fluxo de caixa e contas a pagar. Preferível
 * à exclusão física.
 */
export async function cancelarDespesa(id: string, motivo: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) {
    throw new Error("Sem permissão para cancelar despesas.");
  }
  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(and(eq(schema.despesas.id, id), eq(schema.despesas.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!existing) throw new Error("Despesa não encontrada.");
  if (existing.cancelado) return;

  const hoje = new Date();
  const canceladoEm = `${String(hoje.getMonth() + 1).padStart(2, "0")}/${String(hoje.getDate()).padStart(2, "0")}/${hoje.getFullYear()}`;
  await db
    .update(schema.despesas)
    .set({
      cancelado: true,
      canceladoEm,
      canceladoPor: ctx.userEmail || ctx.userId || null,
      motivoCancelamento: motivo?.trim() || null,
      status: "Cancelada",
    })
    .where(eq(schema.despesas.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.cancel",
    entity: "despesa",
    entityId: id,
    meta: { motivo: motivo?.trim() || null, valor: existing.valor, numDoc: existing.numDoc },
  });
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
  revalidatePath("/caixa");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
}

export interface PagarDespesaInput {
  despesaId: string;
  dataPagamento: string; // "MM/DD/YYYY"
  valorPago: number;
  bankAccountId?: string | null;
  formaPagamento?: string | null;
  juros?: number;
  multa?: number;
  desconto?: number;
  obs?: string;
}

/**
 * Marca uma despesa (sem parcelamento) como paga: registra o pagamento com
 * encargos, lança a saída real no Caixa (na data efetiva), atualiza o status e
 * a conta bancária. Estrutura pronta para pagamento parcial.
 */
export async function pagarDespesa(input: PagarDespesaInput) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    throw new Error("Sem permissão para registrar pagamentos.");
  }
  const [d] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(eq(schema.despesas.id, input.despesaId), eq(schema.despesas.tenantId, ctx.tenant.id)),
    )
    .limit(1);
  if (!d) throw new Error("Despesa não encontrada.");
  if (d.cancelado) throw new Error("Despesa cancelada não pode ser paga.");

  const juros = input.juros || 0;
  const multa = input.multa || 0;
  const desconto = input.desconto || 0;
  const valorPago = input.valorPago > 0 ? input.valorPago : Number(d.valor) + juros + multa - desconto;

  await db.insert(schema.pagamentos).values({
    tenantId: ctx.tenant.id,
    despesaId: d.id,
    parcelaId: null,
    valorOriginal: String(d.valor),
    desconto: String(desconto),
    multa: String(multa),
    juros: String(juros),
    outrosAcrescimos: "0",
    valorTotalPago: String(valorPago),
    dataPagamento: input.dataPagamento || null,
    bankAccountId: input.bankAccountId || null,
    obs: input.obs || null,
    usuarioId: ctx.userId,
  });

  // Pagamento integral × parcial (estrutura pronta): status conforme o total.
  const pagoTotal = valorPago + desconto >= Number(d.valor) - 0.01;
  await db
    .update(schema.despesas)
    .set({
      status: pagoTotal ? "Pago" : "Parcialmente paga",
      dataCaixa: input.dataPagamento || d.dataCaixa,
      formaPagamento: input.formaPagamento || d.formaPagamento,
      bancoId: input.bankAccountId || d.bancoId,
    })
    .where(eq(schema.despesas.id, d.id));

  // Saída REAL no Controle de Caixa (valor efetivamente pago, na data real).
  await db.insert(schema.cashEntries).values({
    versionId: d.versionId,
    tenantId: ctx.tenant.id,
    bankAccountId: input.bankAccountId || null,
    data: input.dataPagamento || null,
    descricao: `Pagamento ${d.numDoc ?? "despesa"}`,
    valor: String(-Math.abs(valorPago)),
    cat: "despesa",
    rec: true,
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.pay",
    entity: "despesa",
    entityId: d.id,
    meta: { valorPago, juros, multa, desconto, dataPagamento: input.dataPagamento },
  });
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
  revalidatePath("/caixa");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
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
    tipo: ((formData.get("tipo") as string) || "").trim() || null,
    uploadedBy: ctx.userEmail || ctx.userId || null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.upload",
    entity: "document",
    meta: { filename: file.name, despesaId, tipo: (formData.get("tipo") as string) || null },
  });
  revalidatePath("/despesas");
}

/**
 * Anexa VÁRIOS arquivos a uma despesa existente — funciona em qualquer momento
 * do ciclo de vida: na edição, antes ou depois da conciliação e depois de a
 * despesa estar paga. Nunca substitui nem remove os anexos já existentes.
 * Retorna o erro (em vez de lançar) para a mensagem chegar à tela em produção.
 */
export async function addDespesaDocs(
  formData: FormData,
): Promise<{ ok: boolean; added?: number; error?: string }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    return { ok: false, error: "Sem permissão para anexar documentos." };
  }
  if (!isR2Configured()) {
    return { ok: false, error: "Storage (R2) não configurado — defina as variáveis R2_*." };
  }
  const despesaId = (formData.get("despesaId") as string) || "";
  if (!despesaId) return { ok: false, error: "Despesa não informada." };

  // A despesa precisa existir NO TENANT — não se checa status: anexar é
  // permitido inclusive depois de paga/conciliada.
  const [desp] = await db
    .select({ id: schema.despesas.id })
    .from(schema.despesas)
    .where(and(eq(schema.despesas.id, despesaId), eq(schema.despesas.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!desp) return { ok: false, error: "Despesa não encontrada." };

  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Selecione ao menos um arquivo." };
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) {
      return { ok: false, error: `"${f.name}" excede 10 MB.` };
    }
  }
  const tipo = ((formData.get("tipo") as string) || "").trim() || null;

  try {
    for (const file of files) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${ctx.tenant.id}/docs/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}_${safe}`;
      await putObject(
        key,
        new Uint8Array(await file.arrayBuffer()),
        file.type || "application/octet-stream",
      );
      await db.insert(schema.documents).values({
        tenantId: ctx.tenant.id,
        despesaId,
        storageKey: key,
        filename: file.name,
        contentType: file.type || null,
        size: file.size,
        tipo,
        uploadedBy: ctx.userEmail || ctx.userId || null,
      });
    }
  } catch (e) {
    console.error("[despesa] falha ao anexar documentos:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao enviar os arquivos.",
    };
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.upload",
    entity: "despesa",
    entityId: despesaId,
    meta: { arquivos: files.map((f) => f.name), qtd: files.length, tipo },
  });
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
  return { ok: true, added: files.length };
}

/**
 * Desvincula UM anexo da despesa, sem afetar os demais.
 *
 * ZERO PERDA DE DADOS: remove-se apenas a linha de `document` (o vínculo). O
 * objeto NÃO é apagado do storage (R2), de modo que o arquivo continua
 * recuperável pela storageKey registrada na auditoria. Mesmo critério já
 * adotado na exclusão de documentos de projeto.
 */
export async function deleteDespesaDoc(
  documentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    return { ok: false, error: "Sem permissão para remover anexos." };
  }
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!doc) return { ok: false, error: "Anexo não encontrado." };

  await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.unlink",
    entity: "despesa",
    entityId: doc.despesaId ?? "—",
    // storageKey fica registrada: o arquivo permanece no storage e pode ser
    // revinculado se a remoção tiver sido indevida.
    meta: { documentId: doc.id, filename: doc.filename, storageKey: doc.storageKey },
  });
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
  return { ok: true };
}
