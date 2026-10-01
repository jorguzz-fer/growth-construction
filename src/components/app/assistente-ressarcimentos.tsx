"use client";

import { useEffect, useState } from "react";
import type { AnaliseDeRessarcimentos } from "@/lib/ressarcimento-analise";
import { cn, brl0 } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Painel do assistente de Ressarcimentos (Prompt T, seção 10; Prompt E).
 * SOMENTE LEITURA: esta tela opera dinheiro, e nenhuma operação dela é
 * adequada a gravação assistida. Analisa o que a página carregou, em código
 * puro (`ressarcimento-analise.ts`); nada vai a modelo; nenhum dado bancário
 * ou chave PIX chega aqui (12d).
 *
 * Nunca: registrar ressarcimento, compensar, cancelar ou conceder papel de
 * pagador. O usuário decide nos cards da tela.
 */

type Acao = "aging" | "encontros" | "conferir" | "concentracao";

export function AssistenteRessarcimentos({ usuario, analise }: { usuario: string; analise: AnaliseDeRessarcimentos }) {
  const chave = `gt:assistente:ressarcimentos:recolhido:${usuario}`;
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
      /* preferência não persiste */
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

  const { aging, encontros, conferir, concentracao, totalObrigacoes } = analise;
  const li = "text-[12px] text-[var(--color-ink2)]";
  const nome = "font-medium text-[var(--color-ink)]";
  const nada = (t: string) => <p className="text-[12px] text-[var(--color-ink2)]">{totalObrigacoes === 0 ? "Nenhuma obrigação em aberto." : t}</p>;
  const comAtraso = aging.filter((a) => a.acimaDe30 > 0).length;
  const alternarAcao = (a: Acao) => setAberta(aberta === a ? null : a);

  return (
    <aside aria-label="Assistente de Ressarcimentos" className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="neutral">Somente leitura</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Ressarcimentos · {totalObrigacoes} obrigação(ões) em aberto</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        <AcaoDoPainel cor="#FFF1DB" icone={<Icone cor="#B45309" d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />} titulo="Aging por terceiro" descricao="Quanto está em aberto há mais de 30, 60 e 90 dias" contador={comAtraso} aberta={aberta === "aging"} onClick={() => alternarAcao("aging")}>
          {aging.length === 0 ? nada("Nada em aberto.") : (
            <ul className="space-y-2">
              {aging.map((a) => (
                <li key={a.terceiro} className={li}>
                  <span className={nome}>{a.terceiro}</span> · {brl0(a.total)} em aberto
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Faixa rotulo="até 30" valor={a.faixas.ate30} tom="neutral" />
                    <Faixa rotulo="31–60" valor={a.faixas.de31a60} tom="info" />
                    <Faixa rotulo="61–90" valor={a.faixas.de61a90} tom="warning" />
                    <Faixa rotulo="+90" valor={a.faixas.acima90} tom="danger" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#E6F4EA" icone={<Icone cor="#1E7A3C" d="M4 7h16M4 7l3-3M4 7l3 3M20 17H4m16 0l-3-3m3 3l-3 3" />} titulo="Encontro de contas disponível" descricao="Terceiros com saldo nos dois lados que ainda não compensaram" contador={encontros.length} aberta={aberta === "encontros"} onClick={() => alternarAcao("encontros")}>
          {encontros.length === 0 ? nada("Ninguém tem saldo nos dois lados ao mesmo tempo.") : (
            <ul className="space-y-1.5">
              {encontros.map((e) => (
                <li key={e.terceiro} className={li}>
                  <span className={nome}>{e.terceiro}</span>: a empresa deve {brl0(e.aRestituir)} e ele deve {brl0(e.aRepassar)} — um encontro abateria {brl0(e.compensavel)}.
                </li>
              ))}
              <li className="text-[11px] text-[var(--color-ink3)]">A compensação é registrada no card de encontro de contas, por você.</li>
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#FDE6E9" icone={<Icone cor="#C0334A" d="M12 9v4m0 4h.01M10.3 3.9L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />} titulo="Conferir obrigações" descricao="Sem previsão, sem pagador identificado ou restituído a mais que o devido" contador={conferir.length} aberta={aberta === "conferir"} onClick={() => alternarAcao("conferir")}>
          {conferir.length === 0 ? nada("Todas têm previsão, pagador e saldo coerente.") : (
            <ul className="space-y-1.5">
              {conferir.map((c) => (
                <li key={c.id} className={li}>
                  <span className={nome}>{c.numDoc ?? "sem PED"}</span> · {c.terceiro} · {c.obra} · {brl0(c.valor)}
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {c.motivos.map((m) => <Badge key={m} tone={m === "saldo negativo" ? "danger" : "warning"}>{m}</Badge>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#EAE6FB" icone={<Icone cor="#6D4BD1" d="M11 3a9 9 0 109 9h-9V3zM13 3a9 9 0 019 9h-9V3z" />} titulo="Concentração" descricao="Quem representa a maior parte do saldo devido" contador={concentracao.dominante ? 1 : 0} aberta={aberta === "concentracao"} onClick={() => alternarAcao("concentracao")}>
          {concentracao.totalDevido === 0 ? nada("A empresa não deve nada a terceiros no momento.") : (
            <div className="space-y-1.5">
              {concentracao.dominante && (
                <p className={li}><span className={nome}>{concentracao.dominante.terceiro}</span> concentra {concentracao.dominante.fatia}% dos {brl0(concentracao.totalDevido)} devidos.</p>
              )}
              <ul className="space-y-1">
                {concentracao.principais.map((p) => (
                  <li key={p.terceiro} className={li}>
                    <span className={nome}>{p.terceiro}</span> · {brl0(p.saldo)} · {p.fatia}%
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AcaoDoPainel>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">
        Somente leitura: analisa o que a tela carregou, em código puro. Não registra ressarcimento, não compensa, não cancela e não concede papel; dados bancários e PIX não chegam aqui.
      </p>
    </aside>
  );
}

function Faixa({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: "neutral" | "info" | "warning" | "danger" }) {
  if (valor <= 0) return null;
  return <Badge tone={tom}>{rotulo}: {brl0(valor)}</Badge>;
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
