"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getProjectVersions, getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { excelSerial } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { lerValorDoAtivo, motivoDeRecusaDoAtivo, TIPOS_DOC_PERMUTA } from "@/lib/permuta-regras";
import { lerValorDaLiberacao, motivoDeRecusaDaLiberacao } from "@/lib/liberacao-regras";

const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "") || null;
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { LIMITE_UPLOAD_BYTES, LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";
import { desc } from "drizzle-orm";
import { diffAudit, houveMudanca } from "@/lib/audit-diff";
import { prepararImportacaoDePermutas, type LinhaIgnoradaPermuta, type LinhaImportacaoPermuta } from "@/lib/permuta-inventario";
import { getPermutaDoTenant, getReembolsoDoTenant } from "@/lib/queries";
import { and, eq } from "drizzle-orm";

/**
 * Obra informada pelo formulário e a versão de trabalho dela (Prompt A): a
 * mesma regra que valia para a obra do cookie (Atual → padrão → mais antiga).
 * Só obra da empresa; sem ela, a gravação é recusada.
 */
async function obraDoFormulario(tenantId: string, formData: FormData) {
  const projectId = formData.get("projectId");
  const r =
    typeof projectId === "string" && projectId
      ? await getProjectVersions(tenantId, projectId)
      : null;
  if (!r || !r.trabalho) throw new Error("Escolha o projeto.");
  // Versão congelada bloqueia também aqui (decisão de 30/09/2026): a mesma
  // regra de todo lançamento. Antes, Liberações e Permuta passavam pela trava.
  if (r.trabalho.locked) throw new Error("Versão congelada — lançamentos bloqueados.");
  return { project: r.project, version: r.trabalho };
}

export type ResultadoLiberacao = { ok: true; id: string } | { ok: false; error: string };

/**
 * Lança uma liberação de obra (Prompt O, 3.1/3.2): valor maior que zero, data
 * válida e origem obrigatória, com `{ ok, error }` legível — sem permissão,
 * sem obra, versão congelada e lançamento inválido são mensagens na tela,
 * nunca um `return` mudo nem um digest. Nenhum campo vira "0" por omissão.
 * A liberação é ENTRADA DE CAIXA, não receita.
 */
export async function addReembolso(formData: FormData): Promise<ResultadoLiberacao> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "reembolso", "criar")) return { ok: false, error: "Sem permissão para lançar liberações de obra." };
  let obra: Awaited<ReturnType<typeof obraDoFormulario>>;
  try {
    obra = await obraDoFormulario(ctx.tenant.id, formData);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Escolha o projeto." };
  }
  const { project, version } = obra;
  const campos = { data: texto(formData.get("data")), origem: texto(formData.get("origem")), valor: texto(formData.get("valor")) };
  const motivo = motivoDeRecusaDaLiberacao(campos);
  if (motivo) return { ok: false, error: motivo };
  const valor = lerValorDaLiberacao(campos.valor);
  const [lib] = await db.insert(schema.reembolsos).values({
    versionId: version.id,
    tenantId: ctx.tenant.id,
    data: campos.data,
    origem: campos.origem,
    valor: valor.toFixed(2),
    // "%" saiu da tela (BO-2, 30/09/2026): um único uso em produção. A coluna
    // fica no banco; o que já foi gravado não muda.
    pct: null,
    obs: texto(formData.get("obs")),
    // SERIAL = INT(Data): continua gravado porque a planilha de exportação o
    // leva e a importação o traz de volta (Prompt O, 2.2).
    serial: excelSerial(campos.data),
    status: "Recebido",
  }).returning();
  // AK Parte 1 — sem transação aqui (1.3).
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "reembolso.create",
    entity: "reembolso",
    entityId: lib.id,
    meta: { projeto: project.name, versao: version.label, valor: lib.valor, data: lib.data, origem: lib.origem },
  });
  for (const t of ["/reembolso", "/fluxocaixa", "/caixa", "/projecao", "/consolidado", "/resumo"]) revalidatePath(t);
  return { ok: true, id: lib.id };
}

const TELAS_DA_LIBERACAO = ["/reembolso", "/fluxocaixa", "/caixa", "/projecao", "/consolidado", "/resumo"];

/**
 * Edita uma liberação (Prompt O, 4.3): valor, data, origem e observações,
 * enquanto não cancelada e com a versão destravada; mesma validação do
 * lançamento; auditoria campo a campo (valor anterior × novo), sem linha
 * quando nada mudou. O serial acompanha a data (continua indo à planilha).
 */
export async function updateReembolso(formData: FormData): Promise<ResultadoLiberacao> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "reembolso", "editar")) return { ok: false, error: "Sem permissão para editar liberações de obra." };
  const id = texto(formData.get("id"));
  if (!id) return { ok: false, error: "Liberação não informada." };
  const alvo = await getReembolsoDoTenant(ctx.tenant.id, id);
  if (!alvo) return { ok: false, error: "Liberação não encontrada." };
  if (alvo.liberacao.cancelado) return { ok: false, error: "Liberação cancelada não pode ser editada." };
  if (alvo.locked) return { ok: false, error: "Versão congelada — edição bloqueada." };
  const campos = { data: texto(formData.get("data")), origem: texto(formData.get("origem")), valor: texto(formData.get("valor")) };
  const motivo = motivoDeRecusaDaLiberacao(campos);
  if (motivo) return { ok: false, error: motivo };
  const novo = {
    data: campos.data,
    origem: campos.origem,
    valor: lerValorDaLiberacao(campos.valor).toFixed(2),
    obs: texto(formData.get("obs")),
    serial: excelSerial(campos.data),
  };
  const changes = diffAudit(alvo.liberacao as unknown as Record<string, unknown>, novo);
  await db
    .update(schema.reembolsos)
    .set(novo)
    .where(and(eq(schema.reembolsos.id, id), eq(schema.reembolsos.tenantId, ctx.tenant.id)));
  if (houveMudanca(changes)) {
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "reembolso.update",
      entity: "reembolso",
      entityId: id,
      meta: { changes },
    });
  }
  for (const t of TELAS_DA_LIBERACAO) revalidatePath(t);
  return { ok: true, id };
}

/**
 * Cancelamento lógico (Prompt O, 4.2), no padrão da despesa: flag, data,
 * autor e motivo. O registro permanece legível na lista; sai dos totais, do
 * caixa e da projeção (4.4, pelo filtro de `getReembolsos`). Estorno, não
 * exclusão — RG-09.
 */
export async function cancelarReembolso(id: string, motivo: string): Promise<ResultadoLiberacao> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "reembolso", "excluir")) return { ok: false, error: "Sem permissão para cancelar liberações de obra." };
  const alvo = await getReembolsoDoTenant(ctx.tenant.id, id);
  if (!alvo) return { ok: false, error: "Liberação não encontrada." };
  if (alvo.liberacao.cancelado) return { ok: false, error: "Liberação já cancelada." };
  if (alvo.locked) return { ok: false, error: "Versão congelada — cancelamento bloqueado." };
  const razao = motivo?.trim();
  if (!razao) return { ok: false, error: "Informe o motivo do cancelamento." };
  const hoje = new Date();
  const canceladoEm = `${String(hoje.getMonth() + 1).padStart(2, "0")}/${String(hoje.getDate()).padStart(2, "0")}/${hoje.getFullYear()}`;
  await db
    .update(schema.reembolsos)
    .set({ cancelado: true, canceladoEm, canceladoPor: ctx.userEmail || ctx.userId || null, motivoCancelamento: razao })
    .where(and(eq(schema.reembolsos.id, id), eq(schema.reembolsos.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "reembolso.cancel",
    entity: "reembolso",
    entityId: id,
    meta: { motivo: razao, valor: alvo.liberacao.valor, data: alvo.liberacao.data, origem: alvo.liberacao.origem },
  });
  for (const t of TELAS_DA_LIBERACAO) revalidatePath(t);
  return { ok: true, id };
}

export type ResultadoPermuta = { ok: true; id: string } | { ok: false; error: string };


/** Os campos do ativo como chegam do formulário (criar e editar leem o mesmo). */
function lerCamposDoAtivo(formData: FormData) {
  return {
    unitCode: texto(formData.get("unitCode")),
    clienteId: texto(formData.get("clienteId")),
    cliente: texto(formData.get("cliente")),
    dataRecebimento: texto(formData.get("dataRecebimento")),
    tipo: texto(formData.get("tipo")),
    descricao: texto(formData.get("descricao")),
    estimado: texto(formData.get("estimado")),
    status: texto(formData.get("status")) ?? "Disponivel",
    dataVenda: texto(formData.get("dataVenda")),
    valorVenda: texto(formData.get("valorVenda")),
    tipoPermuta: texto(formData.get("tipoPermuta")),
    formaVenda: texto(formData.get("formaVenda")),
    parcelas: texto(formData.get("parcelas")),
    periodicidade: texto(formData.get("periodicidade")),
    dataPrimParcela: texto(formData.get("dataPrimParcela")),
    obs: texto(formData.get("obs")),
  };
}

/**
 * 3.6 — cliente por id, da empresa; o nome do cadastro vai junto para a coluna
 * antiga continuar preenchida. Sem id (formulário antigo, importação, registro
 * só com nome) vale o texto.
 */
async function resolverCliente(tenantId: string, clienteId: string | null, clienteTexto: string | null) {
  if (!clienteId) return { clienteId: null, cliente: clienteTexto, erro: null as string | null };
  const [c] = await db
    .select({ id: schema.clientes.id, nome: schema.clientes.nomeCompleto })
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, clienteId), eq(schema.clientes.tenantId, tenantId)))
    .limit(1);
  if (!c) return { clienteId: null, cliente: null, erro: "Cliente não encontrado nesta empresa." };
  return { clienteId: c.id, cliente: c.nome, erro: null };
}

/** Valores gravados a partir dos campos validados. */
function valoresDoAtivo(campos: ReturnType<typeof lerCamposDoAtivo>, cliente: { clienteId: string | null; cliente: string | null }) {
  const estimado = lerValorDoAtivo(campos.estimado);
  const valorVenda = campos.valorVenda ? lerValorDoAtivo(campos.valorVenda) : 0;
  return {
    unitCode: campos.unitCode,
    clienteId: cliente.clienteId,
    cliente: cliente.cliente,
    dataRecebimento: campos.dataRecebimento,
    tipo: campos.tipo,
    descricao: campos.descricao,
    estimado: estimado.toFixed(2),
    status: campos.status,
    dataVenda: campos.dataVenda,
    valorVenda: valorVenda.toFixed(2),
    tipoPermuta: campos.tipoPermuta,
    formaVenda: campos.formaVenda,
    parcelas: campos.parcelas ? Number(campos.parcelas) : null,
    periodicidade: campos.periodicidade,
    dataPrimParcela: campos.dataPrimParcela,
    obs: campos.obs,
  };
}

const TELAS_DA_PERMUTA = ["/permuta", "/fluxocaixa", "/dre", "/caixa", "/resumo"];

/**
 * Cadastra um ativo recebido em permuta (Prompt P, 3.1/3.2). Devolve
 * `{ ok, error }` com mensagem legível — sem permissão, sem obra, versão
 * congelada e cadastro incompleto são erros que a tela mostra, nunca um
 * `return` mudo nem um digest de produção. Nenhum campo vira "0" por omissão.
 */
export async function addPermuta(formData: FormData): Promise<ResultadoPermuta> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "permuta", "criar")) return { ok: false, error: "Sem permissão para cadastrar ativos de permuta." };
  let obra: Awaited<ReturnType<typeof obraDoFormulario>>;
  try {
    obra = await obraDoFormulario(ctx.tenant.id, formData);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Escolha o projeto." };
  }
  const { project, version } = obra;
  const campos = lerCamposDoAtivo(formData);
  const cli = await resolverCliente(ctx.tenant.id, campos.clienteId, campos.cliente);
  if (cli.erro) return { ok: false, error: cli.erro };
  const motivo = motivoDeRecusaDoAtivo({ ...campos, cliente: cli.cliente });
  if (motivo) return { ok: false, error: motivo };
  const [perm] = await db
    .insert(schema.permutas)
    .values({ versionId: version.id, tenantId: ctx.tenant.id, ...valoresDoAtivo(campos, cli) })
    .returning();
  // AK Parte 1 — sem transação aqui (1.3).
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "permuta.create",
    entity: "permuta",
    entityId: perm.id,
    meta: {
      projeto: project.name,
      versao: version.label,
      unidade: perm.unitCode,
      tipo: perm.tipo,
      estimado: perm.estimado,
    },
  });
  for (const t of TELAS_DA_PERMUTA) revalidatePath(t);
  return { ok: true, id: perm.id };
}

/**
 * Edita um ativo (Prompt P, 2.2): todos os campos, enquanto não cancelado e
 * com a versão destravada; mesma validação do cadastro; auditoria campo a
 * campo (valor anterior × novo), sem linha quando nada mudou.
 */
export async function updatePermuta(formData: FormData): Promise<ResultadoPermuta> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "permuta", "editar")) return { ok: false, error: "Sem permissão para editar ativos de permuta." };
  const id = texto(formData.get("id"));
  if (!id) return { ok: false, error: "Ativo não informado." };
  const alvo = await getPermutaDoTenant(ctx.tenant.id, id);
  if (!alvo) return { ok: false, error: "Ativo não encontrado." };
  if (alvo.permuta.cancelado) return { ok: false, error: "Ativo cancelado não pode ser editado." };
  if (alvo.locked) return { ok: false, error: "Versão congelada — edição bloqueada." };
  const campos = lerCamposDoAtivo(formData);
  const cli = await resolverCliente(ctx.tenant.id, campos.clienteId, campos.cliente);
  if (cli.erro) return { ok: false, error: cli.erro };
  const motivo = motivoDeRecusaDoAtivo({ ...campos, cliente: cli.cliente });
  if (motivo) return { ok: false, error: motivo };
  const novo = valoresDoAtivo(campos, cli);
  const changes = diffAudit(alvo.permuta as unknown as Record<string, unknown>, novo);
  await db
    .update(schema.permutas)
    .set(novo)
    .where(and(eq(schema.permutas.id, id), eq(schema.permutas.tenantId, ctx.tenant.id)));
  if (houveMudanca(changes)) {
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "permuta.update",
      entity: "permuta",
      entityId: id,
      meta: { changes, unidade: novo.unitCode, tipo: novo.tipo },
    });
  }
  for (const t of TELAS_DA_PERMUTA) revalidatePath(t);
  return { ok: true, id };
}

/**
 * Cancelamento lógico (Prompt P, 2.3), no padrão da despesa: flag, data,
 * autor e motivo. O registro permanece legível na lista; sai dos totais, da
 * receita e do caixa (2.4, pelo filtro de `getPermutas`).
 */
export async function cancelarPermuta(id: string, motivo: string): Promise<ResultadoPermuta> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "permuta", "excluir")) return { ok: false, error: "Sem permissão para cancelar ativos de permuta." };
  const alvo = await getPermutaDoTenant(ctx.tenant.id, id);
  if (!alvo) return { ok: false, error: "Ativo não encontrado." };
  if (alvo.permuta.cancelado) return { ok: false, error: "Ativo já cancelado." };
  if (alvo.locked) return { ok: false, error: "Versão congelada — cancelamento bloqueado." };
  const razao = motivo?.trim();
  if (!razao) return { ok: false, error: "Informe o motivo do cancelamento." };
  const hoje = new Date();
  const canceladoEm = `${String(hoje.getMonth() + 1).padStart(2, "0")}/${String(hoje.getDate()).padStart(2, "0")}/${hoje.getFullYear()}`;
  await db
    .update(schema.permutas)
    .set({ cancelado: true, canceladoEm, canceladoPor: ctx.userEmail || ctx.userId || null, motivoCancelamento: razao })
    .where(and(eq(schema.permutas.id, id), eq(schema.permutas.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "permuta.cancel",
    entity: "permuta",
    entityId: id,
    meta: {
      motivo: razao,
      unidade: alvo.permuta.unitCode,
      tipo: alvo.permuta.tipo,
      estimado: alvo.permuta.estimado,
      status: alvo.permuta.status,
      valorVenda: alvo.permuta.valorVenda,
    },
  });
  for (const t of TELAS_DA_PERMUTA) revalidatePath(t);
  return { ok: true, id };
}


export interface RelatorioImportacaoPermutas {
  inseridas: number;
  atualizadas: number;
  ignoradas: LinhaIgnoradaPermuta[];
}
export type ResultadoImportacaoPermutas = ({ ok: true } & RelatorioImportacaoPermutas) | { ok: false; error: string };

/**
 * Importa ativos de permuta em lote (Prompt P, 5.5), depois da prévia na tela.
 * Linha com Id que existe ATUALIZA; sem Id, insere. Ativo vendido ou cancelado
 * não é tocado. A trava da versão vale aqui como no formulário. Tudo numa
 * transação com os ativos da versão travados. O cliente vem por nome na
 * planilha: quando casa exatamente com o cadastro, grava também o id (3.6).
 */
export async function importPermutas(rows: LinhaImportacaoPermuta[], projectId: string): Promise<ResultadoImportacaoPermutas> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "permuta", "criar")) return { ok: false, error: "Sem permissão para importar ativos de permuta." };
  const fd = new FormData();
  fd.set("projectId", projectId ?? "");
  let obra: Awaited<ReturnType<typeof obraDoFormulario>>;
  try {
    obra = await obraDoFormulario(ctx.tenant.id, fd);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Escolha o projeto." };
  }
  const { project, version } = obra;
  const clientes = await db
    .select({ id: schema.clientes.id, nome: schema.clientes.nomeCompleto })
    .from(schema.clientes)
    .where(eq(schema.clientes.tenantId, ctx.tenant.id));
  const clientePorNome = new Map(clientes.map((c) => [c.nome.trim().toLowerCase(), c]));
  const inseridas: string[] = [];
  const atualizadas: { id: string; changes: Record<string, unknown> }[] = [];
  let ignoradas: LinhaIgnoradaPermuta[] = [];
  await db.transaction(async (tx) => {
    const existentes = await tx
      .select()
      .from(schema.permutas)
      .where(and(eq(schema.permutas.tenantId, ctx.tenant.id), eq(schema.permutas.versionId, version.id)))
      .for("update");
    const prep = prepararImportacaoDePermutas(rows, existentes);
    ignoradas = prep.ignoradas;
    const porId = new Map(existentes.map((e) => [e.id, e]));
    for (const r of prep.validas) {
      const cadastro = r.cliente ? clientePorNome.get(r.cliente.trim().toLowerCase()) : undefined;
      const cli = cadastro ? { clienteId: cadastro.id, cliente: cadastro.nome } : { clienteId: null, cliente: r.cliente };
      const novo = valoresDoAtivo({ ...r, status: r.status ?? "Disponivel", clienteId: cli.clienteId, parcelas: null, periodicidade: null, dataPrimParcela: null }, cli);
      if (r.acao === "atualizar" && r.id) {
        const atual = porId.get(r.id)!;
        const changes = diffAudit(atual as unknown as Record<string, unknown>, novo);
        if (houveMudanca(changes)) {
          await tx.update(schema.permutas).set(novo).where(and(eq(schema.permutas.id, r.id), eq(schema.permutas.tenantId, ctx.tenant.id)));
        }
        atualizadas.push({ id: r.id, changes });
      } else {
        const [perm] = await tx
          .insert(schema.permutas)
          .values({ versionId: version.id, tenantId: ctx.tenant.id, ...novo })
          .returning({ id: schema.permutas.id });
        inseridas.push(perm.id);
      }
    }
    await logAudit(
      {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "permuta.import",
        entity: "permuta",
        meta: { projeto: project.name, versao: version.label, inseridas, atualizadas, ignoradas },
      },
      tx,
    );
  });
  for (const t of TELAS_DA_PERMUTA) revalidatePath(t);
  return { ok: true, inseridas: inseridas.length, atualizadas: atualizadas.length, ignoradas };
}


export type ResultadoAnexoPermuta = { ok: true; added: number } | { ok: false; error: string };

/**
 * Anexa documentos ao ativo (Prompt P, 6.2–6.4, 6.6, 6.7): tipo obrigatório
 * da lista, tamanho máximo, permissão de editar conferida no servidor, ativo
 * da empresa. Versão por (ativo, tipo): anexar o mesmo tipo cria a versão
 * seguinte e PRESERVA a anterior; tipo diferente não herda versão — o defeito
 * da tela de Clientes que o Prompt M corrigiu não se repete aqui.
 */
export async function addPermutaDocs(formData: FormData): Promise<ResultadoAnexoPermuta> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "permuta", "editar")) return { ok: false, error: "Sem permissão para anexar documentos ao ativo." };
  if (!isR2Configured()) return { ok: false, error: "Storage (R2) não configurado — defina as variáveis R2_*." };
  const permutaId = texto(formData.get("permutaId"));
  if (!permutaId) return { ok: false, error: "Ativo não informado." };
  const alvo = await getPermutaDoTenant(ctx.tenant.id, permutaId);
  if (!alvo) return { ok: false, error: "Ativo não encontrado." };
  const tipo = texto(formData.get("tipo")) ?? "";
  if (!(TIPOS_DOC_PERMUTA as readonly string[]).includes(tipo)) return { ok: false, error: "Escolha o tipo do documento." };
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Selecione ao menos um arquivo." };
  for (const f of files) if (f.size > LIMITE_UPLOAD_BYTES) return { ok: false, error: `"${f.name}" excede ${LIMITE_UPLOAD_MB} MB.` };
  const [ultima] = await db
    .select({ versao: schema.documents.versao })
    .from(schema.documents)
    .where(and(eq(schema.documents.tenantId, ctx.tenant.id), eq(schema.documents.permutaId, permutaId), eq(schema.documents.tipo, tipo)))
    .orderBy(desc(schema.documents.versao))
    .limit(1);
  let versao = ultima?.versao ?? 0;
  const gravados: { filename: string; versao: number; storageKey: string }[] = [];
  try {
    for (const file of files) {
      versao += 1;
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${ctx.tenant.id}/permuta/${permutaId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
      await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");
      await db.insert(schema.documents).values({
        tenantId: ctx.tenant.id,
        permutaId,
        projectId: alvo.projectId,
        unitCode: alvo.permuta.unitCode,
        storageKey: key,
        filename: file.name,
        contentType: file.type || null,
        size: file.size,
        tipo,
        versao,
        uploadedBy: ctx.userEmail || ctx.userId || null,
      });
      gravados.push({ filename: file.name, versao, storageKey: key });
    }
  } catch (e) {
    console.error("[permuta] falha ao anexar documentos:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao enviar os arquivos." };
  }
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "permuta.doc.upload",
    entity: "permuta",
    entityId: permutaId,
    meta: { tipo, arquivos: gravados },
  });
  revalidatePath(`/permuta/${permutaId}`);
  return { ok: true, added: files.length };
}

/**
 * Desvincula UM documento do ativo (6.5): só a linha de `document` sai; o
 * objeto NÃO é apagado do storage (limpeza de órfãos é tarefa própria). A
 * auditoria guarda nome do arquivo, chave, tipo e versão.
 */
export async function deletePermutaDoc(documentId: string): Promise<ResultadoPermuta> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "permuta", "editar")) return { ok: false, error: "Sem permissão para remover documentos do ativo." };
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!doc || !doc.permutaId) return { ok: false, error: "Documento não encontrado." };
  await db.delete(schema.documents).where(and(eq(schema.documents.id, doc.id), eq(schema.documents.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "permuta.doc.unlink",
    entity: "permuta",
    entityId: doc.permutaId,
    meta: { documentId: doc.id, filename: doc.filename, storageKey: doc.storageKey, tipo: doc.tipo, versao: doc.versao },
  });
  revalidatePath(`/permuta/${doc.permutaId}`);
  return { ok: true, id: doc.id };
}
