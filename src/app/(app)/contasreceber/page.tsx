import { getTenantContext } from "@/lib/context";
import {
  getContasReceber,
  getReceivables,
  getClientes,
  getBankAccounts,
  getUnidadesAtuaisPorObra,
  getDocumentsByContasReceber,
  getRecebimentosDasContas,
  getEntradasDisponiveis,
} from "@/lib/queries";
import type { RecebimentoExibido } from "@/components/app/conta-receber-recebimentos";
import { analisarContasReceber } from "@/lib/conta-receber-analise";
import { AssistenteContasReceber } from "@/components/app/assistente-contas-receber";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import type { ContaReceberDoc } from "@/components/app/conta-receber-docs";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ContasReceberManager } from "@/components/app/contas-receber-manager";
import { ReceitaSearch, type ReceitaBuscavel } from "@/components/app/receita-search";
import { ProjectPicker } from "@/components/app/project-picker";

export const dynamic = "force-dynamic";

export default async function ContasReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "contasreceber", "ver")) return <AccessDenied />;

  const sp = await searchParams;

  // Filtro por projeto (?proj=): "all" mostra todos. CR-06 — a obra filtra na
  // consulta; a página não carrega a empresa inteira para descartar depois.
  const isAll = !sp.proj || sp.proj === "all";
  const projSel = isAll ? null : (ctx.projects.find((p) => p.id === sp.proj) ?? null);
  const filtroObra = projSel?.id;

  const [contas, receivables, clientes, bancos, unidadesPorObra] = await Promise.all([
    getContasReceber(ctx.tenant.id, filtroObra),
    getReceivables(ctx.tenant.id, filtroObra),
    getClientes(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    // CR-07 — o seletor de unidade só oferece as unidades da obra escolhida.
    getUnidadesAtuaisPorObra(ctx.tenant.id),
  ]);

  // 6.2 — anexos das contas listadas, com link assinado para abrir.
  const r2 = isR2Configured();
  const docs = await getDocumentsByContasReceber(ctx.tenant.id, contas.map((c) => c.id));
  const docsPorConta: Record<string, ContaReceberDoc[]> = {};
  for (const d of docs) {
    if (!d.contaReceberId) continue;
    (docsPorConta[d.contaReceberId] ??= []).push({
      id: d.id,
      filename: d.filename,
      tipo: d.tipo,
      url: r2 ? await readUrl(d.storageKey) : null,
      uploadedAt: d.uploadedAt ? d.uploadedAt.toISOString() : null,
    });
  }

  // Seções 3 e 4 — recebimentos de cada conta (estado derivado na tela) e
  // entradas do extrato com valor livre para conciliar.
  const [recebimentos, entradas] = await Promise.all([
    getRecebimentosDasContas(ctx.tenant.id, contas.map((c) => c.id)),
    getEntradasDisponiveis(ctx.tenant.id, filtroObra),
  ]);
  const recebimentosPorConta: Record<string, RecebimentoExibido[]> = {};
  for (const r of recebimentos) {
    (recebimentosPorConta[r.contaReceberId] ??= []).push({
      id: r.id,
      valor: Number(r.valor),
      data: r.data,
      forma: r.forma,
      cashEntryId: r.cashEntryId,
      justificativa: r.justificativa,
      estornado: r.estornado,
      motivoEstorno: r.motivoEstorno,
    });
  }

  // Seção 8 — análises do assistente, em código puro, sobre o que a página já
  // carregou. "Hoje" vem do servidor em São Paulo.
  const hoje = new Date();
  const hojeYmd = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(hoje)
      .replace(/-/g, ""),
  );
  const analise = analisarContasReceber(
    contas.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      tipo: c.tipo,
      descricao: c.descricao,
      valor: Number(c.valor),
      vencimento: c.vencimento,
      unitCode: c.unitCode,
      clienteId: c.clienteId,
      clienteNome: c.clienteNome,
      recebimentos: recebimentosPorConta[c.id] ?? [],
    })),
    entradas,
    hojeYmd,
  );

  // Lista unificada para a busca (contas lançadas + recebíveis das vendas),
  // já só da obra escolhida.
  const receitasBuscaveis: ReceitaBuscavel[] = [
    ...contas.map((c) => ({
      id: c.id,
      origem: "conta" as const,
      descricao: c.descricao,
      clienteNome: c.clienteNome,
      projectName: c.projectName,
      unitCode: c.unitCode,
      tipo: c.tipo,
      valor: Number(c.valor),
      vencimento: c.vencimento,
      status: c.status,
    })),
    ...receivables.map((r) => ({
      id: r.refId,
      origem: "recebivel" as const,
      descricao: r.descricao,
      clienteNome: r.clienteNome,
      projectName: r.projectName,
      unitCode: r.unitCode,
      tipo: null,
      valor: r.valor,
      vencimento: r.dia,
      status: r.status,
    })),
  ];

  return (
    <>
      <PageHeader
        eyebrow={projSel ? `${projSel.name} · ${ctx.tenant.name}` : `Todos os projetos · ${ctx.tenant.name}`}
        title="Contas a Receber"
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={projSel ? projSel.id : "all"}
            allOption
          />
        }
        subtitle="Recebíveis das vendas (Unidades) e contas a receber lançadas manualmente — vinculadas a um projeto."
      />
      {/* Abaixo de 1180px o painel desce para baixo do conteúdo (Prompt E, 6.2). */}
      <div className="flex flex-col gap-6 min-[1180px]:flex-row min-[1180px]:items-start">
      <div className="min-w-0 flex-1">
      <div className="mb-3">
        <ReceitaSearch rows={receitasBuscaveis} />
      </div>

      <ContasReceberManager
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        projetoSelecionado={projSel?.id ?? null}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        unidadesPorObra={unidadesPorObra}
        contas={contas}
        docsPorConta={docsPorConta}
        recebimentosPorConta={recebimentosPorConta}
        entradas={entradas}
        r2={r2}
        unitReceb={receivables.map((r) => ({
          // CR-08 — o identificador do recebível (unidade:índice da parcela)
          // chega à tabela; é a chave de qualquer vínculo futuro.
          refId: r.refId,
          unitCode: r.unitCode,
          projectName: r.projectName,
          clienteNome: r.clienteNome,
          descricao: r.descricao,
          dia: r.dia,
          valor: r.valor,
        }))}
        canCriar={can(ctx.perms, "contasreceber", "criar")}
        canEditar={can(ctx.perms, "contasreceber", "editar")}
        canExcluir={can(ctx.perms, "contasreceber", "excluir")}
      />
      </div>
      <AssistenteContasReceber usuario={ctx.userEmail ?? "anon"} analise={analise} podeEditar={can(ctx.perms, "contasreceber", "editar")} />
      </div>
    </>
  );
}
