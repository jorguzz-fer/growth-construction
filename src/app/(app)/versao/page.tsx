import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getProjectVersions, getTenantContext, getVersionContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { VersionIdentity } from "@/components/app/version-identity";
import { ImportVersion } from "@/components/app/import-version";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

const NATUREZA: Record<string, { titulo: string; texto: string }> = {
  budget: {
    titulo: "Budget — Plano inicial fixo",
    texto:
      "Representa o planejamento original aprovado. Não é atualizado com dados realizados. Serve como régua de comparação ao longo do projeto.",
  },
  forecast: {
    titulo: "Forecast — Revisão mensal",
    texto:
      "Budget revisado mensalmente. Mantém a estrutura de projeção mas permite ajustes nas previsões futuras. Não puxa fluxo de caixa real.",
  },
  atual: {
    titulo: "Atual — Realizado",
    texto:
      "Contém apenas o realizado até a data da última conciliação de caixa. Alimentado por upload de extrato bancário e Open Finance.",
  },
  custom: {
    titulo: "Versão customizada",
    texto:
      "Duplicada a partir de outra versão. Os dados são isolados e não afetam as demais.",
  },
};

const SHEETS_INFO = [
  "Parametros (INCC 48 meses)",
  "Dados_de_Venda (Módulo Receitas)",
  "Reembolso",
  "Permuta",
  "Despesas_CEF (Módulo Despesas)",
];

export default async function VersaoPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "versao", "ver")) return <AccessDenied />;
  const sp = await searchParams;
  // Prompt A: a obra vem da URL (?proj=) ou, com só ?v=, da própria versão
  // (validada no tenant). Sem nenhum dos dois, a aba reabre a última obra ou
  // a tela pede a escolha. Sem ?v=, a versão de trabalho da obra.
  const porVersao = sp.v && !sp.proj && !sp.project ? await getVersionContext(ctx.tenant.id, sp.v) : null;
  const selecao = lerSelecaoDeProjeto(ctx.projects, sp);
  const escolhido = porVersao
    ? { project: porVersao.project, versions: porVersao.versions, trabalho: porVersao.version }
    : selecao.tipo === "projeto"
      ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id)
      : null;
  if (!escolhido?.trabalho) {
    return (
      <PedirProjeto titulo="Configuração da Versão" projetos={ctx.projects} oQue="configurar as versões" />
    );
  }
  const { project } = escolhido;
  const v = escolhido.versions.find((x) => x.id === sp.v) ?? escolhido.trabalho;
  const canEdit = can(ctx.perms, "versao", "editar");
  const canDelete = can(ctx.perms, "versao", "excluir");
  const isFixed = v.kind !== "custom";

  const [units, reembolsos, permutas, despesas] = await Promise.all([
    db.select({ id: schema.units.id }).from(schema.units).where(eq(schema.units.versionId, v.id)).then((r) => r.length),
    db.select({ id: schema.reembolsos.id }).from(schema.reembolsos).where(eq(schema.reembolsos.versionId, v.id)).then((r) => r.length),
    db.select({ id: schema.permutas.id }).from(schema.permutas).where(eq(schema.permutas.versionId, v.id)).then((r) => r.length),
    db.select({ id: schema.despesas.id }).from(schema.despesas).where(eq(schema.despesas.versionId, v.id)).then((r) => r.length),
  ]);

  const nat = NATUREZA[v.kind] ?? NATUREZA.custom;
  const cards = [
    { icon: "🏢", label: "Unidades", value: units },
    { icon: "↩︎", label: "Reembolsos", value: reembolsos },
    { icon: "⇄", label: "Ativos de Permuta", value: permutas },
    { icon: "🧾", label: "Lançamentos de despesa", value: despesas },
  ];

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Configuração da Versão"
        subtitle="Nome · Planilha modelo · Importação de dados"
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={project.id}
          />
        }
      />
      <LembrarProjeto projectId={project.id} />

      {/* Título da versão */}
      <div className="mb-6 flex items-center gap-3">
        <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: v.color }} />
        <div>
          <h2 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
            {v.label}
          </h2>
          <p className="text-[13px] text-[var(--color-ink3)]">
            {isFixed ? "Versão fixa — não pode ser excluída" : "Versão customizada"}
            {v.locked && " · congelada"}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Coluna esquerda */}
        <div className="space-y-5">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
                Identificação
              </h3>
              <VersionIdentity version={v} canEdit={canEdit} canDelete={canDelete} />

              <h4 className="mb-2 mt-6 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                Dados carregados nesta versão
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {cards.map((c) => (
                  <div key={c.label} className="rounded-[10px] bg-[var(--color-surface2)] p-3">
                    <div className="flex items-baseline gap-2">
                      <span>{c.icon}</span>
                      <span className="text-xl font-semibold text-[var(--color-ink)]">{c.value}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-ink3)]">{c.label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                {nat.titulo}
              </h3>
              <p className="text-[13px] leading-relaxed text-[var(--color-ink2)]">{nat.texto}</p>
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita */}
        <div className="space-y-5">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
                📗 Planilha Modelo
              </h3>
              <p className="text-[13px] leading-relaxed text-[var(--color-ink2)]">
                Baixe a planilha modelo em branco, preencha com os dados desta versão
                e faça o upload abaixo. A planilha cobre{" "}
                <strong>Módulo Receitas</strong> e <strong>Módulo Despesas</strong>.
              </p>
              <ol className="my-3 space-y-1.5">
                {SHEETS_INFO.map((s, i) => (
                  <li key={s} className="flex items-center gap-2 text-[13px] text-[var(--color-ink2)]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent4)] font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-accent)]">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
              <a
                href={`/versao/template?v=${v.id}`}
                className={buttonVariants({ className: "w-full" })}
              >
                ⬇ Baixar planilha modelo (em branco)
              </a>
              <a
                href={`/versao/export?v=${v.id}`}
                className={buttonVariants({
                  variant: "outline",
                  className: "mt-2 w-full",
                })}
              >
                ⬇ Exportar dados preenchidos desta versão (.xlsx)
              </a>
              <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
                A exportação usa o mesmo formato do modelo — pode editar e
                reimportar, ou usar de backup/base para uma nova versão.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
                📥 Importar Dados
              </h3>
              <p className="mb-3 text-[13px] leading-relaxed text-[var(--color-ink2)]">
                Faça o upload da planilha preenchida. Unidades, despesas, permutas e
                liberações <strong>só entram na versão Atual, e só onde a versão ainda
                não tem nenhum registro daquele tipo</strong> — a importação nunca
                apaga nem substitui o que já foi lançado. O INCC é atualizado mês a mês.
              </p>
              {canEdit ? (
                <ImportVersion versionId={v.id} locked={v.locked} />
              ) : (
                <p className="text-sm text-[var(--color-ink3)]">
                  Sem permissão para importar nesta versão.
                </p>
              )}
              <p className="mt-3 rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
                ⓘ Se a versão já tiver registros de um tipo que a planilha traz, a
                importação é recusada inteira e nada é gravado. Deixe essas abas vazias
                ou lance pela tela.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
