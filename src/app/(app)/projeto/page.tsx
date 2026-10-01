import { getTenantContext } from "@/lib/context";
import { getClientes, getDocumentsByProjects } from "@/lib/queries";
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
  const ctx = await getTenantContext();
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
  const [clientes, projDocs] = await Promise.all([
    getClientes(ctx.tenant.id),
    // Só os documentos de projeto (Prompt B, 13) — e não todos os da empresa.
    getDocumentsByProjects(ctx.tenant.id),
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
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        tenantName={ctx.tenant.name}
        docsByProject={docsByProject}
        r2Configured={r2}
        tenantCodigoMunicipio={ctx.tenant.codigoMunicipio}
        perms={{
          criar: can(ctx.perms, "projeto", "criar"),
          editar: can(ctx.perms, "projeto", "editar"),
          excluir: can(ctx.perms, "projeto", "excluir"),
        }}
      />
    </>
  );
}
