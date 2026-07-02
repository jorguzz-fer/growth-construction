"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface HealthResult {
  ok: boolean;
  configured?: boolean;
  error?: string;
  stage?: string;
  steps?: Record<string, string>;
}

/**
 * Botão de diagnóstico do Cloudflare R2. Chama /api/health/r2 (round-trip
 * PUT→GET→DELETE) e mostra o resultado inline. Ajuda o admin a validar as
 * variáveis logo após o deploy, sem tentar um upload real.
 */
export function R2HealthCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/health/r2", { cache: "no-store" });
      setResult((await res.json()) as HealthResult);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={run} disabled={loading}>
        {loading ? "Testando…" : "Testar conexão R2"}
      </Button>

      {result && (
        <div
          className={`rounded-[8px] border p-3 text-xs ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
              : "border-red-500/30 bg-red-500/10 text-red-700"
          }`}
        >
          <p className="font-semibold">
            {result.ok ? "✓ Conexão OK — upload/leitura funcionando." : "✗ Falhou"}
          </p>
          {result.stage && <p>Etapa que falhou: {result.stage}</p>}
          {result.error && <p className="mt-1 break-words">{result.error}</p>}
          {result.steps && (
            <ul className="mt-1 space-y-0.5">
              {Object.entries(result.steps).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
