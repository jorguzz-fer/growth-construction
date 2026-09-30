"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AnaliseDeUnidades, TipoAchado } from "@/lib/unidade-analise";
import { CHAVE_PROPOSTA_UNIDADE, type PropostaGuardada } from "@/lib/ai/unidade-doc";
import { proporUnidadePorTexto } from "@/lib/actions/unidades-assistente";
import { brl, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Painel do assistente na tela de Unidades (Prompt J, seção 6; Prompt E, 2.2).
 *
 * Duas partes:
 *  - **análises** (Conferir planos, Revisar cadastro): contas feitas no
 *    servidor sobre as unidades que a própria página carregou — nenhum id vem
 *    do cliente, nada sai do sistema, nada grava;
 *  - **lançamento assistido** (6.3, BJ-3): a descrição em texto (ou ditada)
 *    vai à action `proporUnidadePorTexto`, que devolve uma PROPOSTA; o painel
 *    a deixa no sessionStorage e abre o formulário, que mostra cada campo. O
 *    botão de gravar é do usuário. Não existe caminho de gravação direta.
 *
 * O selo diz o que o painel faz (Prompt E, 6.1): "Confirma antes de gravar"
 * quando a IA está configurada; "Somente leitura" quando só há as análises.
 *
 * Recolhível, com a preferência guardada por usuário e navegador.
 */

type Acao = "planos" | "cadastro";

const ROTULO_ACHADO: Record<TipoAchado, string> = {
  venda_sem_data: "Sem data",
  valor_zerado: "Valor zerado",
  codigo_repetido: "Código repetido",
  vendida_sem_plano: "Sem plano",
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

/** Web Speech API do navegador, quando existe (Chrome, Edge, Safari). */
function construtorDeVoz(): ConstrutorDeVoz | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: ConstrutorDeVoz; webkitSpeechRecognition?: ConstrutorDeVoz };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AssistenteUnidades({
  usuario,
  projectId,
  iaDisponivel,
  podeCriar,
  analise,
}: {
  /** Quem está logado — só para a chave da preferência "recolhido". */
  usuario: string;
  projectId: string;
  /** ANTHROPIC_API_KEY presente no servidor. */
  iaDisponivel: boolean;
  /** Permissão "criar" em Unidades — sem ela o convite nem aparece (o servidor confere de novo). */
  podeCriar: boolean;
  analise: AnaliseDeUnidades;
}) {
  const router = useRouter();
  const chave = `gt:assistente:unidades:recolhido:${usuario}`;
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
      /* sem localStorage (navegação privada, etc.): fica expandido */
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
      const r = await proporUnidadePorTexto(texto, projectId);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      const guardada: PropostaGuardada = { projectId, proposta: r.proposta };
      try {
        window.sessionStorage.setItem(CHAVE_PROPOSTA_UNIDADE, JSON.stringify(guardada));
      } catch {
        setErro("Não foi possível guardar a proposta neste navegador.");
        return;
      }
      router.push(`/unidades/nova?proj=${projectId}&assistente=1`);
    });
  };

  if (recolhido) {
    return (
      <aside className="shrink-0 min-[1180px]:sticky min-[1180px]:top-20">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={false}
          aria-label="Abrir o assistente"
          title="Abrir o assistente"
          className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--color-line)] bg-white shadow-sm hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40"
        >
          <Faisca />
        </button>
      </aside>
    );
  }

  const { planosDivergentes, achados, vendidas, total } = analise;

  return (
    <aside
      aria-label="Assistente da tela de Unidades"
      className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]"
    >
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            {lancamento ? <Badge tone="warning">Confirma antes de gravar</Badge> : <Badge tone="neutral">Somente leitura</Badge>}
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Cadastro de unidades e vendas</div>
        </div>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={true}
          aria-label="Recolher o assistente"
          title="Recolher"
          className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {lancamento && (
        <div className="mb-3 rounded-[11px] border border-[#E0D7FB] bg-[#F3EFFE] p-3">
          <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">Lance a venda conversando</div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--color-ink2)]">
            Descreva a venda em texto{temVoz ? " ou por voz" : ""}. Eu preencho o formulário e mostro tudo para você
            conferir antes de gravar.
          </p>
          <div className="mt-2 flex items-stretch gap-1.5">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={2}
              maxLength={2000}
              disabled={pending}
              placeholder="Ex.: vendi a casa 12 por 380 mil em 05/03"
              aria-label="Descrição da venda"
              className="min-w-0 flex-1 resize-y rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2.5 py-1.5 text-[12.5px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20"
            />
            {temVoz && (
              <button
                type="button"
                onClick={ditar}
                disabled={pending || ouvindo}
                aria-label={ouvindo ? "Ouvindo…" : "Ditar a descrição"}
                title={ouvindo ? "Ouvindo…" : "Ditar (alternativa ao texto)"}
                className={cn(
                  "flex w-9 shrink-0 items-center justify-center rounded-[8px] border border-[var(--color-accent2)]/20 bg-white text-[#6D4BD1] hover:bg-[var(--color-surface2)] disabled:opacity-50",
                  ouvindo && "animate-pulse",
                )}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-ink3)]">
            Também entende: &quot;sinal de 50 mil, 36 parcelas de 4.500 e financiamento do restante&quot;.
          </p>
          <button
            type="button"
            onClick={propor}
            disabled={pending || texto.trim().length < 3}
            className="mt-2 w-full rounded-[8px] bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[var(--color-accent2)] disabled:opacity-50"
          >
            {pending ? "Interpretando…" : "Preencher o formulário"}
          </button>
          {erro && <p className="mt-1.5 text-[11.5px] text-[var(--color-danger)]">{erro}</p>}
        </div>
      )}

      <div className="space-y-2">
        <AcaoDoPainel
          cor="#FDE6E9"
          icone={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0334A" strokeWidth="1.9" aria-hidden>
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5v5" />
              <circle cx="12" cy="16" r=".9" fill="#C0334A" stroke="none" />
            </svg>
          }
          titulo="Conferir planos de pagamento"
          descricao="Aponta unidades vendidas cujas fontes não fecham com o valor"
          contador={planosDivergentes.length}
          aberta={aberta === "planos"}
          onClick={() => setAberta(aberta === "planos" ? null : "planos")}
        >
          {planosDivergentes.length === 0 ? (
            <p className="text-[12px] text-[var(--color-ink2)]">
              {vendidas === 0
                ? "Nenhuma unidade vendida nesta versão."
                : `As ${vendidas} vendida(s) fecham com o valor (diferença de até R$ 0,01).`}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {planosDivergentes.map((d) => (
                <li key={d.id} className="text-[12px]">
                  <Link href={`/unidades/${d.id}`} className="font-medium text-[var(--color-accent2)] hover:underline">
                    {d.code}
                  </Link>
                  <span className="text-[var(--color-ink2)]">
                    {" "}
                    · fontes {brl(d.total)} × valor {brl(d.valor)} ·{" "}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-danger)]">
                    {d.saldo > 0 ? "+" : ""}
                    {brl(d.saldo)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel
          cor="#E7EDFD"
          icone={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2B5CD9" strokeWidth="1.9" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M8 9h8M8 13h8M8 17h4" />
            </svg>
          }
          titulo="Revisar cadastro"
          descricao="Venda sem data, valor zerado, código repetido, vendida sem plano"
          contador={achados.length}
          aberta={aberta === "cadastro"}
          onClick={() => setAberta(aberta === "cadastro" ? null : "cadastro")}
        >
          {achados.length === 0 ? (
            <p className="text-[12px] text-[var(--color-ink2)]">
              {total === 0 ? "Nenhuma unidade nesta versão." : `Nada a apontar nas ${total} unidade(s).`}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {achados.map((a, i) => (
                <li key={`${a.id}-${a.tipo}-${i}`} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  <Badge tone="warning">{ROTULO_ACHADO[a.tipo]}</Badge>
                  <Link href={`/unidades/${a.id}`} className="font-medium text-[var(--color-accent2)] hover:underline">
                    {a.code}
                  </Link>
                  <span className="text-[var(--color-ink2)]">{a.descricao}</span>
                </li>
              ))}
            </ul>
          )}
        </AcaoDoPainel>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">
        {lancamento
          ? "O assistente preenche o formulário e mostra cada campo antes de gravar. Nada é salvo sem a sua confirmação, e a sua permissão continua valendo. Ele nunca exclui unidades."
          : "As análises são feitas sobre as unidades desta versão, aqui no sistema. Nada é alterado por aqui: para corrigir, abra a unidade."}
      </p>
    </aside>
  );
}

function AcaoDoPainel({
  cor,
  icone,
  titulo,
  descricao,
  contador,
  aberta,
  onClick,
  children,
}: {
  cor: string;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  contador: number;
  aberta: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-[11px] border border-[var(--color-line)]", aberta && "bg-[var(--color-surface2)]")}>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={aberta}
        className="flex w-full items-center gap-2.5 rounded-[11px] p-2.5 text-left hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40"
      >
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
