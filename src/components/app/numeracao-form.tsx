"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateDespesaSequence,
  type SequenceConfig,
} from "@/lib/actions/numeracao";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

function preview(c: SequenceConfig): string {
  const num = String(Math.max(1, c.nextNumber || 1)).padStart(
    Math.min(12, Math.max(1, c.digits || 6)),
    "0",
  );
  return c.usePrefix && c.prefix ? `${c.prefix}-${num}` : num;
}

export function NumeracaoForm({
  initial,
  canEdit,
}: {
  initial: SequenceConfig;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [c, setC] = useState<SequenceConfig>(initial);

  const salvar = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        await updateDespesaSequence(c);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao salvar.");
      }
    });
  };

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <input
            id="usePrefix"
            type="checkbox"
            checked={c.usePrefix}
            disabled={!canEdit || pending}
            onChange={(e) => setC({ ...c, usePrefix: e.target.checked })}
          />
          <label htmlFor="usePrefix" className="text-[13px] text-[var(--color-ink2)]">
            Usar prefixo
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Label>Prefixo</Label>
            <Input
              value={c.prefix}
              disabled={!canEdit || pending || !c.usePrefix}
              onChange={(e) => setC({ ...c, prefix: e.target.value })}
              placeholder="PED"
            />
          </div>
          <div>
            <Label>Próximo número</Label>
            <Input
              type="number"
              min={1}
              value={c.nextNumber}
              disabled={!canEdit || pending}
              onChange={(e) => setC({ ...c, nextNumber: Number(e.target.value) || 1 })}
            />
          </div>
          <div>
            <Label>Qtd. de dígitos</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={c.digits}
              disabled={!canEdit || pending}
              onChange={(e) => setC({ ...c, digits: Number(e.target.value) || 6 })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={c.active}
            disabled={!canEdit || pending}
            onChange={(e) => setC({ ...c, active: e.target.checked })}
          />
          <label htmlFor="active" className="text-[13px] text-[var(--color-ink2)]">
            Numeração automática ativa
          </label>
        </div>

        <div className="rounded-[10px] bg-[var(--color-surface2)] px-4 py-3">
          <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            Exemplo do próximo número
          </div>
          <div className="mt-1 font-[family-name:var(--font-mono)] text-xl font-semibold text-[var(--color-accent)]">
            {preview(c)}
          </div>
        </div>

        <p className="text-[12px] leading-relaxed text-[var(--color-ink3)]">
          O número é reservado atomicamente no banco a cada nova despesa —
          nunca duplica nem reutiliza números excluídos. Ajuste o “próximo
          número” para alinhar com a numeração histórica da empresa.
        </p>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando…" : "Salvar configuração"}
            </Button>
            {saved && !pending && (
              <span className="text-sm text-[var(--color-success)]">Salvo.</span>
            )}
          </div>
        )}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
