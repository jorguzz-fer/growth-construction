import { getActiveContext } from "@/lib/context";
import {
  getDespesas,
  getInccRows,
  getPermutas,
  getReembolsos,
  getUnits,
} from "@/lib/queries";
import { can } from "@/lib/permissions";
import { emptyPlan } from "@/lib/calc/plan";
import { buildExportBuffer, type ExportData } from "@/lib/xlsx/growth-template";

export const dynamic = "force-dynamic";

/**
 * Download dos dados JÁ PREENCHIDOS de uma versão, no MESMO formato da planilha
 * modelo (reimportável). ?v= indica a versão (padrão: ativa).
 */
export async function GET(req: Request) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "versao", "ver")) {
    return new Response("Não autorizado", { status: 403 });
  }

  const wantedId = new URL(req.url).searchParams.get("v");
  const version = ctx.versions.find((v) => v.id === wantedId) ?? ctx.version;

  const [unitRows, reembRows, permRows, despRows, incc] = await Promise.all([
    getUnits(version.id),
    getReembolsos(version.id),
    getPermutas(version.id),
    getDespesas(version.id),
    getInccRows(ctx.project.id),
  ]);

  const data: ExportData = {
    incc,
    units: unitRows.map((u) => ({
      code: u.code,
      bloco: u.bloco,
      tipo: u.tipo,
      m2: u.m2 != null ? Number(u.m2) : null,
      andar: u.andar,
      valor: Number(u.valor),
      status: u.status,
      mesVenda: u.mesVenda,
      plan: u.paymentPlan ?? emptyPlan(),
    })),
    reembolsos: reembRows.map((r) => ({
      data: r.data ?? "",
      origem: r.origem ?? "",
      valor: Number(r.valor ?? 0),
      pct: r.pct ?? "",
      obs: r.obs ?? "",
      serial: r.serial ?? null,
    })),
    permutas: permRows.map((p) => ({
      unitCode: p.unitCode ?? "",
      cliente: p.cliente ?? "",
      dataRecebimento: p.dataRecebimento ?? "",
      tipo: p.tipo ?? "",
      descricao: p.descricao ?? "",
      estimado: Number(p.estimado ?? 0),
      status: p.status ?? "",
      dataVenda: p.dataVenda ?? "",
      valorVenda: Number(p.valorVenda ?? 0),
      tipoPermuta: p.tipoPermuta ?? "",
      obs: p.obs ?? "",
    })),
    despesas: despRows
      .filter((d) => d.contaCef && d.competencia)
      .map((d) => ({
        contaCef: d.contaCef as string,
        competencia: d.competencia as string,
        valor: Number(d.valor),
      })),
  };

  const buffer = buildExportBuffer(data);
  const slug = version.label.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  const filename = `Growth_Tools_Dados_${slug || "versao"}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
