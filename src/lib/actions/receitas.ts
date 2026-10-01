"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getProjectVersions, getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { excelSerial } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { lerValorDoAtivo, motivoDeRecusaDoAtivo } from "@/lib/permuta-regras";
import { diffAudit, houveMudanca } from "@/lib/audit-diff";
import { prepararImportacaoDePermutas, type LinhaIgnoradaPermuta, type LinhaImportacaoPermuta } from "@/lib/permuta-inventario";
import { getPermutaDoTenant } from "@/lib/queries";
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

export async function addReembolso(formData: FormData) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "reembolso", "criar")) return;
  const { project, version } = await obraDoFormulario(ctx.tenant.id, formData);
  const data = (formData.get("data") as string) || null;
  const [lib] = await db.insert(schema.reembolsos).values({
    versionId: version.id,
    tenantId: ctx.tenant.id,
    data,
    origem: (formData.get("origem") as string) || null,
    valor: (formData.get("valor") as string) || "0",
    // "%" saiu da tela (BO-2, 30/09/2026): um único uso em produção. A coluna
    // fica no banco; o que já foi gravado não muda.
    pct: null,
    obs: (formData.get("obs") as string) || null,
    // SERIAL = INT(Data): calculado automaticamente a partir da data real.
    serial: excelSerial(data),
    status: "Recebido",
  }).returning();
  // AK Parte 1 — sem transação aqui (1.3).
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "reembolso.create",
    entity: "reembolso",
    entityId: lib.id,
    meta: { projeto: project.name, versao: version.label, valor: lib.valor, data: lib.data },
  });
  revalidatePath("/reembolso");
  redirect(`/reembolso?proj=${project.id}`);
}

export type ResultadoPermuta = { ok: true; id: string } | { ok: false; error: string };

const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "") || null;

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
