import { getProjectVersions, getTenantContext } from "@/lib/context";
import { avisoNoSeletor } from "@/lib/situacao-versao";
import { chaveLigada } from "@/lib/chaves-tenant";
import {
  TODOS_OS_PROJETOS,
  lerEscopoDeRelatorio,
  projetosDoEscopo,
  rotuloDoEscopo,
} from "@/lib/projeto-selecao";
import { LembrarProjeto, RecuperarProjeto } from "@/components/app/projeto-da-aba";
import { getInccRows } from "@/lib/queries";
import { calendarYearWindows } from "@/lib/planning";
import { addInto, aggregateInputs, emptyInputs, waterfall, type Inputs } from "@/lib/calc/dre-cascata";
import { projectInputs, projectInputsByMonth, versionInputs, versionInputsByMonth } from "@/lib/dre-inputs";
import { brl0, pct1 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { DreControls } from "@/components/app/dre-controls";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/** Índice absoluto de mês a partir de "MM/YYYY" (ou null se inválido). */
function monthIndex(mm: string): number | null {
  const p = mm.split("/");
  if (p.length !== 2) return null;
  const m = Number(p[0]);
  const y = Number(p[1]);
  if (!m || !y) return null;
  return y * 12 + (m - 1);
}

/** Competências "MM/YYYY" entre `de` e `ate` (inclusive; aceita ordem trocada). */
function enumMonths(de: string, ate: string): string[] {
  const a = monthIndex(de);
  const b = monthIndex(ate);
  if (a == null || b == null) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let i = lo; i <= hi; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    out.push(`${String(m).padStart(2, "0")}/${y}`);
  }
  return out;
}

/** Soma os inputs mensais dentro do período (ou tudo, quando `periodMonths` é nulo). */
export default async function DREPage({
  searchParams,
}: {
  searchParams: Promise<{
    proj?: string;
    periodo?: string;
    vs?: string;
    view?: string;
    de?: string;
    ate?: string;
    vkind?: string;
  }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "dre", "ver")) return <AccessDenied />;
  // Prompt H (BH-3): selo no seletor quando a regra está ligada na empresa.
  const rascunhoFora = await chaveLigada(ctx.tenant.id, "rascunho_fora_dos_relatorios");
  const sp = await searchParams;
  const monthly = sp.view === "mensal";

  // Obra ou escopo vêm da URL (Prompt A, 19). Sem nada: a obra lembrada pela
  // aba; sem memória, "Todos" (B12). Nunca a obra do cookie.
  const escopo = lerEscopoDeRelatorio(ctx.projects, sp);
  if (escopo.tipo === "nenhum") {
    return (
      <RecuperarProjeto
        idsPermitidos={ctx.projects.map((p) => p.id)}
        semMemoria={TODOS_OS_PROJETOS}
      />
    );
  }
  const isAll = escopo.tipo !== "projeto";
  const doEscopo = escopo.tipo === "projeto" ? null : projetosDoEscopo(ctx.projects, escopo.tipo);
  const selectedProjects = escopo.tipo === "projeto" ? [escopo.projeto] : doEscopo!.projetos;
  const projParam =
    escopo.tipo === "projeto"
      ? escopo.projeto.id
      : escopo.tipo === "todos"
        ? TODOS_OS_PROJETOS
        : escopo.tipo;
  // Versões da obra escolhida (antes: as da obra do cookie, e só ela podia
  // comparar versões).
  const daObra =
    escopo.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, escopo.projeto.id) : null;
  const versoesDaObra = daObra?.versions ?? [];

  // Janelas de ano a partir da tabela INCC. Para "empresa toda", usa a união
  // dos meses de todos os projetos selecionados, de modo que o filtro de
  // período continua editável em qualquer combinação de filtros.
  const inccAll = await Promise.all(
    selectedProjects.map((p) => getInccRows(p.tenantId, p.id)),
  );
  // Eixo a partir da tabela INCC dos projetos selecionados (âncora dos dados).
  const axis = [
    ...new Set(inccAll.flat().map((r) => r.m)),
  ].sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return ya - yb || ma - mb;
  });
  // Recortes por ano-calendário: 2025, 2026, … até o ano atual + 5.
  const years = calendarYearWindows(axis, new Date().getFullYear());
  const periodo = sp.periodo ?? "acum";
  const customDe = (sp.de ?? "").trim();
  const customAte = (sp.ate ?? "").trim();
  let periodMonths: Set<string> | null;
  if (periodo === "custom") {
    // Recorte customizado por competência (De / Até em MM/AAAA).
    if (customDe && customAte) {
      periodMonths = new Set(enumMonths(customDe, customAte));
    } else if (customDe || customAte) {
      // Limite aberto de um lado: filtra o eixo pelo(s) limite(s) informado(s).
      const a = customDe ? monthIndex(customDe) : null;
      const b = customAte ? monthIndex(customAte) : null;
      periodMonths = new Set(
        axis.filter((m) => {
          const idx = monthIndex(m);
          if (idx == null) return false;
          if (a != null && idx < a) return false;
          if (b != null && idx > b) return false;
          return true;
        }),
      );
    } else {
      periodMonths = null; // sem limites → acumulado
    }
  } else if (periodo !== "acum") {
    periodMonths = new Set(years.find((y) => y.value === periodo)?.months ?? []);
  } else {
    periodMonths = null;
  }

  const scopeLabel =
    escopo.tipo === "projeto"
      ? escopo.projeto.name
      : escopo.tipo === "todos"
        ? "Empresa toda (matriz + filiais + projetos)"
        : rotuloDoEscopo(escopo.tipo);

  // Comparação de 1–3 versões: quando há UMA obra escolhida (antes, só a obra
  // do cookie). Numericamente igual à coluna agregada: as duas somam a versão
  // de trabalho (Atual) da obra.
  const canCompareVersions = !!daObra?.trabalho;
  // Sem seleção explícita, a DRE abre na versão ATUAL (dados reais).
  const atualVersion = daObra?.trabalho ?? null;
  const vsIds = (sp.vs ?? "").split(",").filter(Boolean);
  const compareVersions =
    canCompareVersions && atualVersion
      ? (vsIds.length
          ? versoesDaObra.filter((v) => vsIds.includes(v.id))
          : [atualVersion]
        ).slice(0, 3)
      : [];
  const obraId = escopo.tipo === "projeto" ? escopo.projeto.id : "";

  // Tipo de versão para a agregação por projeto (visão "Empresa toda" e
  // projetos não-ativos): Atual (padrão) / Forecast / Budget.
  const vkind = ["atual", "forecast", "budget"].includes(sp.vkind ?? "")
    ? (sp.vkind as string)
    : "atual";

  let columns: { label: string; color?: string; wf: ReturnType<typeof waterfall> }[];
  if (monthly) {
    // Visão mensal: uma coluna por mês do período + coluna "Total". Usa a série
    // selecionada (versão de comparação, quando aplicável, ou o escopo agregado).
    let byMonth: Record<string, Inputs>;
    if (canCompareVersions && compareVersions.length >= 1) {
      byMonth = await versionInputsByMonth(ctx.tenant.id, compareVersions[0].id, obraId);
    } else {
      byMonth = {};
      const perP = await Promise.all(
        selectedProjects.map((p) => projectInputsByMonth(p, vkind)),
      );
      for (const bm of perP)
        for (const [mm, inp] of Object.entries(bm))
          addInto((byMonth[mm] ??= emptyInputs()), inp);
    }
    const monthsToShow = periodMonths
      ? [...periodMonths].sort((a, b) => (monthIndex(a) ?? 0) - (monthIndex(b) ?? 0))
      : axis;
    columns = monthsToShow.map((mm) => ({
      label: mm,
      wf: waterfall([byMonth[mm] ?? emptyInputs()]),
    }));
    columns.push({
      label: "Total",
      wf: waterfall([aggregateInputs(byMonth, periodMonths)]),
    });
  } else if (compareVersions.length >= 1) {
    const perV = await Promise.all(
      compareVersions.map((v) => versionInputs(ctx.tenant.id, v.id, obraId, periodMonths)),
    );
    columns = compareVersions.map((v, i) => ({
      label: v.label,
      color: v.color,
      wf: waterfall([perV[i]]),
    }));
  } else {
    const all = await Promise.all(
      selectedProjects.map((p) => projectInputs(p, periodMonths, vkind)),
    );
    columns = [{ label: scopeLabel, wf: waterfall(all) }];
  }
  const multi = columns.length > 1;

  const periodLabel =
    periodo === "custom"
      ? customDe && customAte
        ? `Personalizado (${customDe} – ${customAte})`
        : customDe
          ? `Personalizado (a partir de ${customDe})`
          : customAte
            ? `Personalizado (até ${customAte})`
            : "Personalizado (informe De / Até)"
      : periodMonths
        ? years.find((y) => y.value === periodo)?.label
        : "Acumulado (todo o horizonte)";
  const labels = columns[0].wf.rows;

  return (
    <>
      <PageHeader
        eyebrow={scopeLabel}
        title="DRE — Demonstração de Resultado"
        subtitle={`${periodLabel}${
          monthly
            ? " · visão mensal"
            : multi
              ? " · comparativo de versões"
              : " · análise vertical (% da receita)"
        }`}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DreControls
              projects={ctx.projects.map((p) => ({
                id: p.id,
                label: p.kind === "office" ? `${p.name} · Unidade/Escritório` : p.name,
              }))}
              proj={projParam}
              periods={[
                { value: "acum", label: "Acumulado (todos os anos)" },
                ...years.map((y) => ({ value: y.value, label: y.label })),
                { value: "custom", label: "Personalizado (De / Até)" },
              ]}
              periodo={periodo}
              periodDisabled={false}
              view={monthly ? "mensal" : ""}
              vs={sp.vs ?? ""}
              de={customDe}
              ate={customAte}
              showVersionKind={isAll}
              versionKind={vkind}
            />
            {canCompareVersions && (
              <VersionMultiSelect
                versions={versoesDaObra.map((v) => ({ id: v.id, label: v.label, color: v.color, aviso: avisoNoSeletor(v, rascunhoFora) }))}
                selected={compareVersions.map((v) => v.id)}
              />
            )}
          </div>
        }
      />

      {escopo.tipo === "projeto" && <LembrarProjeto projectId={escopo.projeto.id} />}
      {doEscopo && doEscopo.semSituacao > 0 && (
        <p className="mb-4 rounded-[8px] bg-[var(--color-surface3)] px-3 py-2 text-[13px] text-[var(--color-ink2)]">
          {doEscopo.semSituacao} obra(s) sem status ficaram fora deste filtro. Classifique-as
          como Ativo ou Finalizado em Projetos.
        </p>
      )}

      {doEscopo && doEscopo.projetos.length === 0 ? (
        // Escopo sem nenhuma obra: estado vazio, nunca uma DRE zerada.
        <Card>
          <CardContent className="p-8 text-center text-[var(--color-ink3)]">
            Nenhuma obra classificada como{" "}
            {escopo.tipo === "ativos" ? "Ativo" : "Finalizado"}. Classifique as obras em
            Projetos.
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardContent className="p-5">
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                {columns.map((c) => (
                  <TH key={c.label} className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {c.color && (
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      )}
                      {c.label}
                    </span>
                  </TH>
                ))}
                {!multi && <TH className="text-right">% Receita</TH>}
              </tr>
            </THead>
            <tbody>
              {labels.map((lbl, ri) => {
                const isSub = lbl.kind !== "item";
                return (
                  <TR key={lbl.label} className={isSub ? "bg-[var(--color-surface2)]" : undefined}>
                    <TD
                      className={
                        lbl.kind === "final"
                          ? "font-semibold text-[var(--color-accent)]"
                          : isSub
                            ? "font-semibold text-[var(--color-ink)]"
                            : "text-[var(--color-ink2)]"
                      }
                    >
                      {lbl.label}
                    </TD>
                    {columns.map((c) => {
                      const v = c.wf.rows[ri].value;
                      return (
                        <TD
                          key={c.label}
                          className={`text-right font-[family-name:var(--font-mono)] ${
                            isSub ? "font-semibold" : ""
                          } ${
                            v < 0
                              ? "text-[var(--color-danger)]"
                              : lbl.kind === "final" || lbl.kind === "sub"
                                ? "text-[var(--color-success)]"
                                : "text-[var(--color-ink)]"
                          }`}
                        >
                          {brl0(v)}
                        </TD>
                      );
                    })}
                    {!multi && (
                      <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {pct1(columns[0].wf.R > 0 ? (columns[0].wf.rows[ri].value / columns[0].wf.R) * 100 : 0)}
                      </TD>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>
      )}
    </>
  );
}
