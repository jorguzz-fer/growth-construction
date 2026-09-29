import { getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { UnitForm } from "@/components/app/unit-form";
import { emptyPlan } from "@/lib/calc";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function NovaUnidadePage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "unidades", "ver")) return <AccessDenied />;
  if (!can(ctx.perms, "unidades", "criar")) {
    return <p className="text-sm text-[var(--color-warning)]">Sem permissão para criar unidades.</p>;
  }
  const sp = await searchParams;
  // A obra vem do link (?proj=); sem ela, o formulário vem sem obra marcada e
  // exige a escolha — nunca o primeiro projeto (Prompt A, 12).
  const selecao = lerSelecaoDeProjeto(ctx.projects, sp);
  const projetoId = selecao.tipo === "projeto" ? selecao.projeto.id : "";

  return (
    <>
      <PageHeader eyebrow="Nova venda · versão Atual" title="Nova Unidade" />
      <UnitForm
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        initial={{
          projetoId,
          itemType: "unidade",
          code: "",
          bloco: "",
          tipo: "",
          m2: "",
          andar: "",
          valor: "",
          status: "Disponivel",
          mesVenda: "",
          plan: emptyPlan(),
        }}
      />
    </>
  );
}
