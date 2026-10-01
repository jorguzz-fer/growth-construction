import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getReembolsoDoTenant } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { LiberacaoForm } from "@/components/app/liberacao-form";
import { AccessDenied } from "@/components/app/access-denied";
import { dateBR } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Edição da liberação de obra (Prompt O, 4.3). A liberação já traz a obra dela. */
export default async function EditarLiberacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  if (!can(ctx.perms, "reembolso", "ver")) return <AccessDenied />;
  if (!can(ctx.perms, "reembolso", "editar")) {
    return <p className="text-sm text-[var(--color-warning)]">Sem permissão para editar liberações de obra.</p>;
  }
  const { id } = await params;
  const alvo = await getReembolsoDoTenant(ctx.tenant.id, id);
  if (!alvo) notFound();
  const { liberacao: r } = alvo;
  const nomeDaObra = ctx.projects.find((x) => x.id === alvo.projectId)?.name ?? "";

  if (r.cancelado) {
    return (
      <>
        <PageHeader eyebrow={`${nomeDaObra} · ${alvo.versionLabel}`} title={`Liberação de ${dateBR(r.data)}`} />
        <p role="status" className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface2)] px-4 py-3 text-sm text-[var(--color-ink2)]">
          Liberação cancelada em {dateBR(r.canceladoEm)} por {r.canceladoPor ?? "—"}{r.motivoCancelamento ? `: ${r.motivoCancelamento}` : ""}. Não pode ser editada.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${nomeDaObra} · ${alvo.versionLabel}`}
        title={`Editar liberação de ${dateBR(r.data)}`}
        subtitle={alvo.locked ? "Versão congelada — a edição será recusada." : "Toda alteração registra o valor anterior e o novo na auditoria."}
      />
      <LiberacaoForm projectId={alvo.projectId} initial={{ id: r.id, data: r.data, origem: r.origem, valor: r.valor, obs: r.obs }} />
    </>
  );
}
