import { getActiveContext } from "@/lib/context";
import { getInccRows } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { buildTemplateBuffer } from "@/lib/xlsx/growth-template";

export const dynamic = "force-dynamic";

/** Download da planilha modelo (.xlsx) no formato padrão Growth Tools. */
export async function GET() {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "versao", "ver")) {
    return new Response("Não autorizado", { status: 403 });
  }

  const incc = await getInccRows(ctx.project.id);
  const buffer = buildTemplateBuffer(incc);
  const slug = ctx.version.label.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  const filename = `Growth_Tools_Modelo_${slug || "versao"}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
