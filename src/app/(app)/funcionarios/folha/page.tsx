import Link from "next/link";
import { getTenantContext } from "@/lib/context";
import { getDespesasCandidatasAFolha, getDocumentsByFolhas, getFolhas, getFuncionarios } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { TELA_DADOS_FUNCIONARIO } from "@/lib/funcionario-regras";
import { conferenciaDaFolha, PARECE_FOLHA } from "@/lib/funcionario-docs-regras";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { FolhaManager } from "@/components/app/folha-manager";

export const dynamic = "force-dynamic";

/** Pessoas › Funcionários › Folha de pagamento (Prompt Z, 2.2-B). Dado de folha é sensível: exige a permissão de dados do funcionário. */
export default async function FolhaPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "funcionarios", "ver")) return <AccessDenied />;
  if (!can(ctx.perms, TELA_DADOS_FUNCIONARIO, "ver")) return <AccessDenied />;
  const [folhas, candidatasTodas, funcionarios] = await Promise.all([getFolhas(ctx.tenant.id), getDespesasCandidatasAFolha(ctx.tenant.id), getFuncionarios(ctx.tenant.id)]);
  const docs = await getDocumentsByFolhas(ctx.tenant.id, folhas.map((f) => f.id));
  const r2 = isR2Configured();
  const nomes = new Map(funcionarios.map((f) => [f.id, f.nome]));
  const docsPorFolha = new Map<string, FolhaDoc[]>();
  type FolhaDoc = { id: string; filename: string; tipo: string | null; versao: number; funcionarioNome: string | null; uploadedAt: string | null; url: string | null };
  for (const d of docs) {
    if (!d.folhaId) continue;
    const lista = docsPorFolha.get(d.folhaId) ?? [];
    lista.push({ id: d.id, filename: d.filename, tipo: d.tipo, versao: d.versao, funcionarioNome: d.funcionarioId ? (nomes.get(d.funcionarioId) ?? "funcionário") : null, uploadedAt: d.uploadedAt ? d.uploadedAt.toISOString() : null, url: r2 ? await readUrl(d.storageKey) : null });
    docsPorFolha.set(d.folhaId, lista);
  }
  // candidatas: as que parecem folha, mais as já vinculadas (para o seletor mostrar o vínculo atual)
  const vinculadas = new Set(folhas.map((f) => f.despesaId).filter((x): x is string => !!x));
  const candidatas = candidatasTodas.filter((d) => PARECE_FOLHA.test(d.texto) || vinculadas.has(d.id));
  const conferencia = conferenciaDaFolha(folhas.map((f) => ({ competencia: f.competencia, despesaId: f.despesaId, documentos: f.documentos })), candidatasTodas);
  return (
    <>
      <PageHeader eyebrow={`${ctx.tenant.name} · Funcionários`} title="Folha de pagamento e encargos" subtitle="Arquivo mensal: folha, holerites, guias e comprovantes de INSS, FGTS e IRRF — por competência" actions={<Link href="/funcionarios" className="text-[12px] text-[var(--color-accent2)] hover:underline">← Funcionários</Link>} />
      <FolhaManager
        folhas={folhas.map((f) => ({ id: f.id, competencia: f.competencia, obs: f.obs, despesaId: f.despesaId, despesaNumDoc: f.despesaNumDoc, despesaValor: f.despesaValor, docs: docsPorFolha.get(f.id) ?? [] }))}
        candidatas={candidatas}
        funcionarios={funcionarios.filter((f) => !f.desligamento).map((f) => ({ id: f.id, nome: f.nome }))}
        conferencia={conferencia}
        canEditar={can(ctx.perms, TELA_DADOS_FUNCIONARIO, "editar")}
        r2={r2}
      />
    </>
  );
}
