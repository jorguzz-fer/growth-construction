import { getActiveContext } from "@/lib/context";
import { getContasPagar, type ContaPagarRow } from "@/lib/queries";
import { getObrigacoesTerceiroPendentes } from "@/lib/actions/restituicoes";
import { rotuloStatusObrigacao } from "@/lib/calc/restituicao";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ContasPagarTable } from "@/components/app/contas-pagar-table";

export const dynamic = "force-dynamic";

export default async function ContasPagarPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "contaspagar", "ver")) return <AccessDenied />;

  const podeVerObrigacoes = can(ctx.perms, "restituicoes", "ver");
  const [despesas, obrigacoes] = await Promise.all([
    getContasPagar(ctx.tenant.id),
    podeVerObrigacoes
      ? getObrigacoesTerceiroPendentes(ctx.tenant.id)
      : Promise.resolve([]),
  ]);

  // §11 — a obrigação com quem desembolsou aparece aqui como uma linha própria,
  // separada da despesa original. A despesa continua listada e continua sendo
  // reconhecida 1× na DRE, pela competência dela; esta linha é a dívida COM o
  // terceiro, com o saldo que ainda falta restituir.
  //
  // `origem: "obrigacao"` mantém as duas coisas distinguíveis para o total (uma
  // obrigação não é despesa nova — ver o rodapé de totais da tabela).
  const linhasObrigacao: ContaPagarRow[] = obrigacoes.map((o) => ({
    id: o.id,
    numDoc: o.numDoc,
    fornecedorNome: o.terceiro,
    descricao: o.descricao,
    categoriaDre: null,
    contaCef: null,
    valor: o.valorSaldo,
    vencimento: o.dataPrevista,
    competencia: o.competencia,
    dataPagamento: null,
    formaPagamento: "Restituição",
    status: rotuloStatusObrigacao(o.status),
    projectId: o.projectId,
    projectName: o.projectName,
    clienteId: null,
    clienteNome: null,
    origem: "obrigacao",
    obrigacaoId: o.obrigacaoId,
  }));

  const rows: ContaPagarRow[] = [...despesas, ...linhasObrigacao];

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Contas a Pagar"
        subtitle="Obrigações de todas as obras — filtre por período, fornecedor, cliente, projeto, categoria e status. Clique no cabeçalho para ordenar."
      />
      <ContasPagarTable rows={rows} canEditar={can(ctx.perms, "despesas", "editar")} />
    </>
  );
}
