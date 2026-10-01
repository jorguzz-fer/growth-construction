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
import { getInccRows, getVersionsDoProjeto } from "@/lib/queries";
import { calendarYearWindows } from "@/lib/planning";
import { aggregateInputs, emptyInputs, waterfall, type Inputs } from "@/lib/calc/dre-cascata";
import { versionInputsByMonth } from "@/lib/dre-inputs";
import {
  ROTULO_CENARIO,
  TETO_CELULAS_MENSAL,
  TETO_VERSOES,
  cenariosDaUrl,
  ehCopia,
  ordenarMeses,
  pctDaReceita,
  resolverCenario,
  resolverPeriodo,
  rotuloDaColuna,
  selecaoDaUrl,
  selecaoPadrao,
  textoDaCobertura,
} from "@/lib/dre";
import { brl0, pct1 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DreControls } from "@/components/app/dre-controls";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import { CenarioMultiSelect } from "@/components/app/cenario-multiselect";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/** Uma coluna da comparação: uma versão (projeto) ou um cenário (Empresa toda). */
interface Serie {
  key: string;
  titulo: string;
  complemento?: string;
  color?: string;
  /** Inputs por mês de cada projeto que compõe a série (1 na visão de projeto). */
  porProjeto: Record<string, Inputs>[];
}

/** Soma os meses de várias séries de projeto num mapa só. */
function somarPorMes(lista: Record<string, Inputs>[]): Record<string, Inputs> {
  const out: Record<string, Inputs> = {};
  for (const bm of lista)
    for (const [mm, inp] of Object.entries(bm)) {
      const t = (out[mm] ??= emptyInputs());
      t.receita += inp.receita;
      t.custoVar += inp.custoVar;
      for (const [k, v] of Object.entries(inp.byCat)) t.byCat[k] = (t.byCat[k] || 0) + v;
    }
  return out;
}

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
    cen?: string;
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
  // Versões da obra escolhida, com tenant no where (Prompt A; AC 1.1).
  const daObra =
    escopo.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, escopo.projeto.id) : null;
  const versoesDaObra = daObra?.versions ?? [];

  // Eixo a partir da tabela INCC dos projetos selecionados (Parte 7 muda isso).
  const inccAll = await Promise.all(selectedProjects.map((p) => getInccRows(p.tenantId, p.id)));
  const axis = ordenarMeses(new Set(inccAll.flat().map((r) => r.m)));
  // Recortes por ano-calendário: 2025, 2026, … até o ano atual + 5.
  const years = calendarYearWindows(axis, new Date().getFullYear());
  const periodo = sp.periodo ?? "acum";
  const customDe = (sp.de ?? "").trim();
  const customAte = (sp.ate ?? "").trim();
  // 1.6 — o período é UM SÓ para todas as colunas.
  const { periodMonths, label: periodLabel } = resolverPeriodo(periodo, customDe, customAte, axis, years);

  const scopeLabel =
    escopo.tipo === "projeto"
      ? escopo.projeto.name
      : escopo.tipo === "todos"
        ? "Empresa toda (matriz + filiais + projetos)"
        : rotuloDoEscopo(escopo.tipo);

  // ── As séries (colunas) ────────────────────────────────────────────────
  const series: Serie[] = [];
  const cobertura: string[] = [];
  let selecionadas: typeof versoesDaObra = [];
  const cenarios = cenariosDaUrl(sp.cen, sp.vkind);
  if (escopo.tipo === "projeto") {
    // 1.1/1.4 — qualquer projeto compara; todas as versões são selecionáveis;
    // ?vs= é validado contra as versões DESTE projeto. Padrão: Atual + o
    // Orçamento e a Previsão mais recentes, sem cópia.
    const vsIds = (sp.vs ?? "").split(",").filter(Boolean);
    const daUrl = vsIds.length ? selecaoDaUrl(versoesDaObra, vsIds) : [];
    selecionadas = daUrl.length ? daUrl : selecaoPadrao(versoesDaObra);
    const porVersao = await Promise.all(
      selecionadas.map((v) => versionInputsByMonth(ctx.tenant.id, v.id, escopo.projeto.id)),
    );
    selecionadas.forEach((v, i) => {
      const r = rotuloDaColuna(v);
      series.push({ key: v.id, titulo: r.titulo, complemento: r.complemento, color: v.color, porProjeto: [porVersao[i]] });
    });
  } else {
    // 1.2 — Empresa toda compara CENÁRIOS: para cada cenário e cada projeto,
    // a versão daquele kind NAQUELE projeto. Sem a chave da DRE (AC-3), vale
    // a regra de antes (fallback), agora DECLARADA na cobertura.
    const versoesPorProjeto = await Promise.all(
      selectedProjects.map((p) => getVersionsDoProjeto(ctx.tenant.id, p.id)),
    );
    const projetos = selectedProjects.map((p, i) => ({ id: p.id, name: p.name, versoes: versoesPorProjeto[i] }));
    for (const c of cenarios) {
      const res = resolverCenario(c, projetos, true);
      const texto = textoDaCobertura(c, res);
      if (texto) cobertura.push(texto);
      const porProjeto = await Promise.all(
        res.filter((r) => r.versao).map((r) => versionInputsByMonth(ctx.tenant.id, r.versao!.id, r.projetoId)),
      );
      series.push({ key: c, titulo: ROTULO_CENARIO[c], porProjeto });
    }
  }

  const multi = series.length > 1;
  const nomesDasColunas = series.map((s) => s.titulo).join(", ");
  const recorte = `${selectedProjects.length} projeto(s) · ${isAll ? "cenários" : "versões"}: ${nomesDasColunas || "nenhuma"} · ${periodLabel}`;

  // Meses da matriz (1.5): os do período, ou o eixo no acumulado.
  const meses = periodMonths ? ordenarMeses(periodMonths) : axis;
  const celulasMensal = meses.length * series.length;
  const mensalAcimaDoTeto = monthly && multi && celulasMensal > TETO_CELULAS_MENSAL;

  // Valores: por série, a cascata do período (e, no mensal, a de cada mês).
  const totalDe = (s: Serie) => waterfall(s.porProjeto.map((bm) => aggregateInputs(bm, periodMonths)));
  const porMesDaSerie = new Map(series.map((s) => [s.key, somarPorMes(s.porProjeto)]));
  const mesDe = (s: Serie, mm: string) => waterfall([porMesDaSerie.get(s.key)![mm] ?? emptyInputs()]);
  const totais = series.map(totalDe);
  const linhas = (totais[0] ?? waterfall([emptyInputs()])).rows;

  const semVersao = escopo.tipo === "projeto" && versoesDaObra.length === 0;

  return (
    <>
      <PageHeader
        eyebrow={scopeLabel}
        title="DRE — Demonstração de Resultado"
        subtitle={`${periodLabel}${
          monthly ? " · visão mensal" : multi ? (isAll ? " · comparativo de cenários" : " · comparativo de versões") : " · análise vertical (% da receita)"
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
              showVersionKind={false}
              versionKind="atual"
            />
          </div>
        }
      />

      {/* Seletores da comparação abaixo do cabeçalho: com muitas versões, no
          cabeçalho eles espremiam o título. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {escopo.tipo === "projeto" && versoesDaObra.length > 0 && (
          <VersionMultiSelect
            versions={versoesDaObra.map((v) => ({
              id: v.id,
              label: ehCopia(v) ? `${v.label} · cópia` : v.label,
              color: v.color,
              aviso: avisoNoSeletor(v, rascunhoFora),
            }))}
            selected={selecionadas.map((v) => v.id)}
            max={TETO_VERSOES}
          />
        )}
        {isAll && <CenarioMultiSelect selected={cenarios} />}
      </div>
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
      ) : semVersao ? (
        <Card>
          <CardContent className="p-8 text-center text-[var(--color-ink3)]">
            Este projeto não tem nenhuma versão — não há o que demonstrar.
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardContent className="p-5">
          {/* 1.8 — o cabeçalho declara o recorte e a cobertura. */}
          <p className="mb-1 text-[12.5px] text-[var(--color-ink2)]" data-recorte>
            {recorte}
          </p>
          {cobertura.map((c) => (
            <p key={c} className="mb-1 text-[12px] text-[var(--color-warning)]" data-cobertura>
              {c}
            </p>
          ))}
          {selecionadas.length > TETO_VERSOES && (
            <p className="mb-1 text-[12px] text-[var(--color-warning)]">
              {selecionadas.length} versões selecionadas — acima de {TETO_VERSOES} a tabela fica larga. Todas estão na tela; desmarque as que não precisa.
            </p>
          )}
          {mensalAcimaDoTeto && (
            <p role="status" className="mb-2 rounded-[8px] bg-[var(--color-warning)]/10 px-3 py-2 text-[12.5px] text-[var(--color-ink2)]">
              {meses.length} meses × {series.length} colunas = {celulasMensal} colunas — acima de {TETO_CELULAS_MENSAL}. Reduza o
              período (escolha um ano ou De/Até) ou desmarque versões. Abaixo, só o total de cada coluna; nenhuma foi descartada.
            </p>
          )}
          <div className="tbl-scroll mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                {monthly && multi && !mensalAcimaDoTeto ? (
                  <>
                    <tr className="border-b border-[var(--color-line)]">
                      <th rowSpan={2} className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                        Item
                      </th>
                      {[...meses, "Total"].map((mm) => (
                        <th key={mm} colSpan={series.length} className="border-l border-[var(--color-line)] px-2 py-1.5 text-center font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                          {mm}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-[var(--color-line)]">
                      {[...meses, "Total"].flatMap((mm) =>
                        series.map((s, i) => (
                          <th key={`${mm}-${s.key}`} className={`px-2 py-1.5 text-right text-[11px] font-medium text-[var(--color-ink2)] ${i === 0 ? "border-l border-[var(--color-line)]" : ""}`}>
                            {s.titulo}
                          </th>
                        )),
                      )}
                    </tr>
                  </>
                ) : (
                  <tr className="border-b border-[var(--color-line)]">
                    <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Item</th>
                    {monthly && !multi
                      ? [...meses, "Total"].map((mm) => (
                          <th key={mm} className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                            {mm}
                          </th>
                        ))
                      : series.map((s) => [
                          <th key={s.key} className="px-2 py-2 text-right text-[12px] font-semibold text-[var(--color-ink)]">
                            <span className="inline-flex items-center gap-1.5">
                              {s.color && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />}
                              {s.titulo}
                            </span>
                            {s.complemento && <span className="block text-[10.5px] font-normal text-[var(--color-ink3)]">{s.complemento}</span>}
                          </th>,
                          <th key={`${s.key}-pct`} className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                            % Receita
                          </th>,
                        ])}
                  </tr>
                )}
              </thead>
              <tbody>
                {linhas.map((lbl, ri) => {
                  const isSub = lbl.kind !== "item";
                  const cel = (v: number, key: string, extra = "") => (
                    <td
                      key={key}
                      className={`whitespace-nowrap px-2 py-2 text-right font-[family-name:var(--font-mono)] ${extra} ${isSub ? "font-semibold" : ""} ${
                        v < 0 ? "text-[var(--color-danger)]" : lbl.kind === "final" || lbl.kind === "sub" ? "text-[var(--color-success)]" : "text-[var(--color-ink)]"
                      }`}
                    >
                      {brl0(v)}
                    </td>
                  );
                  return (
                    <tr key={lbl.label} className={`border-b border-[var(--color-line)] ${isSub ? "bg-[var(--color-surface2)]" : ""}`}>
                      <td
                        className={`sticky left-0 z-10 whitespace-nowrap px-2 py-2 ${isSub ? "bg-[var(--color-surface2)]" : "bg-white"} ${
                          lbl.kind === "final" ? "font-semibold text-[var(--color-accent)]" : isSub ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink2)]"
                        }`}
                      >
                        {lbl.label}
                      </td>
                      {monthly && multi && !mensalAcimaDoTeto
                        ? [...meses.flatMap((mm) => series.map((s, i) => cel(mesDe(s, mm).rows[ri].value, `${mm}-${s.key}`, i === 0 ? "border-l border-[var(--color-line)]" : ""))),
                           ...series.map((s, i) => cel(totais[i].rows[ri].value, `tot-${s.key}`, i === 0 ? "border-l border-[var(--color-line)]" : ""))]
                        : monthly && !multi
                          ? [...meses.map((mm) => cel(mesDe(series[0], mm).rows[ri].value, mm)), cel(totais[0].rows[ri].value, "tot")]
                          : series.flatMap((s, i) => {
                              const p = pctDaReceita(totais[i].rows[ri].value, totais[i].R);
                              return [
                                cel(totais[i].rows[ri].value, s.key),
                                <td key={`${s.key}-pct`} className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                  {p == null ? "—" : pct1(p)}
                                </td>,
                              ];
                            })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!monthly && totais.some((t) => t.R <= 0) && (
            <p className="mt-2 text-[11.5px] text-[var(--color-ink3)]">
              “—” em % Receita: a coluna não tem receita positiva para servir de base.
            </p>
          )}
        </CardContent>
      </Card>
      )}
    </>
  );
}
