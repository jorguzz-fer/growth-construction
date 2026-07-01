import * as XLSX from "xlsx";
import { PLANO_CONTAS } from "@/lib/calc/constants";
import { emptyPlan } from "@/lib/calc/plan";
import type { InccRow, PaymentPlan, UnitStatus } from "@/lib/calc/types";

/**
 * Formato padrão Growth Tools (planilha modelo .xlsx) — 5 abas:
 *   1. Parametros     (INCC 48 meses)
 *   2. Dados_de_Venda (unidades + cascata do plano de pagamento)
 *   3. Reembolso
 *   4. Permuta
 *   5. Despesas_CEF   (matriz subitem × 48 meses)
 *
 * Este módulo GERA o template (com estrutura de referência preenchida) e PARSEIA
 * uma planilha preenchida de volta para os tipos do domínio. Usado pela tela
 * Configuração da Versão (baixar modelo / importar dados).
 */

export const SHEETS = {
  parametros: "Parametros",
  vendas: "Dados_de_Venda",
  reembolso: "Reembolso",
  permuta: "Permuta",
  despesas: "Despesas_CEF",
} as const;

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Cabeçalho da aba Dados_de_Venda (55 colunas). */
const UNIT_HEADERS = [
  "Unidade", "Bloco", "Tipologia", "m2", "Andar", "Valor R$", "Status",
  "Mes Venda (MM/DD/AA)", "Usar AS?",
  "AS Valor", "AS Venc", "AS Nr", "AS->S1?",
  "S1 Valor", "S1 Venc", "S1 Nr", "S1->S2?",
  "S2 Valor", "S2 Venc", "S2 Nr", "S2->S3?",
  "S3 Valor", "S3 Venc", "S3 Nr", "S3->Mens?",
  "Mens Valor", "Mens Venc", "Mens Nr", "Mens->Sem?",
  "Sem Valor", "Sem Venc", "Sem Nr", "Sem->Anu?",
  "Anu Valor", "Anu Venc", "Anu Nr", "Anu->FGTS?",
  "FGTS Valor", "FGTS Data", "FGTS->Sub?",
  "Sub Valor", "Sub Data", "Sub Status", "Sub->Perm?",
  "Perm Desc", "Perm Valor", "Perm Data", "Perm->Banc?",
  "Banc Valor", "Banc DataEnt", "Banc Data1a", "Banc Status",
  "Total Fontes", "Saldo",
];

const REEMB_HEADERS = ["Data (DD/MM/AAAA)", "Origem", "Valor R$", "Porcentagem %", "Observacoes", "SERIAL (auto = INT(Data))"];
const PERM_HEADERS = ["ID", "Unidade", "Cliente", "Data Recebimento", "Tipo", "Descricao", "Valor Estimado R$", "Status", "Data Venda", "Valor Venda R$", "Tipo Permuta", "Observacoes"];
const PARAM_HEADERS = ["MES", "INCC MENSAL (%)", "INCC ACUMULADO (%)", "Observacao"];
const DESP_MONTH_COLS = Array.from({ length: 48 }, (_, i) => `${MESES[i % 12]}/Ano${Math.floor(i / 12) + 1}`);
const DESP_HEADERS = ["Grupo", "Subitem", ...DESP_MONTH_COLS];

// ──────────────────────────── geração do modelo ────────────────────────────

/** Gera o workbook modelo (buffer .xlsx) com a estrutura de referência. */
export function buildTemplateBuffer(incc: InccRow[]): Buffer {
  const wb = XLSX.utils.book_new();

  // Parametros (48 meses de INCC)
  const paramRows = [
    PARAM_HEADERS,
    ...incc.map((r) => [r.m, r.mo, r.ac, ""]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paramRows), SHEETS.parametros);

  // Dados_de_Venda (cabeçalho + linha de instrução)
  const vendaRows = [
    UNIT_HEADERS,
    ["* Preencha uma linha por unidade — deixe em branco os campos nao utilizados", "", "", "", "", "", "Disponivel|Reservado|Vendido", "", "Sim|Nao"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vendaRows), SHEETS.vendas);

  // Reembolso / Permuta (só cabeçalho)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([REEMB_HEADERS]), SHEETS.reembolso);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([PERM_HEADERS]), SHEETS.permuta);

  // Despesas_CEF (91 subitens do plano de contas × 48 meses em branco)
  const despRows: (string | number)[][] = [DESP_HEADERS];
  for (const g of [...PLANO_CONTAS.obra, ...PLANO_CONTAS.complementar]) {
    for (const s of g.sub) despRows.push([g.nome, s.nome, ...Array(48).fill("")]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(despRows), SHEETS.despesas);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ─────────────────────────────── parsing ───────────────────────────────

export interface ParsedUnit {
  code: string;
  bloco: string;
  tipo: string;
  m2: number | null;
  andar: number | null;
  valor: number;
  status: UnitStatus;
  mesVenda: string;
  plan: PaymentPlan;
}
export interface ParsedReembolso {
  data: string; origem: string; valor: number; pct: string; obs: string; serial: number | null;
}
export interface ParsedPermuta {
  unitCode: string; cliente: string; dataRecebimento: string; tipo: string; descricao: string;
  estimado: number; status: string; dataVenda: string; valorVenda: number; tipoPermuta: string; obs: string;
}
export interface ParsedDespesa {
  contaCef: string; competencia: string; vencimento: string; valor: number;
}
export interface ParsedWorkbook {
  incc: { mes: string; monthly: number; accumulated: number }[];
  units: ParsedUnit[];
  reembolsos: ParsedReembolso[];
  permutas: ParsedPermuta[];
  despesas: ParsedDespesa[];
}

const num = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const raw = String(v).trim();
  const br = /,\d{1,2}$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  const n = Number(br);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const flag = (v: unknown): boolean => str(v).toLowerCase() === "sim";
const status = (v: unknown): UnitStatus => {
  const s = str(v).toLowerCase();
  if (s.startsWith("vend")) return "Vendido";
  if (s.startsWith("reserv")) return "Reservado";
  return "Disponivel";
};

/** Lê a planilha como matriz e mapeia por cabeçalho. */
function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

export function parseWorkbook(buffer: Buffer | ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer" });

  // Parametros / INCC
  const incc = sheetRows(wb, SHEETS.parametros)
    .map((r) => ({
      mes: str(r["MES"]),
      monthly: num(r["INCC MENSAL (%)"]),
      accumulated: num(r["INCC ACUMULADO (%)"]),
    }))
    .filter((r) => /^\d{2}\/\d{4}$/.test(r.mes));
  const baseYear = incc[0] ? parseInt(incc[0].mes.split("/")[1], 10) : new Date().getFullYear();

  // Unidades
  const units: ParsedUnit[] = [];
  for (const r of sheetRows(wb, SHEETS.vendas)) {
    const code = str(r["Unidade"]);
    if (!code || code.startsWith("*")) continue;
    const plan = emptyPlan();
    plan.usarAS = flag(r["Usar AS?"]);
    plan.AS = { val: num(r["AS Valor"]), venc: str(r["AS Venc"]), n: num(r["AS Nr"]), usarS1: flag(r["AS->S1?"]) };
    plan.S1 = { val: num(r["S1 Valor"]), venc: str(r["S1 Venc"]), n: num(r["S1 Nr"]), usarS2: flag(r["S1->S2?"]) };
    plan.S2 = { val: num(r["S2 Valor"]), venc: str(r["S2 Venc"]), n: num(r["S2 Nr"]), usarS3: flag(r["S2->S3?"]) };
    plan.S3 = { val: num(r["S3 Valor"]), venc: str(r["S3 Venc"]), n: num(r["S3 Nr"]), usarMens: flag(r["S3->Mens?"]) };
    plan.Mensais = { val: num(r["Mens Valor"]), venc: str(r["Mens Venc"]), n: num(r["Mens Nr"]), usarSem: flag(r["Mens->Sem?"]) };
    plan.Semestrais = { val: num(r["Sem Valor"]), venc: str(r["Sem Venc"]), n: num(r["Sem Nr"]), usarAnu: flag(r["Sem->Anu?"]) };
    plan.Anuais = { val: num(r["Anu Valor"]), venc: str(r["Anu Venc"]), n: num(r["Anu Nr"]), usarFGTS: flag(r["Anu->FGTS?"]) };
    plan.FGTS = { val: num(r["FGTS Valor"]), dataPrev: str(r["FGTS Data"]), usarSub: flag(r["FGTS->Sub?"]) };
    plan.Subsidio = {
      val: num(r["Sub Valor"]), dataPrev: str(r["Sub Data"]),
      statusSub: str(r["Sub Status"]).toLowerCase().startsWith("receb") ? "Recebido" : "Aguardando Caixa",
      usarPer: flag(r["Sub->Perm?"]),
    };
    plan.Permuta = { desc: str(r["Perm Desc"]), val: num(r["Perm Valor"]), dataPrev: str(r["Perm Data"]), usarFinanc: flag(r["Perm->Banc?"]) };
    plan.Banco = { valFinanc: num(r["Banc Valor"]), dataEntrada: str(r["Banc DataEnt"]), dataPrimParc: str(r["Banc Data1a"]), statusFinanc: str(r["Banc Status"]) };
    units.push({
      code, bloco: str(r["Bloco"]), tipo: str(r["Tipologia"]),
      m2: r["m2"] === "" ? null : num(r["m2"]),
      andar: r["Andar"] === "" ? null : num(r["Andar"]),
      valor: num(r["Valor R$"]), status: status(r["Status"]),
      mesVenda: str(r["Mes Venda (MM/DD/AA)"]), plan,
    });
  }

  // Reembolsos
  const reembolsos: ParsedReembolso[] = sheetRows(wb, SHEETS.reembolso)
    .filter((r) => num(r["Valor R$"]) !== 0)
    .map((r) => ({
      data: str(r["Data (DD/MM/AAAA)"]), origem: str(r["Origem"]), valor: num(r["Valor R$"]),
      pct: str(r["Porcentagem %"]), obs: str(r["Observacoes"]),
      serial: r["SERIAL (auto = INT(Data))"] === "" ? null : num(r["SERIAL (auto = INT(Data))"]),
    }));

  // Permutas
  const permutas: ParsedPermuta[] = sheetRows(wb, SHEETS.permuta)
    .filter((r) => str(r["Unidade"]) || num(r["Valor Estimado R$"]) !== 0)
    .map((r) => ({
      unitCode: str(r["Unidade"]), cliente: str(r["Cliente"]), dataRecebimento: str(r["Data Recebimento"]),
      tipo: str(r["Tipo"]), descricao: str(r["Descricao"]), estimado: num(r["Valor Estimado R$"]),
      status: str(r["Status"]) || "Disponivel", dataVenda: str(r["Data Venda"]),
      valorVenda: num(r["Valor Venda R$"]), tipoPermuta: str(r["Tipo Permuta"]), obs: str(r["Observacoes"]),
    }));

  // Despesas (matriz subitem × mês → um lançamento por célula preenchida)
  const nameToCode = subitemNameToCode();
  const despesas: ParsedDespesa[] = [];
  for (const r of sheetRows(wb, SHEETS.despesas)) {
    const subitem = str(r["Subitem"]);
    const code = nameToCode.get(subitem);
    if (!code) continue;
    DESP_MONTH_COLS.forEach((col, i) => {
      const valor = num(r[col]);
      if (valor === 0) return;
      const year = baseYear + Math.floor(i / 12);
      const mm = String((i % 12) + 1).padStart(2, "0");
      const comp = `${mm}/${year}`;
      despesas.push({ contaCef: code, competencia: comp, vencimento: comp, valor });
    });
  }

  return { incc, units, reembolsos, permutas, despesas };
}

/** Mapa nome-do-subitem → código do plano de contas (grupos de obra). */
function subitemNameToCode(): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of PLANO_CONTAS.obra) for (const s of g.sub) m.set(s.nome, s.id);
  for (const g of PLANO_CONTAS.complementar) for (const s of g.sub) m.set(s.nome, s.id);
  return m;
}
