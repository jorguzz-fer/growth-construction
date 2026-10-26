import "server-only";
import { and, eq, getTableColumns, gte, inArray, isNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";
import { chaveCompetencia, chaveDataBR } from "@/lib/db/ordem-data";
import { TIPOS_ASO } from "@/lib/funcionario-docs-regras";
import type { SemesterInfo } from "@/lib/semester";
import {
  TABELAS_DO_PACOTE,
  descreverRecorte,
  ehMovimento,
  tabelaDoPacote,
  tabelaDrizzle,
  type TabelaDoPacote,
} from "@/lib/backup-catalogo";
import { linhaParaArquivo, limitesDoSemestre, somasDeControle, type Linha } from "@/lib/backup-pacote-texto";

/**
 * Prompt AO, Partes 1, 2 e 4.2 — lê do banco o que entra no pacote completo.
 *
 * SOMENTE LEITURA: só `select`. Cada tabela é recortada NO SQL (4.2) — nenhuma
 * é carregada inteira para ser filtrada em memória. Cadastro vem inteiro;
 * movimento, pelo semestre. A linha de movimento sem data reconhecível entra
 * em todo pacote, contada à parte: sem isso ela não cairia em semestre nenhum.
 */

export interface TabelaExtraida {
  tabela: string;
  familia: string;
  camada: "cadastro" | "movimento";
  recorte: string;
  linhas: Linha[];
  /** movimento sem data reconhecível (entra em todo pacote). */
  semData: number;
  colunasOmitidas: string[];
  motivoOmissao?: string;
  somas: Record<string, string>;
  /** a consulta falhou: declarada, não silenciada (4.5). */
  erro?: string;
}

export interface ReferenciaForaDoRecorte {
  tabela: string;
  coluna: string;
  aponta: string;
  quantas: number;
}

export interface DadosDoPacote {
  semestre: string;
  rotulo: string;
  /** quando o cadastro foi capturado (2.3). */
  capturadoEm: Date;
  /** o recorte do movimento (2.3). */
  corte: { inicio: Date; fim: Date };
  tabelas: TabelaExtraida[];
  referenciasFora: ReferenciaForaDoRecorte[];
  /** `number_sequence` como informação (1.4). */
  sequencias: { entidade: string; prefixo: string; usaPrefixo: boolean; digitos: number; proximo: number }[];
  /** os arquivos a baixar do R2 (linhas de `document` que entraram). */
  documentos: { id: string; storageKey: string; filename: string | null }[];
  /** documentos de ASO do período que ficaram fora (BAO-2). */
  asoOmitidos: number;
}

const colunas = (t: PgTable) => getTableColumns(t) as Record<string, PgColumn>;

function coluna(t: PgTable, chave: string): PgColumn {
  const c = colunas(t)[chave];
  if (!c) throw new Error(`Coluna ${chave} não existe em ${getTableConfig(t).name}.`);
  return c;
}

/** A chave de ordenação da data do recorte (null = sem data reconhecível). */
function chaveDoRecorte(t: TabelaDoPacote): SQL | null {
  const tb = tabelaDrizzle(t);
  const r = t.recorte;
  if (r.tipo === "data") {
    const ks = r.colunas.map((c) => chaveDataBR(coluna(tb, c)));
    return ks.length === 1 ? ks[0] : sql`coalesce(${sql.join(ks, sql`, `)})`;
  }
  if (r.tipo === "competencia") return chaveCompetencia(coluna(tb, r.coluna));
  return null;
}

/** A condição do semestre (sem o tenant). undefined = cadastro, tudo entra. */
function condicaoDoSemestre(tenantId: string, t: TabelaDoPacote, info: SemesterInfo): SQL | undefined {
  const tb = tabelaDrizzle(t);
  const r = t.recorte;
  const lim = limitesDoSemestre(info);
  switch (r.tipo) {
    case "cadastro":
      return undefined;
    case "data": {
      const k = chaveDoRecorte(t)!;
      return sql`((${k}) between ${lim.diaInicio} and ${lim.diaFim} or (${k}) is null)`;
    }
    case "competencia": {
      const k = chaveDoRecorte(t)!;
      return sql`((${k}) between ${lim.mesInicio} and ${lim.mesFim} or (${k}) is null)`;
    }
    case "instante": {
      const c = coluna(tb, r.coluna);
      return or(and(gte(c, info.start), lte(c, info.end)), isNull(c));
    }
    case "pai": {
      const pai = tabelaDoPacote(r.pai)!;
      const pt = tabelaDrizzle(pai);
      const sub = db
        .select({ id: coluna(pt, "id") })
        .from(pt)
        .where(and(eq(coluna(pt, "tenantId"), tenantId), condicaoDoSemestre(tenantId, pai, info)));
      const c = coluna(tb, r.coluna);
      return or(inArray(c, sub), isNull(c));
    }
  }
}

function filtroDoTenant(tenantId: string, t: TabelaDoPacote): SQL {
  const tb = tabelaDrizzle(t);
  return t.tabela === "tenant" ? eq(coluna(tb, "id"), tenantId) : eq(coluna(tb, "tenantId"), tenantId);
}

function filtroSemAso(t: TabelaDoPacote): SQL | undefined {
  if (!t.semAso) return undefined;
  const tipo = coluna(tabelaDrizzle(t), "tipo");
  return or(isNull(tipo), notInArray(tipo, [...TIPOS_ASO]));
}

async function extrairTabela(tenantId: string, t: TabelaDoPacote, info: SemesterInfo): Promise<TabelaExtraida> {
  const tb = tabelaDrizzle(t);
  const base: Omit<TabelaExtraida, "linhas" | "semData" | "somas"> = {
    tabela: t.tabela,
    familia: t.familia,
    camada: ehMovimento(t) ? "movimento" : "cadastro",
    recorte: descreverRecorte(t.recorte),
    colunasOmitidas: [...(t.omitir ?? [])].map((k) => colunas(tb)[k]?.name ?? k),
    ...(t.motivoOmissao ? { motivoOmissao: t.motivoOmissao } : {}),
  };
  try {
    const onde = and(filtroDoTenant(tenantId, t), condicaoDoSemestre(tenantId, t, info), filtroSemAso(t));
    const brutas = (await db.select().from(tb).where(onde)) as Record<string, unknown>[];
    const k = chaveDoRecorte(t);
    let semData = 0;
    if (k) {
      const [c] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(tb)
        .where(and(filtroDoTenant(tenantId, t), sql`(${k}) is null`));
      semData = Number(c?.n ?? 0);
    }
    const linhas = brutas.map((b) => linhaParaArquivo(b, colunas(tb), t.omitir ?? []));
    return { ...base, linhas, semData, somas: somasDeControle(linhas, numericas(tb, t.omitir ?? [])) };
  } catch (e) {
    return { ...base, linhas: [], semData: 0, somas: {}, erro: e instanceof Error ? e.message.slice(0, 300) : "falha na consulta" };
  }
}

/** Colunas numéricas (nome no banco) para a soma de controle (3.4). */
function numericas(tb: PgTable, omitir: readonly string[]): string[] {
  return Object.entries(colunas(tb))
    .filter(([k, c]) => c.columnType === "PgNumeric" && !omitir.includes(k))
    .map(([, c]) => c.name);
}

/**
 * 2.5 — referência que aponta para registro de MOVIMENTO que não entrou neste
 * recorte (uma despesa de junho paga em agosto). Listada, nunca resolvida em
 * silêncio. Cadastro entra inteiro, então só o movimento pode faltar.
 */
export function referenciasForaDoRecorte(tabelas: readonly TabelaExtraida[]): ReferenciaForaDoRecorte[] {
  const ids = new Map<string, Set<unknown>>();
  for (const t of tabelas) ids.set(t.tabela, new Set(t.linhas.map((l) => l.id)));
  const out: ReferenciaForaDoRecorte[] = [];
  for (const t of tabelas) {
    const cat = tabelaDoPacote(t.tabela);
    if (!cat || t.erro) continue;
    for (const fk of getTableConfig(tabelaDrizzle(cat)).foreignKeys) {
      const ref = fk.reference();
      const destino = getTableConfig(ref.foreignTable).name;
      const alvo = tabelaDoPacote(destino);
      if (!alvo || !ehMovimento(alvo) || ref.columns.length !== 1) continue;
      const col = ref.columns[0].name;
      const presentes = ids.get(destino)!;
      const quantas = t.linhas.filter((l) => l[col] != null && !presentes.has(l[col])).length;
      if (quantas > 0) out.push({ tabela: t.tabela, coluna: col, aponta: destino, quantas });
    }
  }
  return out;
}

/** Lê tudo o que entra no pacote do semestre. `aoProgredir` recebe (feitas, total). */
export async function extrairDados(
  tenantId: string,
  info: SemesterInfo,
  aoProgredir?: (feitas: number, total: number, tabela: string) => void | Promise<void>,
): Promise<DadosDoPacote> {
  const capturadoEm = new Date();
  const tabelas: TabelaExtraida[] = [];
  let feitas = 0;
  for (const t of TABELAS_DO_PACOTE) {
    tabelas.push(await extrairTabela(tenantId, t, info));
    feitas++;
    await aoProgredir?.(feitas, TABELAS_DO_PACOTE.length, t.tabela);
  }
  const sequencias = (await db.select().from(schema.numberSequences).where(eq(schema.numberSequences.tenantId, tenantId))).map((s) => ({
    entidade: s.entity,
    prefixo: s.prefix,
    usaPrefixo: s.usePrefix,
    digitos: s.digits,
    proximo: s.nextNumber,
  }));
  const doc = tabelaDoPacote("document")!;
  const docs = tabelas.find((t) => t.tabela === "document")!;
  const [aso] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.documents)
    .where(and(eq(schema.documents.tenantId, tenantId), condicaoDoSemestre(tenantId, doc, info), inArray(schema.documents.tipo, [...TIPOS_ASO])));
  return {
    semestre: info.key,
    rotulo: info.label,
    capturadoEm,
    corte: { inicio: info.start, fim: info.end },
    tabelas,
    referenciasFora: referenciasForaDoRecorte(tabelas),
    sequencias,
    documentos: docs.linhas.map((l) => ({ id: String(l.id), storageKey: String(l.storage_key), filename: (l.filename as string | null) ?? null })),
    asoOmitidos: Number(aso?.n ?? 0),
  };
}
