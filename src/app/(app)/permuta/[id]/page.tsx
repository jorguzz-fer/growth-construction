import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getClientes, getDocumentsByPermuta, getPermutaDoTenant, getUnits } from "@/lib/queries";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { PermutaDocs, type PermutaDoc } from "@/components/app/permuta-docs";
import { TIPOS_PERMUTA } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { PermutaForm } from "@/components/app/permuta-form";
import { AccessDenied } from "@/components/app/access-denied";
import { dateBR } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Edição do ativo de permuta (Prompt P, 2.2). O ativo já traz a obra dele. */
export default async function EditarPermutaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  if (!can(ctx.perms, "permuta", "ver")) return <AccessDenied />;
  if (!can(ctx.perms, "permuta", "editar")) {
    return <p className="text-sm text-[var(--color-warning)]">Sem permissão para editar ativos de permuta.</p>;
  }
  const { id } = await params;
  const alvo = await getPermutaDoTenant(ctx.tenant.id, id);
  if (!alvo) notFound();
  const { permuta: p } = alvo;
  const nomeDaObra = ctx.projects.find((x) => x.id === alvo.projectId)?.name ?? "";
  const [units, clientes, documentos] = await Promise.all([getUnits(ctx.tenant.id, p.versionId), getClientes(ctx.tenant.id), getDocumentsByPermuta(ctx.tenant.id, p.id)]);
  // 6.7 — o documento só chega a quem pode ver o ativo (a página já exigiu "ver").
  const r2 = isR2Configured();
  const docs: PermutaDoc[] = [];
  for (const d of documentos) {
    docs.push({
      id: d.id,
      filename: d.filename,
      tipo: d.tipo,
      versao: d.versao,
      url: r2 ? await readUrl(d.storageKey) : null,
      uploadedAt: d.uploadedAt ? `${String(d.uploadedAt.getMonth() + 1).padStart(2, "0")}/${String(d.uploadedAt.getDate()).padStart(2, "0")}/${d.uploadedAt.getFullYear()}` : null,
      uploadedBy: d.uploadedBy,
    });
  }
  const unitCodes = [...new Set(units.map((u) => u.code))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (p.cancelado) {
    return (
      <>
        <PageHeader eyebrow={`${nomeDaObra} · ${alvo.versionLabel}`} title={`Ativo ${p.descricao || p.tipo || ""}`} />
        <p role="status" className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface2)] px-4 py-3 text-sm text-[var(--color-ink2)]">
          Ativo cancelado em {dateBR(p.canceladoEm)} por {p.canceladoPor ?? "—"}{p.motivoCancelamento ? `: ${p.motivoCancelamento}` : ""}. Não pode ser editado.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${nomeDaObra} · ${alvo.versionLabel}`}
        title={`Editar ativo${p.unitCode ? ` · Un. ${p.unitCode}` : ""}`}
        subtitle={alvo.locked ? "Versão congelada — a edição será recusada." : "Toda alteração registra o valor anterior e o novo na auditoria."}
      />
      <PermutaForm
        projectId={alvo.projectId}
        unidades={unitCodes}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        tipos={TIPOS_PERMUTA}
        docsSlot={<PermutaDocs permutaId={p.id} docs={docs} canEdit={can(ctx.perms, "permuta", "editar")} r2={r2} />}
        initial={{
          id: p.id,
          unitCode: p.unitCode,
          clienteId: p.clienteId,
          cliente: p.cliente,
          dataRecebimento: p.dataRecebimento,
          tipo: p.tipo,
          descricao: p.descricao,
          estimado: p.estimado,
          status: p.status,
          dataVenda: p.dataVenda,
          valorVenda: p.valorVenda,
          tipoPermuta: p.tipoPermuta,
          formaVenda: p.formaVenda,
          parcelas: p.parcelas,
          periodicidade: p.periodicidade,
          dataPrimParcela: p.dataPrimParcela,
          obs: p.obs,
        }}
      />
    </>
  );
}
