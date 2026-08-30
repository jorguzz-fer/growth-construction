/**
 * O app guarda datas como "MM/DD/YYYY" (convenção herdada do protótipo, ver
 * src/lib/utils.ts). Aqui só existe o que a API de agente precisa a mais:
 * saber que dia é HOJE **no fuso de São Paulo**.
 *
 * Não é preciosismo: a VPS roda em UTC. Depois das 21h de Brasília o `new
 * Date()` do servidor já está no dia seguinte, e "contas a pagar hoje"
 * devolveria as de amanhã — silenciosamente, e só à noite.
 */
const FUSO = "America/Sao_Paulo";

/** Hoje em São Paulo, no formato interno "MM/DD/YYYY". */
export function hojeSP(agora: Date = new Date()): string {
  // "en-CA" formata como YYYY-MM-DD, que é estável para fatiar.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  const [a, m, d] = iso.split("-");
  return `${m}/${d}/${a}`;
}

/** "YYYY-MM-DD" (como a pessoa/agente escreve) → "MM/DD/YYYY" interno. */
export function isoParaInterno(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

/**
 * Resolve o intervalo pedido na query. `hoje=1` é atalho para o dia corrente
 * em São Paulo; `de`/`ate` aceitam "YYYY-MM-DD". Devolve o formato interno.
 */
export function intervalo(url: URL): { de: string; ate: string } {
  if (url.searchParams.get("hoje") === "1") {
    const h = hojeSP();
    return { de: h, ate: h };
  }
  // "" = limite aberto. `dateInRange` já trata data invalida como sem-limite
  // (ymd("") devolve null), então vazio de um lado só corta do outro.
  return {
    de: isoParaInterno(url.searchParams.get("de")) ?? "",
    ate: isoParaInterno(url.searchParams.get("ate")) ?? "",
  };
}
