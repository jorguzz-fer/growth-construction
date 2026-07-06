import Link from "next/link";
import { getActiveContext, type Role } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getMembers } from "@/lib/queries";
import { inviteMember } from "@/lib/actions/users";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { RoleSelect } from "@/components/app/role-select";
import { MemberActions } from "@/components/app/member-actions";

export const dynamic = "force-dynamic";

const roleTone: Record<string, "accent" | "info" | "neutral" | "warning"> = {
  owner: "accent",
  admin: "info",
  membro: "neutral",
  contador: "warning",
  engenheiro: "info",
};

export default async function UsuariosPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const members = await getMembers(ctx.tenant.id);
  const podeCriar = can(ctx.perms, "usuarios", "criar");
  const podeEditar = can(ctx.perms, "usuarios", "editar");
  const podeExcluir = can(ctx.perms, "usuarios", "excluir");
  const temAcoes = podeEditar || podeExcluir;

  return (
    <>
      <PageHeader
        title="Usuários & Acessos"
        subtitle={`${members.length} membros · seu papel: ${ctx.role}`}
      />

      {podeCriar && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Novo usuário
            </h2>
            <form
              action={inviteMember}
              className="grid grid-cols-2 gap-3 sm:grid-cols-5"
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
                  <option value="engenheiro">engenheiro</option>
                </Select>
              </div>
              <div>
                <Label>Senha inicial (opcional)</Label>
                <PasswordInput
                  name="password"
                  placeholder="mín. 8"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Adicionar
                </Button>
              </div>
            </form>
            <p className="mt-2 text-xs text-[var(--color-ink3)]">
              Sem senha inicial, o usuário fica com acesso pendente até você
              definir uma senha na tabela abaixo.
            </p>
          </CardContent>
        </Card>
      )}

      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>E-mail</TH>
            <TH>Papel</TH>
            <TH>Acesso</TH>
            {temAcoes && <TH>Ações</TH>}
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
                {podeEditar ? (
                  <RoleSelect userId={m.userId} role={m.role as Role} />
                ) : (
                  <Badge tone={roleTone[m.role] ?? "neutral"}>{m.role}</Badge>
                )}
              </TD>
              <TD>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={m.hasPassword ? "success" : "warning"}>
                    {m.hasPassword ? "ativo" : "sem senha"}
                  </Badge>
                  {m.mfaEnabled && <Badge tone="info">MFA</Badge>}
                  {m.userId === ctx.userId && (
                    <Badge tone="neutral">você</Badge>
                  )}
                </div>
              </TD>
              {temAcoes && (
                <TD>
                  <MemberActions
                    userId={m.userId}
                    name={m.name}
                    isSelf={m.userId === ctx.userId}
                    canEdit={podeEditar}
                    canDelete={podeExcluir}
                  />
                </TD>
              )}
            </TR>
          ))}
        </tbody>
      </Table>

      {podeCriar && (
        <p className="mb-2 mt-6 text-sm text-[var(--color-ink3)]">
          Para permissões granulares por tela e ação, use{" "}
          <Link href="/acessos" className="text-[var(--color-accent2)] hover:underline">
            Gestão de Acessos
          </Link>
          .
        </p>
      )}

      {!podeEditar && (
        <p className="mt-4 text-sm text-[var(--color-warning)]">
          Você está em modo somente-leitura nesta tela.
        </p>
      )}
    </>
  );
}
