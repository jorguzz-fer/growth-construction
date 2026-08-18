import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getDespesasSuspeitas } from "@/lib/actions/diagnostico";
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
 */
export default async function CategoriasInvertidasPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "despesas", "ver")) return <AccessDenied />;

  const rows = await getDespesasSuspeitas();

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Diagnóstico — lançamentos a conferir"
        subtitle="Despesas gravadas com categoria de receita, sem categoria ou com valor zero. Somente leitura: nada aqui é corrigido sozinho."
      />
      <DiagnosticoCategorias
        rows={rows}
        categorias={categoriasDeDespesa(CATEGORIAS_DRE)}
        canEditar={can(ctx.perms, "despesas", "editar")}
      />
    </>
  );
}
