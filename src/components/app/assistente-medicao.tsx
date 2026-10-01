"use client";

import { useEffect, useState, useTransition } from "react";
import type { AnaliseDeMedicoes } from "@/lib/medicao-analise";
import type { ComparacaoDoLaudo } from "@/lib/ai/medicao-doc";
import { lerLaudoDaMedicao } from "@/lib/actions/medicao-assistente";
import { brl, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Faisca } from "@/components/app/assistente-funcionarios";

/**
 * Painel do assistente na Medição de Obra (Prompt V, seção 6; Prompt E).
 *
 * SOMENTE LEITURA (6.1): a medição é declaração técnica com responsabilidade
 * em ART/RRT — nada aqui lança, altera, exclui ou afirma percentual que o
 * engenheiro não declarou (6.3). As análises vêm prontas do servidor; a
 * única action chamada (ler o laudo) também só lê e compara.
 */
type Acao = "sem" | "avanco" | "liberacoes" | "laudo" | "retencao";

export interface LaudoDisponivel {
  medicaoId: string;
  documentId: string;
  rotulo: string;
}

export function AssistenteMedicao({ usuario, analise, laudos, iaDisponivel }: { usuario: string; analise: AnaliseDeMedicoes; laudos: LaudoDisponivel[]; iaDisponivel: boolean }) {
  const chave = `gt:assistente:medicao:recolhido:${usuario}`;
  const [recolhido, setRecolhido] = useState(false);
  const [aberta, setAberta] = useState<Acao | null>(null);
  const [laudo, setLaudo] = useState(laudos[0] ? `${laudos[0].medicaoId}|${laudos[0].documentId}` : "");
  const [leitura, setLeitura] = useState<{ ok: true; comparacao: ComparacaoDoLaudo } | { ok: false; error: string } | null>(null);
  const [lendo, start] = useTransition();

  useEffect(() => {
    try {
      setRecolhido(window.localStorage.getItem(chave) === "1");
    } catch {
      /* sem localStorage: fica expandido */
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

  const { semMedicao, foraDoPrevisto, medicaoSemLiberacao, liberacaoSemMedicao, retencao, temOrcamento, totalMedicoes } = analise;
  const comparacoes = medicaoSemLiberacao.length + liberacaoSemMedicao.length;
  const nada = (t: string) => <p className="text-[12px] text-[var(--color-ink2)]">{t}</p>;
  const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  return (
    <aside aria-label="Assistente da Medição de Obra" className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="neutral">Somente leitura</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Medição de obra · declaração do engenheiro</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        <Acao cor="#FDE6E9" cor2="#C0334A" d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" titulo="Competências sem medição" descricao="Meses da obra, já decorridos, em que nada foi declarado" contador={semMedicao.length} aberta={aberta === "sem"} onClick={() => setAberta(aberta === "sem" ? null : "sem")}>
          {semMedicao.length === 0 ? nada(totalMedicoes === 0 ? "Nenhuma medição lançada ainda." : "Toda competência decorrida tem medição.") : (
            <ul className="flex flex-wrap gap-1.5">
              {semMedicao.map((c) => (
                <li key={c}>
                  <Badge tone="warning">{c}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Acao>

        <Acao cor="#E7EDFD" cor2="#2B5CD9" d="M4 18l5-6 4 3 7-9M3 21h18" titulo="Avanço fora do previsto" descricao="Grupos medidos muito acima ou abaixo do cronograma do Orçamento" contador={foraDoPrevisto.length} aberta={aberta === "avanco"} onClick={() => setAberta(aberta === "avanco" ? null : "avanco")}>
          {!temOrcamento ? nada("Sem versão de Orçamento: não há cronograma para comparar.") : foraDoPrevisto.length === 0 ? nada("Nenhum grupo fora de ±50% do previsto nas competências decorridas.") : (
            <ul className="space-y-1 text-[12px] text-[var(--color-ink2)]">
              {foraDoPrevisto.map((a) => (
                <li key={`${a.competencia}|${a.grupoCode}`}>
                  <span className="font-medium text-[var(--color-ink)]">
                    {a.competencia} · {a.grupoCode} {a.label}
                  </span>
                  : previsto <span className="font-[family-name:var(--font-mono)]">{brl(a.previsto)}</span>, medido <span className="font-[family-name:var(--font-mono)]">{brl(a.medido)}</span> <Badge tone={a.sentido === "acima" ? "warning" : "neutral"}>{a.sentido === "acima" ? "acima" : "abaixo"}{a.razaoPct != null ? ` · ${pct(a.razaoPct)}` : ""}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Acao>

        <Acao cor="#E3F6EC" cor2="#1F8A4C" d="M3 10h18M7 15h2m4 0h4M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" titulo="Comparar com as liberações" descricao="Competências com medição e sem liberação de obra, e o contrário" contador={comparacoes} aberta={aberta === "liberacoes"} onClick={() => setAberta(aberta === "liberacoes" ? null : "liberacoes")}>
          {comparacoes === 0 ? nada("Toda competência com medição tem liberação, e toda liberação tem medição.") : (
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
        </Acao>

        <Acao cor="#F3E8FF" cor2="#6D4BD1" d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" titulo="Ler o laudo anexado" descricao="Extrai grupo e percentual do laudo e aponta divergência com o lançado. Não preenche." contador={0} aberta={aberta === "laudo"} onClick={() => setAberta(aberta === "laudo" ? null : "laudo")}>
          {laudos.length === 0 ? nada("Nenhum laudo de medição anexado (aba Medições lançadas → Documentos).") : !iaDisponivel ? nada("Leitura por IA não configurada (ANTHROPIC_API_KEY).") : (
            <div className="space-y-2 text-[12px]">
              <Select value={laudo} onChange={(e) => setLaudo(e.target.value)} className="h-8 text-xs" aria-label="Laudo a ler">
                {laudos.map((l) => (
                  <option key={l.documentId} value={`${l.medicaoId}|${l.documentId}`}>
                    {l.rotulo}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={lendo || !laudo}
                onClick={() => {
                  const [medicaoId, documentId] = laudo.split("|");
                  setLeitura(null);
                  start(async () => setLeitura(await lerLaudoDaMedicao(medicaoId, documentId)));
                }}
              >
                {lendo ? "Lendo…" : "Ler e comparar"}
              </Button>
              {leitura && !leitura.ok && <p role="alert" className="text-[var(--color-danger)]">{leitura.error}</p>}
              {leitura && leitura.ok && (
                <div className="space-y-1.5">
                  {!leitura.comparacao.competencia.igual && (
                    <p className="text-[#92400e]">
                      Competência do laudo ({leitura.comparacao.competencia.laudo || "não lida"}) difere da medição ({leitura.comparacao.competencia.medicao}).
                    </p>
                  )}
                  <p className="text-[var(--color-ink2)]">
                    {leitura.comparacao.conferem} item(ns) conferem · {leitura.comparacao.divergencias.length} divergência(s)
                  </p>
                  {leitura.comparacao.divergencias.length > 0 && (
                    <ul className="list-disc pl-4 text-[var(--color-ink2)]">
                      {leitura.comparacao.divergencias.map((d, i) => (
                        <li key={i}>
                          <span className="font-medium text-[var(--color-ink)]">{d.grupo ? `Grupo ${d.grupo}` : "Competência"}</span>
                          {d.descricao && d.grupo ? ` (${d.descricao})` : ""}: laudo diz <em>{d.laudo}</em>; lançado <em>{d.lancado}</em>.
                        </li>
                      ))}
                    </ul>
                  )}
                  {leitura.comparacao.observacoes.length > 0 && <p className="text-[var(--color-ink3)]">Observações do laudo: {leitura.comparacao.observacoes.join(" · ")}</p>}
                  <p className="text-[var(--color-ink3)]">O assistente aponta; quem lança ou corrige é o engenheiro, na aba Medições lançadas.</p>
                </div>
              )}
            </div>
          )}
        </Acao>

        <Acao cor="#FFF4E0" cor2="#B7791F" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" titulo="Proximidade da retenção" descricao="A Caixa libera até 95%; daí em diante mede-se sem liberação" contador={retencao.estado === "perto" || retencao.estado === "atingida" ? 1 : 0} aberta={aberta === "retencao"} onClick={() => setAberta(aberta === "retencao" ? null : "retencao")}>
          {retencao.estado === "sem_orcado" ? nada("Sem orçado, não dá para medir a proximidade dos 95%.") : retencao.estado === "atingida" ? (
            <p className="text-[12px] text-[#991b1b]">Medido em {pct(retencao.pctMedido ?? 0)} do orçado: a retenção final já vale. As próximas medições não liberam recurso.</p>
          ) : retencao.estado === "perto" ? (
            <p className="text-[12px] text-[#92400e]">Medido em {pct(retencao.pctMedido ?? 0)} do orçado — faltam {pct(retencao.faltam ?? 0)} para os 95%. A partir daí as liberações cessam até a conclusão.</p>
          ) : (
            nada(`Medido em ${pct(retencao.pctMedido ?? 0)} do orçado; a retenção começa em 95%.`)
          )}
        </Acao>
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-ink3)]">Nada aqui lança, altera ou exclui medição, nem afirma percentual que o engenheiro não declarou.</p>
    </aside>
  );
}

function Acao({ cor, cor2, d, titulo, descricao, contador, aberta, onClick, children }: { cor: string; cor2: string; d: string; titulo: string; descricao: string; contador: number; aberta: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[11px] border border-[var(--color-line)]", aberta && "bg-[var(--color-surface2)]")}>
      <button type="button" onClick={onClick} aria-expanded={aberta} className="flex w-full items-center gap-2.5 rounded-[11px] p-2.5 text-left hover:bg-[var(--color-surface2)]">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ background: cor }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor2} strokeWidth="1.9" aria-hidden>
            <path d={d} />
          </svg>
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
