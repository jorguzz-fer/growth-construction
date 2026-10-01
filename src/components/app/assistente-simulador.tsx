"use client";

import { useEffect, useMemo, useState } from "react";
import type { InccRow, SimulatorInput, SimulatorResult } from "@/lib/calc";
import { compararCenarios, conferirSimulacao, explicarProposta, testarVariacoes } from "@/lib/simulador-analise";
import { brl0, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Painel do assistente do Simulador (Prompt N, seção 5; Prompt E).
 *
 * Nível (BN-1): SOMENTE LEITURA — a tela é calculadora, nada se grava.
 * Tudo é código puro sobre o input e o resultado que a tela já calculou
 * (`simulador-analise.ts`); nenhum dado vai a modelo. A renda é dado
 * sensível (BE-2): só entra na conferência do limite, nunca no texto para o
 * cliente. Nunca afirma aprovação, nunca promete taxa, nunca chama a coluna
 * Obra % de avanço real.
 */

type Acao = "explicar" | "comparar" | "variacoes" | "conferir";

export function AssistenteSimulador({ usuario, input, result, incc }: { usuario: string; input: SimulatorInput; result: SimulatorResult | null; incc: InccRow[] }) {
  const chave = `gt:assistente:simulador:recolhido:${usuario}`;
  const [recolhido, setRecolhido] = useState(false);
  const [aberta, setAberta] = useState<Acao | null>(null);
  const [copiado, setCopiado] = useState(false);

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

  const explicacao = useMemo(() => (result ? explicarProposta(input, result) : []), [input, result]);
  const cenarios = useMemo(() => (result ? compararCenarios(input, incc) : []), [input, result, incc]);
  const variacoes = useMemo(() => (result ? testarVariacoes(input, incc) : []), [input, result, incc]);
  // Tela em branco (3.2): nada a conferir ainda — a validação só faz sentido
  // depois que o usuário começou a preencher.
  const emBranco = input.valorImovel <= 0 && input.mensais <= 0;
  const conferencia = useMemo(() => (emBranco ? [] : conferirSimulacao(input, result, incc)), [input, result, incc, emBranco]);
  const problemas = conferencia.filter((c) => c.nivel !== "info").length;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(explicacao.join("\n"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sem clipboard: o texto continua na tela */
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

  const semSimulacao = <p className="text-[12px] text-[var(--color-ink2)]">Preencha a simulação para o assistente analisar.</p>;
  const mono = "font-[family-name:var(--font-mono)]";

  return (
    <aside aria-label="Assistente do Simulador" className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="neutral">Somente leitura</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Simulador · nada é gravado</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        <AcaoDoPainel cor="#E7EDFD" icone={<Icone cor="#2B5CD9" d="M4 5h16v12H8l-4 4V5zM8 9h8M8 12h5" />} titulo="Explicar a proposta" descricao="Texto para o cliente, a partir do resultado — sem renda, sem aprovação" contador={0} aberta={aberta === "explicar"} onClick={() => setAberta(aberta === "explicar" ? null : "explicar")}>
          {!result ? (
            semSimulacao
          ) : (
            <div className="text-[12px] text-[var(--color-ink2)]">
              <ul className="space-y-1">
                {explicacao.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <button type="button" onClick={copiar} className="mt-2 text-[12px] font-medium text-[var(--color-accent2)] hover:underline">
                {copiado ? "Copiado" : "Copiar texto"}
              </button>
            </div>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#F3EFFE" icone={<Icone cor="#6D4BD1" d="M4 19V9M10 19V5M16 19v-8M20 19H2" />} titulo="Comparar cenários" descricao="SAC × PRICE × SBPE com os mesmos dados" contador={0} aberta={aberta === "comparar"} onClick={() => setAberta(aberta === "comparar" ? null : "comparar")}>
          {!result ? (
            semSimulacao
          ) : (
            <table className="w-full text-[11.5px] text-[var(--color-ink2)]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  <th className="pb-1">Tipo</th>
                  <th className="pb-1 text-right">1ª</th>
                  <th className="pb-1 text-right">Maior</th>
                  <th className="pb-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {cenarios.map((c) => (
                  <tr key={c.tipo} className={c.tipo === input.tipo ? "font-semibold text-[var(--color-ink)]" : undefined}>
                    <td className="py-0.5">{c.tipo}</td>
                    <td className={cn("py-0.5 text-right", mono)}>{brl0(c.primeiraParcela)}</td>
                    <td className={cn("py-0.5 text-right", mono)}>{brl0(c.maiorParcela)}</td>
                    <td className={cn("py-0.5 text-right", mono)}>{brl0(c.totalPago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#FEF3C7" icone={<Icone cor="#B45309" d="M4 12h6M14 12h6M10 8l4 4-4 4" />} titulo="Testar variações" descricao="Entrada, prazo e juros: efeito no total e na maior parcela" contador={0} aberta={aberta === "variacoes"} onClick={() => setAberta(aberta === "variacoes" ? null : "variacoes")}>
          {!result ? (
            semSimulacao
          ) : (
            <ul className="space-y-1 text-[11.5px] text-[var(--color-ink2)]">
              {variacoes.map((v) => (
                <li key={v.rotulo} className="flex items-baseline justify-between gap-2">
                  <span>{v.rotulo}</span>
                  <span className={cn("shrink-0 text-right", mono)}>
                    maior {sinal(v.dMaior)} · total {sinal(v.dTotal)}
                  </span>
                </li>
              ))}
              <li className="pt-1 text-[var(--color-ink3)]">Prévia na premissa de juros da tela; nada aqui é condição de banco.</li>
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#FDE6E9" icone={<Icone cor="#C0334A" d="M12 7.5v5M12 16h.01M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" />} titulo="Conferir a simulação" descricao="Limite de renda, reforços, correção INCC, parcelas" contador={problemas} aberta={aberta === "conferir"} onClick={() => setAberta(aberta === "conferir" ? null : "conferir")}>
          {conferencia.length === 0 ? (
            semSimulacao
          ) : (
            <ul className="space-y-1 text-[11.5px]">
              {conferencia.map((c) => (
                <li key={c.texto} className={c.nivel === "erro" ? "text-[var(--color-danger)]" : c.nivel === "aviso" ? "text-[var(--color-warning)]" : "text-[var(--color-ink2)]"}>
                  {c.nivel === "erro" ? "✕ " : c.nivel === "aviso" ? "⚠ " : "· "}
                  {c.texto}
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">Somente leitura: analisa o que a tela calculou. Não grava, não envia dados a modelo, não aprova crédito.</p>
    </aside>
  );
}

const sinal = (v: number) => (v === 0 ? "=" : `${v > 0 ? "+" : "−"}${brl0(Math.abs(v))}`);

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
