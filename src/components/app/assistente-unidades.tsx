"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnaliseDeUnidades, TipoAchado } from "@/lib/unidade-analise";
import { brl } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Painel do assistente na tela de Unidades (Prompt J, seção 6; Prompt E, 2.2).
 *
 * Nesta entrega o painel é SOMENTE LEITURA: as duas ações são contas feitas
 * no servidor sobre as unidades que a própria página carregou (nenhum id vem
 * do cliente, nada sai do sistema, nada grava). O selo diz exatamente isso
 * (Prompt E, 6.1) e muda quando o lançamento assistido entrar (J-5).
 *
 * Recolhível, com a preferência guardada por usuário e navegador
 * (localStorage) — preferência de interface, não contexto de negócio.
 */

type Acao = "planos" | "cadastro";

const ROTULO_ACHADO: Record<TipoAchado, string> = {
  venda_sem_data: "Sem data",
  valor_zerado: "Valor zerado",
  codigo_repetido: "Código repetido",
  vendida_sem_plano: "Sem plano",
};

export function AssistenteUnidades({
  usuario,
  analise,
}: {
  /** Quem está logado — só para a chave da preferência "recolhido". */
  usuario: string;
  analise: AnaliseDeUnidades;
}) {
  const chave = `gt:assistente:unidades:recolhido:${usuario}`;
  const [recolhido, setRecolhido] = useState(false);
  const [aberta, setAberta] = useState<Acao | null>(null);

  useEffect(() => {
    try {
      setRecolhido(window.localStorage.getItem(chave) === "1");
    } catch {
      /* sem localStorage (navegação privada, etc.): fica expandido */
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
            <Badge tone="neutral">Somente leitura</Badge>
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
        As análises são feitas sobre as unidades desta versão, aqui no sistema. Nada é alterado por
        aqui: para corrigir, abra a unidade.
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
