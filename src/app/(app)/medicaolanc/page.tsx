import { getActiveContext } from "@/lib/context";
import { getAtualVersion, getChartAccounts, getMedicoes } from "@/lib/queries";
import { addMedicao } from "@/lib/actions/medicao";
import { can } from "@/lib/permissions";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";
import { MedicaoTable } from "@/components/app/medicao-manager";
import { ProjectPicker } from "@/components/app/project-picker";

export const dynamic = "force-dynamic";

export default async function MedicaoLancamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const sp = await searchParams;

  // Projetos de obra (kind "proj") — só eles têm medição/CEF.
  const projetos = ctx.projects.filter((p) => p.kind === "proj");
  const selectedProject =
    projetos.find((p) => p.id === sp.proj) ??
    (ctx.project.kind === "proj" ? ctx.project : projetos[0]) ??
    ctx.project;

  // Versão Atual do projeto medido (a medição alimenta o realizado da DRE).
  const atual =
    selectedProject.id === ctx.project.id && ctx.version.kind === "atual"
      ? ctx.version
      : (await getAtualVersion(ctx.tenant.id, selectedProject.id)) ?? ctx.version;

  const [rows, chart] = await Promise.all([
    getMedicoes(atual.id),
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
  const locked = atual.locked;

  return (
    <>
      <PageHeader
        eyebrow={`${selectedProject.name} · ${atual.label}`}
        title="Lançamento de Medição"
        subtitle={`${rows.length} lançamentos · total ${brl0(total)} — alimenta o Custo Variável da DRE`}
        actions={
          projetos.length > 1 ? (
            <ProjectPicker
              projects={projetos.map((p) => ({ id: p.id, label: p.name }))}
              selected={selectedProject.id}
            />
          ) : undefined
        }
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
              <input type="hidden" name="projectId" value={selectedProject.id} />
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
