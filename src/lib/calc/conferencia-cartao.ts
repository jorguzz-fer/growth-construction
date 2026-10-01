import { faturaDaCompra, faturaSeguinte, type CicloDoCartao } from "@/lib/calc/cartao-ciclo";
import { ymd } from "@/lib/utils";

/**
 * Conferência do extrato do cartão (Prompt U, 5.1–5.2) — PURA, sem gravar
 * nada. Compara o que o cartão cobrou com o que está lançado, por fatura
 * (a data da compra decide a fatura, 2.1) e valor:
 *  - compras no extrato SEM lançamento (BU-2: a tela propõe o lançamento,
 *    que acontece em /despesas);
 *  - lançamentos SEM correspondência no extrato;
 *  - divergências de valor ou de data no mesmo par;
 *  - créditos e estornos (6.3: crédito que já foi antecipado aparece como par,
 *    sem segundo estorno).
 */

export interface ItemDoExtrato {
  id: string;
  /** "MM/DD/YYYY" */
  data: string | null;
  descricao: string | null;
  /** positivo = compra; negativo = crédito/estorno. */
  valor: number;
}

export interface CompraParaConferir {
  parcelaId: string;
  despesaId: string;
  numDoc: string | null;
  descricao: string | null;
  valor: number;
  numero: number;
  total: number;
  faturaFechamento: string;
}

export interface EstornoParaConferir {
  id: string;
  despesaId: string | null;
  numDoc: string | null;
  valor: number;
  data: string | null;
  origem: string;
  extratoItemId: string | null;
}

export interface Divergencia {
  item: ItemDoExtrato;
  compra: CompraParaConferir;
  motivo: "valor" | "data";
}

export interface Conferencia {
  casados: { item: ItemDoExtrato; compra: CompraParaConferir }[];
  semLancamento: ItemDoExtrato[];
  semExtrato: CompraParaConferir[];
  divergentes: Divergencia[];
  creditos: { item: ItemDoExtrato; estorno: EstornoParaConferir | null; vinculado: boolean }[];
  /** faturas (fechamento) cobertas pelo extrato subido. */
  faturasCobertas: string[];
}

const igual = (a: number, b: number) => Math.abs(a - b) <= 0.005;

/** Assinatura de dedup de um item do extrato (5.3) — mesmo padrão do caixa: cartão, data, centavos e descrição. */
export function assinaturaDoItem(cartaoId: string, data: string | null | undefined, valor: number, descricao: string | null | undefined): string {
  return `${cartaoId}|${(data ?? "").trim()}|${Math.round(valor * 100)}|${(descricao ?? "").trim().toLowerCase().slice(0, 80)}`;
}

export function conferirExtrato(itens: readonly ItemDoExtrato[], compras: readonly CompraParaConferir[], estornos: readonly EstornoParaConferir[], ciclo: CicloDoCartao): Conferencia {
  const livres = new Set(compras.map((c) => c.parcelaId));
  const porId = new Map(compras.map((c) => [c.parcelaId, c]));
  const faturaDe = (item: ItemDoExtrato) => (item.data ? faturaDaCompra(item.data, ciclo)?.fechamento ?? null : null);
  const vizinhas = (fechamento: string): string[] => {
    const f = { fechamento, vencimento: fechamento };
    const prox = faturaSeguinte(f, ciclo)?.fechamento;
    // a anterior: a fatura cujo "seguinte" é esta — anda um mês para trás
    const p = fechamento.split("/");
    const mes = Number(p[0]) === 1 ? 12 : Number(p[0]) - 1;
    const ano = Number(p[0]) === 1 ? Number(p[2]) - 1 : Number(p[2]);
    const ant = faturaDaCompra(`${String(mes).padStart(2, "0")}/01/${ano}`, ciclo)?.fechamento;
    return [ant, prox].filter((x): x is string => !!x);
  };
  const pegar = (filtro: (c: CompraParaConferir) => boolean): CompraParaConferir | null => {
    for (const id of livres) {
      const c = porId.get(id)!;
      if (filtro(c)) {
        livres.delete(id);
        return c;
      }
    }
    return null;
  };

  const compras_ = [...itens].filter((i) => i.valor > 0).sort((a, b) => (ymd(a.data) ?? 0) - (ymd(b.data) ?? 0));
  const casados: Conferencia["casados"] = [];
  const divergentes: Divergencia[] = [];
  const pendentes: ItemDoExtrato[] = [];
  const faturasCobertas = new Set<string>();
  // 1ª passada: mesma fatura, mesmo valor.
  for (const item of compras_) {
    const f = faturaDe(item);
    if (f) faturasCobertas.add(f);
    const c = f ? pegar((x) => x.faturaFechamento === f && igual(x.valor, item.valor)) : null;
    if (c) casados.push({ item, compra: c });
    else pendentes.push(item);
  }
  // 2ª passada: mesmo valor na fatura vizinha (data divergente) ou valor próximo na mesma fatura (valor divergente).
  const semLancamento: ItemDoExtrato[] = [];
  for (const item of pendentes) {
    const f = faturaDe(item);
    const porData = f ? pegar((x) => vizinhas(f).includes(x.faturaFechamento) && igual(x.valor, item.valor)) : null;
    if (porData) {
      divergentes.push({ item, compra: porData, motivo: "data" });
      continue;
    }
    const porValor = f ? pegar((x) => x.faturaFechamento === f && !igual(x.valor, item.valor) && Math.abs(x.valor - item.valor) <= Math.max(0.5, item.valor * 0.05)) : null;
    if (porValor) {
      divergentes.push({ item, compra: porValor, motivo: "valor" });
      continue;
    }
    semLancamento.push(item);
  }
  // Lançamentos sem extrato: só das faturas que o extrato cobre.
  const semExtrato = [...livres].map((id) => porId.get(id)!).filter((c) => faturasCobertas.has(c.faturaFechamento));
  // Créditos: já vinculado a um estorno, ou antecipado sem vínculo com o mesmo valor (6.3), ou sem estorno.
  const usados = new Set<string>();
  const creditos: Conferencia["creditos"] = itens
    .filter((i) => i.valor < 0)
    .map((item) => {
      const vinculado = estornos.find((e) => e.extratoItemId === item.id) ?? null;
      if (vinculado) {
        usados.add(vinculado.id);
        return { item, estorno: vinculado, vinculado: true };
      }
      const antecipado = estornos.find((e) => !e.extratoItemId && !usados.has(e.id) && e.origem === "antecipado" && igual(e.valor, Math.abs(item.valor))) ?? null;
      if (antecipado) usados.add(antecipado.id);
      return { item, estorno: antecipado, vinculado: false };
    });
  return { casados, semLancamento, semExtrato, divergentes, creditos, faturasCobertas: [...faturasCobertas].sort((a, b) => (ymd(a) ?? 0) - (ymd(b) ?? 0)) };
}
