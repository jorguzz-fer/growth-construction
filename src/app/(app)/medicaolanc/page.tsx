import { getActiveContext } from "@/lib/context";
import { getChartAccounts, getMedicoes } from "@/lib/queries";
import { addMedicao } from "@/lib/actions/medicao";
import { can } from "@/lib/permissions";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";
import { MedicaoTable } from "@/components/app/medicao-manager";

export const dynamic = "force-dynamic";

export default async function MedicaoLancamentoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [rows, chart] = await Promise.all([
    getMedicoes(ctx.version.id),
    getChartAccounts(ctx.tenant.id),
  ]);

  // Grupos CEF distintos (para o seletor de grupo de obra).
  const grupos = [
    ...new Map(
      chart
        .filter((c) => c.kind === "cef")
        .map((c) => [c.groupCode, { code: c.groupCode, name: c.groupName }]),
    ).values(),
  ].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const canCriar = can(ctx.perms, "medicaolanc", "criar");
  const canEditar = can(ctx.perms, "medicaolanc", "editar");
  const canExcluir = can(ctx.perms, "medicaolanc", "excluir");
  const total = rows.reduce((a, r) => a + Number(r.valor), 0);
  const locked = ctx.version.locked;

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · ${ctx.version.label}`}
        title="Lançamento de Medição"
        subtitle={`${rows.length} lançamentos · total ${brl0(total)} — alimenta o Custo Variável da DRE`}
      />

      {locked && (
        <p className="mb-4 rounded-[8px] bg-[#fef3c7] px-3 py-2 text-[13px] text-[#92400e]">
          Versão congelada — lançamentos bloqueados.
        </p>
      )}

      {canCriar && !locked && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <form action={addMedicao} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div>
                <Label>Competência</Label>
                <MonthField name="competencia" required />
              </div>
              <div className="sm:col-span-2">
                <Label>Grupo de obra (CEF)</Label>
                <Select name="grupo" defaultValue="">
                  <option value="">Selecione...</option>
                  {grupos.map((g) => (
                    <option key={g.code} value={`${g.code}|${g.name}`}>
                      {g.code} — {g.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Valor medido</Label>
                <Input name="valor" type="number" step="0.01" placeholder="0" />
              </div>
              <div className="sm:col-span-4">
                <Label>Observação</Label>
                <Input name="obs" placeholder="" />
              </div>
              <div className="flex items-end sm:col-span-2">
                <Button type="submit" className="w-full">
                  Lançar medição
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <MedicaoTable
        rows={rows.map((r) => ({
          id: r.id,
          competencia: r.competencia,
          grupoCode: r.grupoCode,
          grupoName: r.grupoName,
          valor: Number(r.valor),
          obs: r.obs ?? "",
        }))}
        canEditar={canEditar && !locked}
        canExcluir={canExcluir && !locked}
      />
    </>
  );
}
