"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { legivelPelaIa } from "@/lib/ai/campos";

/**
 * Bloco de upload de documentos — o mesmo em toda tela que aceita arquivo.
 *
 * O que ele resolve: o `<input type="file">` cru mostrava "Escolher arquivos /
 * Nenhum arquivo escolhido" (texto do navegador, fora do idioma e do visual do
 * app) e a única pista do que fazer depois era um parágrafo cinza misturando
 * três assuntos — leitura por IA, chave de ambiente e armazenamento. Ficava
 * confuso justamente para quem está lançando com o celular na mão.
 *
 * Agora a ação está em dois botões nomeados, na ordem em que se usa:
 *
 *   [ Subir arquivos ]  [ Preencher formulário ]
 *
 * O primeiro abre o seletor; o segundo executa o trabalho sobre o que foi
 * subido (ler e preencher, anexar ao lançamento — quem define é a tela). Cada
 * arquivo vira uma linha com nome, tamanho e um botão de remover, então dá
 * para conferir e corrigir antes de agir.
 *
 * Todo texto de domínio (o que subir, por que a ação está indisponível) vem da
 * tela via props: este componente não sabe o que é despesa nem fornecedor.
 */

export interface AcaoDocumentos {
  /** Rótulo normal, ex.: "Preencher formulário". */
  label: string;
  /** Rótulo enquanto executa, ex.: "Lendo documentos…". */
  labelOcupado: string;
  /** Rótulo depois da primeira execução, ex.: "Preencher novamente". */
  labelRepetir?: string;
  /** Já executou uma vez nesta seleção? (troca para `labelRepetir`) */
  repetiu?: boolean;
  ocupado: boolean;
  desabilitada?: boolean;
  /** Por que está desabilitada / o que ela faz — vira `title` do botão. */
  motivo?: string;
  /**
   * Repete o `motivo` ao lado do botão. Só vale a pena quando é algo que a
   * pessoa resolve ali mesmo ("suba um PDF"); motivo de configuração do
   * servidor já aparece no aviso e repetir vira ruído.
   */
  motivoVisivel?: boolean;
  onClick: () => void;
  variante?: "default" | "outline";
}

export type TomAviso = "info" | "atencao" | "erro" | "ok";

export interface AvisoDocumentos {
  tom: TomAviso;
  texto: React.ReactNode;
}

const TOM_AVISO: Record<TomAviso, string> = {
  info: "text-[var(--color-ink3)]",
  atencao:
    "rounded-[8px] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-2.5 py-2 text-[#92400e]",
  erro: "rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/8 px-2.5 py-2 text-[var(--color-danger)]",
  ok: "text-[var(--color-success)]",
};

function tamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function UploadDocumentos({
  titulo,
  descricao,
  arquivos,
  onArquivos,
  acao,
  avisos = [],
  multiplo = true,
  accept,
  desabilitado = false,
  marcarLegibilidade = false,
  limiteTotalBytes,
  className,
}: {
  titulo: string;
  /** Uma linha dizendo o que subir aqui. */
  descricao: React.ReactNode;
  arquivos: File[];
  /**
   * `adicionados` traz só os arquivos recém-escolhidos (vazio quando a mudança
   * foi uma remoção) — é o que permite à tela agir no upload sem reagir de
   * novo quando alguém tira um arquivo da lista.
   */
  onArquivos: (lista: File[], adicionados: File[]) => void;
  /** Botão de ação principal sobre os arquivos. Sem ele, só há o upload. */
  acao?: AcaoDocumentos;
  avisos?: AvisoDocumentos[];
  multiplo?: boolean;
  accept?: string;
  desabilitado?: boolean;
  /** Marca na lista os arquivos que a IA não consegue ler (XML, planilha…). */
  marcarLegibilidade?: boolean;
  /** Acima disto o envio não cabe na requisição — vira aviso, não bloqueio. */
  limiteTotalBytes?: number;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const total = arquivos.reduce((a, f) => a + f.size, 0);
  const estourou = !!limiteTotalBytes && total > limiteTotalBytes;

  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const novos = Array.from(e.target.files ?? []);
    // Zera o input para que escolher o MESMO arquivo de novo dispare o evento
    // (o navegador não emite change quando o valor não muda).
    e.target.value = "";
    if (novos.length === 0) return;
    const lista = multiplo ? [...arquivos, ...novos] : novos;
    onArquivos(lista, novos);
  };

  const remover = (i: number) => {
    onArquivos(
      arquivos.filter((_, idx) => idx !== i),
      [],
    );
  };

  const rotuloAcao = acao
    ? acao.ocupado
      ? acao.labelOcupado
      : acao.repetiu && acao.labelRepetir
        ? acao.labelRepetir
        : acao.label
    : "";

  return (
    <div
      className={cn(
        "rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4",
        className,
      )}
    >
      <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
        {titulo}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink2)]">
        {descricao}
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple={multiplo}
        accept={accept}
        hidden
        onChange={escolher}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={desabilitado}
          onClick={() => inputRef.current?.click()}
        >
          {arquivos.length > 0 ? "Adicionar mais arquivos" : "Subir arquivos"}
        </Button>
        {acao && (
          <Button
            type="button"
            variant={acao.variante ?? "default"}
            disabled={desabilitado || acao.desabilitada || acao.ocupado}
            title={acao.motivo}
            onClick={acao.onClick}
          >
            {rotuloAcao}
          </Button>
        )}
        {acao?.desabilitada && acao.motivoVisivel && acao.motivo && (
          <span className="text-[11.5px] text-[var(--color-ink3)]">{acao.motivo}</span>
        )}
      </div>

      {arquivos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {arquivos.map((f, i) => {
            const ilegivel = marcarLegibilidade && !legivelPelaIa(f.type);
            return (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface)] px-3 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[12.5px] text-[var(--color-ink)]">
                    {f.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--color-ink4)]">
                    {tamanho(f.size)}
                  </span>
                  {ilegivel && (
                    <span
                      className="shrink-0 rounded-full bg-[var(--color-surface3)] px-1.5 py-0.5 text-[9.5px] text-[var(--color-ink3)]"
                      title="A IA lê PDF e imagem. Este arquivo será apenas anexado."
                    >
                      só anexo
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={desabilitado}
                  onClick={() => remover(i)}
                  title={`Remover ${f.name} da lista`}
                  aria-label={`Remover ${f.name}`}
                  className="shrink-0 rounded-[6px] px-2 py-0.5 text-[13px] text-[var(--color-ink3)] hover:bg-[var(--color-surface3)] hover:text-[var(--color-danger)] disabled:opacity-50"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(avisos.length > 0 || estourou) && (
        <div className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed">
          {estourou && (
            <p className={TOM_AVISO.atencao}>
              Os arquivos somam {tamanho(total)} e o limite por envio é{" "}
              {tamanho(limiteTotalBytes!)}. Remova algum e envie em partes — os já
              enviados são preservados.
            </p>
          )}
          {avisos.map((a, i) => (
            <p key={i} className={TOM_AVISO[a.tom]}>
              {a.texto}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
