import { getBankAccounts, getCashDaEmpresa, getDailyClosings, type DailyClosingRow } from "@/lib/queries";
import { saldoDisponivel } from "@/lib/contas-saldo";
import { cadeiaDeSaldo, type FechamentoGravado, type MovimentoDeCaixa } from "@/lib/calc/cadeia-caixa";

/**
 * Prompt L, Parte 9 (9.9) — a cadeia de saldo é DA EMPRESA: o saldo em conta
 * é a soma das contas (que são do tenant), então o conciliado que se compara
 * a ele precisa somar todas as obras. O fechamento é sempre do tenant inteiro
 * (projectId nulo), como já era. A tabela de movimentos da tela continua
 * por obra; só a cadeia e o fechamento são da empresa.
 *
 * A action de fechar e a página usam ESTA função: os números gravados são os
 * mesmos que o cartão mostra (9.2 — nada vem do cliente).
 */
export function fechamentosAtivos(rows: readonly DailyClosingRow[]): FechamentoGravado[] {
  return rows
    .filter((f) => !f.projectId && !f.reabertoEm)
    .map((f) => ({
      dia: f.dia,
      saldoFinal: Number(f.saldoFinal),
      id: f.id,
      saldoInicial: Number(f.saldoInicial),
      saldoEmConta: f.saldoEmConta == null ? null : Number(f.saldoEmConta),
      divergencia: Number(f.divergencias),
      responsavel: f.responsavelNome,
      fechadoEm: f.closedAt ? new Date(f.closedAt).toISOString() : null,
    }));
}

export async function cadeiaDaEmpresa(tenantId: string, opts: { hojeISO: string; diasPassados?: number; diasFuturos?: number }) {
  const [contas, cash, closings] = await Promise.all([getBankAccounts(tenantId), getCashDaEmpresa(tenantId), getDailyClosings(tenantId)]);
  const fechamentos = fechamentosAtivos(closings);
  const movimentos: MovimentoDeCaixa[] = cash.map((c) => ({ id: c.id, data: c.data, valor: Number(c.valor), rec: c.rec, cat: c.cat, importado: !!c.importHash, bankAccountId: c.bankAccountId }));
  const saldoEmContaAtual = saldoDisponivel(contas);
  const cadeia = cadeiaDeSaldo({ movimentos, saldoEmContaAtual, fechamentos, hojeISO: opts.hojeISO, diasPassados: opts.diasPassados, diasFuturos: opts.diasFuturos });
  return { cadeia, contas, cash, closings, fechamentos, movimentos, saldoEmContaAtual };
}
