import { getTenantContext } from "@/lib/context";
import Link from "next/link";
import { getContasPagar, getContasPagarEmPlanejamento, getFaturasCartao, getParcelasContasPagar, type ContaPagarRow } from "@/lib/queries";
import { linhasComFaturas } from "@/lib/calc/fatura";
import { hojeISO } from "@/lib/despesa-status";
import { chaveLigada } from "@/lib/chaves-tenant";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { getObrigacoesTerceiroPendentes } from "@/lib/actions/restituicoes";
import { rotuloStatusObrigacao } from "@/lib/calc/restituicao";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ContasPagarTable } from "@/components/app/contas-pagar-table";

export const dynamic = "force-dynamic";

export default async function ContasPagarPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "contaspagar", "ver")) return <AccessDenied />;

  const podeVerObrigacoes = can(ctx.perms, "restituicoes", "ver");
  // §10 — prévia da chave: só quem administra chaves vê as linhas de
  // planejamento que deixam de aparecer quando ela liga.
  const podeVerPrevia = can(ctx.perms, "chaves", "ver");
  const podeVerFaturas = can(ctx.perms, "cartoes", "ver");
  const [despesas, parcelas, obrigacoes, soAtual, planejamento, faturas] = await Promise.all([
    getContasPagar(ctx.tenant.id),
    // Prompt R, seção 1 — consulta própria da tela: `getContasPagar` não muda
    // para Dashboard, Fechamento e conciliação.
    getParcelasContasPagar(ctx.tenant.id),
    podeVerObrigacoes
      ? getObrigacoesTerceiroPendentes(ctx.tenant.id)
      : Promise.resolve([]),
    chaveLigada(ctx.tenant.id, "contas_pagar_so_atual"),
    podeVerPrevia ? getContasPagarEmPlanejamento(ctx.tenant.id) : Promise.resolve([]),
    // Prompt U, 2.6/2.7 (R 1.6) — as faturas de cartão: a obrigação é a
    // fatura, nunca as compras; a do ciclo aberto entra como prevista.
    podeVerFaturas ? getFaturasCartao(ctx.tenant.id) : Promise.resolve([]),
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
    saldo: o.valorSaldo,
    versionKind: "atual",
    versionLabel: "Atual",
    vencimento: o.dataPrevista,
    competencia: o.competencia,
    dataPagamento: null,
    formaPagamento: "Ressarcimento",
    status: rotuloStatusObrigacao(o.status),
    projectId: o.projectId,
    projectName: o.projectName,
    clienteId: null,
    clienteNome: null,
    origem: "obrigacao",
    obrigacaoId: o.obrigacaoId,
  }));

  // Prompt R, 1.2 — despesa parcelada vira uma linha por parcela (nº,
  // vencimento, saldo, cheque); sem parcelamento, uma linha como hoje (1.5:
  // as obrigações com terceiro não têm parcela e não mudam).
  // Prompt U, 2.6 — compra no cartão SAI da lista (e as parcelas dela); quem
  // fica é a fatura, pelo acumulado do ciclo, sem estimativa de juros (2.8).
  // Sem permissão de ver cartões, as compras continuam fora (o mesmo dinheiro
  // não pode aparecer duas vezes) e a fatura não aparece.
  const hoje = hojeISO();
  const comCartao = linhasComFaturas(despesas, parcelas, faturas, hoje);
  const rows: ContaPagarRow[] = [...comCartao.compras, ...linhasObrigacao, ...comCartao.faturas];

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Contas a Pagar"
        subtitle="Uma linha por obrigação que vence: despesa, parcela ou ressarcimento. Filtre por período, fornecedor, cliente, projeto, categoria e status; clique no cabeçalho para ordenar."
      />
      {/* Prompt R, 4.5 — hoje vem do servidor: o relógio do navegador não decide o que está vencido. */}
      <ContasPagarTable rows={rows} canEditar={can(ctx.perms, "despesas", "editar")} hoje={hoje} />
      {podeVerPrevia && <PreviaPlanejamento linhas={planejamento} chaveLigada={soAtual} />}
    </>
  );
}

/**
 * §10 — prévia da chave `contas_pagar_so_atual`: exatamente as despesas fora da
 * versão Atual que hoje contam como obrigação. Ligada a chave, elas saem daqui,
 * do Dashboard, do Fechamento e da conciliação; continuam nas versões delas.
 */
function PreviaPlanejamento({ linhas, chaveLigada }: { linhas: ContaPagarRow[]; chaveLigada: boolean }) {
  const total = linhas.reduce((a, l) => a + l.valor, 0);
  return (
    <Card id="previa" className="mt-6">
      <CardContent className="p-5">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">
          Prévia da chave “Contas a Pagar só com a versão Atual” — {chaveLigada ? "ligada" : "desligada"}
        </h2>
        <p className="mt-1.5 text-[13px] text-[var(--color-ink2)]">
          {linhas.length === 0
            ? "Nenhuma despesa fora da versão Atual conta como obrigação nesta empresa. Ligar a chave não muda nenhum número."
            : chaveLigada
              ? `${linhas.length} despesa(s) de Orçamento/Previsão, somando ${brl0(total)}, já ficam de fora da lista acima, do Dashboard, do Fechamento e da conciliação. Desligar a chave volta a contá-las.`
              : `${linhas.length} despesa(s) de Orçamento/Previsão, somando ${brl0(total)}, contam hoje como obrigação. Com a chave ligada, elas deixam de aparecer aqui, no Dashboard, no Fechamento e na conciliação — e continuam gravadas nas versões delas.`}{" "}
          <Link href="/chaves" className="text-[var(--color-accent2)] hover:underline">
            Chaves de mudança
          </Link>
        </p>
        {linhas.length > 0 && (
          <Table wrapperClassName="mt-3 max-h-[40vh]" className="min-w-[700px]">
            <THead>
              <tr>
                <TH>PED</TH>
                <TH>Projeto</TH>
                <TH>Versão</TH>
                <TH>Fornecedor</TH>
                <TH>Vencimento</TH>
                <TH>Status</TH>
                <TH className="text-right">Valor</TH>
              </tr>
            </THead>
            <tbody>
              {linhas.map((l) => (
                <TR key={l.id}>
                  <TD className="font-[family-name:var(--font-mono)]">{l.numDoc ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{l.projectName}</TD>
                  <TD className="whitespace-nowrap">{l.versionLabel}</TD>
                  <TD>{l.fornecedorNome ?? "—"}</TD>
                  <TD className="font-[family-name:var(--font-mono)]">{l.vencimento ? dateBR(l.vencimento) : "—"}</TD>
                  <TD>{l.status ?? "—"}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(l.valor)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
