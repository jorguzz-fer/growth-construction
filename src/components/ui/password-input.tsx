"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** classes do botão de olho (ajuste de cor por tema, ex.: dark). */
  iconClassName?: string;
}

/**
 * Campo de senha com toggle mostrar/ocultar (ícone de olho). Serve tanto para
 * uso controlado quanto em formulários (basta passar `name`).
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(({ className, iconClassName, ...props }, ref) => {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={show ? "text" : "password"}
        className={cn(
          "h-9 w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 pr-10 text-sm text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink4)] focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        title={show ? "Ocultar senha" : "Mostrar senha"}
        className={cn(
          "absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--color-ink3)] transition-colors hover:text-[var(--color-ink)]",
          iconClassName,
        )}
      >
        {show ? (
          <EyeOff className="h-4 w-4" aria-hidden />
        ) : (
          <Eye className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
