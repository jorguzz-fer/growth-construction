import { NextResponse } from "next/server";
import { AgentAuthError, resolveAgentIdentity, type AgentIdentity } from "./auth";
import { logAudit } from "@/lib/audit";

/**
 * Casca comum dos handlers da API de agente: resolve a identidade, executa,
 * registra no log de auditoria e traduz exceção em JSON.
 *
 * O erro devolvido é **legível pelo agente** (`erro` em português) — é isso
 * que a Cris vai ler para explicar à pessoa por que não respondeu. Nada de
 * stack trace: o skill de armadilhas já registrou o caso em que um AxiosError
 * inteiro foi parar no contexto do modelo.
 */
export async function handleAgent<T>(
  req: Request,
  opts: { rota: string; auditar?: boolean },
  fn: (id: AgentIdentity, url: URL) => Promise<T>,
): Promise<NextResponse> {
  let id: AgentIdentity | null = null;
  try {
    id = await resolveAgentIdentity(req);
    const dados = await fn(id, new URL(req.url));

    if (opts.auditar !== false) {
      // Consulta de dado financeiro por WhatsApp deixa rastro: quem perguntou,
      // de qual número, o quê. É barato e é o que responde "quem viu isso?".
      await logAudit({
        tenantId: id.tenantId,
        userId: id.userId,
        action: "consulta",
        entity: "api-agente",
        entityId: opts.rota,
        meta: { telefone: id.phone, rota: opts.rota, url: req.url },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...dados });
  } catch (e) {
    if (e instanceof AgentAuthError) {
      return NextResponse.json({ ok: false, codigo: e.code, erro: e.message }, { status: e.status });
    }
    console.error(`[api-agente] ${opts.rota} falhou`, e);
    return NextResponse.json(
      { ok: false, codigo: "erro_interno", erro: "Falha ao consultar o Growth." },
      { status: 500 },
    );
  }
}
