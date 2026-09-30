import { getTenantContext } from "@/lib/context";
import { getAuditLog, getMembers } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import {
  ehAlteracaoProtegida,
  metaVisivel,
  podeVerDadoProtegido,
} from "@/lib/audit-mask";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/**
 * Renderiza o meta de auditoria; destaca alterações campo a campo (de → para).
 *
 * Recebe o meta JÁ MASCARADO para o papel de quem vê (`metaVisivel`). Um campo
 * protegido chega como `AlteracaoProtegida` e aparece só como "alterado" — o
 * leitor sabe que o dado mudou, sem ver o valor.
 */
function renderMeta(meta: unknown) {
  if (!meta || typeof meta !== "object") return meta ? String(meta) : "—";
  const m = meta as Record<string, unknown>;
  const changes = m.changes as Record<string, unknown> | undefined;
  if (changes && typeof changes === "object" && Object.keys(changes).length > 0) {
    return (
      <div className="space-y-0.5">
        {Object.entries(changes).map(([k, v]) => {
          if (ehAlteracaoProtegida(v)) {
            return (
              <div key={k}>
                <span className="text-[var(--color-ink2)]">{k}</span>:{" "}
                <span className="italic text-[var(--color-ink3)]">alterado</span>
              </div>
            );
          }
          const alt = (v ?? {}) as { de?: unknown; para?: unknown };
          return (
            <div key={k}>
              <span className="text-[var(--color-ink2)]">{k}</span>:{" "}
              <span className="text-[var(--color-danger)]">{String(alt.de ?? "—")}</span>
              {" → "}
              <span className="text-[var(--color-success)]">{String(alt.para ?? "—")}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return <span className="break-words">{JSON.stringify(meta)}</span>;
}

export default async function AcoesPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "acoes", "ver")) return <AccessDenied />;

  const [audit, members] = await Promise.all([
    getAuditLog(ctx.tenant.id, 200),
    getMembers(ctx.tenant.id),
  ]);
  const nameById = new Map(members.map((m) => [m.userId, m.name ?? m.email]));
  const veDadoProtegido = podeVerDadoProtegido(ctx.role);

  return (
    <>
      <PageHeader
        title="Log de Auditoria"
        subtitle={`${audit.length} eventos recentes · quem alterou o quê`}
      />
      {!veDadoProtegido && (
        <p className="mb-3 text-xs text-[var(--color-ink3)]">
          Dados pessoais de compradores (CPF, nascimento, renda, FGTS, score e
          restrições de crédito) aparecem só como “alterado”. O valor é visível
          apenas para dono e administrador.
        </p>
      )}
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
                {renderMeta(metaVisivel(a.meta, ctx.role))}
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
