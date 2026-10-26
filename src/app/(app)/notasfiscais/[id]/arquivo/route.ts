import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { arquivoDaNota, temArquivos, type TipoDeArquivo } from "@/lib/nota-servico-arquivos";

export const dynamic = "force-dynamic";

/**
 * Prompt AG, 5.5 — baixa o PDF ou o XML da nota (`?tipo=pdf|xml`). Quem vê
 * Notas Fiscais baixa. O nome do arquivo leva a marca de homologação.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "notasfiscais", "ver")) return new Response("Não autorizado", { status: 403 });
  const { id } = await params;
  const tipo = new URL(req.url).searchParams.get("tipo");
  if (tipo !== "pdf" && tipo !== "xml") return new Response("Tipo de arquivo inválido", { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Nota não encontrada", { status: 404 });
  const [n] = await db
    .select()
    .from(schema.notasServico)
    .where(and(eq(schema.notasServico.id, id), eq(schema.notasServico.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!n || !ctx.projects.some((p) => p.id === n.projectId)) return new Response("Nota não encontrada", { status: 404 });
  if (!temArquivos(n.status)) return new Response("A nota ainda não foi autorizada.", { status: 409 });

  let arquivo: Awaited<ReturnType<typeof arquivoDaNota>>;
  try {
    arquivo = await arquivoDaNota(n, tipo as TipoDeArquivo);
  } catch {
    return new Response("Não foi possível obter o arquivo agora. Tente de novo em alguns minutos.", { status: 502 });
  }
  if (!arquivo) return new Response("O provedor ainda não disponibilizou este arquivo.", { status: 404 });

  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "nfse.arquivo.baixar", entity: "nota_servico", entityId: n.id, meta: { tipo } });
  return new Response(Buffer.from(arquivo.bytes), {
    headers: {
      "Content-Type": arquivo.contentType,
      "Content-Disposition": `attachment; filename="${arquivo.nome}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
