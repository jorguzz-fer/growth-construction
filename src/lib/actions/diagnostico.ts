"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { diffAudit } from "@/lib/audit-diff";
import {
  categoriaValidaParaDespesa,
  validarCategoriaDespesa,
} from "@/lib/calc/natureza-dre";
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
  fornecedorNome: string | null;
  categoriaDre: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: number;
  status: string | null;
  obs: string | null;
  /** Por que este lançamento está na lista. */
  motivos: string[];
}

/**
 * Despesas gravadas com categoria de natureza credora (o bug do item 1.3), sem
 * categoria nenhuma, ou com valor zero (item 1.4).
 *
 * Somente leitura. Inclui lançamentos cancelados marcados como tal, para que a
 * conferência veja o quadro inteiro sem que eles poluam a contagem de pendências.
 */
export async function getDespesasSuspeitas(): Promise<DespesaSuspeita[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return [];

  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(eq(schema.despesas.tenantId, ctx.tenant.id));

  const out: DespesaSuspeita[] = [];
  for (const r of rows) {
    const motivos: string[] = [];
    if (r.d.categoriaDre && !categoriaValidaParaDespesa(r.d.categoriaDre)) {
      motivos.push("categoria de receita em lançamento de despesa");
    }
    if (!r.d.categoriaDre) motivos.push("sem categoria DRE");
    if (Number(r.d.valor) === 0) motivos.push("valor zero");
    if (r.d.cancelado) {
      // Cancelada não é pendência — mas some da lista só se não houver outro
      // motivo, para não esconder um registro que a contabilidade queira ver.
      if (motivos.length === 0) continue;
      motivos.push("lançamento cancelado");
    }
    if (motivos.length === 0) continue;
    out.push({
      id: r.d.id,
      numDoc: r.d.numDoc,
      projectId: r.projectId,
      projectName: r.projectName,
      fornecedorNome: r.fornecedorNome,
      categoriaDre: r.d.categoriaDre,
      competencia: r.d.competencia,
      vencimento: r.d.vencimento,
      valor: Number(r.d.valor),
      status: r.d.status,
      obs: r.d.obs,
      motivos,
    });
  }
  // Maiores valores primeiro: é por onde a conferência começa.
  return out.sort((a, b) => b.valor - a.valor);
}

export interface ReclassificarResult {
  ok: boolean;
  error?: string;
  alteradas?: number;
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
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    return { ok: false, error: "Sem permissão para reclassificar lançamentos." };
  }
  const erro = validarCategoriaDespesa(categoriaDre);
  if (erro) return { ok: false, error: erro };
  const alvos = [...new Set(ids.filter(Boolean))];
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

  let alteradas = 0;
  for (const d of existentes) {
    // Cancelada não é reclassificada: o registro está encerrado.
    if (d.cancelado) continue;
    if (d.categoriaDre === categoriaDre) continue;
    const changes = diffAudit(d as unknown as Record<string, unknown>, {
      categoriaDre,
    });
    await db
      .update(schema.despesas)
      .set({ categoriaDre: categoriaDre as CategoriaDRE })
      .where(eq(schema.despesas.id, d.id));
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "despesa.reclassificar",
      entity: "despesa",
      entityId: d.id,
      meta: { changes, origem: "diagnostico/categorias-invertidas", numDoc: d.numDoc },
    });
    alteradas++;
  }

  revalidatePath("/diagnostico/categorias-invertidas");
  revalidatePath("/despesas");
  revalidatePath("/dre");
  return { ok: true, alteradas };
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
  const ctx = await getActiveContext();
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
