import Link from "next/link";
import type { CompraDaFatura, FaturaCartaoView } from "@/lib/queries";
import { estadoDaFatura, saldoDaFatura, statusDaFatura } from "@/lib/calc/fatura";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { tomDoStatus } from "@/lib/despesa-status";

/**
 * Faturas de cartão (Prompt U, 2.5–2.8): uma linha por ciclo com estado
 * derivado (aberta / fechada / paga), compras, pago e saldo. O valor da
 * aberta é o acumulado do ciclo, SEM estimativa de juros (2.8). Clicar numa
 * fatura lista as compras dela; cada compra leva ao lançamento raiz.
 */
export function FaturasCartao({ faturas, hoje, aberta, compras }: { faturas: FaturaCartaoView[]; hoje: string; aberta: string | null; compras: CompraDaFatura[] }) {
  const comMovimento = faturas.filter((f) => f.qtdCompras > 0 || f.valorPago > 0);
  const escolhida = comMovimento.find((f) => f.id === aberta) ?? null;
  return (
    <Card className="mt-6">
      <CardContent className="p-5">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Faturas</h2>
        <p className="mt-1 text-[12.5px] text-[var(--color-ink2)]">
          A fatura <strong>aberta</strong> é obrigação prevista: o valor é o acumulado até agora e cresce com as compras. Ao fechar, a mesma fatura passa a firme. Em Contas a Pagar aparece a fatura, nunca as compras.
        </p>
        {comMovimento.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--color-ink4)]">Nenhuma compra no cartão ainda. Lance em Despesas com a forma &quot;Cartão de crédito&quot;.</p>
        ) : (
          <Table wrapperClassName="mt-3" className="min-w-[760px]">
            <THead>
              <tr>
                <TH>Cartão</TH>
                <TH>Fecha</TH>
                <TH>Vence</TH>
                <TH>Estado</TH>
                <TH className="text-right">Compras</TH>
                <TH className="text-right">Valor</TH>
                <TH className="text-right">Pago</TH>
                <TH className="text-right">Saldo</TH>
              </tr>
            </THead>
            <tbody>
              {comMovimento.map((f) => {
                const estado = estadoDaFatura(f, hoje);
                const st = statusDaFatura(f, hoje);
                return (
                  <TR key={f.id} className={f.id === aberta ? "bg-[var(--color-surface2)]" : undefined}>
                    <TD className="font-medium text-[var(--color-ink)]">
                      <Link href={`/cartoes?fatura=${f.id}#faturas`} className="hover:underline">
                        {f.cartaoNome}
                      </Link>
                    </TD>
                    <TD className="font-[family-name:var(--font-mono)]">{dateBR(f.fechamento)}</TD>
                    <TD className="font-[family-name:var(--font-mono)]">{dateBR(f.vencimento)}</TD>
                    <TD>
                      <Badge tone={estado === "aberta" ? "info" : tomDoStatus(st)}>{estado === "aberta" ? "aberta · prevista" : st}</Badge>
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">{f.qtdCompras}</TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(f.valorCompras)}</TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(f.valorPago)}</TD>
                    <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">{brl0(saldoDaFatura(f))}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
        {escolhida && (
          <div id="faturas" className="mt-4">
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">
              Compras da fatura {escolhida.cartaoNome} · fecha {dateBR(escolhida.fechamento)}
            </h3>
            <Table wrapperClassName="mt-2" className="min-w-[700px]">
              <THead>
                <tr>
                  <TH>PED</TH>
                  <TH>Descrição</TH>
                  <TH>Fornecedor</TH>
                  <TH>Obra</TH>
                  <TH>Competência</TH>
                  <TH>Parcela</TH>
                  <TH className="text-right">Valor</TH>
                </tr>
              </THead>
              <tbody>
                {compras.map((c) => (
                  <TR key={c.parcelaId}>
                    <TD className="font-[family-name:var(--font-mono)]">
                      <Link href={`/despesas?proj=${c.projectId}&tab=lancamentos&edit=${c.despesaId}`} className="text-[var(--color-accent2)] hover:underline">
                        {c.numDoc ?? "—"}
                      </Link>
                    </TD>
                    <TD>{c.descricao ?? "—"}</TD>
                    <TD>{c.fornecedorNome ?? "—"}</TD>
                    <TD>{c.projectName}</TD>
                    <TD className="font-[family-name:var(--font-mono)]">{c.competencia ?? "—"}</TD>
                    <TD className="font-[family-name:var(--font-mono)]">{c.numero}/{c.total}</TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(c.valor)}</TD>
                  </TR>
                ))}
                {compras.length === 0 && (
                  <TR>
                    <TD colSpan={7} className="py-4 text-center text-[var(--color-ink4)]">Sem compras nesta fatura.</TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
