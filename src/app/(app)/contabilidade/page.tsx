import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto, RecuperarProjeto } from "@/components/app/projeto-da-aba";
import { getDespesas, getMembers, getMonthlyRevenue } from "@/lib/queries";
import { inviteContador } from "@/lib/actions/users";
import { brl0 } from "@/lib/utils";
import { FormComResultado } from "@/components/app/form-com-resultado";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function ContabilidadePage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "contabilidade", "ver")) return <AccessDenied />;

  // Os três números são de UMA obra, escolhida aqui (Prompt A) — não mais a
  // do cookie. Sem obra: a aba reabre a última; senão, a tela pede a escolha
  // só para o bloco de números (o convite de contador é da empresa).
  const selecao = lerSelecaoDeProjeto(ctx.projects, await searchParams);
  const escolhido =
    selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  const obra = escolhido?.trabalho ? escolhido.project : null;
  const versao = escolhido?.trabalho ?? null;
  const [despesas, revenue, members] = await Promise.all([
    versao ? getDespesas(versao.id) : Promise.resolve([]),
    versao && obra ? getMonthlyRevenue(versao.id, obra.id) : Promise.resolve({} as Record<string, number>),
    getMembers(ctx.tenant.id),
  ]);
  const receita = Object.values(revenue).reduce((a, b) => a + b, 0);
  const totalDespesas = despesas.reduce((a, d) => a + Number(d.valor), 0);
  const resultado = receita - totalDespesas;
  const contadores = members.filter((m) => m.role === "contador");
  const podeGerir = ctx.role === "owner" || ctx.role === "admin";

  return (
    <>
      <PageHeader
        title="Acesso Contabilidade"
        subtitle="Visão somente-leitura de balancetes e demonstrativos"
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={obra?.id ?? ""}
          />
        }
      />
      {obra ? (
        <LembrarProjeto projectId={obra.id} />
      ) : (
        <RecuperarProjeto idsPermitidos={ctx.projects.map((p) => p.id)}>
          <Card className="mb-6">
            <CardContent className="p-6 text-center text-[var(--color-ink3)]">
              Selecione um projeto para ver receita, despesas e resultado.
            </CardContent>
          </Card>
        </RecuperarProjeto>
      )}

      {/* Prompt M, 4 — os três números são de UM projeto e UMA versão, não da
          empresa. A tela diz quais; a obra é escolhida no seletor (Prompt A). */}
      {obra && versao && (
      <>
      <p className="mb-2 text-xs text-[var(--color-ink3)]">
        Projeto <strong className="text-[var(--color-ink2)]">{obra.name}</strong> · versão{" "}
        <strong className="text-[var(--color-ink2)]">{versao.label}</strong> — não é o
        consolidado da empresa.
      </p>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Receita projetada
            </p>
            <p className="mt-2 text-xl font-semibold">{brl0(receita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Despesas lançadas
            </p>
            <p className="mt-2 text-xl font-semibold">{brl0(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Resultado
            </p>
            <p
              className={`mt-2 text-xl font-semibold ${
                resultado >= 0
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]"
              }`}
            >
              {brl0(resultado)}
            </p>
          </CardContent>
        </Card>
      </div>
      </>
      )}

      {podeGerir && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Convidar escritório contábil
            </h2>
            <FormComResultado
              action={inviteContador}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              sucesso="Convite registrado."
              aoConcluir="recarregar"
            >
              <div>
                <Label>Nome</Label>
                <Input name="name" placeholder="Escritório Contábil" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input name="email" type="email" required />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Convidar (somente leitura)
                </Button>
              </div>
            </FormComResultado>
          </CardContent>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Contadores com acesso
      </h2>
      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>E-mail</TH>
            <TH>Acesso</TH>
          </tr>
        </THead>
        <tbody>
          {contadores.map((m) => (
            <TR key={m.userId}>
              <TD className="font-medium text-[var(--color-ink)]">
                {m.name ?? "—"}
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {m.email ?? "—"}
              </TD>
              <TD>
                <Badge tone="warning">somente leitura</Badge>
              </TD>
            </TR>
          ))}
          {contadores.length === 0 && (
            <TR>
              <TD colSpan={3} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum contador convidado ainda.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
