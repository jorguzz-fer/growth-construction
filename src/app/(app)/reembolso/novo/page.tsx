import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { can } from "@/lib/permissions";
import { addReembolso } from "@/lib/actions/receitas";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function NovoReembolsoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "reembolso", "ver")) return <AccessDenied />;
  if (!can(ctx.perms, "reembolso", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para criar reembolsos.
      </p>
    );
  }

  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a obra do cookie.
  const sp = await searchParams;
  const selecao = lerSelecaoDeProjeto(ctx.projects, sp);
  const escolhido =
    selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido?.trabalho) {
    return <PedirProjeto titulo="Nova Liberação de Obra" projetos={ctx.projects} oQue="lançar a liberação de obra" />;
  }
  const { project, trabalho: version } = escolhido;

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${version.label}`}
        title="Nova Liberação de Obra"
        subtitle="A data deve ser uma DATA REAL — o SERIAL é calculado automaticamente via INT(Data)."
      />

      <Card>
        <CardContent className="p-5">
          <form
            action={addReembolso}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {/* Obra desta tela (Prompt A): a liberação vai para a versão de trabalho dela. */}
            <input type="hidden" name="projectId" value={project.id} />
            <div>
              <Label>Data</Label>
              <DateField name="data" required />
            </div>
            <div>
              <Label>Origem</Label>
              <Input name="origem" placeholder="Origem X" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input name="valor" type="number" step="0.01" placeholder="0" />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Input name="obs" placeholder="" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit">Salvar liberação</Button>
              <a href={`/reembolso?proj=${project.id}`} className={buttonVariants({ variant: "ghost" })}>
                Cancelar
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
