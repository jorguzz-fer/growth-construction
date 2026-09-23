import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { buildSemesterZip } from "@/lib/backup";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Download do ZIP de backup de um semestre (?sem=YYYY-H1). Contém a planilha
 * dos dados do período + os documentos salvos no período. Não remove nada.
 */
export async function GET(req: Request) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "backup", "ver")) {
    return new Response("Não autorizado", { status: 403 });
  }
  const key = new URL(req.url).searchParams.get("sem") || "";
  const res = await buildSemesterZip(ctx.tenant.id, key, ctx.tenant.name);
  if (!res) return new Response("Semestre inválido", { status: 400 });

  // Esta é a operação mais sensível do sistema: um semestre inteiro de dados da
  // empresa — despesas, recebíveis, caixa e os documentos anexados — sai daqui
  // num arquivo só. Era a única que não deixava rastro. O registro vem ANTES do
  // corpo da resposta: se a auditoria falhar, o download não acontece.
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "backup.download",
    entity: "backup",
    entityId: key,
    meta: { semestre: key, arquivo: res.filename, bytes: res.bytes.byteLength },
  });

  return new Response(new Uint8Array(res.bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${res.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
