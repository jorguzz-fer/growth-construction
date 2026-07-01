import { getActiveContext, type Role } from "@/lib/context";
import { can, effectivePermissions } from "@/lib/permissions";
import { getMembers } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { AccessMatrix } from "@/components/app/access-matrix";

export const dynamic = "force-dynamic";

export default async function AcessosPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const members = await getMembers(ctx.tenant.id);
  const canEditPerms = can(ctx.perms, "acessos", "editar");

  const rows = members.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: m.role,
    perms: effectivePermissions(m.role as Role, m.permissions),
  }));

  return (
    <>
      <PageHeader
        title="Gestão de Acessos"
        subtitle="Permissões granulares por usuário · telas × ações (Ver / Criar / Editar / Excluir)"
      />
      {!canEditPerms && (
        <p className="mb-4 text-sm text-[var(--color-warning)]">
          Você pode visualizar, mas não editar permissões.
        </p>
      )}
      <AccessMatrix members={rows} canEdit={canEditPerms} />
    </>
  );
}
