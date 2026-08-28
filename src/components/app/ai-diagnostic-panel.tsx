"use client";

import { useState, useTransition } from "react";
import { testAiConnection, type AiDiagnosticResult } from "@/lib/actions/ai";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MODELO_PADRAO, rotuloModelo } from "@/lib/ai/modelos";

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
            <div className="mt-3 space-y-1.5 text-[11.5px] text-[var(--color-ink3)]">
              <div>
                Modelo configurado:{" "}
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                  {res.configuredModel}
                </span>{" "}
                ({res.configuredModelLabel}) — defina <code>ANTHROPIC_MODEL</code> para
                trocar sem alterar código
              </div>
              {/* A variável tem que levar o IDENTIFICADOR do modelo, não o nome
                  comercial. Sem este aviso, um valor errado some no fallback e a
                  configuração parece valer quando não vale. */}
              {res.modelWarning && (
                <div className="rounded-[8px] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-2.5 py-2 leading-relaxed text-[#92400e]">
                  {res.modelWarning}
                </div>
              )}
              {res.error && (
                <div className="rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/8 px-2.5 py-2 leading-relaxed text-[var(--color-danger)]">
                  {res.error}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1.5 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          <p>
            <strong className="text-[var(--color-ink)]">Como habilitar:</strong> defina{" "}
            <code>ANTHROPIC_API_KEY</code> no ambiente do servidor (ex.: variáveis do
            Coolify) e reinicie/redeploy o app. Com a chave ativa e créditos na conta,
            a leitura de NF/boleto, cadastro de fornecedor por imagem/PDF e extratos
            (inclusive escaneados) passa a funcionar.
          </p>
          <p>
            <strong className="text-[var(--color-ink)]">Escolher o modelo:</strong>{" "}
            <code>ANTHROPIC_MODEL</code> é opcional e aceita o{" "}
            <em>identificador</em>, não o nome comercial — ex.:{" "}
            <code>claude-sonnet-5</code>, e não &ldquo;Sonnet 5&rdquo;. Sem ela, o app
            usa {rotuloModelo(MODELO_PADRAO)} (<code>{MODELO_PADRAO}</code>), que é o
            mais econômico e dá conta de PDF nítido. Se a leitura de foto (cupom
            amassado, papel desbotado) vier fraca, suba um degrau:{" "}
            <code>claude-sonnet-5</code> ou <code>claude-opus-5</code>.
          </p>
          <p>
            <strong className="text-[var(--color-ink)]">Créditos:</strong> chave e
            modelo corretos, mas a chamada falha por saldo? O consumo é cobrado por
            uso — adicione créditos em <code>console.anthropic.com</code> (Plans &amp;
            Billing).
          </p>
          <p>
            <strong className="text-[var(--color-ink)]">Chave vinculada a identidade:</strong>{" "}
            se a chave foi criada para uma service account, defina também{" "}
            <code>ANTHROPIC_WORKSPACE_ID</code> com o ID do workspace
            (Settings → Workspaces, começa com <code>wrkspc_</code>). Chave comum
            dispensa isso.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
