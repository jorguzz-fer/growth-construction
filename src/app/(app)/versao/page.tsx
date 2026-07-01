import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { VersionConfig } from "@/components/app/version-config";

export const dynamic = "force-dynamic";

export default async function VersaoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  return (
    <>
      <PageHeader
        eyebrow={ctx.project.name}
        title="Configuração da Versão"
        subtitle={`${ctx.versions.length}/6 versões · renomear, cor, congelar, default`}
      />
      <VersionConfig
        versions={ctx.versions}
        canEdit={can(ctx.perms, "versao", "editar")}
        canDelete={can(ctx.perms, "versao", "excluir")}
      />
    </>
  );
}
