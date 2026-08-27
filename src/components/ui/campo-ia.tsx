"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/input";
import { contarAlertas, type Alerta } from "@/lib/ai/campos";

/**
 * Marcação visual dos campos preenchidos por leitura de documento (IA).
 *
 * Regra da tela, igual em qualquer módulo que aceite subir documento:
 *
 *   - campo lido com certeza  → fica normal, sem ruído;
 *   - campo que a IA não achou → moldura de ALERTA "faltando" + motivo;
 *   - campo duvidoso/deduzido  → moldura de ALERTA "conferir" + motivo.
 *
 * O alerta some assim que o usuário mexe no campo: quem editou já conferiu, e
 * manter a marca depois disso vira poluição. Isso é responsabilidade da tela —
 * ela simplesmente para de passar o alerta (ver `limparAlerta` no formulário).
 *
 * Nada aqui bloqueia gravação: alerta é sinal, não trava.
 */

const TOM: Record<
  Alerta["nivel"],
  { borda: string; texto: string; chip: string; rotulo: string; titulo: string }
> = {
  faltando: {
    borda: "ring-2 ring-[var(--color-danger)]/35",
    texto: "text-[#b45309]",
    chip: "bg-[#fee2e2] text-[#991b1b]",
    rotulo: "⚠ faltando",
    titulo: "A IA não encontrou esta informação no documento",
  },
  conferir: {
    borda: "ring-2 ring-[var(--color-warning)]/45",
    texto: "text-[#92400e]",
    chip: "bg-[#fef3c7] text-[#92400e]",
    rotulo: "⚠ conferir",
    titulo: "Preenchido sem certeza — confira antes de gravar",
  },
};

/** Selo curto ao lado do rótulo do campo. */
export function SeloAlerta({ alerta }: { alerta: Alerta }) {
  const t = TOM[alerta.nivel];
  return (
    <span
      title={alerta.motivo || t.titulo}
      className={cn(
        "ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 align-middle text-[9.5px] font-medium normal-case tracking-normal font-[family-name:var(--font-mono)]",
        t.chip,
      )}
    >
      {t.rotulo}
    </span>
  );
}

/**
 * Envolve um campo do formulário: rótulo + selo + moldura + motivo.
 *
 * Uso: `<CampoIA label="Valor" alerta={alertas.valor}><MoneyInput …/></CampoIA>`
 * Com `alerta` nulo/ausente ele é apenas um `<Label>` + o campo — ou seja, dá
 * para trocar todos os campos da tela por `CampoIA` sem mudar a aparência de
 * quem nunca subiu documento.
 */
export function CampoIA({
  label,
  alerta,
  children,
  className,
  hint,
}: {
  label: React.ReactNode;
  alerta?: Alerta | null;
  children: React.ReactNode;
  className?: string;
  /** Texto auxiliar fixo do campo (aparece abaixo, sem relação com a IA). */
  hint?: React.ReactNode;
}) {
  const t = alerta ? TOM[alerta.nivel] : null;
  return (
    <div className={className}>
      <Label>
        {label}
        {alerta && <SeloAlerta alerta={alerta} />}
      </Label>
      <div className={cn("rounded-[9px]", t?.borda)}>{children}</div>
      {alerta?.motivo && (
        <p className={cn("mt-1 text-[11px] leading-snug", t?.texto)}>{alerta.motivo}</p>
      )}
      {hint && !alerta && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink3)]">{hint}</p>
      )}
    </div>
  );
}

/**
 * Resumo da leitura, no topo do formulário: o que a IA entendeu do documento,
 * o que preencheu e o que ficou pendente de conferência.
 *
 * Existe porque o alerta por campo, sozinho, obriga a varrer a tela inteira
 * para saber se sobrou algo — aqui o usuário vê o placar de uma vez.
 */
export function ResumoLeituraIA({
  titulo,
  resumo,
  preenchidos,
  alertas,
  rotulos,
  observacoes = [],
  onFechar,
}: {
  /** Ex.: "Comprovante de pagamento · 2 arquivos". */
  titulo: string;
  /** Frase da IA sobre o que é o documento. */
  resumo?: string;
  preenchidos: string[];
  alertas: Record<string, Alerta>;
  /** Tradução campo → rótulo exibido. */
  rotulos: Record<string, string>;
  observacoes?: string[];
  onFechar?: () => void;
}) {
  const { faltando, conferir, total } = contarAlertas(alertas);
  const lista = Object.entries(alertas);
  return (
    <div className="rounded-[10px] border border-[var(--color-accent2)]/25 bg-[var(--color-surface2)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            Leitura do documento · {titulo}
          </p>
          {resumo && (
            <p className="mt-1 text-[13px] text-[var(--color-ink)]">{resumo}</p>
          )}
        </div>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            title="Limpar as marcas de alerta desta leitura"
            className="shrink-0 rounded-[6px] border border-[var(--color-accent2)]/25 px-2 py-1 text-[11px] text-[var(--color-ink3)] hover:bg-[var(--color-surface3)]"
          >
            Limpar alertas
          </button>
        )}
      </div>

      <p className="mt-2 text-[12px] text-[var(--color-ink2)]">
        {preenchidos.length > 0
          ? `${preenchidos.length} campo(s) preenchido(s): ${preenchidos.join(", ")}.`
          : "Nenhum campo pôde ser preenchido automaticamente."}
        {total > 0
          ? ` ${faltando} faltando · ${conferir} para conferir — os campos estão marcados abaixo.`
          : " Nada pendente de conferência."}
      </p>

      {lista.length > 0 && (
        <ul className="mt-2 space-y-1">
          {lista.map(([campo, a]) => (
            <li key={campo} className="text-[11.5px] leading-snug">
              <span
                className={cn(
                  "font-medium",
                  a.nivel === "faltando" ? "text-[#991b1b]" : "text-[#92400e]",
                )}
              >
                {rotulos[campo] ?? campo}:
              </span>{" "}
              <span className="text-[var(--color-ink2)]">{a.motivo}</span>
            </li>
          ))}
        </ul>
      )}

      {observacoes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11.5px] text-[var(--color-ink3)]">
          {observacoes.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-[var(--color-ink4)]">
        A leitura é um rascunho: nada é gravado até você conferir e salvar.
      </p>
    </div>
  );
}
