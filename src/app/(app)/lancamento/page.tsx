import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getChartAccounts, getBudgetLines, getInccRows } from "@/lib/queries";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { RECEITA_ROWS, defaultDreCategory, isBudgetVersion } from "@/lib/budget/config";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetMatrix, type MatrixRow } from "@/components/app/budget-matrix";

export const dynamic = "force-dynamic";

export default async function LancamentoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "lancamento", "ver")) return <AccessDenied />;

  const version = ctx.version;
  if (!isBudgetVersion(version.kind)) {
    return (
      <>
        <PageHeader
          eyebrow={version.label}
          title="Lançamento Simplificado"
          subtitle="Disponível para as versões Budget e Forecast."
        />
        <Card>
          <CardContent className="p-6 text-[13px] text-[var(--color-ink2)]">
            A versão ativa (<strong>{version.label}</strong>) é a{" "}
            <strong>Atual</strong> e usa o lançamento detalhado (Unidades /
            Despesas). Selecione uma versão <strong>Budget</strong> ou{" "}
            <strong>Forecast</strong> na barra lateral para usar o lançamento
            simplificado mensal.
          </CardContent>
        </Card>
      </>
    );
  }

  const [chart, lines, incc] = await Promise.all([
    getChartAccounts(ctx.tenant.id),
    getBudgetLines(version.id),
    getInccRows(ctx.project.id),
  ]);

  const months = incc.map((r) => r.m);

  const receitaRows: MatrixRow[] = RECEITA_ROWS.map((k) => ({
    rowKey: k,
    label: k,
    dreCategory: "Receita",
  }));

  // Grupos do plano de contas (CEF + complementar), distintos por código.
  const grupos = new Map<string, MatrixRow>();
  for (const r of chart) {
    if (!grupos.has(r.groupCode))
      grupos.set(r.groupCode, {
        rowKey: r.groupCode,
        label: `${r.groupCode} · ${r.groupName}`,
        dreCategory: defaultDreCategory(r.kind),
      });
  }
  const despesaRows = [...grupos.values()].sort((a, b) =>
    a.rowKey.localeCompare(b.rowKey, undefined, { numeric: true }),
  );

  // Valores atuais + categorias salvas.
  const initial = {
    receita: {} as Record<string, Record<string, number>>,
    despesa: {} as Record<string, Record<string, number>>,
  };
  const initialDespCat: Record<string, string> = {};
  for (const l of lines) {
    const bag = l.kind === "receita" ? initial.receita : initial.despesa;
    (bag[l.rowKey] ??= {})[l.mes] = Number(l.valor);
    if (l.kind === "despesa" && l.dreCategory) initialDespCat[l.rowKey] = l.dreCategory;
  }

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · ${version.label}`}
        title="Lançamento Simplificado (Budget/Forecast)"
        subtitle="Receitas por fonte consolidada e despesas por grupo do plano de contas — valores mensais."
      />
      <BudgetMatrix
        versionId={version.id}
        versionLabel={version.label}
        isForecast={version.kind === "forecast"}
        months={months}
        receitaRows={receitaRows}
        despesaRows={despesaRows}
        dreCategories={CATEGORIAS_DRE.filter((c) => c !== "Receita")}
        initial={initial}
        initialDespCat={initialDespCat}
        canEdit={can(ctx.perms, "lancamento", "editar") && !version.locked}
      />
    </>
  );
}
