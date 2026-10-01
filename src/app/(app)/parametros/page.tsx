import { getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getInccTabela, getAtualVersion, getUnits } from "@/lib/queries";
import { expandUnitReceivables } from "@/lib/calc/receivables";
import { analisarIncc, mesDaData } from "@/lib/incc-analise";
import { ordDeHoje } from "@/lib/incc-regras";
import { AssistenteIncc } from "@/components/app/assistente-incc";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { InccEditor } from "@/components/app/incc-editor";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function ParametrosPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "parametros", "ver")) return <AccessDenied />;
  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a do cookie.
  const selecao = lerSelecaoDeProjeto(ctx.projects, await searchParams);
  if (selecao.tipo !== "projeto") {
    return <PedirProjeto titulo="Parâmetros / INCC" projetos={ctx.projects} oQue="editar o INCC" />;
  }
  const project = selecao.projeto;
  const { linhas, variante } = await getInccTabela(ctx.tenant.id, project.id);
  const canEdit = can(ctx.perms, "parametros", "editar");
  // Seção 6.3 — análises do assistente (puras): meses faltantes, curva,
  // cobertura (vencimentos das vendas da versão Atual e janela da obra).
  const atual = await getAtualVersion(ctx.tenant.id, project.id);
  const unidades = atual ? await getUnits(ctx.tenant.id, atual.id) : [];
  const mesesComVencimento = unidades.flatMap((u) => expandUnitReceivables(u.paymentPlan, u.status).map((r) => mesDaData(r.dia))).filter((m): m is string => !!m);
  const analise = analisarIncc(linhas, ordDeHoje(), mesesComVencimento, { inicio: mesDaData(project.startDate), fim: mesDaData(project.endDate) });

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title={`Parâmetros / INCC${variante ? ` · ${variante}` : ""}`}
        subtitle={`${variante ?? "Variante do INCC a confirmar (DI, M ou 10)"} · mês de referência · correção a partir da 5ª parcela, pelo acumulado do mês do vencimento`}
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={project.id}
          />
        }
      />
      <LembrarProjeto projectId={project.id} />
      {/* Abaixo de 1180px o painel desce para baixo do conteúdo (Prompt E, 6.2). */}
      <div className="flex flex-col gap-6 min-[1180px]:flex-row min-[1180px]:items-start">
      <div className="min-w-0 flex-1">
      {/* Prompt Q, seção 5 — o que a tela governa, declarado onde o usuário lê. */}
      <div className="mb-4 grid grid-cols-1 gap-2 text-[12.5px] text-[var(--color-ink2)] sm:grid-cols-2">
        <p className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface2)] px-3 py-2">
          <strong className="text-[var(--color-ink)]">Mês de referência.</strong> Cada linha é o mês a que o índice se refere (a FGV divulga no mês seguinte). A parcela
          que vence no mês usa o <strong>acumulado</strong> daquele mês, a partir da 5ª parcela.
        </p>
        <p className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface2)] px-3 py-2">
          <strong className="text-[var(--color-ink)]">Onde incide e onde não.</strong> A correção entra no Caixa, na comparação entre cenários e na Projeção.{" "}
          <strong>Não é aplicada</strong> nos recebíveis de Contas a Receber nem na receita da DRE (valor nominal, por decisão). Nada é gravado corrigido: a
          correção é aplicada na leitura.
        </p>
      </div>
      <InccEditor projectId={project.id} initial={linhas} variante={variante} canEdit={canEdit} />
      </div>
      <AssistenteIncc usuario={ctx.userEmail ?? "anon"} rows={linhas.map((l) => ({ m: l.m, mo: l.mo, ac: l.ac, projected: l.projected }))} variante={variante} analise={analise} />
      </div>
    </>
  );
}
