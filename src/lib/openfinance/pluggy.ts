/**
 * Cliente mínimo da Pluggy (agregador de Open Finance brasileiro).
 * Ver docs/STACK.md §2 (Open Finance) e §5 (variáveis PLUGGY_*).
 *
 * Fluxo: autentica com client_id/secret → obtém apiKey → consulta transações
 * de um `itemId`/`accountId` conectado. O worker (src/workers) usa isto para
 * popular lançamentos de caixa para conciliação.
 */

const PLUGGY_BASE = "https://api.pluggy.ai";

export function isPluggyConfigured(): boolean {
  return Boolean(
    process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET,
  );
}

export interface PluggyTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string | null;
}

/** Autentica e retorna a apiKey de curta duração. */
export async function authenticate(): Promise<string> {
  if (!isPluggyConfigured()) {
    throw new Error("Pluggy não configurada (ver .env.example).");
  }
  const res = await fetch(`${PLUGGY_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Pluggy auth falhou: ${res.status}`);
  const json = (await res.json()) as { apiKey: string };
  return json.apiKey;
}

/** Lista transações de uma conta conectada, no período informado. */
export async function listTransactions(
  apiKey: string,
  accountId: string,
  opts: { from?: string; to?: string } = {},
): Promise<PluggyTransaction[]> {
  const params = new URLSearchParams({ accountId });
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);

  const res = await fetch(`${PLUGGY_BASE}/transactions?${params}`, {
    headers: { "X-API-KEY": apiKey },
  });
  if (!res.ok) throw new Error(`Pluggy transactions falhou: ${res.status}`);
  const json = (await res.json()) as { results: PluggyTransaction[] };
  return json.results ?? [];
}
