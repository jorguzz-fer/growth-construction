import * as React from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        {eyebrow && (
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink3)]">
            {eyebrow}
          </span>
        )}
        <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-[var(--color-ink3)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
