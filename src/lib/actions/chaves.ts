"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { CHAVES, ehChave } from "@/lib/chaves";

type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Liga ou desliga uma chave de mudança da empresa (B4). Só owner e admin (a
 * tela está em TELAS_SO_ADMIN). Ligar exige declarar que a prévia foi vista;
 * desligar não — desligar devolve o comportamento de antes. Grava de → para
 * na auditoria, na mesma transação.
 */
export async function definirChave(formData: FormData): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "chaves", "editar")) {
    return { ok: false, error: "Só owner e admin ligam ou desligam chaves." };
  }
  const chave = formData.get("chave");
  if (!ehChave(chave)) return { ok: false, error: "Chave desconhecida." };
  const ligar = formData.get("ligar") === "1";
  if (ligar && formData.get("viPrevia") !== "on") {
    return { ok: false, error: "Confira a prévia e marque que a viu antes de ligar." };
  }
  const titulo = CHAVES.find((c) => c.id === chave)!.titulo;

  await db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ ligada: schema.tenantFlags.ligada })
      .from(schema.tenantFlags)
      .where(and(eq(schema.tenantFlags.tenantId, ctx.tenant.id), eq(schema.tenantFlags.chave, chave)))
      .for("update")
      .limit(1);
    const de = antes?.ligada ?? false;
    if (de === ligar) return;
    const quem = ctx.userEmail ?? ctx.userId;
    await tx
      .insert(schema.tenantFlags)
      .values({ tenantId: ctx.tenant.id, chave, ligada: ligar, alteradaPor: quem, alteradaEm: new Date() })
      .onConflictDoUpdate({
        target: [schema.tenantFlags.tenantId, schema.tenantFlags.chave],
        set: { ligada: ligar, alteradaPor: quem, alteradaEm: new Date() },
      });
    await logAudit(
      {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: ligar ? "chave.ligar" : "chave.desligar",
        entity: "tenant_flag",
        entityId: chave,
        meta: { chave, titulo, de, para: ligar },
      },
      tx,
    );
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
