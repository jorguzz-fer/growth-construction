"use client";

import { useEffect, useState } from "react";
import type { AnaliseDeOrcamento, Apontamento } from "@/lib/orcamento-analise";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Faisca } from "@/components/app/assistente-funcionarios";

/**
 * Assistente de Orçamentos / Previsão Atualizada (Prompt D, seção 6; BD-3).
 * SOMENTE LEITURA: recebe o resultado da análise feita no servidor sobre a
 * versão que a página carregou (projeto e versão validados contra o tenant
 * lá, 6.5) e só mostra frases. Não importa nenhuma action; nenhuma
 * informação é alterada. "Construir orçamento por texto ou voz" fica fora.
 */
type Acao = "revisar" | "distribuicao" | "comparar" | "desvios";

export function AssistenteOrcamento({ usuario, tela, analise }: { usuario: string; tela: "budget" | "forecast"; analise: AnaliseDeOrcamento }) {
  const chave = `gt:assistente:${tela}:recolhido:${usuario}`;
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
      /* não persiste */
    }
  };
  if (recolhido) {
    return (
      <aside className="shrink-0 min-[1180px]:sticky min-[1180px]:top-20">
        <button type="button" onClick={alternar} aria-expanded={false} aria-label="Abrir o assistente" className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--color-line)] bg-white shadow-sm hover:bg-[var(--color-surface2)]"><Faisca /></button>
      </aside>
    );
  }
  const a = (x: Acao) => setAberta(aberta === x ? null : x);
  const atencao = (xs: Apontamento[]) => xs.filter((x) => x.nivel === "atencao").length;
  return (
    <aside aria-label="Assistente de Orçamentos" className="w-full shrink-0 rounded-[16px] border border-[#e9d5ff] bg-[#fcfaff] p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">Assistente IA <Badge tone="neutral">Somente leitura</Badge></div>
          <div className="text-[12px] text-[var(--color-ink2)]">{tela === "budget" ? "Orçamentos" : "Previsão Atualizada"} · análise da versão em tela</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden><path d="M9 6l6 6-6 6" /></svg></button>
      </div>
      <div className="space-y-2">
        <Acao cor="#FFF1DB" cor2="#B45309" d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" titulo="Revisar orçamento" descricao="Analisa a estrutura e identifica pontos de atenção" contador={atencao(analise.revisar)} aberta={aberta === "revisar"} onClick={() => a("revisar")}>
          <Lista itens={analise.revisar} />
        </Acao>
        <Acao cor="#E8F1FB" cor2="#2563EB" d="M3 3v18h18M7 14l4-4 4 4 5-6" titulo="Analisar distribuição" descricao="Avalia a distribuição mensal de receitas e despesas" contador={atencao(analise.distribuicao)} aberta={aberta === "distribuicao"} onClick={() => a("distribuicao")}>
          <Lista itens={analise.distribuicao} />
        </Acao>
        <Acao cor="#EAE6FB" cor2="#6D4BD1" d="M4 6h16M4 12h16M4 18h10" titulo="Comparar Orçamento × Previsão" descricao="Destaca as principais variações entre cenários" contador={0} aberta={aberta === "comparar"} onClick={() => a("comparar")}>
          <Lista itens={analise.comparar} />
        </Acao>
        <Acao cor="#FDE6E9" cor2="#C0334A" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" titulo="Explicar desvios" descricao="Aponta possíveis causas para diferenças nos valores" contador={atencao(analise.desvios)} aberta={aberta === "desvios"} onClick={() => a("desvios")}>
          <Lista itens={analise.desvios} />
        </Acao>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">Somente leitura: nenhuma informação é alterada. O assistente só lê a versão em tela; lançar e salvar continuam sendo seus.</p>
    </aside>
  );
}

function Lista({ itens }: { itens: Apontamento[] }) {
  return (
    <ul className="space-y-1">
      {itens.map((x, i) => (
        <li key={i} className={cn("text-[12px]", x.nivel === "atencao" ? "text-[#92400e]" : "text-[var(--color-ink2)]")}>
          {x.texto}
        </li>
      ))}
    </ul>
  );
}

function Acao({ cor, cor2, d, titulo, descricao, contador, aberta, onClick, children }: { cor: string; cor2: string; d: string; titulo: string; descricao: string; contador: number; aberta: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[11px] border border-[var(--color-line)] bg-white", aberta && "bg-[var(--color-surface2)]")}>
      <button type="button" onClick={onClick} aria-expanded={aberta} className="flex w-full items-center gap-2.5 rounded-[11px] p-2.5 text-left hover:bg-[var(--color-surface2)]">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ background: cor }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor2} strokeWidth="1.9" aria-hidden><path d={d} /></svg></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-ink)]">{titulo}{contador > 0 && <Badge tone="danger">{contador}</Badge>}</span>
          <span className="block text-[11.5px] leading-snug text-[var(--color-ink2)]">{descricao}</span>
        </span>
        <span className="text-[var(--color-ink3)]" aria-hidden>{aberta ? "▾" : "›"}</span>
      </button>
      {aberta && <div className="border-t border-[var(--color-line)] px-3 py-2.5">{children}</div>}
    </div>
  );
}
