import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { CHAVES } from "@/lib/chaves";
import { nomeDoArquivo, temPreviaExportavel } from "@/lib/chaves-previa";
import { ACAO_EXPORTAR_PREVIA, tabelaDaPrevia } from "@/lib/chaves-exportacao";

export const dynamic = "force-dynamic";

/**
 * Decisão de 01/10/2026: exporta a prévia (antes × depois) de uma chave em
 * .xlsx, para guardar antes de ligar. Somente leitura; a exportação fica na
 * Auditoria (quem e quando) e é exigida por definirChave para ligar.
 */
export async function GET(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "chaves", "ver")) return new Response("Não autorizado", { status: 403 });
  const chave = new URL(req.url).searchParams.get("chave");
  if (!temPreviaExportavel(chave)) return new Response("Chave sem prévia exportável", { status: 400 });

  const titulo = CHAVES.find((c) => c.id === chave)?.titulo ?? chave;
  const [flag] = await db
    .select({ ligada: schema.tenantFlags.ligada })
    .from(schema.tenantFlags)
    .where(and(eq(schema.tenantFlags.tenantId, ctx.tenant.id), eq(schema.tenantFlags.chave, chave)))
    .limit(1);
  const tabela = await tabelaDaPrevia(ctx.tenant.id, chave, ctx.projects);
  const agora = new Date();
  const quem = ctx.userEmail ?? ctx.userId;

  const linhas = [
    ["Prévia da chave", titulo],
    ["Empresa", ctx.tenant.name],
    ["Situação da chave na exportação", flag?.ligada ? "Ligada" : "Desligada"],
    ["Exportada por", quem],
    ["Exportada em", agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
    [],
    tabela.cabecalho,
    ...tabela.linhas,
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Prévia");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: ACAO_EXPORTAR_PREVIA,
    entity: "tenant_flag",
    entityId: chave,
    meta: { chave, titulo, ligada: flag?.ligada ?? false, linhas: tabela.linhas.length },
  });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeDoArquivo(chave, agora)}"`,
      "Cache-Control": "no-store",
    },
  });
}
