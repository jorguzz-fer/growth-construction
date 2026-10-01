import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getAnaliseConferencia, getDespesasSuspeitas } from "@/lib/actions/diagnostico";
import { AssistenteConferencia } from "@/components/app/assistente-conferencia";
import { categoriasDeDespesa } from "@/lib/calc/natureza-dre";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { DiagnosticoCategorias } from "@/components/app/diagnostico-categorias";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico dos lançamentos que violam as regras NOVAS (item 1.3).
 *
 * As validações deste pacote valem para lançamentos novos. Registros
 * históricos que as violem continuam legíveis, editáveis e íntegros — eles são
 * apenas LISTADOS aqui. Nada é corrigido automaticamente: a reclassificação
 * exige seleção e confirmação humana, e vai para a auditoria.
 *
 * Prompt AN: quarta condição (sem competência), triagem no SQL, filtros por
 * projeto, competência e fornecedor, e paginação por cursor.
 */
export default async function ConferenciaPage({
  searchParams,
}: {
  searchParams?: Promise<{ projeto?: string; competencia?: string; fornecedor?: string; cursor?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // Duas camadas (AN 5.3): o id próprio, que o enforcement central também
  // cobre, e a checagem de Despesas — o dado aqui é dado de despesa.
  if (!can(ctx.perms, "conferencia", "ver")) return <AccessDenied />;
  if (!can(ctx.perms, "despesas", "ver")) return <AccessDenied />;

  const sp = (await searchParams) ?? {};
  const projetoValido = ctx.projects.some((p) => p.id === sp.projeto) ? sp.projeto! : "";
  const filtros = {
    projectId: projetoValido || null,
    competencia: sp.competencia ?? null,
    fornecedorId: /^[0-9a-f-]{36}$/i.test(sp.fornecedor ?? "") ? sp.fornecedor! : null,
    cursor: sp.cursor ?? null,
  };
  const [pagina, analise] = await Promise.all([getDespesasSuspeitas(filtros), getAnaliseConferencia()]);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Conferência de lançamentos"
        subtitle="Despesas gravadas com categoria de receita, sem categoria, com valor zero ou sem competência. Somente leitura: nada aqui é corrigido sozinho."
      />
      <div className="flex flex-col gap-6 min-[1180px]:flex-row min-[1180px]:items-start">
        <div className="min-w-0 flex-1">
          <DiagnosticoCategorias
            pagina={pagina}
            filtros={{ projeto: projetoValido, competencia: sp.competencia ?? "", fornecedor: filtros.fornecedorId ?? "", cursor: filtros.cursor ?? "" }}
            projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
            categorias={categoriasDeDespesa(CATEGORIAS_DRE)}
            canEditar={can(ctx.perms, "despesas", "editar")}
          />
        </div>
        {/* Prompt AN, Parte 7 — somente leitura; não reclassifica. */}
        {analise && <AssistenteConferencia usuario={ctx.userId ?? "anon"} analise={analise} />}
      </div>
    </>
  );
}
