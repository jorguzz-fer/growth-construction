import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { buildSemesterZip } from "@/lib/backup";

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

  return new Response(new Uint8Array(res.bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${res.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
