import { getActiveContext } from "@/lib/context";
import { getAuditLog, getMembers } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Renderiza o meta de auditoria; destaca alterações campo a campo (de → para). */
function renderMeta(meta: unknown) {
  if (!meta || typeof meta !== "object") return meta ? String(meta) : "—";
  const m = meta as Record<string, unknown>;
  const changes = m.changes as Record<string, { de: unknown; para: unknown }> | undefined;
  if (changes && Object.keys(changes).length > 0) {
    return (
      <div className="space-y-0.5">
        {Object.entries(changes).map(([k, v]) => (
          <div key={k}>
            <span className="text-[var(--color-ink2)]">{k}</span>:{" "}
            <span className="text-[var(--color-danger)]">{String(v.de ?? "—")}</span>
            {" → "}
            <span className="text-[var(--color-success)]">{String(v.para ?? "—")}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="break-words">{JSON.stringify(meta)}</span>;
}

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
              <TD className="max-w-[360px] font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
                {renderMeta(a.meta)}
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
