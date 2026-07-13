import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getChartAccounts, getBudgetLines, getInccRows } from "@/lib/queries";
import { RECEITA_ROWS, RECEITA_ROW_KEY, defaultDreCategory, isBudgetVersion } from "@/lib/budget/config";

export const dynamic = "force-dynamic";

/** Exporta o lançamento simplificado (Receitas + Despesas) de uma versão em .xlsx. */
export async function GET(req: Request) {
  const ctx = await getActiveContext();
  if (!ctx) return new Response("Não autorizado", { status: 403 });

  const wantedId = new URL(req.url).searchParams.get("v");
  const [version] = wantedId
    ? await db
        .select()
        .from(schema.versions)
        .where(
          and(eq(schema.versions.id, wantedId), eq(schema.versions.tenantId, ctx.tenant.id)),
        )
        .limit(1)
    : [];
  if (!version || !isBudgetVersion(version.kind)) {
    return new Response("Somente Budget/Forecast", { status: 400 });
  }
  if (!can(ctx.perms, version.kind, "ver")) {
    return new Response("Não autorizado", { status: 403 });
  }

  const [chart, lines, incc] = await Promise.all([
    getChartAccounts(ctx.tenant.id),
    getBudgetLines(version.id),
    getInccRows(version.projectId),
  ]);
  const months = incc.map((r) => r.m);

  // valores: kind → rowKey → mes. Receita é consolidada numa única linha.
  const val: Record<string, Record<string, Record<string, number>>> = { receita: {}, despesa: {} };
  const cat: Record<string, string> = {};
  for (const l of lines) {
    if (l.kind === "receita") {
      const bag = ((val.receita[RECEITA_ROW_KEY] ??= {}) as Record<string, number>);
      bag[l.mes] = (bag[l.mes] || 0) + Number(l.valor);
    } else {
      ((val.despesa[l.rowKey] ??= {}) as Record<string, number>)[l.mes] = Number(l.valor);
      if (l.dreCategory) cat[l.rowKey] = l.dreCategory;
    }
  }

  const wb = XLSX.utils.book_new();

  // Receitas
  const recRows: (string | number)[][] = [["Fonte", ...months]];
  for (const k of RECEITA_ROWS)
    recRows.push([k, ...months.map((m) => val.receita?.[k]?.[m] ?? "")]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recRows), "Receitas");

  // Despesas
  const grupos = new Map<string, { label: string; kind: "cef" | "complementar" }>();
  for (const r of chart)
    if (!grupos.has(r.groupCode))
      grupos.set(r.groupCode, { label: `${r.groupCode} · ${r.groupName}`, kind: r.kind });
  const despRows: (string | number)[][] = [["Grupo", "Categoria DRE", ...months]];
  for (const [code, g] of [...grupos.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true }),
  )) {
    despRows.push([
      g.label,
      cat[code] ?? defaultDreCategory(g.kind),
      ...months.map((m) => val.despesa?.[code]?.[m] ?? ""),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(despRows), "Despesas");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const slug = version.label.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Lancamento_${slug || "versao"}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
