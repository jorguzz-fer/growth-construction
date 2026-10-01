import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/utils";
import type { CardOrcadoRealizado, TomDaLinha } from "@/lib/calc/orcado-realizado";

const COR: Record<TomDaLinha, string> = {
  bom: "text-[#065f46]",
  alerta: "text-[var(--color-danger)]",
  neutro: "text-[var(--color-ink2)]",
};

/**
 * Card Orçado x Realizado (Prompt B, 18–21), à direita da Localização na
 * visão de um projeto. Quadro de leitura: nada aqui grava. O regime do
 * Realizado está escrito (RG-01); ausência de dado é dita como tal, nunca
 * zero; a cor segue o significado (custo acima de 100% é alerta).
 */
export function OrcadoRealizado({ projectId, card }: { projectId: string; card: CardOrcadoRealizado }) {
  const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
  const val = (v: number | null) => (v == null ? "—" : brl(v));
  return (
    <section aria-label="Orçado x Realizado" className="rounded-[10px] border border-[#e9d5ff] bg-[#faf5ff] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-[family-name:var(--font-mono)] text-[10.5px] uppercase tracking-wide text-[var(--color-ink)]">Orçado x Realizado</h3>
          <p className="text-[11.5px] text-[var(--color-ink3)]">Acompanhe o desempenho financeiro do projeto</p>
        </div>
        <Badge tone="info" title="Custo por competência da despesa; receita pelos recebíveis das vendas, como na DRE. Recebimento efetivo (caixa) não entra aqui.">{card.regime}</Badge>
      </div>
      <table className="mt-2.5 w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--color-ink4)]">
            <th className="py-1 font-normal">Linha</th>
            <th className="py-1 pl-3 text-right font-normal">Orçado</th>
            <th className="py-1 pl-3 text-right font-normal">Realizado</th>
            <th className="py-1 pl-3 text-right font-normal">Execução</th>
          </tr>
        </thead>
        <tbody>
          {card.linhas.map((l) => (
            <tr key={l.chave} className={`border-t border-[#e9d5ff] ${l.chave === "resultado" ? "font-semibold" : ""}`}>
              <td className="py-1.5 text-[var(--color-ink)]">{l.rotulo}</td>
              <td className="py-1.5 pl-3 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink)]">{card.semOrcamento ? <span className="text-[var(--color-ink4)]">—</span> : val(l.orcado)}</td>
              <td className="py-1.5 pl-3 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink)]">{card.semLancamentos ? <span className="text-[var(--color-ink4)]">—</span> : val(l.realizado)}</td>
              <td className={`py-1.5 pl-3 text-right font-[family-name:var(--font-mono)] ${COR[l.tom]}`} data-tom={l.tom}>
                {pct(l.execucao)}
                {l.tom === "alerta" && l.chave === "custo" && <span className="ml-1 text-[10px]" title="Custo acima do orçado">▲</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 space-y-0.5 text-[11.5px] text-[var(--color-ink3)]">
        {card.semOrcamento && (
          <p>
            <strong className="text-[var(--color-ink2)]">Sem orçamento lançado.</strong> Lance em <Link href={`/budget?proj=${projectId}`} className="text-[var(--color-accent2)] hover:underline">Orçamentos</Link>.
          </p>
        )}
        {card.semLancamentos && (
          <p>
            <strong className="text-[var(--color-ink2)]">Sem lançamentos na versão Atual</strong> — nenhuma despesa por competência nem venda de unidade.
          </p>
        )}
        {!card.semLancamentos && card.linhas[0].realizado === 0 && <p>Sem receita reconhecida: a receita por competência nasce das unidades vendidas (plano de recebíveis).</p>}
        <p>
          Custos e despesas = tudo o que a DRE deduz. Contas a receber lançadas à mão não têm competência e ficam fora.{" "}
          <Link href={`/dre?proj=${projectId}`} className="text-[var(--color-accent2)] hover:underline">Ver a DRE</Link>
        </p>
      </div>
    </section>
  );
}
