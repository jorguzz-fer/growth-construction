import { getTenantContext } from "@/lib/context";
import { contarPontoDoProjeto, getClientes, getDocumentsByProjects } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ProjectManager } from "@/components/app/project-manager";
import { ProjectPicker } from "@/components/app/project-picker";
import type { ProjetoDoc } from "@/components/app/projeto-docs";
import { OrcadoRealizado } from "@/components/app/orcado-realizado";
import { getOrcadoRealizado } from "@/lib/dre-inputs";
import { montarCard } from "@/lib/calc/orcado-realizado";

export const dynamic = "force-dynamic";

/**
 * Projetos (Prompt B): dois estados na mesma rota — "Todos" (cards empilhados,
 * editáveis) e um projeto (`?proj=<id>`, visão completa com Localização e
 * Orçado x Realizado). O seletor é só desta página: não grava projeto ativo,
 * cookie nem padrão (seção 3). A lista já vem ordenada do contexto.
 */
export default async function ProjetoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "projeto", "ver")) return <AccessDenied />;

  const sp = await searchParams;
  const selecionado = !sp.proj || sp.proj === "all" ? "all" : sp.proj;
  const projetoSel =
    selecionado === "all" ? null : ctx.projects.find((p) => p.id === selecionado) ?? null;

  const r2 = isR2Configured();
  const obraSel = projetoSel && projetoSel.kind !== "office" ? projetoSel : null;
  const [clientes, projDocs, registrosDePonto, oxr] = await Promise.all([
    getClientes(ctx.tenant.id),
    // Só os documentos de projeto (Prompt B, 13) — e não todos os da empresa.
    getDocumentsByProjects(ctx.tenant.id),
    obraSel ? contarPontoDoProjeto(ctx.tenant.id, obraSel.id) : Promise.resolve(0),
    // Orçado x Realizado (19–20): só na visão de uma obra; fontes da Fase 1.
    obraSel ? getOrcadoRealizado(ctx.tenant.id, obraSel.id) : Promise.resolve(null),
  ]);
  // URLs assinadas em paralelo, não uma a uma.
  const urls = await Promise.all(projDocs.map((d) => (r2 ? readUrl(d.storageKey) : Promise.resolve(null))));
  const docsByProject: Record<string, ProjetoDoc[]> = {};
  projDocs.forEach((d, i) => {
    (docsByProject[d.projectId!] ??= []).push({
      id: d.id,
      filename: d.filename,
      tipo: d.tipo,
      url: urls[i],
      uploadedAt: d.uploadedAt ? new Date(d.uploadedAt).toISOString() : null,
    });
  });

  // Id inválido na URL (projeto de outra empresa, ou apagado): a tela não
  // escolhe outro no lugar — mostra "Todos" com aviso.
  const idDesconhecido = selecionado !== "all" && !projetoSel;

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title={projetoSel ? `Projeto ${projetoSel.name}` : "Projetos"}
        subtitle={
          projetoSel
            ? `Projetos — empreendimentos imobiliários — ${projetoSel.name}`
            : "Projetos — empreendimentos imobiliários · unidades e escritórios"
        }
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({
              id: p.id,
              label: p.kind === "office" ? `${p.name} · Matriz/Filial` : p.name,
              kind: p.kind === "office" ? "office" : "proj",
            }))}
            selected={projetoSel ? projetoSel.id : "all"}
            allOption
          />
        }
      />

      {idDesconhecido && (
        <p role="alert" className="mb-4 rounded-[10px] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-2 text-[12.5px] text-[var(--color-ink)]">
          O projeto pedido na URL não existe nesta empresa. Mostrando todos os projetos.
        </p>
      )}

      <ProjectManager
        projects={ctx.projects}
        selecionadoId={projetoSel ? projetoSel.id : "all"}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        tenantName={ctx.tenant.name}
        docsByProject={docsByProject}
        r2Configured={r2}
        tenantCodigoMunicipio={ctx.tenant.codigoMunicipio}
        registrosDePonto={registrosDePonto}
        orcadoRealizado={obraSel && oxr ? <OrcadoRealizado projectId={obraSel.id} card={montarCard(oxr.orcado, oxr.realizado)} /> : undefined}
        perms={{
          criar: can(ctx.perms, "projeto", "criar"),
          editar: can(ctx.perms, "projeto", "editar"),
          excluir: can(ctx.perms, "projeto", "excluir"),
        }}
      />
    </>
  );
}
