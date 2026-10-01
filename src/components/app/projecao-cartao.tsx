import type { CartaoView, FaturaCartaoView } from "@/lib/queries";
import { cicloAberto } from "@/lib/calc/cartao-ciclo";
import { projecaoDoCiclo, rotativoParaOCiclo } from "@/lib/calc/fatura";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Projeção da próxima fatura (Prompt U, seção 4), por cartão ativo: compras
 * já lançadas no ciclo, parcelas de compras anteriores, rotativo anterior e o
 * total projetado. O juro só aparece com taxa cadastrada (BU-3), sempre como
 * ESTIMATIVA (4.2), e nunca entra no valor de Contas a Pagar (4.3).
 */
export function ProjecaoCartao({ cartoes, faturas, hoje }: { cartoes: CartaoView[]; faturas: FaturaCartaoView[]; hoje: string }) {
  const ativos = cartoes.filter((c) => c.ativo);
  if (ativos.length === 0) return null;
  return (
    <Card className="mt-6">
      <CardContent className="p-5">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Próxima fatura — ciclo em curso</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 min-[1180px]:grid-cols-3">
          {ativos.map((c) => {
            const ciclo = cicloAberto(hoje, c);
            const doCartao = faturas.filter((x) => x.cartaoId === c.id);
            const f = ciclo ? doCartao.find((x) => x.fechamento === ciclo.fechamento) : null;
            // O rotativo do ciclo aberto: o que as faturas anteriores pagas parcialmente deixaram (mesmo cálculo da lista).
            const rotativo = ciclo ? rotativoParaOCiclo(doCartao, ciclo.fechamento, hoje) : 0;
            const p = projecaoDoCiclo({ comprasDoCiclo: f?.valorNovas ?? 0, parcelasAnteriores: f?.valorParceladas ?? 0, rotativoAnterior: rotativo, taxaRotativo: c.taxaRotativo });
            return (
              <div key={c.id} className="rounded-[12px] border border-[var(--color-line)] p-3 text-[12.5px]">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-[var(--color-ink)]">{c.apelido}{c.ultimos4 ? ` •••• ${c.ultimos4}` : ""}</strong>
                  {ciclo && <Badge tone="info">fecha {dateBR(ciclo.fechamento)} · vence {dateBR(ciclo.vencimento)}</Badge>}
                </div>
                <dl className="mt-2 space-y-1 text-[var(--color-ink2)]">
                  <Linha rotulo="Compras lançadas no ciclo" valor={p.comprasDoCiclo} />
                  <Linha rotulo="Parcelas de compras anteriores" valor={p.parcelasAnteriores} />
                  <Linha rotulo="Rotativo da fatura anterior" valor={p.rotativoAnterior} />
                  <Linha rotulo="Total previsto (é o que Contas a Pagar mostra)" valor={p.totalPrevisto} forte />
                  {p.juroEstimado == null ? (
                    <div className="text-[11.5px] text-[var(--color-ink4)]">Sem taxa de rotativo cadastrada: a tela não projeta juro.</div>
                  ) : (
                    <>
                      <Linha rotulo={`Juro do rotativo — ESTIMATIVA (${c.taxaRotativo}% a.m.)`} valor={p.juroEstimado} />
                      <Linha rotulo="Total projetado com a estimativa" valor={p.totalProjetado} forte />
                      <div className="text-[11px] text-[var(--color-ink4)]">A estimativa não entra em Contas a Pagar nem gera lançamento: por isso os dois totais diferem.</div>
                    </>
                  )}
                </dl>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: number; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={forte ? "font-medium text-[var(--color-ink)]" : undefined}>{rotulo}</dt>
      <dd className={`font-[family-name:var(--font-mono)] ${forte ? "font-semibold text-[var(--color-ink)]" : ""}`}>{brl0(valor)}</dd>
    </div>
  );
}
