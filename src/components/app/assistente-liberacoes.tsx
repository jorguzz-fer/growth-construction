"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnaliseDeLiberacoes, ProblemaDoLancamento } from "@/lib/liberacao-analise";
import { brl, cn, dateBR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Painel do assistente nas Liberações de Obra (Prompt O, seção 6; Prompt E).
 *
 * SOMENTE LEITURA (6.1): analisa e aponta; não lança, não edita, não cancela.
 * Tudo é conta feita no servidor sobre o que a página carregou — nenhum
 * modelo de IA, nada sai do sistema, nada grava. O selo diz exatamente isso.
 *
 * 6.3/6.4 — nunca afirma que um valor foi conferido com o banco, e nunca
 * trata a liberação como receita: é entrada de caixa, comparada com a
 * medição e com o previsto de financiamento (caixa contra caixa).
 */

type Acao = "conferir" | "medicao" | "competencia" | "duplicidade";

const ROTULO_PROBLEMA: Record<ProblemaDoLancamento, string> = {
  valor_invalido: "valor zerado ou negativo",
  data_invalida: "data ausente ou inválida",
  origem_em_branco: "origem em branco",
  pct_fora_de_faixa: "% fora de 0–100",
};

export function AssistenteLiberacoes({ usuario, analise }: { usuario: string; analise: AnaliseDeLiberacoes }) {
  const chave = `gt:assistente:liberacoes:recolhido:${usuario}`;
  const [recolhido, setRecolhido] = useState(false);
  const [aberta, setAberta] = useState<Acao | null>(null);

  useEffect(() => {
    try {
      setRecolhido(window.localStorage.getItem(chave) === "1");
    } catch {
      /* sem localStorage: fica expandido */
    }
  }, [chave]);

  const alternar = () => {
    const proximo = !recolhido;
    setRecolhido(proximo);
    try {
      window.localStorage.setItem(chave, proximo ? "1" : "0");
    } catch {
      /* preferência não persiste; a tela continua funcionando */
    }
  };

  if (recolhido) {
    return (
      <aside className="shrink-0 min-[1180px]:sticky min-[1180px]:top-20">
        <button type="button" onClick={alternar} aria-expanded={false} aria-label="Abrir o assistente" title="Abrir o assistente" className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--color-line)] bg-white shadow-sm hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40">
          <Faisca />
        </button>
      </aside>
    );
  }

  const { conferir, medicaoSemLiberacao, liberacaoSemMedicao, porCompetencia, duplicidades, total } = analise;
  const nada = (t: string) => <p className="text-[12px] text-[var(--color-ink2)]">{total === 0 ? "Nenhuma liberação nesta versão." : t}</p>;
  const link = (id: string, rotulo: string) => (
    <Link href={`/reembolso/${id}`} className="font-medium text-[var(--color-accent2)] hover:underline">
      {rotulo}
    </Link>
  );
  const comparacoes = medicaoSemLiberacao.length + liberacaoSemMedicao.length;

  return (
    <aside aria-label="Assistente das Liberações de Obra" className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="neutral">Somente leitura</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Liberações de obra · entrada de caixa</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        <AcaoDoPainel cor="#FDE6E9" icone={<Icone cor="#C0334A" d="M12 7.5v5M12 16h.01M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" />} titulo="Conferir lançamentos" descricao="Valor zerado ou negativo, data ausente ou inválida, origem em branco" contador={conferir.length} aberta={aberta === "conferir"} onClick={() => setAberta(aberta === "conferir" ? null : "conferir")}>
          {conferir.length === 0 ? (
            nada("Nenhum lançamento com problema de cadastro.")
          ) : (
            <ul className="space-y-1.5">
              {conferir.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  {c.problemas.map((p) => (
                    <Badge key={p} tone="warning">
                      {ROTULO_PROBLEMA[p]}
                    </Badge>
                  ))}
                  {link(c.id, c.rotulo)}
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#E7EDFD" icone={<Icone cor="#2B5CD9" d="M4 18l5-6 4 3 7-9M3 21h18" />} titulo="Comparar com a medição" descricao="Competências com medição e sem liberação, e o contrário" contador={comparacoes} aberta={aberta === "medicao"} onClick={() => setAberta(aberta === "medicao" ? null : "medicao")}>
          {comparacoes === 0 ? (
            nada("Toda competência com medição tem liberação, e toda liberação tem medição.")
          ) : (
            <div className="space-y-2 text-[12px]">
              {medicaoSemLiberacao.length > 0 && (
                <div>
                  <div className="font-medium text-[var(--color-ink)]">Medição lançada, sem liberação</div>
                  <ul className="list-disc pl-4 text-[var(--color-ink2)]">
                    {medicaoSemLiberacao.map((c) => (
                      <li key={c.competencia}>
                        {c.competencia} · medição <span className="font-[family-name:var(--font-mono)]">{brl(c.medicao)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {liberacaoSemMedicao.length > 0 && (
                <div>
                  <div className="font-medium text-[var(--color-ink)]">Liberação sem medição na competência</div>
                  <ul className="list-disc pl-4 text-[var(--color-ink2)]">
                    {liberacaoSemMedicao.map((c) => (
                      <li key={c.competencia}>
                        {c.competencia} · liberado <span className="font-[family-name:var(--font-mono)]">{brl(c.liberado)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#E6F4EA" icone={<Icone cor="#1E7A3C" d="M4 20V10M10 20V4M16 20v-8M22 20H2" />} titulo="Liberações por competência" descricao="O que entrou mês a mês e o acumulado, contra o financiamento previsto das unidades vendidas" contador={0} aberta={aberta === "competencia"} onClick={() => setAberta(aberta === "competencia" ? null : "competencia")}>
          {porCompetencia.meses.length === 0 ? (
            nada("Nenhuma liberação com data válida.")
          ) : (
            <div className="text-[12px]">
              <table className="w-full border-collapse">
                <thead className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase text-[var(--color-ink3)]">
                  <tr>
                    <th className="py-1">Mês</th>
                    <th className="py-1 text-right">Entrou</th>
                    <th className="py-1 text-right">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {porCompetencia.meses.map((m) => (
                    <tr key={m.competencia} className="border-t border-[var(--color-line)]">
                      <td className="py-1">{m.competencia}</td>
                      <td className="py-1 text-right font-[family-name:var(--font-mono)]">{brl(m.liberado)}</td>
                      <td className="py-1 text-right font-[family-name:var(--font-mono)]">{brl(m.acumulado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[var(--color-ink2)]">
                Financiamento previsto das unidades vendidas: <span className="font-[family-name:var(--font-mono)]">{brl(porCompetencia.previstoFinanciamento)}</span>
                {porCompetencia.percentualLiberado != null ? ` · liberado ${porCompetencia.percentualLiberado}%` : " · sem financiamento previsto no plano das vendas"}
              </p>
            </div>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#F3EFFE" icone={<Icone cor="#6D4BD1" d="M4 7h7v10H4zM13 7h7v10h-7z" />} titulo="Duplicidade aparente" descricao="Mesmo valor, mesma data e mesma origem lançados mais de uma vez" contador={duplicidades.length} aberta={aberta === "duplicidade"} onClick={() => setAberta(aberta === "duplicidade" ? null : "duplicidade")}>
          {duplicidades.length === 0 ? (
            nada("Nenhum lançamento repetido.")
          ) : (
            <ul className="space-y-1.5">
              {duplicidades.map((d) => (
                <li key={`${d.data}|${d.origem}|${d.valor}`} className="text-[12px]">
                  <span className="text-[var(--color-ink2)]">
                    {dateBR(d.data)} · {d.origem || "sem origem"} · <span className="font-[family-name:var(--font-mono)]">{brl(d.valor)}</span> · {d.ids.length}×
                  </span>{" "}
                  {d.ids.map((id, i) => (
                    <span key={id}>
                      {link(id, `#${i + 1}`)}{" "}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">
        As análises são feitas sobre as liberações desta versão, aqui no sistema. Nada é alterado por aqui: para corrigir, abra a liberação. A liberação é
        entrada de caixa, comparada só com a medição e com o financiamento previsto — o assistente não a soma a nenhum total de resultado ou margem, e não
        afirma que um valor foi conferido com o banco.
      </p>
    </aside>
  );
}

function Icone({ cor, d }: { cor: string; d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="1.9" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function AcaoDoPainel({ cor, icone, titulo, descricao, contador, aberta, onClick, children }: { cor: string; icone: React.ReactNode; titulo: string; descricao: string; contador: number; aberta: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[11px] border border-[var(--color-line)]", aberta && "bg-[var(--color-surface2)]")}>
      <button type="button" onClick={onClick} aria-expanded={aberta} className="flex w-full items-center gap-2.5 rounded-[11px] p-2.5 text-left hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ background: cor }}>
          {icone}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-ink)]">
            {titulo}
            {contador > 0 && <Badge tone="danger">{contador}</Badge>}
          </span>
          <span className="block text-[11.5px] leading-snug text-[var(--color-ink2)]">{descricao}</span>
        </span>
        <span className="text-[var(--color-ink3)]" aria-hidden>
          {aberta ? "▾" : "›"}
        </span>
      </button>
      {aberta && <div className="border-t border-[var(--color-line)] px-3 py-2.5">{children}</div>}
    </div>
  );
}

function Faisca() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3z" fill="#6D4BD1" />
      <path d="M18.5 15l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z" fill="#3B82F6" />
    </svg>
  );
}
