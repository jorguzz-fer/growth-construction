import type { PaymentPlan } from "./types";

/** Plano de pagamento com a cascata zerada/desligada (unidade nova). */
export function emptyPlan(): PaymentPlan {
  const s = { val: 0, venc: "", n: 0 };
  return {
    usarAS: false,
    AS: { ...s, usarS1: false },
    S1: { ...s, usarS2: false },
    S2: { ...s, usarS3: false },
    S3: { ...s, usarMens: false },
    Mensais: { ...s, usarSem: false },
    Semestrais: { ...s, usarAnu: false },
    Anuais: { ...s, usarFGTS: false },
    FGTS: { val: 0, dataPrev: "", usarSub: false },
    Subsidio: { val: 0, dataPrev: "", statusSub: "Aguardando Caixa", usarPer: false },
    Permuta: { desc: "", val: 0, dataPrev: "", usarFinanc: false },
    Banco: { valFinanc: 0, dataEntrada: "", dataPrimParc: "", statusFinanc: "" },
  };
}
