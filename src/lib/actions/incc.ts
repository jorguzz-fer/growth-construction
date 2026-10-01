"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getInccRows } from "@/lib/queries";
import { projectIncc, type InccRow } from "@/lib/calc";
import { diffDeIncc, ehVarianteDoIncc, mesesFuturosOficiais, ordDeHoje, ordDoMes, VARIANTES_DO_INCC } from "@/lib/incc-regras";

export type ResultadoIncc = { ok: true; meses: number } | { ok: false; error: string };

/**
 * `saveIncc` (gravação em lote) foi REMOVIDA no Prompt Q, 4.5: era código
 * morto — nenhum chamador — e reencadeava o acumulado ignorando `projected`.
 * A tela edita mês a mês (`updateInccMonth`) e reprojeta por ação explícita
 * (`projectFutureIncc`, `marcarComoProjecao`).
 */

const TELAS_DO_INCC = ["/parametros", "/caixa", "/fluxocaixa", "/projecao", "/consolidado", "/simulador"];

const hojeGravado = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
};

/**
 * Persiste (monthly, accumulated, projected) de cada linha em transação, com
 * a auditoria dentro dela. `origem` (5.3): o mês informado à mão ganha quem e
 * quando; mês convertido em projeção perde a origem (não há mais índice
 * informado ali).
 */
async function persistir(
  tenantId: string,
  projectId: string,
  rows: InccRow[],
  auditoria: Parameters<typeof logAudit>[0],
  origem: { informado?: { mes: string; por: string | null; fonte: string | null }; limpar?: string[] } = {},
) {
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const extra =
        origem.informado?.mes === r.m
          ? { informadoPor: origem.informado.por, informadoEm: hojeGravado(), fonte: origem.informado.fonte }
          : origem.limpar?.includes(r.m)
            ? { informadoPor: null, informadoEm: null, fonte: null }
            : {};
      await tx
        .update(schema.inccRates)
        .set({ monthly: r.mo.toString(), accumulated: r.ac.toString(), projected: !!r.projected, ...extra })
        .where(and(eq(schema.inccRates.tenantId, tenantId), eq(schema.inccRates.projectId, projectId), eq(schema.inccRates.mes, r.m)));
    }
    await logAudit(auditoria, tx);
  });
}

type Contexto =
  | { ok: false; error: string }
  | { ok: true; ctx: NonNullable<Awaited<ReturnType<typeof getTenantContext>>>; projeto: { id: string; name: string } };

async function contexto(projectId: string): Promise<Contexto> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "parametros", "editar")) return { ok: false, error: "Sem permissão para editar o INCC." };
  const projeto = ctx.projects.find((p) => p.id === projectId);
  if (!projeto) return { ok: false, error: "Escolha a obra." };
  return { ok: true, ctx, projeto };
}

/**
 * Edita manualmente o índice de UM mês (3.1): o mês passa a ser oficial, os
 * meses ainda projetados são recalculados pela média móvel e o acumulado é
 * reencadeado. A auditoria registra o mês editado com valor anterior e novo e
 * a lista dos meses reescritos com os dois valores de cada um (3.2) — é o que
 * permite reconstituir por que a receita de um mês mudou.
 *
 * Índice fora da faixa usual é ACEITO (o aviso é da tela, 4.3); só o
 * impossível (não finito) é recusado. Negativo existe: deflação de insumos.
 */
export async function updateInccMonth(projectId: string, mes: string, mo: number, fonte?: string | null): Promise<ResultadoIncc> {
  const c = await contexto(projectId);
  if (!c.ok) return c;
  if (typeof mo !== "number" || !Number.isFinite(mo)) return { ok: false, error: "Informe um número para a variação mensal." };
  const antes = await getInccRows(c.ctx.tenant.id, projectId);
  const alvo = antes.find((r) => r.m === mes);
  if (!alvo) return { ok: false, error: `Mês ${mes} não está na tabela desta obra.` };
  const editado = antes.map((r) => (r.m === mes ? { ...r, mo, projected: false } : r));
  const depois = projectIncc(editado);
  const mudancas = diffDeIncc(antes, depois);
  await persistir(c.ctx.tenant.id, projectId, depois, {
    tenantId: c.ctx.tenant.id,
    userId: c.ctx.userId,
    action: "incc.update",
    entity: "incc_rate",
    meta: {
      projectId,
      projeto: c.projeto.name,
      mes,
      mensal: { de: alvo.mo, para: mo },
      eraProjetado: !!alvo.projected,
      reprojetados: mudancas.filter((m) => m.mes !== mes),
      mesesReescritos: mudancas.filter((m) => m.mes !== mes).length,
      fonte: fonte?.trim() || null,
    },
  }, { informado: { mes, por: c.ctx.userEmail || c.ctx.userId || null, fonte: fonte?.trim() || null } });
  for (const t of TELAS_DO_INCC) revalidatePath(t);
  return { ok: true, meses: mudancas.length };
}

/**
 * Reprojeção explícita (1.2): recalcula pela média móvel APENAS os meses já
 * marcados como projeção. Mês oficial permanece oficial, esteja no futuro ou
 * não (2.2) — antes, o botão marcava como projetado todo mês futuro e apagava
 * índice informado. A auditoria registra quantos meses mudaram e os valores
 * anteriores e novos (1.3).
 */
export async function projectFutureIncc(projectId: string): Promise<ResultadoIncc> {
  const c = await contexto(projectId);
  if (!c.ok) return c;
  const antes = await getInccRows(c.ctx.tenant.id, projectId);
  if (!antes.some((r) => r.projected)) return { ok: false, error: "Nenhum mês está marcado como projeção. Para projetar um mês futuro ainda oficial, use a ação do próprio mês." };
  const depois = projectIncc(antes);
  const mudancas = diffDeIncc(antes, depois);
  await persistir(c.ctx.tenant.id, projectId, depois, {
    tenantId: c.ctx.tenant.id,
    userId: c.ctx.userId,
    action: "incc.project",
    entity: "incc_rate",
    meta: { projectId, projeto: c.projeto.name, mesesReescritos: mudancas.length, mudancas },
  });
  for (const t of TELAS_DO_INCC) revalidatePath(t);
  return { ok: true, meses: mudancas.length };
}

/**
 * Converte meses FUTUROS ainda oficiais em projeção (2.3): ação explícita,
 * mês a mês ou na lista que a tela mostrou e o usuário confirmou — nunca
 * efeito colateral do botão de reprojetar. Mês corrente ou passado não vira
 * projeção por aqui: índice divulgado não se apaga.
 */
export async function marcarComoProjecao(projectId: string, meses: string[]): Promise<ResultadoIncc> {
  const c = await contexto(projectId);
  if (!c.ok) return c;
  const pedidos = [...new Set((meses ?? []).map((m) => m.trim()).filter(Boolean))];
  if (pedidos.length === 0) return { ok: false, error: "Informe ao menos um mês." };
  const antes = await getInccRows(c.ctx.tenant.id, projectId);
  const hoje = ordDeHoje();
  const candidatos = new Set(mesesFuturosOficiais(antes, hoje));
  const foraDaTabela = pedidos.filter((m) => !antes.some((r) => r.m === m));
  if (foraDaTabela.length) return { ok: false, error: `Mês fora da tabela: ${foraDaTabela.join(", ")}.` };
  const naoFuturo = pedidos.filter((m) => ordDoMes(m) <= hoje);
  if (naoFuturo.length) return { ok: false, error: `Só meses futuros podem virar projeção (${naoFuturo.join(", ")} já encerrou ou está em curso).` };
  const jaProjetados = pedidos.filter((m) => !candidatos.has(m));
  if (jaProjetados.length === pedidos.length) return { ok: false, error: "Esses meses já são projeção." };
  const marcados = antes.map((r) => (candidatos.has(r.m) && pedidos.includes(r.m) ? { ...r, projected: true } : r));
  const depois = projectIncc(marcados);
  const mudancas = diffDeIncc(antes, depois);
  const convertidos = pedidos.filter((m) => candidatos.has(m));
  await persistir(c.ctx.tenant.id, projectId, depois, {
    tenantId: c.ctx.tenant.id,
    userId: c.ctx.userId,
    action: "incc.marcarProjecao",
    entity: "incc_rate",
    meta: {
      projectId,
      projeto: c.projeto.name,
      convertidos,
      valoresAnteriores: antes.filter((r) => convertidos.includes(r.m)).map((r) => ({ mes: r.m, mensal: r.mo, acumulado: r.ac })),
      mesesReescritos: mudancas.length,
      mudancas,
    },
  }, { limpar: convertidos });
  for (const t of TELAS_DO_INCC) revalidatePath(t);
  return { ok: true, meses: convertidos.length };
}

/**
 * Declara a variante do índice que a tabela desta obra guarda (BQ-1, 5.1):
 * INCC-DI, INCC-M ou INCC-10. É parâmetro, não índice: nenhum valor muda.
 * Gravado em todas as linhas da obra (a tabela é por projeto); auditado.
 */
export async function definirVarianteIncc(projectId: string, variante: string): Promise<ResultadoIncc> {
  const c = await contexto(projectId);
  if (!c.ok) return c;
  if (!ehVarianteDoIncc(variante)) return { ok: false, error: `Variante inválida. Use ${VARIANTES_DO_INCC.join(", ")}.` };
  const [atual] = await db
    .select({ variante: schema.inccRates.variante })
    .from(schema.inccRates)
    .where(and(eq(schema.inccRates.tenantId, c.ctx.tenant.id), eq(schema.inccRates.projectId, projectId)))
    .limit(1);
  if (!atual) return { ok: false, error: "Esta obra ainda não tem tabela INCC." };
  await db.transaction(async (tx) => {
    await tx
      .update(schema.inccRates)
      .set({ variante })
      .where(and(eq(schema.inccRates.tenantId, c.ctx.tenant.id), eq(schema.inccRates.projectId, projectId)));
    await logAudit(
      {
        tenantId: c.ctx.tenant.id,
        userId: c.ctx.userId,
        action: "incc.variante",
        entity: "incc_rate",
        meta: { projectId, projeto: c.projeto.name, variante: { de: atual.variante ?? null, para: variante } },
      },
      tx,
    );
  });
  revalidatePath("/parametros");
  return { ok: true, meses: 0 };
}
