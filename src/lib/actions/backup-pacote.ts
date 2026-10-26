"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { semesterInfo } from "@/lib/semester";
import { isR2Configured } from "@/lib/storage/r2";
import { gerarPacote, pacoteEmAndamento } from "@/lib/backup-geracao";

/**
 * Prompt AO, 4.3 — pede o pacote completo de um semestre. A geração roda em
 * segundo plano; a tela acompanha o progresso. Um pedido por vez, por empresa.
 * Gerar é ato humano: nenhum assistente chama isto (8.2).
 */
export async function pedirPacoteCompleto(semestre: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "backup", "ver")) return { ok: false, error: "Sem permissão para o backup." };
  const info = semesterInfo(semestre);
  if (!info) return { ok: false, error: "Semestre inválido." };
  if (!isR2Configured()) return { ok: false, error: "O pacote completo precisa do armazenamento (R2) configurado no servidor." };
  const andamento = await pacoteEmAndamento(ctx.tenant.id);
  if (andamento) return { ok: false, error: `Já há um pacote sendo gerado (${andamento.semestre}). Espere terminar.` };

  const [p] = await db
    .insert(schema.backupPacotes)
    .values({ tenantId: ctx.tenant.id, semestre: info.key, createdBy: ctx.userId, etapa: "Na fila" })
    .returning({ id: schema.backupPacotes.id });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "backup.pacote.gerar", entity: "backup", entityId: info.key, meta: { semestre: info.key, pacoteId: p.id } });
  try {
    after(() => gerarPacote(p.id));
  } catch {
    // Fora de uma requisição (testes): roda solto.
    void gerarPacote(p.id);
  }
  revalidatePath("/backup");
  return { ok: true, id: p.id };
}
