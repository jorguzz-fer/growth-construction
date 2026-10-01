import { getTenantContext } from "@/lib/context";
import { getFuncionarios } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { TELA_DADOS_FUNCIONARIO, TELA_FUNCIONARIOS } from "@/lib/funcionario-regras";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { FuncionariosManager } from "@/components/app/funcionarios-manager";

export const dynamic = "force-dynamic";

/** Pessoas › Funcionários (Prompt Z, Parte 2): cadastro dos CLT. Autônomos e sócios ficam em Fornecedores. */
export default async function FuncionariosPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "funcionarios", "ver")) return <AccessDenied />;
  const funcionarios = await getFuncionarios(ctx.tenant.id);
  const ativos = funcionarios.filter((f) => !f.desligamento).length;
  return (
    <>
      <PageHeader eyebrow={ctx.tenant.name} title="Funcionários" subtitle={`${ativos} ativo(s) · ${funcionarios.length - ativos} desligado(s) · ficha de registro (art. 41 da CLT); o sistema não tem folha de pagamento`} />
      <FuncionariosManager
        funcionarios={funcionarios}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        canCriar={can(ctx.perms, TELA_FUNCIONARIOS, "criar")}
        podeDados={can(ctx.perms, TELA_DADOS_FUNCIONARIO, "editar")}
      />
    </>
  );
}
