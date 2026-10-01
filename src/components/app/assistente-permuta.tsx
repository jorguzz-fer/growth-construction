"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AnaliseDePermutas, TipoDeFalta } from "@/lib/permuta-analise";
import { CHAVE_PROPOSTA_PERMUTA, type PropostaGuardadaPermuta } from "@/lib/ai/permuta-doc";
import { proporAtivoPorTexto } from "@/lib/actions/permuta-assistente";
import { brl, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Painel do assistente na tela de Permuta (Prompt P, seção 7; Prompt E).
 *
 * Duas partes:
 *  - **análises** (7.5): ativos parados, cadastro incompleto, venda abaixo da
 *    entrada, duplicidade com o plano — contas feitas no servidor sobre o que
 *    a página carregou; nada sai do sistema, nada grava;
 *  - **lançamento por descrição** (7.3): o texto (ou a voz) vai à action
 *    `proporAtivoPorTexto`, que devolve uma PROPOSTA; o painel a deixa no
 *    sessionStorage e abre o formulário, que mostra cada campo. Gravar é o
 *    botão do usuário (7.1). Não existe caminho de gravação direta.
 *
 * Nunca assistido (7.6): cancelar ativo, alterar ativo vendido, importar
 * planilha. Leitura de documento (7.4) espera a decisão sobre enviar
 * documentos ao provedor de IA. Selo (7.2): "Propõe, você confirma".
 * Linguagem (7.7): ativo, caixa e resultado — nunca receita.
 */

type Acao = "parados" | "incompletos" | "abaixo" | "duplicidade";

const ROTULO_FALTA: Record<TipoDeFalta, string> = {
  sem_estimado: "sem valor estimado",
  sem_unidade: "sem unidade de origem",
  sem_cliente: "sem cliente",
  vendido_sem_data: "vendido sem data da venda",
  vendido_sem_valor: "vendido sem valor da venda",
};

type ReconhecedorDeVoz = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
};
type ConstrutorDeVoz = new () => ReconhecedorDeVoz;
function construtorDeVoz(): ConstrutorDeVoz | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: ConstrutorDeVoz; webkitSpeechRecognition?: ConstrutorDeVoz };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AssistentePermuta({ usuario, projectId, iaDisponivel, podeCriar, analise }: { usuario: string; projectId: string; iaDisponivel: boolean; podeCriar: boolean; analise: AnaliseDePermutas }) {
  const router = useRouter();
  const chave = `gt:assistente:permuta:recolhido:${usuario}`;
  const [recolhido, setRecolhido] = useState(false);
  const [aberta, setAberta] = useState<Acao | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [temVoz, setTemVoz] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const lancamento = iaDisponivel && podeCriar;

  useEffect(() => {
    try {
      setRecolhido(window.localStorage.getItem(chave) === "1");
    } catch {
      /* sem localStorage: fica expandido */
    }
    setTemVoz(!!construtorDeVoz());
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

  const ditar = () => {
    const Voz = construtorDeVoz();
    if (!Voz) return;
    const r = new Voz();
    r.lang = "pt-BR";
    r.interimResults = false;
    r.onresult = (e) => {
      const falado = e.results[0]?.[0]?.transcript ?? "";
      if (falado) setTexto((t) => (t.trim() ? `${t.trim()} ${falado}` : falado));
    };
    r.onend = () => setOuvindo(false);
    r.onerror = () => setOuvindo(false);
    setOuvindo(true);
    r.start();
  };

  const propor = () => {
    setErro(null);
    start(async () => {
      const r = await proporAtivoPorTexto(texto, projectId);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      const guardada: PropostaGuardadaPermuta = { projectId, proposta: r.proposta };
      try {
        window.sessionStorage.setItem(CHAVE_PROPOSTA_PERMUTA, JSON.stringify(guardada));
      } catch {
        setErro("Não foi possível guardar a proposta neste navegador.");
        return;
      }
      router.push(`/permuta/novo?proj=${projectId}&assistente=1`);
    });
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

  const { parados, incompletos, abaixoDaEntrada, duplicidades, total } = analise;
  const nada = (t: string) => <p className="text-[12px] text-[var(--color-ink2)]">{total === 0 ? "Nenhum ativo nesta versão." : t}</p>;
  const link = (id: string, rotulo: string) => (
    <Link href={`/permuta/${id}`} className="font-medium text-[var(--color-accent2)] hover:underline">
      {rotulo}
    </Link>
  );

  return (
    <aside aria-label="Assistente da tela de Permuta" className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="warning">Propõe, você confirma</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Ativos recebidos em permuta</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {lancamento && (
        <div className="mb-3 rounded-[11px] border border-[#E0D7FB] bg-[#F3EFFE] p-3">
          <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">Lance o ativo conversando</div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--color-ink2)]">
            Descreva o bem recebido em texto{temVoz ? " ou por voz" : ""}. Eu preencho o cadastro e mostro cada campo para você conferir antes de gravar.
          </p>
          <div className="mt-2 flex items-stretch gap-1.5">
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} disabled={pending} placeholder="Ex.: recebi um Corolla 2020 de 50 mil da Maria pela casa 12 em 15/09" aria-label="Descrição do bem recebido" className="min-w-0 flex-1 resize-y rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2.5 py-1.5 text-[12.5px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20" />
            {temVoz && (
              <button type="button" onClick={ditar} disabled={pending || ouvindo} aria-label={ouvindo ? "Ouvindo…" : "Ditar a descrição"} title={ouvindo ? "Ouvindo…" : "Ditar (alternativa ao texto)"} className={cn("flex w-9 shrink-0 items-center justify-center rounded-[8px] border border-[var(--color-accent2)]/20 bg-white text-[#6D4BD1] hover:bg-[var(--color-surface2)] disabled:opacity-50", ouvindo && "animate-pulse")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            )}
          </div>
          <button type="button" onClick={propor} disabled={pending || texto.trim().length < 3} className="mt-2 w-full rounded-[8px] bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[var(--color-accent2)] disabled:opacity-50">
            {pending ? "Interpretando…" : "Preencher o cadastro"}
          </button>
          {erro && <p className="mt-1.5 text-[11.5px] text-[var(--color-danger)]">{erro}</p>}
        </div>
      )}

      <div className="space-y-2">
        <AcaoDoPainel cor="#FEF3C7" icone={<Icone cor="#B45309" d="M12 7.5v5l3 2M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" />} titulo="Ativos parados" descricao="Em estoque há mais tempo que o normal do seu tipo, ou acima de 180 dias" contador={parados.length} aberta={aberta === "parados"} onClick={() => setAberta(aberta === "parados" ? null : "parados")}>
          {parados.length === 0 ? (
            nada("Nenhum ativo parado além do normal do seu tipo.")
          ) : (
            <ul className="space-y-1.5">
              {parados.map((a) => (
                <li key={a.id} className="text-[12px]">
                  {link(a.id, [a.unitCode ? `Un. ${a.unitCode}` : null, a.descricao || a.tipo].filter(Boolean).join(" · "))}
                  <span className="text-[var(--color-ink2)]">
                    {" "}
                    · {a.diasEmEstoque} dias (normal do tipo {a.tipo}: {Math.round(a.normalDoTipo)}) · <span className="font-[family-name:var(--font-mono)]">{brl(a.estimado)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#E7EDFD" icone={<Icone cor="#2B5CD9" d="M3 3h18v18H3zM8 9h8M8 13h8M8 17h4" />} titulo="Cadastro incompleto" descricao="Sem valor estimado, sem unidade, sem cliente, vendido sem data ou valor" contador={incompletos.length} aberta={aberta === "incompletos"} onClick={() => setAberta(aberta === "incompletos" ? null : "incompletos")}>
          {incompletos.length === 0 ? (
            nada("Todos os ativos têm valor, unidade e cliente; os vendidos têm data e valor de venda.")
          ) : (
            <ul className="space-y-1.5">
              {incompletos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  {a.faltas.map((f) => (
                    <Badge key={f} tone="warning">
                      {ROTULO_FALTA[f]}
                    </Badge>
                  ))}
                  {link(a.id, a.rotulo)}
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#FDE6E9" icone={<Icone cor="#C0334A" d="M4 6l5 6 4-3 7 9" />} titulo="Venda abaixo da entrada" descricao="Revendidos por menos que o valor pelo qual entraram, com o resultado" contador={abaixoDaEntrada.length} aberta={aberta === "abaixo"} onClick={() => setAberta(aberta === "abaixo" ? null : "abaixo")}>
          {abaixoDaEntrada.length === 0 ? (
            nada("Nenhuma revenda abaixo do valor de entrada.")
          ) : (
            <ul className="space-y-1.5">
              {abaixoDaEntrada.map((a) => (
                <li key={a.id} className="text-[12px]">
                  {link(a.id, a.rotulo)}
                  <span className="text-[var(--color-ink2)]">
                    {" "}
                    · entrou por {brl(a.estimado)}, saiu por {brl(a.valorVenda)} ·{" "}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-danger)]">{brl(a.resultado)}</span>
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#F3EFFE" icone={<Icone cor="#6D4BD1" d="M4 7h7v10H4zM13 7h7v10h-7z" />} titulo="Duplicidade com o plano" descricao="Unidades com 'Permuta' no plano de pagamento que também têm ativo aqui" contador={duplicidades.length} aberta={aberta === "duplicidade"} onClick={() => setAberta(aberta === "duplicidade" ? null : "duplicidade")}>
          {duplicidades.length === 0 ? (
            nada("Nenhuma unidade com o bem contado no plano e também como ativo.")
          ) : (
            <ul className="space-y-2">
              {duplicidades.map((d) => (
                <li key={d.unitCode} className="rounded-[8px] border border-[var(--color-line)] bg-white p-2 text-[12px]">
                  <div className="font-medium text-[var(--color-ink)]">Unidade {d.unitCode}</div>
                  <div className="text-[var(--color-ink2)]">
                    Permuta no plano <span className="font-[family-name:var(--font-mono)]">{brl(d.permutaNoPlano)}</span> × ativo(s) aqui <span className="font-[family-name:var(--font-mono)]">{brl(d.somaDosAtivos)}</span>
                  </div>
                  <ul className="mt-1 list-disc pl-4">
                    {d.ativos.map((a) => (
                      <li key={a.id}>
                        {link(a.id, a.rotulo)} <span className="text-[var(--color-ink3)]">({brl(a.estimado)})</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-[var(--color-ink3)]">O mesmo bem pode estar dentro do preço da unidade e também como ativo. Só reporta: para corrigir, abra a unidade ou o ativo.</p>
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">
        {lancamento ? "O assistente preenche o cadastro e mostra cada campo antes de gravar. Nada é salvo sem a sua confirmação, e a sua permissão continua valendo. " : "As análises são feitas sobre os ativos desta versão, aqui no sistema. "}
        Ele nunca cancela ativo, não altera ativo vendido e não importa planilha. O bem recebido é ativo; a venda posterior é caixa e resultado, não receita. A leitura de documento anexado entra quando for decidido o envio de documentos ao provedor de IA.
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
