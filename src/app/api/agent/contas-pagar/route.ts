import { handleAgent } from "@/lib/agent/http";
import { requireScreen } from "@/lib/agent/auth";
import { getContasPagar } from "@/lib/queries";
import { casaNome, empacotar, limiteDe } from "@/lib/agent/lista";
import { intervalo } from "@/lib/agent/datas";
import { brl, dateBR, dateInRange, ymd } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contas a pagar — a tela "Contas a Pagar".
 *
 * `?hoje=1` responde "o que vence hoje" já no fuso de São Paulo.
 * `?de=&ate=` (YYYY-MM-DD) para uma janela; `?status=` e `?projeto=` filtram.
 * Sem filtro nenhum devolve tudo do tenant, ordenado por vencimento.
 *
 * `getContasPagar` já exclui despesa cancelada e é escopada por tenant — o
 * filtro daqui é só recorte, não regra de negócio.
 */
export async function GET(req: Request) {
  return handleAgent(req, { rota: "contas-pagar" }, async (id, url) => {
    requireScreen(id, "contaspagar");

    const todas = await getContasPagar(id.tenantId);
    const { de, ate } = intervalo(url);
    const status = url.searchParams.get("status");
    const projeto = url.searchParams.get("projeto");
    const pendentes = url.searchParams.get("pendentes") === "1";

    const filtradas = todas
      .filter((c) => casaNome(c.projectName, projeto))
      .filter((c) => (!de && !ate ? true : dateInRange(c.vencimento, de, ate)))
      .filter((c) => !status || (c.status ?? "").toLowerCase() === status.toLowerCase())
      // "pendente" = ainda não saiu do caixa. Sem data de pagamento.
      .filter((c) => !pendentes || !c.dataPagamento)
      .map((c) => ({
        id: c.id,
        documento: c.numDoc,
        fornecedor: c.fornecedorNome,
        descricao: c.descricao,
        projeto: c.projectName,
        categoria: c.categoriaDre,
        valor: c.valor,
        valorBRL: brl(c.valor),
        vencimento: dateBR(c.vencimento),
        pagamento: dateBR(c.dataPagamento),
        formaPagamento: c.formaPagamento,
        status: c.status,
      }))
      .sort((a, b) => (ymd(a.vencimento) ?? 0) - (ymd(b.vencimento) ?? 0));

    return {
      empresa: id.tenantName,
      filtro: {
        de: de ? dateBR(de) : null,
        ate: ate ? dateBR(ate) : null,
        projeto: projeto ?? "todos",
        status: status ?? "todos",
        somentePendentes: pendentes,
      },
      ...empacotar(filtradas, { limite: limiteDe(url), valor: (c) => c.valor }),
    };
  });
}
