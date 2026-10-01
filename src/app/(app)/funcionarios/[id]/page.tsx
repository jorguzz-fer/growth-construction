import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/context";
import { getDocumentsByFuncionario, getFuncionario } from "@/lib/queries";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { tipoEhAso } from "@/lib/funcionario-docs-regras";
import { hojeISO } from "@/lib/despesa-status";
import { FuncionarioDocs } from "@/components/app/funcionario-docs";
import { can } from "@/lib/permissions";
import { TELA_ASO, TELA_DADOS_FUNCIONARIO, TELA_FUNCIONARIOS } from "@/lib/funcionario-regras";
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
  // 2.2-A — documentos: sem a permissão do ASO, o servidor não devolve nem a existência (16c);
  // o ASO nunca ganha URL direta — abre pela action que registra o acesso (7.3-A).
  const podeAso = can(ctx.perms, TELA_ASO, "ver");
  const r2 = isR2Configured();
  const docsRows = await getDocumentsByFuncionario(ctx.tenant.id, f.id, podeAso);
  const docs = [];
  for (const d of docsRows) docs.push({ id: d.id, filename: d.filename, tipo: d.tipo, versao: d.versao, contentType: d.contentType, validade: d.validade, uploadedAt: d.uploadedAt ? d.uploadedAt.toISOString() : null, url: r2 && !tipoEhAso(d.tipo) ? await readUrl(d.storageKey) : null });
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
      <div className="mt-4">
        <FuncionarioDocs funcionarioId={f.id} docs={docs} hojeISO={hojeISO()} canEditar={can(ctx.perms, TELA_FUNCIONARIOS, "editar")} podeAso={podeAso} podeEditarAso={can(ctx.perms, TELA_ASO, "editar")} r2={r2} />
      </div>
    </>
  );
}
