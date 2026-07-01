import { getActiveContext } from "@/lib/context";
import { getAuditLog, getMembers } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AcoesPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [audit, members] = await Promise.all([
    getAuditLog(ctx.tenant.id, 200),
    getMembers(ctx.tenant.id),
  ]);
  const nameById = new Map(members.map((m) => [m.userId, m.name ?? m.email]));

  return (
    <>
      <PageHeader
        title="Log de Auditoria"
        subtitle={`${audit.length} eventos recentes · quem alterou o quê`}
      />
      <Table>
        <THead>
          <tr>
            <TH>Quando</TH>
            <TH>Usuário</TH>
            <TH>Ação</TH>
            <TH>Entidade</TH>
            <TH>Detalhes</TH>
          </tr>
        </THead>
        <tbody>
          {audit.map((a) => (
            <TR key={a.id}>
              <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {a.createdAt.toLocaleString("pt-BR")}
              </TD>
              <TD>{a.userId ? nameById.get(a.userId) ?? "—" : "sistema"}</TD>
              <TD>
                <Badge tone="accent">{a.action}</Badge>
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {a.entity}
                {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}
              </TD>
              <TD className="max-w-[280px] truncate font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
                {a.meta ? JSON.stringify(a.meta) : "—"}
              </TD>
            </TR>
          ))}
          {audit.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-[var(--color-ink3)]">
                Sem eventos de auditoria ainda.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
