import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isR2Configured, presignDownload } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

/**
 * Prompt AO — baixa o pacote completo já gerado. O download vai para a
 * Auditoria (6.2) ANTES do link: se o registro falhar, o arquivo não sai. O
 * link é temporário (5 min) e nunca o domínio público do bucket — o pacote tem
 * dado pessoal.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "backup", "ver")) return new Response("Não autorizado", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Pacote não encontrado", { status: 404 });
  const [p] = await db
    .select()
    .from(schema.backupPacotes)
    .where(and(eq(schema.backupPacotes.id, id), eq(schema.backupPacotes.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!p) return new Response("Pacote não encontrado", { status: 404 });
  if (p.status !== "pronto" || !p.storageKey || !p.arquivo) return new Response("O pacote ainda não está pronto.", { status: 409 });
  if (!isR2Configured()) return new Response("Armazenamento não configurado.", { status: 503 });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "backup.download",
    entity: "backup",
    entityId: p.semestre,
    meta: { semestre: p.semestre, arquivo: p.arquivo, bytes: p.bytes, pacote: "completo", pacoteId: p.id, conteudo: p.resumo },
  });
  return Response.redirect(await presignDownload(p.storageKey, p.arquivo), 302);
}
