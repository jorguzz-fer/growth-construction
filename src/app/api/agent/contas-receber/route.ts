import { handleAgent } from "@/lib/agent/http";
import { requireScreen } from "@/lib/agent/auth";
import { getReceivables } from "@/lib/queries";
import { casaNome, empacotar, limiteDe } from "@/lib/agent/lista";
import { intervalo } from "@/lib/agent/datas";
import { brl, dateBR, dateInRange, ymd } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recebíveis previstos — a tela "Contas a Receber".
 *
 * `getReceivables` expande o plano de pagamento das unidades vendidas da
 * versão "atual" em parcelas datadas. É PREVISÃO, não extrato: mostra o que
 * está contratado a receber, não o que caiu na conta.
 *
 * `?projeto=OBRA 28` responde "quanto tem a receber da OBRA 28".
 */
export async function GET(req: Request) {
  return handleAgent(req, { rota: "contas-receber" }, async (id, url) => {
    requireScreen(id, "contasreceber");

    const todos = await getReceivables(id.tenantId);
    const { de, ate } = intervalo(url);
    const projeto = url.searchParams.get("projeto");

    const filtrados = todos
      .filter((r) => casaNome(r.projectName, projeto))
      .filter((r) => (!de && !ate ? true : dateInRange(r.dia, de, ate)))
      .map((r) => ({
        unidade: r.unitCode,
        projeto: r.projectName,
        cliente: r.clienteNome,
        descricao: r.descricao,
        vencimento: dateBR(r.dia),
        valor: r.valor,
        valorBRL: brl(r.valor),
        status: r.status,
      }))
      .sort((a, b) => (ymd(a.vencimento) ?? 0) - (ymd(b.vencimento) ?? 0));

    return {
      empresa: id.tenantName,
      natureza: "previsao",
      filtro: {
        de: de ? dateBR(de) : null,
        ate: ate ? dateBR(ate) : null,
        projeto: projeto ?? "todos",
      },
      ...empacotar(filtrados, { limite: limiteDe(url), valor: (r) => r.valor }),
    };
  });
}
