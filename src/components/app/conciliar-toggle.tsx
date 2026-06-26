"use client";

import { useTransition } from "react";
import { toggleConciliado } from "@/lib/actions/caixa";
import { Badge } from "@/components/ui/badge";

export function ConciliarToggle({ id, rec }: { id: string; rec: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => toggleConciliado(id, !rec))}
      className="disabled:opacity-50"
      title="Alternar conciliação"
    >
      <Badge tone={rec ? "success" : "warning"}>
        {pending ? "..." : rec ? "conciliado" : "pendente"}
      </Badge>
    </button>
  );
}
