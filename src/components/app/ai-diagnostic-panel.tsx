"use client";

import { useState, useTransition } from "react";
import { testAiConnection, type AiDiagnosticResult } from "@/lib/actions/ai";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function Item({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-accent2)]/8 py-2 last:border-0">
      <div>
        <div className="text-[13px] text-[var(--color-ink)]">{label}</div>
        {hint && <div className="text-[11.5px] text-[var(--color-ink3)]">{hint}</div>}
      </div>
      <Badge tone={ok ? "success" : "danger"}>{ok ? "OK" : "Falhou"}</Badge>
    </div>
  );
}

export function AiDiagnosticPanel() {
  const [res, setRes] = useState<AiDiagnosticResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setErr(null);
    start(async () => {
      try {
        setRes(await testAiConnection());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao executar o diagnóstico.");
      }
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--color-ink3)]">
            Testa a leitura por IA (despesas, fornecedores e extratos) fazendo uma
            chamada real à API — verifica a chave, o acesso ao modelo e a rede.
          </p>
          <Button type="button" onClick={run} disabled={pending} className="shrink-0">
            {pending ? "Testando…" : "Testar agora"}
          </Button>
        </div>

        {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}

        {res && (
          <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone={res.ok ? "success" : "danger"}>
                {res.ok ? "Leitura por IA operacional" : "Leitura por IA indisponível"}
              </Badge>
            </div>
            <Item
              label="Chave de IA (ANTHROPIC_API_KEY)"
              ok={res.keyPresent}
              hint={res.keyPresent ? "Definida no ambiente" : "Ausente — defina no ambiente do servidor"}
            />
            <Item
              label="Chamada ao modelo"
              ok={res.ok}
              hint={
                res.ok
                  ? `Respondeu com o modelo ${res.modelUsed ?? "?"}`
                  : "A chamada de teste falhou"
              }
            />
            <Item
              label="Storage de documentos (R2)"
              ok={res.r2Configured}
              hint={
                res.r2Configured
                  ? "Configurado — anexos são salvos e entram no backup"
                  : "Opcional para a leitura; necessário para anexar/baixar documentos"
              }
            />
            <div className="mt-3 space-y-1 text-[11.5px] text-[var(--color-ink3)]">
              <div>
                Modelo configurado:{" "}
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                  {res.configuredModel}
                </span>{" "}
                (defina <code>ANTHROPIC_MODEL</code> para trocar sem alterar código)
              </div>
              {res.error && (
                <div className="text-[var(--color-danger)]">Detalhe: {res.error}</div>
              )}
            </div>
          </div>
        )}

        <div className="text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          <strong className="text-[var(--color-ink)]">Como habilitar:</strong> defina{" "}
          <code>ANTHROPIC_API_KEY</code> no ambiente do servidor (ex.: variáveis do
          Coolify) e reinicie/redeploy o app. Opcional: <code>ANTHROPIC_MODEL</code>{" "}
          para escolher o modelo. Com a chave ativa, a leitura de NF/boleto,
          cadastro de fornecedor por imagem/PDF e extratos (inclusive escaneados)
          passa a funcionar.
        </div>
      </CardContent>
    </Card>
  );
}
