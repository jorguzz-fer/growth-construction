import Link from "next/link";
import type { TenantContext } from "@/lib/context";
import { getProjectVersions } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { getChartAccounts, getMedicoes } from "@/lib/queries";
import { brl0 } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { idsDuplicados, podeTocarMedicao, rotuloDoAutor, textoDoVazio, veSoAsProprias, TELA_LANCAMENTO } from "@/lib/medicao-regras";
import { abasPermitidas, filtrarMedicoes, filtroAtivo, hrefDaAba, ordenarPorCompetenciaDesc, type AbaMedicao } from "@/lib/medicao-abas";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { PageHeader } from "@/components/app/page-header";
import { MedicaoForm } from "@/components/app/medicao-form";
import { MedicaoTable } from "@/components/app/medicao-manager";
import { RelatorioCef } from "@/components/app/medicao-relatorio";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";

export interface ParamsDaMedicao {
  proj?: string;
  project?: string;
  aba?: string;
  de?: string;
  ate?: string;
  orc?: string;
  comp?: string;
  grupo?: string;
  autor?: string;
}

/**
 * Tela única de Medição de Obra (Prompt V, seção 0): três abas, duas rotas.
 * Servidor. A página que chama já verificou a permissão da ROTA e escolheu a
 * aba inicial (`abaInicial`); aqui cada aba é renderizada só com a própria
 * permissão (0.3) — nunca escondida com CSS. A barra de abas lista apenas
 * as abas permitidas e some quando só há uma.
 */
export async function MedicaoDeObra({ ctx, sp, aba }: { ctx: TenantContext; sp: ParamsDaMedicao; aba: AbaMedicao }) {
  const obras = ctx.projects.filter((p) => p.kind === "proj");
  const selecao = lerSelecaoDeProjeto(obras, { proj: sp.proj, project: sp.project });
  const escolhido = selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido?.trabalho) {
    return <PedirProjeto titulo="Medição de Obra" projetos={obras} oQue={aba === "relatorio" ? "ver o Relatório CEF" : "lançar a medição"} />;
  }
  const { project, versions } = escolhido;
  const atual = escolhido.trabalho;
  const abas = abasPermitidas(ctx.perms);

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${atual.label}`}
        title="Medição de Obra"
        subtitle="Informação auxiliar: alimenta o Relatório CEF (orçado × medido por grupo); não entra na DRE."
        actions={<ProjectPicker projects={obras.map((p) => ({ id: p.id, label: p.name }))} selected={project.id} />}
      />
      <LembrarProjeto projectId={project.id} />

      {abas.length > 1 && (
        <nav aria-label="Abas da medição" className="mb-5 flex flex-wrap gap-1 border-b border-[var(--color-line)]">
          {abas.map((a) => (
            <Link
              key={a.id}
              href={hrefDaAba(a, project.id)}
              aria-current={a.id === aba ? "page" : undefined}
              data-aba-link={a.id}
              className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] ${a.id === aba ? "border-[var(--color-accent2)] font-semibold text-[var(--color-ink)]" : "border-transparent text-[var(--color-ink3)] hover:text-[var(--color-ink)]"}`}
            >
              {a.rotulo}
            </Link>
          ))}
        </nav>
      )}

      {aba === "nova" && can(ctx.perms, TELA_LANCAMENTO, "criar") && <AbaNova ctx={ctx} projectId={project.id} locked={atual.locked} />}
      {aba === "lancadas" && can(ctx.perms, TELA_LANCAMENTO, "ver") && <AbaLancadas ctx={ctx} versionId={atual.id} projectId={project.id} locked={atual.locked} sp={sp} />}
      {aba === "relatorio" && can(ctx.perms, "medicao", "ver") && <RelatorioCef tenantId={ctx.tenant.id} versions={versions} atual={atual} sp={sp} />}
    </>
  );
}

async function AbaNova({ ctx, projectId, locked }: { ctx: TenantContext; projectId: string; locked: boolean }) {
  const chart = await getChartAccounts(ctx.tenant.id);
  const grupos = [...new Map(chart.filter((c) => c.kind === "cef").map((c) => [c.groupCode, { code: c.groupCode, name: c.groupName }])).values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  return (
    <div data-aba="nova">
      {locked ? (
        <p className="mb-4 rounded-[8px] bg-[#fef3c7] px-3 py-2 text-[13px] text-[#92400e]">Versão congelada — lançamentos bloqueados.</p>
      ) : (
        <Card className="mb-4">
          <CardContent className="p-5">
            <MedicaoForm projectId={projectId} grupos={grupos} />
          </CardContent>
        </Card>
      )}
      <p className="text-[12px] text-[var(--color-ink3)]">
        A medição vai para a versão Atual desta obra. O que já foi lançado está em{" "}
        <Link href={`/medicaolanc?aba=lancadas&project=${projectId}`} className="text-[var(--color-accent2)] hover:underline">
          Medições lançadas
        </Link>
        .
      </p>
    </div>
  );
}

async function AbaLancadas({ ctx, versionId, projectId, locked, sp }: { ctx: TenantContext; versionId: string; projectId: string; locked: boolean; sp: ParamsDaMedicao }) {
  // 0.5.2 — o engenheiro recebe só as próprias (e as sem autor), filtrado NA
  // CONSULTA: medição de outro autor não chega ao navegador.
  const soAsProprias = veSoAsProprias(ctx.role);
  const todas = await getMedicoes(ctx.tenant.id, versionId, { autor: soAsProprias ? ctx.userId : null });
  const filtros = { competencia: sp.comp || null, grupo: sp.grupo || null, autor: soAsProprias ? null : sp.autor || null };
  const rows = ordenarPorCompetenciaDesc(filtrarMedicoes(todas, filtros));
  const duplicadas = idsDuplicados(todas.map((r) => ({ id: r.id, competencia: r.competencia, grupoCode: r.grupoCode, valor: Number(r.valor) })));
  const competencias = [...new Set(todas.map((m) => m.competencia))];
  const grupos = [...new Map(todas.map((m) => [m.grupoCode, m.grupoName])).entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  const autores = [...new Map(todas.filter((m) => m.createdBy).map((m) => [m.createdBy!, rotuloDoAutor(m)])).entries()];
  const temSemAutor = todas.some((m) => !m.createdBy);
  const canEditar = can(ctx.perms, TELA_LANCAMENTO, "editar");
  const canExcluir = can(ctx.perms, TELA_LANCAMENTO, "excluir");
  const total = rows.reduce((a, r) => a + Number(r.valor), 0);

  return (
    <div data-aba="lancadas">
      <form method="get" action="/medicaolanc" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filtros das medições">
        <input type="hidden" name="aba" value="lancadas" />
        <input type="hidden" name="project" value={projectId} />
        <div>
          <Label>Competência</Label>
          <Select name="comp" defaultValue={filtros.competencia ?? ""} className="h-9 w-36">
            <option value="">Todas</option>
            {competencias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Grupo</Label>
          <Select name="grupo" defaultValue={filtros.grupo ?? ""} className="h-9 w-56">
            <option value="">Todos</option>
            {grupos.map(([code, name]) => (
              <option key={code} value={code}>
                {code} — {name}
              </option>
            ))}
          </Select>
        </div>
        {!soAsProprias && (
          <div>
            <Label>Quem lançou</Label>
            <Select name="autor" defaultValue={filtros.autor ?? ""} className="h-9 w-48">
              <option value="">Todos</option>
              {autores.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
              {temSemAutor && <option value="sem">autor não registrado</option>}
            </Select>
          </div>
        )}
        <Button type="submit" size="sm" variant="outline">
          Filtrar
        </Button>
        {filtroAtivo(filtros) && (
          <Link href={`/medicaolanc?aba=lancadas&project=${projectId}`} className="text-[13px] text-[var(--color-accent2)] hover:underline">
            Limpar filtros
          </Link>
        )}
        <span className="ml-auto text-[12px] text-[var(--color-ink3)]">
          {rows.length} {rows.length === 1 ? "medição" : "medições"} · total {brl0(total)}
          {soAsProprias && " · só as suas e as sem autor"}
        </span>
      </form>
      {locked && <p className="mb-4 rounded-[8px] bg-[#fef3c7] px-3 py-2 text-[13px] text-[#92400e]">Versão congelada — edição e exclusão bloqueadas.</p>}
      <MedicaoTable
        rows={rows.map((r) => ({
          id: r.id,
          competencia: r.competencia,
          grupoCode: r.grupoCode,
          grupoName: r.grupoName,
          valor: Number(r.valor),
          obs: r.obs ?? "",
          autor: rotuloDoAutor(r),
          semAutor: !r.createdBy,
          quando: r.createdAt.toLocaleDateString("pt-BR"),
          podeTocar: podeTocarMedicao(r, { userId: ctx.userId, role: ctx.role }),
          duplicada: duplicadas.has(r.id),
        }))}
        canEditar={canEditar && !locked}
        canExcluir={canExcluir && !locked}
        vazio={textoDoVazio({ soAsProprias, filtrado: filtroAtivo(filtros) })}
      />
    </div>
  );
}
