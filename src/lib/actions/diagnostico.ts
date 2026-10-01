"use server";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { diffAudit } from "@/lib/audit-diff";
import { validarCategoriaDespesa } from "@/lib/calc/natureza-dre";
import {
  CATEGORIAS_CREDORAS,
  TAMANHO_DA_PAGINA,
  codificarCursor,
  lerCompetenciaDoFiltro,
  lerCursor,
  motivosDaDespesa,
  type Motivo,
  type Pulada,
} from "@/lib/conferencia-regras";
import type { CategoriaDRE } from "@/lib/calc/constants";
import { intervaloMeses } from "@/lib/calc/carencia";

/**
 * Diagnóstico de lançamentos que violam as regras NOVAS.
 *
 * As validações deste pacote (categoria de natureza devedora, valor obrigatório)
 * valem apenas para lançamentos novos. Registros históricos que as violem
 * continuam legíveis, editáveis e íntegros — eles aparecem aqui, e só saem
 * daqui por decisão humana, item a item ou em lote com preview.
 *
 * Nada nestas funções corrige nada sozinho. `reclassificarDespesas` é a única
 * que escreve, e só age sobre os IDs que o usuário marcou e confirmou.
 */

export interface DespesaSuspeita {
  id: string;
  numDoc: string | null;
  projectId: string;
  projectName: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  contaCef: string | null;
  categoriaDre: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: number;
  status: string | null;
  obs: string | null;
  createdAt: Date;
  /** Por que este lançamento está na lista — código governa, texto apresenta (AN 4.4). */
  motivos: Motivo[];
}

export interface FiltrosConferencia {
  projectId?: string | null;
  /** "MM/AAAA" */
  competencia?: string | null;
  fornecedorId?: string | null;
  cursor?: string | null;
  limite?: number;
}

export interface PaginaConferencia {
  rows: DespesaSuspeita[];
  /** Do conjunto filtrado inteiro — não da página (AN 4.3). */
  total: number;
  soma: number;
  /** Do conjunto inteiro, sem filtro: é o que o badge "a conferir" conta. */
  totalGeral: number;
  somaGeral: number;
  proximoCursor: string | null;
  fornecedores: { id: string; nome: string }[];
}

const VAZIA: PaginaConferencia = { rows: [], total: 0, soma: 0, totalGeral: 0, somaGeral: 0, proximoCursor: null, fornecedores: [] };

/**
 * As quatro condições, no SQL (AN 4.2): categoria credora, sem categoria,
 * valor zero e — Parte 1 — competência nula ou em branco (esta, só para
 * lançamento não cancelado: ver `motivosDaDespesa`). As credoras chegam como
 * parâmetro, calculadas pela regra de `natureza-dre.ts`.
 */
function condicoesSuspeitas() {
  const d = schema.despesas;
  const credora = CATEGORIAS_CREDORAS.length
    ? inArray(d.categoriaDre, CATEGORIAS_CREDORAS as CategoriaDRE[])
    : sql`false`;
  return or(
    credora,
    isNull(d.categoriaDre),
    eq(d.valor, "0"),
    and(eq(d.cancelado, false), or(isNull(d.competencia), sql`btrim(${d.competencia}) = ''`)),
  )!;
}

/**
 * Despesas a conferir, uma página por vez (AN 4.3), mais o total e a soma do
 * conjunto inteiro. Somente leitura. Cancelada aparece só quando já tem outro
 * motivo — a exclusão continua em JavaScript, porque é lógica, não filtro.
 */
export async function getDespesasSuspeitas(filtros: FiltrosConferencia = {}): Promise<PaginaConferencia> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return VAZIA;
  const d = schema.despesas;
  const base = and(eq(d.tenantId, ctx.tenant.id), condicoesSuspeitas())!;
  const competencia = lerCompetenciaDoFiltro(filtros.competencia);
  const filtro = and(
    base,
    filtros.projectId ? eq(schema.projects.id, filtros.projectId) : undefined,
    competencia ? sql`btrim(${d.competencia}) = ${competencia}` : undefined,
    filtros.fornecedorId ? eq(d.fornecedorId, filtros.fornecedorId) : undefined,
  )!;
  const cursor = lerCursor(filtros.cursor);
  const limite = Math.min(Math.max(1, filtros.limite ?? TAMANHO_DA_PAGINA), 500);

  const deTodas = () =>
    db
      .select({ n: sql<number>`count(*)::int`, soma: sql<string>`coalesce(sum(${d.valor}), 0)` })
      .from(d)
      .innerJoin(schema.versions, eq(d.versionId, schema.versions.id))
      .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id));

  const [linhas, [filtrado], [geral], fornecedores] = await Promise.all([
    db
      .select({
        d,
        projectId: schema.projects.id,
        projectName: schema.projects.name,
        fornecedorNome: schema.stakeholders.nome,
      })
      .from(d)
      .innerJoin(schema.versions, eq(d.versionId, schema.versions.id))
      .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
      .leftJoin(schema.stakeholders, eq(d.fornecedorId, schema.stakeholders.id))
      .where(
        and(
          filtro,
          cursor
            ? or(sql`${d.valor} < ${cursor.valor}::numeric`, and(sql`${d.valor} = ${cursor.valor}::numeric`, sql`${d.id} > ${cursor.id}::uuid`))
            : undefined,
        ),
      )
      .orderBy(desc(d.valor), asc(d.id))
      .limit(limite + 1),
    deTodas().where(filtro),
    deTodas().where(base),
    db
      .selectDistinct({ id: schema.stakeholders.id, nome: schema.stakeholders.nome })
      .from(d)
      .innerJoin(schema.stakeholders, eq(d.fornecedorId, schema.stakeholders.id))
      .where(base)
      .orderBy(asc(schema.stakeholders.nome)),
  ]);

  const rows: DespesaSuspeita[] = [];
  for (const r of linhas.slice(0, limite)) {
    const motivos = motivosDaDespesa(r.d);
    // Nunca acontece com o `where` acima; fica como guarda da mesma regra.
    if (!motivos) continue;
    rows.push({
      id: r.d.id,
      numDoc: r.d.numDoc,
      projectId: r.projectId,
      projectName: r.projectName,
      fornecedorId: r.d.fornecedorId,
      fornecedorNome: r.fornecedorNome,
      contaCef: r.d.contaCef,
      categoriaDre: r.d.categoriaDre,
      competencia: r.d.competencia,
      vencimento: r.d.vencimento,
      valor: Number(r.d.valor),
      status: r.d.status,
      obs: r.d.obs,
      createdAt: r.d.createdAt,
      motivos,
    });
  }
  const ultimo = linhas.length > limite ? linhas[limite - 1] : null;
  return {
    rows,
    total: filtrado?.n ?? 0,
    soma: Number(filtrado?.soma ?? 0),
    totalGeral: geral?.n ?? 0,
    somaGeral: Number(geral?.soma ?? 0),
    proximoCursor: ultimo ? codificarCursor(Number(ultimo.d.valor), ultimo.d.id) : null,
    fornecedores: fornecedores.filter((f): f is { id: string; nome: string } => !!f.nome),
  };
}

export interface ReclassificarResult {
  ok: boolean;
  error?: string;
  /** AN 2.3 — os três números. */
  selecionadas?: number;
  alteradas?: number;
  puladas?: Pulada[];
}

/**
 * Reclassificação ASSISTIDA: aplica uma categoria DRE às despesas escolhidas.
 *
 * Só roda sobre IDs que o usuário marcou na tela e confirmou depois do preview.
 * Nunca é chamada automaticamente, nunca infere a categoria "certa" sozinha e
 * nunca toca em valor, competência, vencimento, status ou número PED. Cada
 * alteração vai para a auditoria com valor anterior e novo (RG-09).
 */
export async function reclassificarDespesas(
  ids: string[],
  categoriaDre: string,
): Promise<ReclassificarResult> {
  return reclassificarItens(ids.map((id) => ({ id, categoriaDre })));
}

/**
 * AN, Parte 3: cada lançamento com o seu destino, escolhido linha a linha (o
 * lote da tela só preenche o destino de seleção homogênea). Toda categoria é
 * validada ANTES de qualquer leitura ou escrita.
 *
 * AN, Parte 2: o laço inteiro — updates E logs — roda numa transação só. Se
 * qualquer item falhar, nada fica reclassificado nem registrado.
 */
export async function reclassificarItens(
  itens: { id: string; categoriaDre: string }[],
): Promise<ReclassificarResult> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    return { ok: false, error: "Sem permissão para reclassificar lançamentos." };
  }
  if (!Array.isArray(itens)) return { ok: false, error: "Nenhum lançamento selecionado." };
  const destino = new Map<string, string>();
  for (const it of itens) {
    if (!it || typeof it.id !== "string" || !it.id) continue;
    const erro = validarCategoriaDespesa(it.categoriaDre);
    if (erro) return { ok: false, error: erro };
    if (destino.has(it.id) && destino.get(it.id) !== it.categoriaDre) {
      return { ok: false, error: "O mesmo lançamento recebeu duas categorias diferentes." };
    }
    destino.set(it.id, it.categoriaDre);
  }
  const alvos = [...destino.keys()];
  if (alvos.length === 0) return { ok: false, error: "Nenhum lançamento selecionado." };

  const existentes = await db
    .select()
    .from(schema.despesas)
    .where(
      and(
        eq(schema.despesas.tenantId, ctx.tenant.id),
        inArray(schema.despesas.id, alvos),
      ),
    );
  if (existentes.length === 0) {
    return { ok: false, error: "Os lançamentos selecionados não foram encontrados." };
  }

  const puladas: Pulada[] = [];
  const achados = new Set(existentes.map((d) => d.id));
  for (const id of alvos) if (!achados.has(id)) puladas.push({ id, numDoc: null, motivo: "nao_encontrada" });

  let alteradas = 0;
  try {
    alteradas = await db.transaction(async (tx) => {
      let n = 0;
      for (const d of existentes) {
        const categoriaDre = destino.get(d.id)!;
        // Cancelada não é reclassificada: o registro está encerrado.
        if (d.cancelado) {
          puladas.push({ id: d.id, numDoc: d.numDoc, motivo: "cancelada" });
          continue;
        }
        if (d.categoriaDre === categoriaDre) {
          puladas.push({ id: d.id, numDoc: d.numDoc, motivo: "ja_na_categoria" });
          continue;
        }
        const changes = diffAudit(d as unknown as Record<string, unknown>, {
          categoriaDre,
        });
        await tx
          .update(schema.despesas)
          .set({ categoriaDre: categoriaDre as CategoriaDRE })
          .where(and(eq(schema.despesas.id, d.id), eq(schema.despesas.tenantId, ctx.tenant.id)));
        await logAudit(
          {
            tenantId: ctx.tenant.id,
            userId: ctx.userId,
            action: "despesa.reclassificar",
            entity: "despesa",
            entityId: d.id,
            meta: { changes, origem: "diagnostico/categorias-invertidas", numDoc: d.numDoc },
          },
          tx,
        );
        n++;
      }
      return n;
    });
  } catch (e) {
    console.error("[conferencia] reclassificação desfeita:", e);
    return { ok: false, error: "A reclassificação falhou e foi desfeita por inteiro: nenhum lançamento foi alterado. Tente de novo." };
  }

  revalidatePath("/diagnostico/categorias-invertidas");
  revalidatePath("/despesas");
  revalidatePath("/dre");
  return { ok: true, selecionadas: alvos.length, alteradas, puladas };
}

export interface PlanoSuspeito {
  unitId: string;
  unitCode: string;
  projectName: string;
  status: string;
  /** Data-base do plano: o "Ato" (ou o primeiro bloco preenchido). */
  dataBase: string | null;
  labelBase: string;
  /** Vencimento da primeira parcela do bloco periódico seguinte. */
  primeiraParcela: string | null;
  labelPrimeira: string;
  /** Meses entre a data-base e a primeira parcela. */
  intervaloMeses: number;
  /** Datas que o expansor produziria fora do calendário (ex.: 31 em abril). */
  datasInvalidas: string[];
}

/**
 * Planos de pagamento cujo intervalo entre a data-base e a primeira mensal é
 * maior que a carência esperada (item 6.3), e planos cujo dia de vencimento não
 * existe em algum mês da série (item 6.2 / 2.4).
 *
 * Diagnóstico puro: **nenhuma data de recebível contratado é alterada aqui.**
 */
export async function getPlanosSuspeitos(
  carenciaEsperadaMeses = 1,
): Promise<PlanoSuspeito[]> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "unidades", "ver")) return [];

  const rows = await db
    .select({
      u: schema.units,
      projectName: schema.projects.name,
    })
    .from(schema.units)
    .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(eq(schema.units.tenantId, ctx.tenant.id), eq(schema.versions.kind, "atual")),
    );

  const out: PlanoSuspeito[] = [];
  for (const r of rows) {
    if (r.u.status !== "Vendido" || !r.u.paymentPlan) continue;
    const p = r.u.paymentPlan as unknown as Record<string, Record<string, unknown>>;
    const sec = (k: string) => p[k] ?? {};
    const venc = (k: string) => {
      const v = sec(k).venc;
      return typeof v === "string" && v.trim() ? v : null;
    };
    const val = (k: string) => Number(sec(k).val) || 0;
    const qtd = (k: string) => Math.max(1, Number(sec(k).n) || 1);

    // Data-base: o primeiro bloco de entrada preenchido (Ato, depois Sinais).
    const basesPossiveis: [string, string][] = [
      ["AS", "Ato"],
      ["S1", "Sinal 1"],
      ["S2", "Sinal 2"],
      ["S3", "Sinal 3"],
    ];
    let dataBase: string | null = null;
    let labelBase = "";
    for (const [k, label] of basesPossiveis) {
      if (venc(k) && val(k) > 0) {
        dataBase = venc(k);
        labelBase = label;
        break;
      }
    }
    const primeira = venc("Mensais") && val("Mensais") > 0 ? venc("Mensais") : null;

    const meses = dataBase && primeira ? intervaloMeses(dataBase, primeira) : 0;

    // Dia de vencimento inexistente em algum mês da série periódica.
    const datasInvalidas: string[] = [];
    for (const [k, label, passo] of [
      ["Mensais", "Mensal", 1],
      ["Semestrais", "Semestral", 6],
      ["Anuais", "Anual", 12],
    ] as [string, string, number][]) {
      const base = venc(k);
      if (!base || val(k) <= 0) continue;
      const partes = base.split("/");
      if (partes.length !== 3) continue;
      const dia = Number(partes[1]);
      if (dia <= 28) continue; // 1..28 existe em todo mês
      const mo = Number(partes[0]);
      const yr = Number(partes[2]);
      for (let i = 0; i < qtd(k); i++) {
        const total = mo - 1 + i * passo;
        const m = (total % 12) + 1;
        const y = yr + Math.floor(total / 12);
        const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
        if (dia > ultimoDia) {
          datasInvalidas.push(
            `${label} #${i + 1}: dia ${dia} não existe em ${String(m).padStart(2, "0")}/${y}`,
          );
        }
      }
    }

    const forcaCarencia = dataBase && primeira && meses > carenciaEsperadaMeses;
    if (!forcaCarencia && datasInvalidas.length === 0) continue;

    out.push({
      unitId: r.u.id,
      unitCode: r.u.code,
      projectName: r.projectName,
      status: r.u.status,
      dataBase,
      labelBase,
      primeiraParcela: primeira,
      labelPrimeira: "Mensal #1",
      intervaloMeses: meses,
      // Um plano pode ter dezenas de parcelas; mostrar as primeiras já basta
      // para a conferência entender o padrão.
      datasInvalidas: datasInvalidas.slice(0, 6),
    });
  }
  return out.sort((a, b) => b.intervaloMeses - a.intervaloMeses);
}
