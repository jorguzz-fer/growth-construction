import { getTenantContext } from "@/lib/context";
import { getAlocacoesAtivas, getCpfsConhecidos, getDespesasCandidatasAFolha, getFolhas, getFuncionarios, getFuncionariosParaAnalise, getTiposDeDocPorFuncionario } from "@/lib/queries";
import { analisarFuncionarios } from "@/lib/pessoas-analise";
import { hojeISO } from "@/lib/despesa-status";
import { AssistenteFuncionarios } from "@/components/app/assistente-funcionarios";
import { can } from "@/lib/permissions";
import { TELA_DADOS_FUNCIONARIO, TELA_FUNCIONARIOS } from "@/lib/funcionario-regras";
import Link from "next/link";
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
  // 6.1 — a análise roda NO SERVIDOR: o CPF é comparado aqui e o painel recebe só nomes, datas, tipos e contagens (6.3).
  const [paraAnalise, cpfs, tipos, alocacoes, folhas, despesas] = await Promise.all([getFuncionariosParaAnalise(ctx.tenant.id), getCpfsConhecidos(ctx.tenant.id), getTiposDeDocPorFuncionario(ctx.tenant.id), getAlocacoesAtivas(ctx.tenant.id), getFolhas(ctx.tenant.id), getDespesasCandidatasAFolha(ctx.tenant.id)]);
  const analise = analisarFuncionarios({
    funcionarios: paraAnalise,
    fornecedoresPF: cpfs.filter((c) => c.origem === "fornecedor").map((c) => ({ nome: c.nome, cpf: c.cpf })),
    docs: tipos,
    alocacoes,
    folhas: folhas.map((f) => ({ competencia: f.competencia, despesaId: f.despesaId, documentos: f.documentos })),
    despesas,
    hojeISO: hojeISO(),
  });
  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Funcionários"
        subtitle={`${ativos} ativo(s) · ${funcionarios.length - ativos} desligado(s) · ficha de registro (art. 41 da CLT); o sistema não calcula folha`}
        actions={can(ctx.perms, TELA_DADOS_FUNCIONARIO, "ver") ? <Link href="/funcionarios/folha" className="text-[12px] text-[var(--color-accent2)] hover:underline">Folha de pagamento e encargos →</Link> : undefined}
      />
      {/* Abaixo de 1180px o painel desce para baixo do conteúdo (Prompt E, 6.2). */}
      <div className="flex flex-col gap-6 min-[1180px]:flex-row min-[1180px]:items-start">
      <div className="min-w-0 flex-1">
      <FuncionariosManager
        funcionarios={funcionarios}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        canCriar={can(ctx.perms, TELA_FUNCIONARIOS, "criar")}
        podeDados={can(ctx.perms, TELA_DADOS_FUNCIONARIO, "editar")}
      />
      </div>
      <AssistenteFuncionarios usuario={ctx.userEmail ?? "anon"} analise={analise} />
      </div>
    </>
  );
}
