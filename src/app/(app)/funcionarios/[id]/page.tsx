import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/context";
import { getFuncionario } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { TELA_DADOS_FUNCIONARIO, TELA_FUNCIONARIOS } from "@/lib/funcionario-regras";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { FuncionarioFicha } from "@/components/app/funcionario-ficha";
import { valoresDe } from "@/lib/funcionario-form";

export const dynamic = "force-dynamic";

export default async function FuncionarioPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "funcionarios", "ver")) return <AccessDenied />;
  const { id } = await params;
  const podeDados = can(ctx.perms, TELA_DADOS_FUNCIONARIO, "ver");
  // 7.2 — sem a permissão, a consulta devolve endereço, salário, jornada e banco NULOS.
  const f = await getFuncionario(ctx.tenant.id, id, podeDados);
  if (!f) notFound();
  const valores = valoresDe(f as unknown as Record<string, unknown>);
  return (
    <>
      <PageHeader eyebrow={`${ctx.tenant.name} · Funcionários`} title={f.nome} subtitle={[f.cargo, f.setor, f.projectName].filter(Boolean).join(" · ") || "ficha de registro"} actions={<Link href="/funcionarios" className="text-[12px] text-[var(--color-accent2)] hover:underline">← Funcionários</Link>} />
      <FuncionarioFicha
        id={f.id}
        nome={f.nome}
        valores={valores}
        desligamento={f.desligamento}
        motivoDesligamento={f.motivoDesligamento}
        dependentes={f.dependentes.map((d) => ({ id: d.id, nome: d.nome, nascimento: d.nascimento, parentesco: d.parentesco, dependenteIr: d.dependenteIr, salarioFamilia: d.salarioFamilia }))}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        canEditar={can(ctx.perms, TELA_FUNCIONARIOS, "editar")}
        canExcluir={can(ctx.perms, TELA_FUNCIONARIOS, "excluir")}
        podeDados={podeDados}
        podeEditarDados={can(ctx.perms, TELA_DADOS_FUNCIONARIO, "editar")}
      />
    </>
  );
}
