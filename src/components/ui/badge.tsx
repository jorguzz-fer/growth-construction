import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium font-[family-name:var(--font-mono)]",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--color-surface3)] text-[var(--color-ink2)]",
        accent: "bg-[var(--color-accent4)] text-[var(--color-accent)]",
        success: "bg-[#d1fae5] text-[#065f46]",
        warning: "bg-[#fef3c7] text-[#92400e]",
        danger: "bg-[#fee2e2] text-[#991b1b]",
        info: "bg-[#dbeafe] text-[#1e40af]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Mapeia o status de unidade para o tom do badge. */
export function unitStatusTone(
  status: string,
): "success" | "warning" | "neutral" {
  if (status === "Vendido") return "success";
  if (status === "Reservado") return "warning";
  return "neutral";
}
