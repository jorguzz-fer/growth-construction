"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AnaliseDeOrcamento, Apontamento } from "@/lib/orcamento-analise";
import type { OrigemDaReprojecao, PropostaDeReprojecao } from "@/lib/previsao-reprojecao";
import { resumoDaProposta } from "@/lib/previsao-reprojecao";
import { criarRevisaoComReprojecao, proporReprojecao } from "@/lib/actions/previsao-assistente";
import { brl0, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Faisca } from "@/components/app/assistente-funcionarios";

/**
 * Assistente de Orçamentos / Previsão Atualizada (Prompt D, seção 6, BD-3;
 * Prompt F, seção 8).
 *
 * Em Orçamentos é SOMENTE LEITURA: recebe o resultado da análise feita no
 * servidor sobre a versão em tela e só mostra frases; não importa action de
 * escrita. Em Previsão Atualizada ele também PROPÕE a reprojeção (8.1): a
 * proposta é uma comparação antes/depois por conta (8.2); ao confirmar, uma
 * REVISÃO NOVA é criada pelo caminho que já existe e a aberta fica intacta
 * (8.3); estouro de 100% é sinalizado antes (8.4). Por isso o selo lá é
 * "Propõe, você confirma", não "Somente leitura" (8.5). Nunca exclui revisão,
 * troca situação nem altera total por conta.
 */
type Acao = "revisar" | "distribuicao" | "comparar" | "desvios" | "reprojetar";

export function AssistenteOrcamento({ usuario, tela, analise, reprojecao }: { usuario: string; tela: "budget" | "forecast"; analise: AnaliseDeOrcamento; reprojecao?: { versionId: string; canCriar: boolean; temOrigem: boolean } }) {
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
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">Assistente IA <Badge tone="neutral">{tela === "forecast" && reprojecao ? "Propõe, você confirma" : "Somente leitura"}</Badge></div>
          <div className="text-[12px] text-[var(--color-ink2)]">{tela === "budget" ? "Orçamentos" : "Previsão Atualizada"} · análise da versão em tela</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden><path d="M9 6l6 6-6 6" /></svg></button>
      </div>
      <div className="space-y-2">
        <Acao cor="#FFF1DB" cor2="#B45309" d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" titulo={tela === "forecast" ? "Revisar previsão" : "Revisar orçamento"} descricao="Analisa a estrutura e identifica pontos de atenção" contador={atencao(analise.revisar)} aberta={aberta === "revisar"} onClick={() => a("revisar")}>
          <Lista itens={analise.revisar} />
        </Acao>
        <Acao cor="#E8F1FB" cor2="#2563EB" d="M3 3v18h18M7 14l4-4 4 4 5-6" titulo="Analisar distribuição" descricao="Avalia a distribuição mensal de receitas e despesas" contador={atencao(analise.distribuicao)} aberta={aberta === "distribuicao"} onClick={() => a("distribuicao")}>
          <Lista itens={analise.distribuicao} />
        </Acao>
        <Acao cor="#EAE6FB" cor2="#6D4BD1" d="M4 6h16M4 12h16M4 18h10" titulo={tela === "forecast" ? "Comparar com o orçamento" : "Comparar Orçamento × Previsão"} descricao="Destaca as principais variações entre cenários" contador={0} aberta={aberta === "comparar"} onClick={() => a("comparar")}>
          <Lista itens={analise.comparar} />
        </Acao>
        <Acao cor="#FDE6E9" cor2="#C0334A" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" titulo="Explicar desvios" descricao="Aponta possíveis causas para diferenças nos valores" contador={atencao(analise.desvios)} aberta={aberta === "desvios"} onClick={() => a("desvios")}>
          <Lista itens={analise.desvios} />
        </Acao>
        {tela === "forecast" && reprojecao && (
          <Acao cor="#E6F4EA" cor2="#1E7A3C" d="M4 4v6h6M20 20v-6h-6M20 9a8 8 0 00-14.5-3M4 15a8 8 0 0014.5 3" titulo="Reprojetar em uma revisão nova" descricao="Partir do Orçamento ou do realizado — a revisão aberta não muda" contador={0} aberta={aberta === "reprojetar"} onClick={() => a("reprojetar")}>
            <Reprojecao {...reprojecao} />
          </Acao>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">
        {tela === "forecast" && reprojecao
          ? "Ele propõe, você confirma: a reprojeção só vira revisão nova pelo seu clique, com o seu nome para ela. Nunca exclui revisão, troca situação nem altera total por conta."
          : "Somente leitura: nenhuma informação é alterada. O assistente só lê a versão em tela; lançar e salvar continuam sendo seus."}
      </p>
    </aside>
  );
}

/** 8.1–8.4: a proposta como comparação, e a confirmação que cria a revisão nova. */
function Reprojecao({ versionId, canCriar, temOrigem }: { versionId: string; canCriar: boolean; temOrigem: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [origem, setOrigem] = useState<OrigemDaReprojecao | null>(null);
  const [proposta, setProposta] = useState<PropostaDeReprojecao | null>(null);
  const [nome, setNome] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const propor = (o: OrigemDaReprojecao) =>
    start(async () => {
      setMsg(null);
      setProposta(null);
      setOrigem(o);
      const r = await proporReprojecao(versionId, o);
      if (!r.ok) return setMsg({ ok: false, texto: r.error });
      setProposta(r.proposta);
    });
  const confirmar = () =>
    start(async () => {
      if (!origem) return;
      setMsg(null);
      const r = await criarRevisaoComReprojecao(versionId, origem, nome);
      if (!r.ok) return setMsg({ ok: false, texto: r.error });
      setMsg({ ok: true, texto: `Revisão “${nome}” criada com a sua confirmação.${r.aviso ? ` ${r.aviso}` : ""}` });
      setProposta(null);
      setNome("");
      const params = new URLSearchParams(window.location.search);
      params.set("v", r.id);
      params.delete("cmp");
      router.push(`/forecast?${params.toString()}`);
    });
  const li = "text-[12px] text-[var(--color-ink2)]";
  const mudadas = proposta?.contas.filter((c) => c.mudou) ?? [];
  return (
    <div className="space-y-2" data-reprojecao>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending || !temOrigem} title={temOrigem ? "Copiar a distribuição mensal do Orçamento de origem" : "Esta previsão não tem Orçamento de origem registrado"} onClick={() => propor("orcamento")}>Partir do Orçamento</Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} title="Despesas da versão Atual nas competências decorridas; o restante por igual nos meses futuros" onClick={() => propor("realizado")}>Partir do realizado</Button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-[8px] px-2 py-1 text-[11.5px] ${msg.ok ? "bg-[var(--color-success)]/10 text-[var(--color-success)]" : "bg-[var(--color-danger)]/10 text-[var(--color-danger)]"}`}>{msg.texto}</p>}
      {pending && !proposta && <p className={li}>Calculando…</p>}
      {proposta && (
        <div className="space-y-1.5">
          <p className={li}>{resumoDaProposta(proposta, brl0)}</p>
          {mudadas.length === 0 ? <p className={li}>Nada muda em relação à revisão aberta.</p> : (
            <ul className="space-y-1">
              {mudadas.map((c) => (
                <li key={`${c.bloco}|${c.rowKey}`} className={li}>
                  <span className="font-medium text-[var(--color-ink)]">{c.label}</span> · {c.mesesAlterados.length} competência(s) mudam · variação {brl0(c.variacao)}
                  {c.estouro != null && <Badge tone="danger" className="ml-1">realizado passa o total em {brl0(c.estouro)}</Badge>}
                  <span className="block text-[11px] text-[var(--color-ink3)]">{c.mesesAlterados.slice(0, 4).map((m) => `${m}: ${c.antes[m]}% → ${c.depois[m]}%`).join(" · ")}{c.mesesAlterados.length > 4 ? " · …" : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {canCriar && mudadas.length > 0 && proposta.estouros === 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da revisão nova (obrigatório)" aria-label="Nome da revisão nova" className="h-8 w-56 text-xs" disabled={pending} />
              <Button type="button" size="sm" disabled={pending || !nome.trim()} onClick={confirmar}>Criar revisão com esta proposta</Button>
            </div>
          )}
          {proposta.estouros > 0 && <p className="text-[11.5px] text-[var(--color-danger)]">Com estouro a distribuição passaria de 100% e o salvamento recusaria: ajuste o total no Orçamento e crie a previsão a partir dele.</p>}
          {!canCriar && <p className={li}>Sem permissão de criar revisão: a proposta fica só como leitura.</p>}
        </div>
      )}
    </div>
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
