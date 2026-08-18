import { getActiveContext } from "@/lib/context";
import { getClientes, getDocuments } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ProjectManager } from "@/components/app/project-manager";
import { ProjectPicker } from "@/components/app/project-picker";
import type { ProjetoDoc } from "@/components/app/projeto-docs";

export const dynamic = "force-dynamic";

export default async function ProjetoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "projeto", "ver")) return <AccessDenied />;

  // Seletor no topo (?proj=): a tela listava TODOS os projetos empilhados, o
  // que obriga a rolar muito para achar um. "all" mantém o comportamento
  // anterior — quem quiser a lista inteira continua tendo.
  const sp = await searchParams;
  const selecionado = !sp.proj || sp.proj === "all" ? "all" : sp.proj;
  const projetoSel =
    selecionado === "all" ? null : ctx.projects.find((p) => p.id === selecionado) ?? null;

  const r2 = isR2Configured();
  const [clientes, docs] = await Promise.all([
    getClientes(ctx.tenant.id),
    getDocuments(ctx.tenant.id),
  ]);
  // Documentos vinculados a projetos, com URL assinada (item 4).
  const projDocs = docs.filter((d) => d.projectId);
  const docsByProject: Record<string, ProjetoDoc[]> = {};
  for (const d of projDocs) {
    const url = r2 ? await readUrl(d.storageKey) : null;
    (docsByProject[d.projectId!] ??= []).push({
      id: d.id,
      filename: d.filename,
      tipo: d.tipo,
      url,
      uploadedAt: d.uploadedAt ? new Date(d.uploadedAt).toISOString() : null,
    });
  }

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Projetos & Unidades"
        subtitle={
          projetoSel
            ? `Exibindo ${projetoSel.name}. Escolha "Todos" no seletor para ver a lista completa.`
            : "Cadastre empreendimentos (nome, datas, cliente e duração) e unidades/escritórios (matriz e filiais)."
        }
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({
              id: p.id,
              // Matriz/filial fica identificada na própria lista: as duas
              // aparecem juntas porque a tela também tem as duas seções.
              label: p.kind === "office" ? `${p.name} · Matriz/Filial` : p.name,
            }))}
            selected={selecionado}
            allOption
          />
        }
      />

      <ProjectManager
        projects={ctx.projects}
        selecionadoId={selecionado}
        activeId={ctx.project.id}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        tenantName={ctx.tenant.name}
        docsByProject={docsByProject}
        r2Configured={r2}
        perms={{
          criar: can(ctx.perms, "projeto", "criar"),
          editar: can(ctx.perms, "projeto", "editar"),
          excluir: can(ctx.perms, "projeto", "excluir"),
        }}
      />
    </>
  );
}
