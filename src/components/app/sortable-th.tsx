"use client";

import { useMemo, useState } from "react";
import { TH } from "@/components/ui/table";
import {
  ordenarTabela,
  proximoEstado,
  setaOrdenacao,
  type ColunaOrdenavel,
  type EstadoOrdenacao,
} from "@/lib/tabela-ordenacao";

/**
 * Cabeçalho de coluna clicável (ordenação estilo planilha) — §5.
 *
 * COMPARTILHADO APENAS entre **Contas a Pagar** e **Contas a Receber**. A tela
 * de Despesas/Lançamentos mantém a ordenação por momento de lançamento e não
 * usa este componente.
 */
export function SortTH({
  coluna,
  estado,
  onSort,
  className,
  children,
}: {
  coluna: string;
  estado: EstadoOrdenacao | null;
  onSort: (coluna: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const seta = setaOrdenacao(estado, coluna);
  const ativo = seta !== "";
  return (
    <TH className={className}>
      <button
        type="button"
        onClick={() => onSort(coluna)}
        // aria-sort no <th> seria o ideal, mas o indicador textual já é lido:
        // o title explica o próximo clique para quem usa mouse.
        title={
          !ativo
            ? "Ordenar (crescente)"
            : seta === "▲"
              ? "Ordenar (decrescente)"
              : "Remover ordenação"
        }
        className={`group inline-flex w-full items-center gap-1 uppercase tracking-wide transition-colors ${
          className?.includes("text-right") ? "justify-end" : "justify-start"
        } ${ativo ? "text-[var(--color-accent2)]" : "hover:text-[var(--color-ink)]"}`}
      >
        <span>{children}</span>
        <span
          aria-hidden
          className={`text-[9px] leading-none ${
            ativo ? "opacity-100" : "opacity-0 group-hover:opacity-40"
          }`}
        >
          {seta || "▲"}
        </span>
      </button>
    </TH>
  );
}

/**
 * Estado + aplicação da ordenação para uma tabela.
 *
 * `rowsPadrao` já vem filtrada e na ordem padrão da tela; enquanto não houver
 * clique de cabeçalho, ela é devolvida intacta. Trocar filtros NÃO limpa a
 * ordenação escolhida — ela é reaplicada ao novo conjunto filtrado inteiro
 * (inclusive fora da página visível), conforme §5.
 */
export function useOrdenacaoTabela<T>(
  rowsPadrao: readonly T[],
  colunas: readonly ColunaOrdenavel<T>[],
  id: (row: T) => string,
) {
  const [estado, setEstado] = useState<EstadoOrdenacao | null>(null);
  const onSort = (coluna: string) => setEstado((e) => proximoEstado(e, coluna));
  const rows = useMemo(
    () => ordenarTabela(rowsPadrao, colunas, estado, id),
    // `id` é uma função pura do chamador (identidade irrelevante para o
    // resultado); as demais dependências são as que de fato mudam a ordem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowsPadrao, colunas, estado],
  );
  return { rows, estado, onSort };
}
