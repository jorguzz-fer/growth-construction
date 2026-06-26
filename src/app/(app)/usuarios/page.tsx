import { getActiveContext, canEdit, type Role } from "@/lib/context";
import { getAuditLog, getMembers } from "@/lib/queries";
import { inviteMember } from "@/lib/actions/users";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { RoleSelect } from "@/components/app/role-select";

export const dynamic = "force-dynamic";

const roleTone: Record<string, "accent" | "info" | "neutral" | "warning"> = {
  owner: "accent",
  admin: "info",
  membro: "neutral",
  contador: "warning",
};

export default async function UsuariosPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [members, audit] = await Promise.all([
    getMembers(ctx.tenant.id),
    getAuditLog(ctx.tenant.id),
  ]);
  const podeGerir = ctx.role === "owner" || ctx.role === "admin";

  return (
    <>
      <PageHeader
        title="Usuários & Acessos"
        subtitle={`${members.length} membros · seu papel: ${ctx.role}`}
      />

      {podeGerir && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <form
              action={inviteMember}
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              <div>
                <Label>Nome</Label>
                <Input name="name" placeholder="Nome do membro" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input name="email" type="email" required />
              </div>
              <div>
                <Label>Papel</Label>
                <Select name="role" defaultValue="membro">
                  <option value="admin">admin</option>
                  <option value="membro">membro</option>
                  <option value="contador">contador</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Convidar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>E-mail</TH>
            <TH>Papel</TH>
          </tr>
        </THead>
        <tbody>
          {members.map((m) => (
            <TR key={m.userId}>
              <TD className="font-medium text-[var(--color-ink)]">
                {m.name ?? "—"}
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {m.email ?? "—"}
              </TD>
              <TD>
                {podeGerir ? (
                  <RoleSelect userId={m.userId} role={m.role as Role} />
                ) : (
                  <Badge tone={roleTone[m.role] ?? "neutral"}>{m.role}</Badge>
                )}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>

      {/* Auditoria */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-[var(--color-ink)]">
        Auditoria recente
      </h2>
      <Table>
        <THead>
          <tr>
            <TH>Quando</TH>
            <TH>Ação</TH>
            <TH>Entidade</TH>
          </tr>
        </THead>
        <tbody>
          {audit.map((a) => (
            <TR key={a.id}>
              <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {a.createdAt.toLocaleString("pt-BR")}
              </TD>
              <TD>
                <Badge tone="accent">{a.action}</Badge>
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {a.entity}
                {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}
              </TD>
            </TR>
          ))}
          {audit.length === 0 && (
            <TR>
              <TD colSpan={3} className="py-6 text-center text-[var(--color-ink3)]">
                Sem eventos de auditoria ainda.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>

      {!canEdit(ctx.role) && (
        <p className="mt-4 text-sm text-[var(--color-warning)]">
          Você está em modo somente-leitura (papel contador).
        </p>
      )}
    </>
  );
}
