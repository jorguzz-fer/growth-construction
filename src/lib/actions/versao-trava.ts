"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext, getVersionContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { TELA_TRAVA } from "@/lib/versao-trava";

export type ResultadoTrava = { ok: true } | { ok: false; error: string };

/**
 * Trava ou destrava uma versão (Prompt AP, BAP-2). Substitui
 * `toggleVersionLock` da tela `/versao`, que sai. Escrita e log na mesma
 * transação, com `de`/`para`. Não toca em nenhuma outra coluna da versão.
 */
export async function travarVersao(versionId: string, travar: boolean): Promise<ResultadoTrava> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, TELA_TRAVA, "editar")) return { ok: false, error: "Sem permissão para travar ou destravar versão." };
  if (typeof travar !== "boolean") return { ok: false, error: "Pedido inválido." };
  const alvo = await getVersionContext(ctx.tenant.id, versionId);
  if (!alvo) return { ok: false, error: "Versão não encontrada nesta empresa." };
  const { version, project } = alvo;
  if (version.locked === travar) return { ok: true };
  await db.transaction(async (tx) => {
    await tx
      .update(schema.versions)
      .set({ locked: travar })
      .where(and(eq(schema.versions.id, version.id), eq(schema.versions.tenantId, ctx.tenant.id)));
    await logAudit(
      {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "version.lock",
        entity: "version",
        entityId: version.id,
        meta: { projeto: project.name, versao: version.label, changes: { locked: { de: version.locked, para: travar } } },
      },
      tx,
    );
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
