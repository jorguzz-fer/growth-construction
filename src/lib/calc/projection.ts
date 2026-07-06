import { getIncc } from "./incc";
import type {
  CalcPermuta,
  CalcReembolso,
  CalcUnit,
  InccRow,
  MonthlyProjection,
  VersionTotals,
} from "./types";

// ─────────────────────────── helpers de data ────────────────────────────

interface ParsedDate {
  mo: number;
  d: number;
  yr: number;
}

/** Parse de "MM/DD/YYYY" → {mo,d,yr} (null se vazio/ inválido). */
export function parseDate(s: string | null | undefined): ParsedDate | null {
  if (!s || !s.trim()) return null;
  const p = s.split("/");
  if (p.length < 3) return null;
  return { mo: parseInt(p[0], 10), d: parseInt(p[1], 10), yr: parseInt(p[2], 10) };
}

/** Chave de mês "MM/YYYY". */
export function monthKey(mo: number, yr: number): string {
  return String(mo).padStart(2, "0") + "/" + yr;
}

/** Avança `n` meses a partir de (mo, yr), normalizando o ano. */
export function addMonths(mo: number, yr: number, n: number): ParsedDate {
  let m = mo + n;
  let y = yr;
  while (m > 12) {
    m -= 12;
    y++;
  }
  return { mo: m, d: 1, yr: y };
}

const INCC_FROM_INSTALLMENT = 4; // correção a partir da 5ª parcela (i >= 4)

// ───────────────────────────── projeção ─────────────────────────────────

/**
 * Projeta os recebíveis de uma unidade vendida mês a mês (matriz "MM/YYYY" →
 * valor). Espelha `calcProj()` do protótipo: percorre a cascata de fontes,
 * cada uma liberada pela flag da anterior, aplicando INCC nas fontes
 * periódicas a partir da 5ª parcela. Retorna {} se a unidade não estiver
 * vendida.
 */
export function calcProjection(
  u: CalcUnit,
  incc: readonly InccRow[] = [],
): MonthlyProjection {
  const proj: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) proj[mm] = (proj[mm] || 0) + v;
  };
  if (u.status !== "Vendido") return proj;

  const periodic = (val: number, i: number, mk: string) =>
    Math.round(
      val * (1 + (i >= INCC_FROM_INSTALLMENT ? getIncc(incc, mk) : 0) / 100) *
        100,
    ) / 100;

  if (u.usarAS && u.AS.val > 0) {
    const d = parseDate(u.AS.venc);
    if (d)
      for (let i = 0; i < (u.AS.n || 1); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        add(monthKey(dt.mo, dt.yr), u.AS.val);
      }
  }
  if (u.AS.usarS1 && u.S1.val > 0) {
    const d = parseDate(u.S1.venc);
    if (d)
      for (let i = 0; i < (u.S1.n || 1); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        add(monthKey(dt.mo, dt.yr), u.S1.val);
      }
  }
  if (u.S1.usarS2 && u.S2.val > 0) {
    const d = parseDate(u.S2.venc);
    if (d)
      for (let i = 0; i < (u.S2.n || 1); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        add(monthKey(dt.mo, dt.yr), u.S2.val);
      }
  }
  if (u.S2.usarS3 && u.S3.val > 0) {
    const d = parseDate(u.S3.venc);
    if (d)
      for (let i = 0; i < (u.S3.n || 1); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        add(monthKey(dt.mo, dt.yr), u.S3.val);
      }
  }
  if (u.S3.usarMens && u.Mensais.val > 0) {
    const d = parseDate(u.Mensais.venc);
    if (d)
      for (let i = 0; i < (u.Mensais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        const mk = monthKey(dt.mo, dt.yr);
        add(mk, periodic(u.Mensais.val, i, mk));
      }
  }
  if (u.Mensais.usarSem && u.Semestrais.val > 0) {
    const d = parseDate(u.Semestrais.venc);
    if (d)
      for (let i = 0; i < (u.Semestrais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 6);
        const mk = monthKey(dt.mo, dt.yr);
        add(mk, periodic(u.Semestrais.val, i, mk));
      }
  }
  if (u.Semestrais.usarAnu && u.Anuais.val > 0) {
    const d = parseDate(u.Anuais.venc);
    if (d)
      for (let i = 0; i < (u.Anuais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 12);
        const mk = monthKey(dt.mo, dt.yr);
        add(mk, periodic(u.Anuais.val, i, mk));
      }
  }
  if (u.Anuais.usarFGTS && u.FGTS.val > 0) {
    const d = parseDate(u.FGTS.dataPrev);
    if (d) add(monthKey(d.mo, d.yr), u.FGTS.val);
  }
  if (u.FGTS.usarSub && u.Subsidio.val > 0 && u.Subsidio.statusSub === "Recebido") {
    const d = parseDate(u.Subsidio.dataPrev);
    if (d) add(monthKey(d.mo, d.yr), u.Subsidio.val);
  }
  if (u.Subsidio.usarPer && u.Permuta.val > 0) {
    const d = parseDate(u.Permuta.dataPrev);
    if (d) add(monthKey(d.mo, d.yr), u.Permuta.val);
  }
  return proj;
}

/** Fontes de receita usadas no consolidado (quebra da projeção por tipo). */
export const PROJECTION_SOURCES = [
  "AS/Sinais",
  "Mensais",
  "Semestrais",
  "Anuais",
  "FGTS",
  "Subsídio",
  "Permuta",
] as const;
export type ProjectionSource = (typeof PROJECTION_SOURCES)[number];

/**
 * Igual a `calcProjection`, mas separando a receita projetada por tipo de fonte
 * (AS/Sinais, Mensais, …). Usado no Consolidado. Retorna um mapa vazio por
 * fonte se a unidade não estiver vendida.
 */
export function calcProjectionBySource(
  u: CalcUnit,
  incc: readonly InccRow[] = [],
): Record<ProjectionSource, MonthlyProjection> {
  const out = {
    "AS/Sinais": {},
    Mensais: {},
    Semestrais: {},
    Anuais: {},
    FGTS: {},
    Subsídio: {},
    Permuta: {},
  } as Record<ProjectionSource, MonthlyProjection>;
  if (u.status !== "Vendido") return out;
  const add = (key: ProjectionSource, mm: string, v: number) => {
    if (v > 0) out[key][mm] = (out[key][mm] || 0) + v;
  };
  const periodic = (val: number, i: number, mk: string) =>
    Math.round(
      val * (1 + (i >= INCC_FROM_INSTALLMENT ? getIncc(incc, mk) : 0) / 100) * 100,
    ) / 100;

  const signals: { use: boolean; val: number; venc: string; n: number }[] = [
    { use: u.usarAS, val: u.AS.val, venc: u.AS.venc, n: u.AS.n },
    { use: u.AS.usarS1, val: u.S1.val, venc: u.S1.venc, n: u.S1.n },
    { use: u.S1.usarS2, val: u.S2.val, venc: u.S2.venc, n: u.S2.n },
    { use: u.S2.usarS3, val: u.S3.val, venc: u.S3.venc, n: u.S3.n },
  ];
  for (const s of signals) {
    if (s.use && s.val > 0) {
      const d = parseDate(s.venc);
      if (d)
        for (let i = 0; i < (s.n || 1); i++) {
          const dt = addMonths(d.mo, d.yr, i);
          add("AS/Sinais", monthKey(dt.mo, dt.yr), s.val);
        }
    }
  }
  if (u.S3.usarMens && u.Mensais.val > 0) {
    const d = parseDate(u.Mensais.venc);
    if (d)
      for (let i = 0; i < (u.Mensais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        const mk = monthKey(dt.mo, dt.yr);
        add("Mensais", mk, periodic(u.Mensais.val, i, mk));
      }
  }
  if (u.Mensais.usarSem && u.Semestrais.val > 0) {
    const d = parseDate(u.Semestrais.venc);
    if (d)
      for (let i = 0; i < (u.Semestrais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 6);
        const mk = monthKey(dt.mo, dt.yr);
        add("Semestrais", mk, periodic(u.Semestrais.val, i, mk));
      }
  }
  if (u.Semestrais.usarAnu && u.Anuais.val > 0) {
    const d = parseDate(u.Anuais.venc);
    if (d)
      for (let i = 0; i < (u.Anuais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 12);
        const mk = monthKey(dt.mo, dt.yr);
        add("Anuais", mk, periodic(u.Anuais.val, i, mk));
      }
  }
  if (u.Anuais.usarFGTS && u.FGTS.val > 0) {
    const d = parseDate(u.FGTS.dataPrev);
    if (d) add("FGTS", monthKey(d.mo, d.yr), u.FGTS.val);
  }
  if (u.FGTS.usarSub && u.Subsidio.val > 0 && u.Subsidio.statusSub === "Recebido") {
    const d = parseDate(u.Subsidio.dataPrev);
    if (d) add("Subsídio", monthKey(d.mo, d.yr), u.Subsidio.val);
  }
  if (u.Subsidio.usarPer && u.Permuta.val > 0) {
    const d = parseDate(u.Permuta.dataPrev);
    if (d) add("Permuta", monthKey(d.mo, d.yr), u.Permuta.val);
  }
  return out;
}

/**
 * Total contratado da unidade (soma de todas as fontes). Comparado ao VGV
 * gera o saldo. Espelha `calcUnitTotal()`. Retorna 0 se não vendida.
 */
export function calcUnitTotal(u: CalcUnit): number {
  if (u.status !== "Vendido") return 0;
  let t = 0;
  t +=
    (u.AS.val || 0) * (u.AS.n || 1) +
    (u.S1.val || 0) * (u.S1.n || 1) +
    (u.S2.val || 0) * (u.S2.n || 1) +
    (u.S3.val || 0) * (u.S3.n || 1);
  t +=
    (u.Mensais.val || 0) * (u.Mensais.n || 0) +
    (u.Semestrais.val || 0) * (u.Semestrais.n || 0) +
    (u.Anuais.val || 0) * (u.Anuais.n || 0);
  t +=
    (u.FGTS.val || 0) +
    (u.Subsidio.val || 0) +
    (u.Permuta.val || 0) +
    (u.Banco.valFinanc || 0);
  return t;
}

/** Revenda de um bem recebido em permuta (item 10). */
export interface CalcPermutaResale {
  valorVenda: number;
  dataVenda: string; // "MM/DD/YYYY"
  formaVenda: string; // "avista" | "parcelada" | "escambo"
  parcelas: number;
  periodicidade: string; // "mensal" | "semestral" | "anual"
  dataPrimParcela: string; // "MM/DD/YYYY"
}

const STEP: Record<string, number> = { mensal: 1, semestral: 6, anual: 12 };

/**
 * Recebimentos FINANCEIROS da revenda de bens recebidos em permuta, por mês.
 * À vista: 1 recebimento na data da venda. Parcelada: N parcelas iguais a
 * partir da 1ª, na periodicidade informada. Escambo NÃO gera caixa (sem
 * entrada financeira). Alimenta Fluxo de Caixa e Caixa (previstas).
 */
export function permutaCashByMonth(
  rows: readonly CalcPermutaResale[],
): MonthlyProjection {
  const out: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) out[mm] = (out[mm] || 0) + v;
  };
  for (const r of rows) {
    const forma = (r.formaVenda || "").toLowerCase();
    if (!r.valorVenda || r.valorVenda <= 0) continue;
    if (forma === "escambo") continue; // sem entrada financeira
    if (forma === "parcelada" && r.parcelas > 0) {
      const d = parseDate(r.dataPrimParcela) ?? parseDate(r.dataVenda);
      if (!d) continue;
      const step = STEP[(r.periodicidade || "mensal").toLowerCase()] ?? 1;
      const parc = Math.round((r.valorVenda / r.parcelas) * 100) / 100;
      for (let i = 0; i < r.parcelas; i++) {
        const dt = addMonths(d.mo, d.yr, i * step);
        add(monthKey(dt.mo, dt.yr), parc);
      }
    } else {
      // à vista (ou forma não informada): recebimento único na data da venda.
      const d = parseDate(r.dataVenda) ?? parseDate(r.dataPrimParcela);
      if (d) add(monthKey(d.mo, d.yr), r.valorVenda);
    }
  }
  return out;
}

/**
 * Receita CONTÁBIL da revenda de permuta para a DRE, por mês. Igual ao caixa
 * para à vista/parcelada; para ESCAMBO, contabiliza o valor na data do escambo
 * (data da venda), sem gerar caixa.
 */
export function permutaRevenueByMonth(
  rows: readonly CalcPermutaResale[],
): MonthlyProjection {
  const out: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) out[mm] = (out[mm] || 0) + v;
  };
  const cash = permutaCashByMonth(rows);
  for (const [mm, v] of Object.entries(cash)) add(mm, v);
  // Escambo: só DRE, na data do escambo.
  for (const r of rows) {
    if ((r.formaVenda || "").toLowerCase() !== "escambo") continue;
    if (!r.valorVenda || r.valorVenda <= 0) continue;
    const d = parseDate(r.dataVenda) ?? parseDate(r.dataPrimParcela);
    if (d) add(monthKey(d.mo, d.yr), r.valorVenda);
  }
  return out;
}

/** Agrega reembolsos por mês ("MM/YYYY"). Espelha `rembByMonth()`. */
export function reembursementsByMonth(
  reembolsos: readonly CalcReembolso[],
): MonthlyProjection {
  const m: MonthlyProjection = {};
  reembolsos.forEach((r) => {
    if (r.data && r.valor > 0) {
      const p = r.data.split("/");
      if (p.length === 3) {
        const k = p[0] + "/" + p[2];
        m[k] = (m[k] || 0) + r.valor;
      }
    }
  });
  return m;
}

/**
 * Agrega os totais de receita de uma versão (VGV, sinais, mensais, semestrais,
 * anuais, FGTS, subsídio, permuta recebida/vendida, reembolsos, banco e
 * contagem por status). Espelha `calcTotals()`, recebendo as coleções da
 * versão ao invés de ler estado global.
 */
export function calcTotals(
  units: readonly CalcUnit[],
  permutas: readonly CalcPermuta[],
  reembolsos: readonly CalcReembolso[],
): VersionTotals {
  let sinais = 0,
    mens = 0,
    sem = 0,
    anu = 0,
    fgts = 0,
    sub = 0,
    permRec = 0,
    permVend = 0,
    banco = 0;

  units.forEach((u) => {
    if (u.status !== "Vendido") return;
    sinais +=
      (u.AS.val || 0) * (u.AS.n || 1) +
      (u.S1.val || 0) +
      (u.S2.val || 0) +
      (u.S3.val || 0);
    mens += (u.Mensais.val || 0) * (u.Mensais.n || 0);
    sem += (u.Semestrais.val || 0) * (u.Semestrais.n || 0);
    anu += (u.Anuais.val || 0) * (u.Anuais.n || 0);
    fgts += u.FGTS.val || 0;
    sub += u.Subsidio.val || 0;
    banco += u.Banco.valFinanc || 0;
  });

  permutas.forEach((p) => {
    permRec += p.estimado || 0;
    if (p.status === "Vendido") permVend += p.valorVenda || 0;
  });

  const reemb = reembolsos.reduce((a, r) => a + (r.valor || 0), 0);
  const vgv = units.reduce((a, u) => a + u.valor, 0);

  return {
    vgv,
    sinais,
    mens,
    sem,
    anu,
    fgts,
    sub,
    permRec,
    permVend,
    reemb,
    banco,
    disp: units.filter((u) => u.status === "Disponivel").length,
    res: units.filter((u) => u.status === "Reservado").length,
    vend: units.filter((u) => u.status === "Vendido").length,
  };
}
