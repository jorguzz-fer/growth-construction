"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { CONFIRMACAO_RECUO } from "@/lib/numeracao-regras";
import {
  ocupacaoDaFaixa,
  previewNumber,
  reserveDespesaNumber,
} from "@/lib/db/numbering";

export type SequenceConfig = {
  prefix: string;
  usePrefix: boolean;
  digits: number;
  nextNumber: number;
  active: boolean;
};

/** Lê (garantindo a existência) a configuração de numeração de Despesas. */
export async function getDespesaSequence(
  tenantId: string,
): Promise<SequenceConfig> {
  const [seq] = await db
    .select()
    .from(schema.numberSequences)
    .where(
      and(
        eq(schema.numberSequences.tenantId, tenantId),
        eq(schema.numberSequences.entity, "despesa"),
      ),
    )
    .limit(1);
  if (seq) {
    return {
      prefix: seq.prefix,
      usePrefix: seq.usePrefix,
      digits: seq.digits,
      nextNumber: seq.nextNumber,
      active: seq.active,
    };
  }
  // Ainda não inicializada: semeia a partir do maior número existente sem consumir.
  const rows = await db
    .select({ n: schema.despesas.numDoc })
    .from(schema.despesas)
    .where(eq(schema.despesas.tenantId, tenantId));
  let max = 0;
  for (const r of rows) {
    const m = r.n?.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return { prefix: "PED", usePrefix: true, digits: 6, nextNumber: max + 1, active: true };
}

export type ResultadoNumeracao =
  | { ok: true }
  | { ok: false; error: string; exigeConfirmacao?: boolean };

/**
 * Atualiza a configuração da sequência (somente quem pode editar a tela).
 *
 * Trava do Prompt AF, Parte 2 — verificada AQUI, na action que grava; o
 * formulário só informa antes:
 *  - o "próximo número" já emitido é sempre recusado (seria duplicata já no
 *    lançamento seguinte);
 *  - abaixo do maior número emitido no mesmo formato, só com confirmação
 *    escrita, e a mensagem diz quantos números da faixa já estão em uso;
 *  - salvar sem mudar formato nem contador passa como sempre passou.
 *
 * Devolve `{ ok, error }` em vez de lançar: mensagem de exceção de Server
 * Action não chega ao navegador em produção.
 */
export async function updateDespesaSequence(
  patch: SequenceConfig,
  confirmacao?: string,
): Promise<ResultadoNumeracao> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "numeracao", "editar")) {
    return { ok: false, error: "Sem permissão para configurar a numeração." };
  }
  const prefix = (patch.prefix || "").trim().slice(0, 12);
  const digits = Math.min(12, Math.max(1, Math.trunc(patch.digits) || 6));
  const nextNumber = Math.max(1, Math.trunc(patch.nextNumber) || 1);
  const usePrefix = !!patch.usePrefix;
  const before = await getDespesaSequence(ctx.tenant.id);
  // A flag "Numeração automática ativa" saiu da tela (decisão BAF-2 = opção 2):
  // nenhum caminho de lançamento a lê. A coluna fica, com o valor que já tinha.
  const active = before.active;

  const formato = { prefix, usePrefix, digits };
  const fmt = (n: number) => previewNumber(prefix, usePrefix, digits, n);
  const semMudanca =
    prefix === before.prefix &&
    usePrefix === before.usePrefix &&
    digits === before.digits &&
    nextNumber === before.nextNumber;

  const occ = await ocupacaoDaFaixa(ctx.tenant.id, formato, nextNumber);
  if (occ.proximoOcupado) {
    return {
      ok: false,
      error: `O número ${fmt(nextNumber)} já foi emitido — o lançamento seguinte repetiria um documento. Escolha um número ainda não usado (o maior emitido neste formato é ${fmt(occ.maiorEmitido!)}).`,
    };
  }
  if (
    !semMudanca &&
    occ.maiorEmitido !== null &&
    nextNumber < occ.maiorEmitido &&
    (confirmacao ?? "").trim().toUpperCase() !== CONFIRMACAO_RECUO
  ) {
    return {
      ok: false,
      exigeConfirmacao: true,
      error: `O próximo número (${fmt(nextNumber)}) fica abaixo do maior já emitido (${fmt(occ.maiorEmitido)}). ${occ.emUsoAFrente} número(s) entre ${fmt(nextNumber)} e ${fmt(occ.maiorEmitido)} já estão em uso: quando o contador chegar neles, o lançamento será recusado. O mínimo sem esse risco é ${occ.maiorEmitido + 1}. Para salvar mesmo assim, digite ${CONFIRMACAO_RECUO}.`,
    };
  }

  await db
    .insert(schema.numberSequences)
    .values({
      tenantId: ctx.tenant.id,
      entity: "despesa",
      prefix,
      usePrefix,
      digits,
      nextNumber,
      active,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.numberSequences.tenantId, schema.numberSequences.entity],
      set: {
        prefix,
        usePrefix,
        digits,
        nextNumber,
        updatedAt: new Date(),
      },
    });

  // Salvar sem mudar nada não é evento (AK, Parte 2): grava como sempre, sem
  // linha de log vazia.
  if (!semMudanca) {
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "numeracao.update",
      entity: "number_sequence",
      meta: {
        before,
        after: { prefix, usePrefix, digits, nextNumber, active },
        ...(occ.maiorEmitido !== null && nextNumber < occ.maiorEmitido
          ? { recuoConfirmado: true, emUsoAFrente: occ.emUsoAFrente }
          : {}),
      },
    });
  }
  revalidatePath("/numeracao");
  revalidatePath("/despesas");
  return { ok: true };
}

/** Reserva (consome) o próximo número — usado por outras actions. */
export { reserveDespesaNumber };
