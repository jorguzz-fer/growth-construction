import { parseDate, addMonths } from "./projection";
import type { PaymentPlan, UnitStatus } from "./types";

export interface Receivable {
  /** data prevista, "MM/DD/YYYY". */
  dia: string;
  valor: number;
  label: string;
}

/**
 * Expande o plano de pagamento de uma unidade vendida em recebíveis datados
 * (uma linha por vencimento). Base do painel "Receitas a Receber do Dia".
 * Só gera recebíveis para unidades com status "Vendido".
 */
export function expandUnitReceivables(
  plan: PaymentPlan | null | undefined,
  status: UnitStatus,
): Receivable[] {
  if (status !== "Vendido" || !plan) return [];
  const out: Receivable[] = [];
  const fmt = (mo: number, d: number, yr: number) =>
    `${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}/${yr}`;

  const periodic: { venc: string; val: number; n: number; label: string; step: number }[] = [
    { venc: plan.AS.venc, val: plan.AS.val, n: plan.AS.n, label: "Ato", step: 1 },
    { venc: plan.S1.venc, val: plan.S1.val, n: plan.S1.n, label: "Sinal 1", step: 1 },
    { venc: plan.S2.venc, val: plan.S2.val, n: plan.S2.n, label: "Sinal 2", step: 1 },
    { venc: plan.S3.venc, val: plan.S3.val, n: plan.S3.n, label: "Sinal 3", step: 1 },
    { venc: plan.Mensais.venc, val: plan.Mensais.val, n: plan.Mensais.n, label: "Mensal", step: 1 },
    { venc: plan.Semestrais.venc, val: plan.Semestrais.val, n: plan.Semestrais.n, label: "Semestral", step: 6 },
    { venc: plan.Anuais.venc, val: plan.Anuais.val, n: plan.Anuais.n, label: "Anual", step: 12 },
  ];
  for (const s of periodic) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    const n = Math.max(1, Number(s.n) || 1);
    if (!d || val <= 0) continue;
    for (let i = 0; i < n; i++) {
      const a = addMonths(d.mo, d.yr, i * s.step);
      out.push({
        dia: fmt(a.mo, d.d, a.yr),
        valor: val,
        label: n > 1 ? `${s.label} #${i + 1}` : s.label,
      });
    }
  }

  const singles: { venc: string; val: number; label: string }[] = [
    { venc: plan.FGTS.dataPrev, val: plan.FGTS.val, label: "FGTS" },
    { venc: plan.Subsidio.dataPrev, val: plan.Subsidio.val, label: "Subsídio" },
    { venc: plan.Permuta.dataPrev, val: plan.Permuta.val, label: "Permuta" },
    { venc: plan.Banco.dataPrimParc, val: plan.Banco.valFinanc, label: "Financiamento" },
  ];
  for (const s of singles) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    if (!d || val <= 0) continue;
    out.push({ dia: fmt(d.mo, d.d, d.yr), valor: val, label: s.label });
  }
  return out;
}
