import * as React from "react";

/**
 * Cabeçalho de página: eyebrow (obra · versão), título e subtítulo.
 *
 * O eyebrow e o subtítulo ficaram ocultos por um tempo "para um visual mais
 * clean" — e as telas continuaram passando os dois. O Prompt J (3.1) e o
 * Prompt B mandam voltar a exibir: sem o eyebrow, o usuário não sabe que está
 * vendo a versão Atual. Só apresentação; quem não passa nada continua igual.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  /** Contexto acima do título, ex.: "OBRA 28 · Atual". */
  eyebrow?: string;
  title: string;
  /** Resumo abaixo do título, ex.: "12 unidades · VGV R$ 4.800.000". */
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 font-[family-name:var(--font-mono)] text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-ink3)]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-[var(--color-ink2)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
