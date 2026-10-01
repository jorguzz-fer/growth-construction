"use client";

import { useEffect, useState } from "react";
import {
  REGIME,
  ROTULO_LEITURA,
  fraseDeAbertura,
  type AnaliseDoCenario,
  type AnaliseDoFluxo,
  type Comparacao,
} from "@/lib/fluxo-analise";
import { brl0, cn, pct1 } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Faisca } from "@/components/app/assistente-funcionarios";

/**
 * Painel do assistente no Fluxo de Caixa (Prompt AD, Parte 4).
 * SOMENTE LEITURA: recebe a análise pronta — feita pelas mesmas funções da
 * tabela (4.2) — e só escolhe o que mostrar. Não chama action, não soma, não
 * projeta saldo, não afirma causa e não grava nada.
 */
type Acao = "budget" | "forecast" | "fugiu" | "vencido" | "sem_previsao";

const sinal = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${brl0(Math.abs(n))}`;
const fmt = { pct: (n: number) => pct1(n), brl: (n: number) => brl0(n) };

export function AssistenteFluxo({ usuario, analise }: { usuario: string; analise: AnaliseDoFluxo }) {
  const chave = `gt:assistente:fluxocaixa:recolhido:${usuario}`;
  const [recolhido, setRecolhido] = useState(false);
  const [aberta, setAberta] = useState<Acao | null>(null);
  useEffect(() => {
    try {
      setRecolhido(window.localStorage.getItem(chave) === "1");
    } catch {
      /* sem localStorage */
    }
  }, [chave]);
  const alternar = () => {
    const p = !recolhido;
    setRecolhido(p);
    try {
      window.localStorage.setItem(chave, p ? "1" : "0");
    } catch {
      /* preferência não persiste */
    }
  };
  if (recolhido) {
    return (
      <div className="flex justify-end">
        <button type="button" onClick={alternar} aria-expanded={false} aria-label="Abrir o assistente" className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--color-line)] bg-white shadow-sm hover:bg-[var(--color-surface2)]">
          <Faisca />
        </button>
      </div>
    );
  }
  const orc = analise.cenarios.find((c) => c.cenario === "budget");
  const prev = analise.cenarios.find((c) => c.cenario === "forecast");
  // A frase sai do Orçamento; sem ele, da Previsão; sem nenhum, diz isso.
  const principal = orc && !orc.ausente ? orc : prev && !prev.ausente ? prev : orc ?? prev;
  const toggle = (a: Acao) => setAberta(aberta === a ? null : a);
  const nada = (t: string) => <p className="text-[12px] text-[var(--color-ink2)]">{t}</p>;
  const comparaveis = analise.cenarios.filter((c) => c.caixa && c.caixa.total.mesesComparados > 0);

  return (
    <aside aria-label="Assistente do Fluxo de Caixa" data-assistente-fluxo className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="neutral">Somente leitura</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Fluxo de Caixa · caixa contra o plano</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* 4.3 — o convite já traz o achado. */}
      {principal && (
        <p className="mb-2 text-[13px] leading-snug text-[var(--color-ink)]" data-frase>
          {fraseDeAbertura(principal, analise.periodo, fmt)}
        </p>
      )}
      <p className="mb-3 text-[11px] leading-snug text-[var(--color-ink3)]">
        Período: {analise.periodo} ({analise.origemDoPeriodo}). {REGIME.caixa_x_plano}
        {analise.avisoDoRealizado && <> {analise.avisoDoRealizado}</>}
      </p>

      <div className="space-y-2">
        {[orc, prev].map((c) =>
          c ? (
            <Acao
              key={c.cenario}
              cor={c.cenario === "budget" ? "#E7EDFD" : "#F1E8FD"}
              cor2={c.cenario === "budget" ? "#2B5CD9" : "#7A3FD1"}
              d="M4 19V9m6 10V5m6 14v-7m4 7H2"
              titulo={`Comparar com ${c.cenario === "budget" ? "o" : "a"} ${c.nome}`}
              descricao={c.ausente ? `Indisponível: ${c.ausente}` : "Mês a mês, os maiores desvios em cima"}
              desabilitada={!!c.ausente}
              aberta={aberta === c.cenario}
              onClick={() => toggle(c.cenario)}
            >
              <CenarioDetalhe c={c} />
            </Acao>
          ) : null,
        )}

        <Acao cor="#FDE6E9" cor2="#C0334A" d="M3 17l6-6 4 4 8-8M14 7h7v7" titulo="Onde o caixa fugiu do plano" descricao="Os meses de maior desvio" desabilitada={comparaveis.length === 0} aberta={aberta === "fugiu"} onClick={() => toggle("fugiu")}>
          {comparaveis.length === 0 ? (
            nada("Nenhum mês tem caixa realizado e plano ao mesmo tempo.")
          ) : (
            <div className="space-y-2 text-[12px] text-[var(--color-ink2)]">
              {comparaveis.map((c) => (
                <div key={c.cenario}>
                  <p className="font-medium text-[var(--color-ink)]">Contra {c.nome}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {c.caixa!.ordenadas.slice(0, 3).map((m) => (
                      <li key={m.mm}>
                        {m.mm}: {sinal(m.valor)}
                        {m.pct != null && ` (${m.pct > 0 ? "+" : ""}${pct1(m.pct)})`}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-[11px] text-[var(--color-ink3)]">
                As contas que puxaram cada mês não estão na tabela; o assistente só mostra número que a tela mostra. O porquê do desvio é seu: o assistente aponta onde e quanto, não a causa.
              </p>
            </div>
          )}
        </Acao>

        <Acao cor="#FFF4E0" cor2="#B7791F" d="M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" titulo="O que já aconteceu e continua previsto" descricao="Meses fechados que seguem com previsto" contador={analise.vencidos.length} aberta={aberta === "vencido"} onClick={() => toggle("vencido")}>
          {analise.vencidos.length === 0 ? (
            nada("No período, nenhum mês já fechado segue com previsto.")
          ) : (
            <div className="text-[12px] text-[var(--color-ink2)]">
              <ul className="space-y-0.5">
                {analise.vencidos.map((v) => (
                  <li key={v.mm}>
                    {v.mm}: previsto {brl0(v.previsto)} <span className="text-[var(--color-ink3)]">(já venceu)</span> · realizado {brl0(v.realizado)}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-[var(--color-ink3)]">
                O previsto desses meses ({analise.referencia}) já venceu e continua somado nos totais de entradas e saídas. Para o mês fechado, o número que aconteceu é o realizado.
              </p>
            </div>
          )}
        </Acao>

        <Acao cor="#E3F6EC" cor2="#1F8A4C" d="M12 3v18M3 12h18" titulo="Movimento sem previsão" descricao="Caixa em meses que o plano não previa" contador={analise.semPrevisao.length} aberta={aberta === "sem_previsao"} onClick={() => toggle("sem_previsao")}>
          {analise.semPrevisao.length === 0 ? (
            nada("No período, todo mês com caixa realizado também tem previsto.")
          ) : (
            <div className="text-[12px] text-[var(--color-ink2)]">
              <ul className="space-y-0.5">
                {analise.semPrevisao.map((m) => (
                  <li key={m.mm}>
                    {m.mm}: entrou {brl0(m.entradas)}, saiu {brl0(m.saidas)}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-[var(--color-ink3)]">
                Esses meses não têm previsto em {analise.referencia}; por isso ficam fora do desvio do período.
              </p>
            </div>
          )}
        </Acao>
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-ink3)]">
        Nada é alterado por este painel. Os números são os mesmos da tabela, calculados pelas mesmas funções.
      </p>
    </aside>
  );
}

function CenarioDetalhe({ c }: { c: AnaliseDoCenario }) {
  return (
    <div className="space-y-2.5 text-[12px] text-[var(--color-ink2)]">
      <p className="text-[11px] text-[var(--color-ink3)]">
        {c.nome}
        {c.versao ? ` ${c.versao}` : ""}.{c.cobertura ? ` ${c.cobertura}` : ""}
      </p>
      {c.caixa && <Leitura comp={c.caixa} />}
      {c.previsao && <Leitura comp={c.previsao} />}
    </div>
  );
}

function Leitura({ comp }: { comp: Comparacao }) {
  const { total, ordenadas, linhas } = comp;
  const soPlano = linhas.filter((l) => l.desvio.estado === "so_previsto").length;
  const soLado = linhas.filter((l) => l.desvio.estado === "so_realizado").length;
  const umLado = { length: soPlano + soLado };
  return (
    <div data-leitura={comp.leitura}>
      <p className="font-medium text-[var(--color-ink)]">{ROTULO_LEITURA[comp.leitura]}</p>
      <p className="text-[11px] text-[var(--color-ink3)]">{REGIME[comp.leitura]}</p>
      {total.mesesComparados === 0 ? (
        <p className="mt-1">Nenhum mês com os dois lados no período.</p>
      ) : (
        <>
          <p className="mt-1">
            Desvio do período: <strong>{sinal(total.valor)}</strong>
            {total.pct != null && ` (${total.pct > 0 ? "+" : ""}${pct1(total.pct)})`} em {total.mesesComparados} mês(es).
          </p>
          <ul className="mt-1 space-y-0.5">
            {ordenadas.map((m) => (
              <li key={m.mm}>
                {m.mm}: {sinal(m.valor)}
                {m.pct != null && ` (${m.pct > 0 ? "+" : ""}${pct1(m.pct)})`}
              </li>
            ))}
          </ul>
        </>
      )}
      {umLado.length > 0 && (
        <p className="mt-1 text-[11px] text-[var(--color-ink3)]">
          {umLado.length} mês(es) com um lado só não entram no desvio
          {soPlano > 0 && ` · ${soPlano} só com plano`}
          {soLado > 0 && ` · ${soLado} só com ${comp.leitura === "caixa_x_plano" ? "caixa" : "a previsão da Atual"}`}.
        </p>
      )}
    </div>
  );
}

function Acao({ cor, cor2, d, titulo, descricao, contador = 0, desabilitada = false, aberta, onClick, children }: { cor: string; cor2: string; d: string; titulo: string; descricao: string; contador?: number; desabilitada?: boolean; aberta: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[11px] border border-[var(--color-line)]", aberta && !desabilitada && "bg-[var(--color-surface2)]")}>
      <button type="button" onClick={onClick} disabled={desabilitada} aria-expanded={aberta && !desabilitada} className="flex w-full items-center gap-2.5 rounded-[11px] p-2.5 text-left hover:bg-[var(--color-surface2)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ background: cor }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor2} strokeWidth="1.9" aria-hidden>
            <path d={d} />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-ink)]">
            {titulo}
            {contador > 0 && <Badge tone="warning">{contador}</Badge>}
          </span>
          <span className="block text-[11.5px] leading-snug text-[var(--color-ink2)]">{descricao}</span>
        </span>
        {!desabilitada && (
          <span className="text-[var(--color-ink3)]" aria-hidden>
            {aberta ? "▾" : "›"}
          </span>
        )}
      </button>
      {aberta && !desabilitada && <div className="border-t border-[var(--color-line)] px-3 py-2.5">{children}</div>}
    </div>
  );
}
