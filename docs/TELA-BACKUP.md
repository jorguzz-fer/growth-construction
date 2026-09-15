# Tela — Backup & Arquivamento (`/backup`)

Coleta de código, sem análise. Cada arquivo aparece com o caminho como
cabeçalho. Trechos parciais trazem a faixa de linhas no título do bloco.

Base: branch `claude/contexto-revisao`.

---

## 1. A página

### `src/app/(app)/backup/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { listSemesters } from "@/lib/backup";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "backup", "ver")) return null;

  const { semesters, pendingKey } = await listSemesters(ctx.tenant.id);
  const pending = semesters.find((s) => s.key === pendingKey) ?? null;

  return (
    <>
      <PageHeader title="Backup & Arquivamento" />

      {pending && (
        <Card className="mb-5 border-l-4 border-[var(--color-warning)]">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[14px] font-semibold text-[var(--color-ink)]">
                Um semestre foi encerrado — faça o backup
              </div>
              <p className="mt-1 text-[12.5px] text-[var(--color-ink3)]">
                O {pending.label} já se encerrou. Baixe uma cópia de segurança
                (planilha dos dados + documentos do período). Nada é removido do
                sistema — os dados continuam disponíveis normalmente.
              </p>
            </div>
            <a
              href={`/backup/download?sem=${pending.key}`}
              className="shrink-0 rounded-[8px] bg-[var(--color-accent2)] px-4 py-2 text-center text-[13px] font-medium text-white hover:opacity-90"
            >
              Baixar backup do {pending.label.split(" (")[0]}
            </a>
          </CardContent>
        </Card>
      )}

      <Card className="mb-5">
        <CardContent className="p-5 text-[12.5px] leading-relaxed text-[var(--color-ink3)]">
          A cada virada de semestre (janeiro e julho), o app avisa e oferece o
          backup do semestre que se encerrou. Cada backup é um único arquivo{" "}
          <strong className="text-[var(--color-ink)]">.zip</strong> com uma
          planilha (Despesas, Contas a Receber e Caixa do período) e os
          documentos salvos naquele semestre. Esta é apenas uma cópia de
          segurança: <strong className="text-[var(--color-ink)]">nenhum dado é
          apagado</strong> e a visualização não muda.
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <tr>
                <TH>Semestre</TH>
                <TH className="text-right">Despesas</TH>
                <TH className="text-right">Contas a Receber</TH>
                <TH className="text-right">Caixa</TH>
                <TH className="text-right">Documentos</TH>
                <TH>Situação</TH>
                <TH className="text-right">Backup</TH>
              </tr>
            </THead>
            <tbody>
              {semesters.map((s) => (
                <TR key={s.key}>
                  <TD className="font-medium text-[var(--color-ink)]">{s.label}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">{s.despesas}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">{s.contasReceber}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">{s.caixa}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">{s.documentos}</TD>
                  <TD>
                    <Badge tone={s.closed ? "neutral" : "success"}>
                      {s.closed ? "Encerrado" : "Em andamento"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <a
                      href={`/backup/download?sem=${s.key}`}
                      className="text-[13px] text-[var(--color-accent2)] hover:underline"
                    >
                      Baixar ZIP
                    </a>
                  </TD>
                </TR>
              ))}
              {semesters.length === 0 && (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-[var(--color-ink4)]">
                    Ainda não há dados para arquivar.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
```

---

## 2. Componentes próprios que a página importa (recursivamente)

```
src/app/(app)/backup/page.tsx
├── @/lib/context                → getActiveContext
├── @/lib/permissions            → can
├── @/lib/backup                 → listSemesters                     (seções 3 e 5)
├── @/components/app/page-header → PageHeader
├── @/components/ui/card         → Card, CardContent
├── @/components/ui/badge        → Badge
└── @/components/ui/table        → Table, THead, TH, TR, TD
```

**Nenhum componente `"use client"`.** A página é um Server Component puro; o
download é um `<a href>` comum para a rota (`backup/page.tsx:37` e `:87`), sem
`fetch`, sem `useTransition`, sem estado.

O aviso global que leva a esta tela — `BackupReminder` — **não** é importado
aqui: ele vive no layout (`layout.tsx:126`), alimentado por
`hasPendingSemesterBackup` (seção 5).

### `src/components/app/page-header.tsx`

```tsx
import * as React from "react";

export function PageHeader({
  title,
  actions,
}: {
  /** Mantidos por compatibilidade; ocultados por ora para um visual mais clean. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
```

### `src/components/ui/card.tsx`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(55,48,163,.08)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
}

function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-base font-semibold leading-none text-[var(--color-ink)]",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-[var(--color-ink3)]", className)}
      {...props}
    />
  );
}

function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
```

### `src/components/ui/badge.tsx`

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium font-[family-name:var(--font-mono)]",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--color-surface3)] text-[var(--color-ink2)]",
        accent: "bg-[var(--color-accent4)] text-[var(--color-accent)]",
        success: "bg-[#d1fae5] text-[#065f46]",
        warning: "bg-[#fef3c7] text-[#92400e]",
        danger: "bg-[#fee2e2] text-[#991b1b]",
        info: "bg-[#dbeafe] text-[#1e40af]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Mapeia o status de unidade para o tom do badge. */
export function unitStatusTone(
  status: string,
): "success" | "warning" | "neutral" {
  if (status === "Vendido") return "success";
  if (status === "Reservado") return "warning";
  return "neutral";
}
```

### `src/components/ui/table.tsx`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({
  className,
  wrapperClassName,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  /**
   * Classes extras no contêiner de rolagem (ex.: `max-h-[70vh]` para limitar a
   * altura e manter a barra de rolagem horizontal sempre visível, em vez de só
   * no fim da página).
   */
  wrapperClassName?: string;
}) {
  return (
    <div
      className={cn(
        "tbl-scroll w-full overflow-auto rounded-[12px] border border-[var(--color-accent2)]/12 bg-white",
        wrapperClassName,
      )}
    >
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-[var(--color-accent2)]/12 bg-[var(--color-surface2)]",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-left font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink3)]",
        className,
      )}
      {...props}
    />
  );
}

export function TR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--color-accent2)]/8 last:border-0 hover:bg-[var(--color-surface2)]/60",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-3 py-2.5 text-[var(--color-ink2)]", className)} {...props} />
  );
}
```

---

## 3. `src/lib/backup.ts` inteiro

```ts
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  getCashByTenant,
  getContasReceber,
  getDespesasByTenant,
  getDocuments,
} from "@/lib/queries";
import { isR2Configured, getObjectBytes } from "@/lib/storage/r2";
import { dateBR } from "@/lib/utils";
import {
  currentSemesterKey,
  lastClosedSemesterKey,
  semesterInfo,
  semesterOfMonthKey,
  semesterOrdinal,
  internalDateInSemester,
  type SemesterInfo,
} from "@/lib/semester";

export interface SemesterSummary {
  key: string;
  label: string;
  despesas: number;
  contasReceber: number;
  caixa: number;
  documentos: number;
  total: number;
  /** Semestre já encerrado (anterior ao corrente). */
  closed: boolean;
}

export interface SemesterListing {
  semesters: SemesterSummary[];
  currentKey: string;
  lastClosedKey: string;
  /** Chave do último semestre encerrado que possui dados (para o aviso). */
  pendingKey: string | null;
}

/** Semestre de uma data interna "MM/DD/YYYY". */
function semKeyOfInternalDate(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length !== 3) return null;
  const [mo, day, y] = p.map(Number);
  if (!y || !mo || !day) return null;
  return `${y}-H${mo <= 6 ? 1 : 2}`;
}

/** Semestre de uma data (Date). */
function semKeyOfDate(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-H${d.getMonth() < 6 ? 1 : 2}`;
}

/**
 * Semestres do tenant que possuem dados (despesas, contas a receber, caixa ou
 * documentos), do mais recente para o mais antigo, com a contagem por tipo.
 */
export async function listSemesters(
  tenantId: string,
  today: Date = new Date(),
): Promise<SemesterListing> {
  const [despesas, receber, caixa, documentos] = await Promise.all([
    getDespesasByTenant(tenantId),
    getContasReceber(tenantId),
    getCashByTenant(tenantId),
    getDocuments(tenantId),
  ]);

  const acc = new Map<string, SemesterSummary>();
  type CountField = "despesas" | "contasReceber" | "caixa" | "documentos";
  const bump = (key: string | null, field: CountField) => {
    if (!key) return;
    const info = semesterInfo(key);
    if (!info) return;
    const s =
      acc.get(key) ??
      ({
        key,
        label: info.label,
        despesas: 0,
        contasReceber: 0,
        caixa: 0,
        documentos: 0,
        total: 0,
        closed: false,
      } as SemesterSummary);
    s[field] += 1;
    s.total += 1;
    acc.set(key, s);
  };

  for (const d of despesas) bump(semesterOfMonthKey(d.competencia ?? ""), "despesas");
  for (const r of receber)
    bump(semKeyOfInternalDate(r.vencimento ?? r.dataRecebimento), "contasReceber");
  for (const c of caixa) bump(semKeyOfInternalDate(c.data), "caixa");
  for (const doc of documentos) bump(semKeyOfDate(doc.uploadedAt ?? null), "documentos");

  const currentKey = currentSemesterKey(today);
  const lastClosedKey = lastClosedSemesterKey(today);
  const lastClosedOrd = semesterOrdinal(lastClosedKey);

  const semesters = [...acc.values()]
    .map((s) => ({ ...s, closed: semesterOrdinal(s.key) <= lastClosedOrd }))
    .sort((a, b) => semesterOrdinal(b.key) - semesterOrdinal(a.key));

  // Aviso: último semestre ENCERRADO que tem dados.
  const pendingKey =
    semesters.find((s) => s.closed && s.total > 0)?.key ?? null;

  return { semesters, currentKey, lastClosedKey, pendingKey };
}

/**
 * Verificação leve (para o aviso global no layout): o último semestre encerrado
 * tem dados? Usa contagens indexadas por tenant — barato para rodar por página.
 */
export async function hasPendingSemesterBackup(
  tenantId: string,
  today: Date = new Date(),
): Promise<{ key: string; label: string; has: boolean }> {
  const key = lastClosedSemesterKey(today);
  const info = semesterInfo(key);
  if (!info) return { key, label: key, has: false };

  const [d] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.despesas)
    .where(
      and(
        eq(schema.despesas.tenantId, tenantId),
        inArray(schema.despesas.competencia, info.months),
      ),
    );
  let n = Number(d?.n ?? 0);
  if (n === 0) {
    const [doc] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.tenantId, tenantId),
          gte(schema.documents.uploadedAt, info.start),
          lte(schema.documents.uploadedAt, info.end),
        ),
      );
    n = Number(doc?.n ?? 0);
  }
  return { key, label: info.label, has: n > 0 };
}

function sheetFromAoa(rows: (string | number)[][]) {
  return XLSX.utils.aoa_to_sheet(rows);
}

/**
 * Monta o ZIP de backup de um semestre: uma planilha com os dados do período
 * (Despesas, Contas a Receber, Caixa) e os documentos salvos no período.
 * NÃO remove nada do banco — é apenas uma cópia de segurança.
 */
export async function buildSemesterZip(
  tenantId: string,
  key: string,
  tenantName: string,
): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const info = semesterInfo(key);
  if (!info) return null;
  const monthSet = new Set(info.months);

  const [despesas, receber, caixa, documentos] = await Promise.all([
    getDespesasByTenant(tenantId),
    getContasReceber(tenantId),
    getCashByTenant(tenantId),
    getDocuments(tenantId),
  ]);

  const despRows = despesas.filter((d) => monthSet.has(d.competencia ?? ""));
  const recRows = receber.filter((r) =>
    internalDateInSemester(r.vencimento ?? r.dataRecebimento, info),
  );
  const cxRows = caixa.filter((c) => internalDateInSemester(c.data, info));
  const docRows = documentos.filter(
    (doc) => semKeyOfDate(doc.uploadedAt ?? null) === key,
  );

  // ── Planilha (XLSX) ────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoa([
      ["Competência", "Nº Doc", "Projeto", "Conta CEF", "Categoria DRE", "Vencimento", "Valor", "Status"],
      ...despRows.map((d) => [
        d.competencia ?? "",
        d.numDoc ?? "",
        d.projectName ?? "",
        d.contaCef ?? "",
        d.categoriaDre ?? "",
        d.vencimento ? dateBR(d.vencimento) : "",
        Number(d.valor),
        d.status ?? "",
      ]),
    ]),
    "Despesas",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoa([
      ["Projeto", "Unidade", "Cliente", "Descrição", "Tipo", "Vencimento", "Recebimento", "Valor", "Recebido", "Status"],
      ...recRows.map((r) => [
        r.projectName ?? "",
        r.unitCode ?? "",
        r.clienteNome ?? "",
        r.descricao ?? "",
        r.tipo ?? "",
        r.vencimento ? dateBR(r.vencimento) : "",
        r.dataRecebimento ? dateBR(r.dataRecebimento) : "",
        Number(r.valor),
        Number(r.valorRecebido),
        r.status ?? "",
      ]),
    ]),
    "Contas a Receber",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoa([
      ["Data", "Descrição", "Categoria", "Valor", "Conciliado"],
      ...cxRows.map((c) => [
        c.data ? dateBR(c.data) : "",
        c.descricao ?? "",
        c.cat ?? "",
        Number(c.valor),
        c.rec ? "Sim" : "Não",
      ]),
    ]),
    "Caixa",
  );

  const xlsxBytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;

  // ── ZIP (planilha + documentos) ────────────────────────────────────────────
  const zip = new JSZip();
  const slug = key.replace(/[^\w-]+/g, "");
  zip.file(`dados_${slug}.xlsx`, xlsxBytes);

  const docsFolder = zip.folder("documentos");
  let docsIncluidos = 0;
  const docsFalhos: string[] = [];
  if (docRows.length > 0 && isR2Configured() && docsFolder) {
    for (let i = 0; i < docRows.length; i++) {
      const doc = docRows[i];
      try {
        const bytes = await getObjectBytes(doc.storageKey);
        const safe = (doc.filename || `documento_${i + 1}`).replace(/[^\w.\-]+/g, "_");
        docsFolder.file(`${String(i + 1).padStart(3, "0")}_${safe}`, bytes);
        docsIncluidos++;
      } catch {
        docsFalhos.push(doc.filename || doc.storageKey);
      }
    }
  }

  const leiaMe = [
    `Backup — ${tenantName}`,
    `Semestre: ${info.label}`,
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    "",
    "Conteúdo desta cópia de segurança:",
    `- Despesas: ${despRows.length}`,
    `- Contas a Receber: ${recRows.length}`,
    `- Lançamentos de Caixa: ${cxRows.length}`,
    `- Documentos: ${docsIncluidos}${docRows.length > docsIncluidos ? ` (de ${docRows.length})` : ""}`,
    docsFalhos.length ? `- Documentos não baixados: ${docsFalhos.join(", ")}` : "",
    !isR2Configured() && docRows.length
      ? "- Observação: storage (R2) não configurado — documentos não incluídos."
      : "",
    "",
    "Observação: este backup é apenas uma cópia. Nenhum dado foi removido do sistema.",
  ]
    .filter(Boolean)
    .join("\n");
  zip.file("_leia-me.txt", leiaMe);

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const tenantSlug = (tenantName || "tenant").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  return { filename: `Backup_${tenantSlug}_${slug}.zip`, bytes };
}

export type { SemesterInfo };
```

### `src/lib/semester.ts` — o módulo puro de semestres que `backup.ts` usa

```ts
/**
 * Semestres-calendário (Jan–Jun = H1, Jul–Dez = H2) — base do backup periódico.
 *
 * A visualização do app NÃO remove dados antigos; o backup é apenas uma cópia
 * de segurança oferecida a cada virada de semestre. Estas funções são puras
 * (sem acesso a banco) e trabalham com competências "MM/YYYY" e datas.
 */

export interface SemesterInfo {
  key: string; // "2026-H1"
  year: number;
  half: 1 | 2;
  label: string; // "1º semestre de 2026 (Jan–Jun)"
  months: string[]; // ["01/2026", …, "06/2026"]
  start: Date; // primeiro instante do semestre
  end: Date; // último instante do semestre
}

const MESES_H1 = "Jan–Jun";
const MESES_H2 = "Jul–Dez";

/** Chave do semestre de uma data (H1 = Jan–Jun, H2 = Jul–Dez). */
export function semesterKeyOf(date: Date): string {
  const y = date.getFullYear();
  const h = date.getMonth() < 6 ? 1 : 2;
  return `${y}-H${h}`;
}

/** Semestre corrente (aberto) relativo a `today`. */
export function currentSemesterKey(today: Date = new Date()): string {
  return semesterKeyOf(today);
}

/** Semestre imediatamente anterior a `key`. */
export function previousSemesterKey(key: string): string {
  const info = semesterInfo(key);
  if (!info) return key;
  return info.half === 1 ? `${info.year - 1}-H2` : `${info.year}-H1`;
}

/** Último semestre JÁ ENCERRADO (o anterior ao corrente). */
export function lastClosedSemesterKey(today: Date = new Date()): string {
  return previousSemesterKey(currentSemesterKey(today));
}

/** Semestre de uma competência "MM/YYYY" (ou null se inválida). */
export function semesterOfMonthKey(mk: string): string | null {
  const p = mk.split("/");
  if (p.length !== 2) return null;
  const m = Number(p[0]);
  const y = Number(p[1]);
  if (!m || !y || m < 1 || m > 12) return null;
  return `${y}-H${m <= 6 ? 1 : 2}`;
}

/** Detalhes de um semestre a partir da chave "YYYY-H1"/"YYYY-H2". */
export function semesterInfo(key: string): SemesterInfo | null {
  const m = key.match(/^(\d{4})-H([12])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const half = Number(m[2]) as 1 | 2;
  const firstMonth = half === 1 ? 1 : 7; // 1-based
  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    months.push(`${String(firstMonth + i).padStart(2, "0")}/${year}`);
  }
  const start = new Date(year, firstMonth - 1, 1, 0, 0, 0, 0);
  // Último dia do 6º mês, 23:59:59.999.
  const end = new Date(year, firstMonth - 1 + 6, 0, 23, 59, 59, 999);
  return {
    key,
    year,
    half,
    label: `${half}º semestre de ${year} (${half === 1 ? MESES_H1 : MESES_H2})`,
    months,
    start,
    end,
  };
}

/** Índice ordinal de um semestre (para comparar/ordenar). */
export function semesterOrdinal(key: string): number {
  const info = semesterInfo(key);
  if (!info) return 0;
  return info.year * 2 + (info.half - 1);
}

/** Lista de chaves de semestre de `fromKey` até `toKey` (inclusive). */
export function enumSemesters(fromKey: string, toKey: string): string[] {
  const a = semesterOrdinal(fromKey);
  const b = semesterOrdinal(toKey);
  if (!a || !b) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let o = lo; o <= hi; o++) {
    const year = Math.floor(o / 2);
    const half = (o % 2) + 1;
    out.push(`${year}-H${half}`);
  }
  return out;
}

/** Uma data "MM/DD/YYYY" (formato interno) cai dentro do semestre? */
export function internalDateInSemester(d: string | null, info: SemesterInfo): boolean {
  if (!d) return false;
  const p = d.split("/");
  if (p.length !== 3) return false;
  const [mo, day, y] = p.map(Number);
  if (!y || !mo || !day) return false;
  const t = new Date(y, mo - 1, day).getTime();
  return t >= info.start.getTime() && t <= info.end.getTime();
}
```

---

## 4. A rota que gera e entrega o ZIP

É um Route Handler `GET`, não uma Server Action — por isso o download é um
`<a href>` simples.

### `src/app/(app)/backup/download/route.ts`

```ts
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { buildSemesterZip } from "@/lib/backup";

export const dynamic = "force-dynamic";

/**
 * Download do ZIP de backup de um semestre (?sem=YYYY-H1). Contém a planilha
 * dos dados do período + os documentos salvos no período. Não remove nada.
 */
export async function GET(req: Request) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "backup", "ver")) {
    return new Response("Não autorizado", { status: 403 });
  }
  const key = new URL(req.url).searchParams.get("sem") || "";
  const res = await buildSemesterZip(ctx.tenant.id, key, ctx.tenant.name);
  if (!res) return new Response("Semestre inválido", { status: 400 });

  return new Response(new Uint8Array(res.bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${res.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

---

## 5. As funções de contagem que alimentam a tabela de semestres

`listSemesters` monta a tabela da tela; `hasPendingSemesterBackup` alimenta o
aviso global do layout. As duas estão no arquivo inteiro da seção 3; repetidas
aqui isoladas.

### `src/lib/backup.ts:59–116` — `listSemesters`

```ts
/**
 * Semestres do tenant que possuem dados (despesas, contas a receber, caixa ou
 * documentos), do mais recente para o mais antigo, com a contagem por tipo.
 */
export async function listSemesters(
  tenantId: string,
  today: Date = new Date(),
): Promise<SemesterListing> {
  const [despesas, receber, caixa, documentos] = await Promise.all([
    getDespesasByTenant(tenantId),
    getContasReceber(tenantId),
    getCashByTenant(tenantId),
    getDocuments(tenantId),
  ]);

  const acc = new Map<string, SemesterSummary>();
  type CountField = "despesas" | "contasReceber" | "caixa" | "documentos";
  const bump = (key: string | null, field: CountField) => {
    if (!key) return;
    const info = semesterInfo(key);
    if (!info) return;
    const s =
      acc.get(key) ??
      ({
        key,
        label: info.label,
        despesas: 0,
        contasReceber: 0,
        caixa: 0,
        documentos: 0,
        total: 0,
        closed: false,
      } as SemesterSummary);
    s[field] += 1;
    s.total += 1;
    acc.set(key, s);
  };

  for (const d of despesas) bump(semesterOfMonthKey(d.competencia ?? ""), "despesas");
  for (const r of receber)
    bump(semKeyOfInternalDate(r.vencimento ?? r.dataRecebimento), "contasReceber");
  for (const c of caixa) bump(semKeyOfInternalDate(c.data), "caixa");
  for (const doc of documentos) bump(semKeyOfDate(doc.uploadedAt ?? null), "documentos");

  const currentKey = currentSemesterKey(today);
  const lastClosedKey = lastClosedSemesterKey(today);
  const lastClosedOrd = semesterOrdinal(lastClosedKey);

  const semesters = [...acc.values()]
    .map((s) => ({ ...s, closed: semesterOrdinal(s.key) <= lastClosedOrd }))
    .sort((a, b) => semesterOrdinal(b.key) - semesterOrdinal(a.key));

  // Aviso: último semestre ENCERRADO que tem dados.
  const pendingKey =
    semesters.find((s) => s.closed && s.total > 0)?.key ?? null;

  return { semesters, currentKey, lastClosedKey, pendingKey };
}
```

### `src/lib/backup.ts:118–154` — `hasPendingSemesterBackup`

```ts
/**
 * Verificação leve (para o aviso global no layout): o último semestre encerrado
 * tem dados? Usa contagens indexadas por tenant — barato para rodar por página.
 */
export async function hasPendingSemesterBackup(
  tenantId: string,
  today: Date = new Date(),
): Promise<{ key: string; label: string; has: boolean }> {
  const key = lastClosedSemesterKey(today);
  const info = semesterInfo(key);
  if (!info) return { key, label: key, has: false };

  const [d] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.despesas)
    .where(
      and(
        eq(schema.despesas.tenantId, tenantId),
        inArray(schema.despesas.competencia, info.months),
      ),
    );
  let n = Number(d?.n ?? 0);
  if (n === 0) {
    const [doc] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.tenantId, tenantId),
          gte(schema.documents.uploadedAt, info.start),
          lte(schema.documents.uploadedAt, info.end),
        ),
      );
    n = Number(doc?.n ?? 0);
  }
  return { key, label: info.label, has: n > 0 };
}
```

### As quatro consultas que as alimentam

#### `src/lib/queries.ts:287–318` — `getDespesasByTenant`

```ts
/**
 * Todas as despesas do tenant (todos os projetos/filiais), na versão Atual de
 * cada projeto, com o rótulo de origem — base da consulta consolidada.
 */
export async function getDespesasByTenant(
  tenantId: string,
): Promise<DespesaComOrigem[]> {
  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      projectKind: schema.projects.kind,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.despesas.tenantId, tenantId),
        eq(schema.versions.kind, "atual"),
      ),
    )
    .orderBy(asc(schema.despesas.competencia));
  return rows.map((r) => ({
    ...r.d,
    projectId: r.projectId,
    projectName: r.projectName,
    projectKind: r.projectKind,
    origem: r.projectKind === "office" ? `Filial/Matriz · ${r.projectName}` : r.projectName,
  }));
}
```

#### `src/lib/queries.ts:1802–1838` — `getContasReceber`

```ts
/** Contas a receber criadas manualmente / convertidas do extrato (não canceladas). */
export async function getContasReceber(tenantId: string): Promise<ContaReceberRow[]> {
  const rows = await db
    .select({
      c: schema.contasReceber,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.contasReceber)
    .innerJoin(schema.projects, eq(schema.contasReceber.projectId, schema.projects.id))
    .leftJoin(schema.clientes, eq(schema.contasReceber.clienteId, schema.clientes.id))
    .where(
      and(
        eq(schema.contasReceber.tenantId, tenantId),
        eq(schema.contasReceber.cancelado, false),
      ),
    )
    .orderBy(asc(schema.contasReceber.vencimento));
  return rows.map((r) => ({
    id: r.c.id,
    projectId: r.c.projectId,
    projectName: r.projectName,
    unitCode: r.c.unitCode,
    clienteId: r.c.clienteId,
    clienteNome: r.clienteNome,
    descricao: r.c.descricao,
    tipo: r.c.tipo,
    valor: Number(r.c.valor),
    vencimento: r.c.vencimento,
    dataRecebimento: r.c.dataRecebimento,
    valorRecebido: Number(r.c.valorRecebido),
    status: r.c.status,
    bancoId: r.c.bancoId,
    origemCashEntryId: r.c.origemCashEntryId,
    createdAt: r.c.createdAt ? new Date(r.c.createdAt).toISOString() : null,
  }));
}
```

#### `src/lib/queries.ts:1069–1078` — `getCashByTenant`

```ts
/** Lançamentos de caixa de todas as versões Atual do tenant (caixa real). */
export async function getCashByTenant(tenantId: string): Promise<CashRow[]> {
  const rows = await db
    .select({ c: schema.cashEntries })
    .from(schema.cashEntries)
    .innerJoin(schema.versions, eq(schema.cashEntries.versionId, schema.versions.id))
    .where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.versions.kind, "atual")))
    .orderBy(asc(schema.cashEntries.data));
  return rows.map((r) => r.c);
}
```

#### `src/lib/queries.ts:1032–1040` — `getDocuments`

```ts
export type DocumentRow = typeof schema.documents.$inferSelect;

export async function getDocuments(tenantId: string): Promise<DocumentRow[]> {
  return db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.tenantId, tenantId))
    .orderBy(desc(schema.documents.uploadedAt));
}
```

### `src/app/(app)/layout.tsx:97–101` — onde o aviso global é calculado

```tsx
  // Aviso de backup: só para quem pode ver a tela de Backup e quando o último
  // semestre encerrado tem dados a arquivar.
  const backupPending = can(ctx.perms, "backup", "ver")
    ? await hasPendingSemesterBackup(ctx.tenant.id)
    : { has: false, key: "", label: "" };
```

---

## 6. Perguntas

### a) `buildSemesterZip` inteira. Quais tabelas entram no ZIP?

A função está colada na seção 3 (`backup.ts:160–294`); repetida aqui por ser o
centro da pergunta.

```ts
/**
 * Monta o ZIP de backup de um semestre: uma planilha com os dados do período
 * (Despesas, Contas a Receber, Caixa) e os documentos salvos no período.
 * NÃO remove nada do banco — é apenas uma cópia de segurança.
 */
export async function buildSemesterZip(
  tenantId: string,
  key: string,
  tenantName: string,
): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const info = semesterInfo(key);
  if (!info) return null;
  const monthSet = new Set(info.months);

  const [despesas, receber, caixa, documentos] = await Promise.all([
    getDespesasByTenant(tenantId),
    getContasReceber(tenantId),
    getCashByTenant(tenantId),
    getDocuments(tenantId),
  ]);

  const despRows = despesas.filter((d) => monthSet.has(d.competencia ?? ""));
  const recRows = receber.filter((r) =>
    internalDateInSemester(r.vencimento ?? r.dataRecebimento, info),
  );
  const cxRows = caixa.filter((c) => internalDateInSemester(c.data, info));
  const docRows = documentos.filter(
    (doc) => semKeyOfDate(doc.uploadedAt ?? null) === key,
  );

  // ── Planilha (XLSX) ────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoa([
      ["Competência", "Nº Doc", "Projeto", "Conta CEF", "Categoria DRE", "Vencimento", "Valor", "Status"],
      ...despRows.map((d) => [
        d.competencia ?? "",
        d.numDoc ?? "",
        d.projectName ?? "",
        d.contaCef ?? "",
        d.categoriaDre ?? "",
        d.vencimento ? dateBR(d.vencimento) : "",
        Number(d.valor),
        d.status ?? "",
      ]),
    ]),
    "Despesas",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoa([
      ["Projeto", "Unidade", "Cliente", "Descrição", "Tipo", "Vencimento", "Recebimento", "Valor", "Recebido", "Status"],
      ...recRows.map((r) => [
        r.projectName ?? "",
        r.unitCode ?? "",
        r.clienteNome ?? "",
        r.descricao ?? "",
        r.tipo ?? "",
        r.vencimento ? dateBR(r.vencimento) : "",
        r.dataRecebimento ? dateBR(r.dataRecebimento) : "",
        Number(r.valor),
        Number(r.valorRecebido),
        r.status ?? "",
      ]),
    ]),
    "Contas a Receber",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoa([
      ["Data", "Descrição", "Categoria", "Valor", "Conciliado"],
      ...cxRows.map((c) => [
        c.data ? dateBR(c.data) : "",
        c.descricao ?? "",
        c.cat ?? "",
        Number(c.valor),
        c.rec ? "Sim" : "Não",
      ]),
    ]),
    "Caixa",
  );

  const xlsxBytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;

  // ── ZIP (planilha + documentos) ────────────────────────────────────────────
  const zip = new JSZip();
  const slug = key.replace(/[^\w-]+/g, "");
  zip.file(`dados_${slug}.xlsx`, xlsxBytes);

  const docsFolder = zip.folder("documentos");
  let docsIncluidos = 0;
  const docsFalhos: string[] = [];
  if (docRows.length > 0 && isR2Configured() && docsFolder) {
    for (let i = 0; i < docRows.length; i++) {
      const doc = docRows[i];
      try {
        const bytes = await getObjectBytes(doc.storageKey);
        const safe = (doc.filename || `documento_${i + 1}`).replace(/[^\w.\-]+/g, "_");
        docsFolder.file(`${String(i + 1).padStart(3, "0")}_${safe}`, bytes);
        docsIncluidos++;
      } catch {
        docsFalhos.push(doc.filename || doc.storageKey);
      }
    }
  }

  const leiaMe = [
    `Backup — ${tenantName}`,
    `Semestre: ${info.label}`,
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    "",
    "Conteúdo desta cópia de segurança:",
    `- Despesas: ${despRows.length}`,
    `- Contas a Receber: ${recRows.length}`,
    `- Lançamentos de Caixa: ${cxRows.length}`,
    `- Documentos: ${docsIncluidos}${docRows.length > docsIncluidos ? ` (de ${docRows.length})` : ""}`,
    docsFalhos.length ? `- Documentos não baixados: ${docsFalhos.join(", ")}` : "",
    !isR2Configured() && docRows.length
      ? "- Observação: storage (R2) não configurado — documentos não incluídos."
      : "",
    "",
    "Observação: este backup é apenas uma cópia. Nenhum dado foi removido do sistema.",
  ]
    .filter(Boolean)
    .join("\n");
  zip.file("_leia-me.txt", leiaMe);

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const tenantSlug = (tenantName || "tenant").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  return { filename: `Backup_${tenantSlug}_${slug}.zip`, bytes };
}
```

**Quatro fontes entram**, carregadas em `backup.ts:174–179`. O schema tem
**44 tabelas** (`pgTable` em `src/lib/db/schema.ts`); segue cada uma marcada:

| # | Tabela | Linha no schema | No ZIP? | Como |
|---|---|---|---|---|
| 1 | `user` | 40 | ❌ não | — |
| 2 | `account` | 55 | ❌ não | — |
| 3 | `session` | 77 | ❌ não | — |
| 4 | `verificationToken` | 85 | ❌ não | — |
| 5 | `tenant` | 110 | ⚠️ parcial | só `name`, no nome do arquivo e no `_leia-me.txt` |
| 6 | `membership` | 150 | ❌ não | — |
| 7 | `project` | 230 | ⚠️ parcial | só `name`, como texto nas abas Despesas e Contas a Receber |
| 8 | `time_entry` | 329 | ❌ não | — |
| 9 | `version` | 365 | ⚠️ parcial | não aparece — serve só de filtro (`kind = "atual"`) |
| 10 | `unit` | 406 | ❌ não | — |
| 11 | `permuta` | 432 | ❌ não | — |
| 12 | `reembolso` | 463 | ❌ não | — |
| 13 | `stakeholder` | 484 | ❌ não | — |
| 14 | `bank_account` | 515 | ❌ não | — |
| 15 | `chart_account` | 537 | ❌ não | — |
| 16 | `despesa` | 564 | ✅ **sim** | aba **Despesas** (8 colunas) |
| 17 | `despesa_terceiro` | 623 | ❌ não | — |
| 18 | `restituicao` | 663 | ❌ não | — |
| 19 | `documento_fiscal` | 703 | ❌ não | — |
| 20 | `recebimento_terceiro` | 732 | ❌ não | — |
| 21 | `repasse` | 763 | ❌ não | — |
| 22 | `acerto` | 799 | ❌ não | — |
| 23 | `acerto_item` | 849 | ❌ não | — |
| 24 | `rateio_obra` | 875 | ❌ não | — |
| 25 | `restituicao_item` | 906 | ❌ não | — |
| 26 | `compensacao` | 931 | ❌ não | — |
| 27 | `despesa_parcela` | 957 | ❌ não | — |
| 28 | `pagamento` | 1005 | ❌ não | — |
| 29 | `document` | 1034 | ✅ **sim** | pasta **documentos/** (bytes baixados do R2) |
| 30 | `servico` | 1086 | ❌ não | — |
| 31 | `medicao_servico` | 1112 | ❌ não | — |
| 32 | `medicao` | 1130 | ❌ não | — |
| 33 | `cliente` | 1153 | ⚠️ parcial | só `nomeCompleto`, como texto na aba Contas a Receber |
| 34 | `cash_entry` | 1204 | ✅ **sim** | aba **Caixa** (5 colunas) |
| 35 | `conta_receber` | 1243 | ✅ **sim** | aba **Contas a Receber** (10 colunas) |
| 36 | `incc_rate` | 1277 | ❌ não | — |
| 37 | `audit_log` | 1306 | ❌ não | — |
| 38 | `number_sequence` | 1330 | ❌ não | — |
| 39 | `budget_line` | 1358 | ❌ não | — |
| 40 | `budget_account` | 1392 | ❌ não | — |
| 41 | `daily_closing` | 1418 | ❌ não | — |
| 42 | `carry_over` | 1447 | ❌ não | — |
| 43 | `stock_item` | 1468 | ❌ não | — |
| 44 | `stock_movement` | 1486 | ❌ não | — |

**Resumo: 4 tabelas entram, 4 aparecem só como texto derivado, 36 ficam
inteiramente de fora.**

O que fica de fora inclui, entre outras: `unit` e `permuta` (o inventário de
vendas), `cliente` (o cadastro completo dos compradores — só o nome aparece na
aba de Contas a Receber), `stakeholder` (fornecedores), `chart_account` (o
plano de contas), `despesa_parcela` e `pagamento` (o parcelamento e as baixas),
`medicao` e `medicao_servico`, `acerto`/`acerto_item`/`rateio_obra`,
`restituicao`/`restituicao_item`/`compensacao`/`despesa_terceiro` (todo o
módulo de terceiros), `documento_fiscal`, `incc_rate`, `budget_line` e
`budget_account`, `daily_closing`, `time_entry`, `stock_item`/`stock_movement`,
`number_sequence`, as seis tabelas de autenticação e permissão, e
**`audit_log`** — a trilha de auditoria não é arquivada.

Vale registrar a assimetria: a aba **Despesas** leva 8 das 36 colunas de
`despesa` (`backup.ts:196`), a de **Contas a Receber** leva 10 de 15
(`backup.ts:214`) e a de **Caixa** leva 5 (`backup.ts:234`). Nem o `id`, nem o
`tenant_id`, nem o `version_id` entram — o ZIP é um extrato legível, não um
dump restaurável (item (l)).

### b) Qual coluna de data recorta cada uma das quatro fontes?

**Três colunas diferentes, com três mecanismos diferentes** — e uma delas usa
uma quarta função na contagem e outra no ZIP.

| Fonte | Coluna | Formato | Função na **contagem** | Função no **ZIP** |
|---|---|---|---|---|
| Despesas | `competencia` | `"MM/YYYY"` | `semesterOfMonthKey` (`semester.ts:47`) | `monthSet.has(...)` (`backup.ts:172`, `:181`) |
| Contas a Receber | `vencimento` **ou** `dataRecebimento` | `"MM/DD/YYYY"` | `semKeyOfInternalDate` (`backup.ts:44`) | `internalDateInSemester` (`semester.ts:104`) |
| Caixa | `data` | `"MM/DD/YYYY"` | `semKeyOfInternalDate` | `internalDateInSemester` |
| Documentos | `uploadedAt` | `Date` (timestamp) | `semKeyOfDate` (`backup.ts:54`) | `semKeyOfDate` (`backup.ts:187`) |

Note o `??` das contas a receber (`backup.ts:99` e `:183`): usa o
`vencimento`; **se ele for nulo**, cai no `dataRecebimento`. Se os dois forem
nulos, a linha não entra em semestre nenhum.

#### `src/lib/semester.ts:103–112` — `internalDateInSemester`

```ts
/** Uma data "MM/DD/YYYY" (formato interno) cai dentro do semestre? */
export function internalDateInSemester(d: string | null, info: SemesterInfo): boolean {
  if (!d) return false;
  const p = d.split("/");
  if (p.length !== 3) return false;
  const [mo, day, y] = p.map(Number);
  if (!y || !mo || !day) return false;
  const t = new Date(y, mo - 1, day).getTime();
  return t >= info.start.getTime() && t <= info.end.getTime();
}
```

#### `src/lib/backup.ts:53–57` — `semKeyOfDate`

```ts
/** Semestre de uma data (Date). */
function semKeyOfDate(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-H${d.getMonth() < 6 ? 1 : 2}`;
}
```

E a irmã dela, usada nas duas fontes de data interna:

#### `src/lib/backup.ts:43–51` — `semKeyOfInternalDate`

```ts
/** Semestre de uma data interna "MM/DD/YYYY". */
function semKeyOfInternalDate(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length !== 3) return null;
  const [mo, day, y] = p.map(Number);
  if (!y || !mo || !day) return null;
  return `${y}-H${mo <= 6 ? 1 : 2}`;
}
```

Duas diferenças entre as duas funções de semestre que valem registro:

1. `semKeyOfDate` usa `d.getMonth() < 6` (0-based → Jan–Jun = H1);
   `semKeyOfInternalDate` usa `mo <= 6` (1-based). As duas chegam ao mesmo
   resultado, por caminhos diferentes.
2. A contagem usa **chave de semestre** (comparação de string); o ZIP usa
   **intervalo de datas** (`internalDateInSemester`, com `start`/`end` em
   milissegundos). Para despesas, a divergência é maior: a contagem usa
   `semesterOfMonthKey(competencia)` e o ZIP usa `monthSet.has(competencia)` —
   equivalentes na prática, mas implementações independentes.

### c) Por que Contas a Receber aparece zerado em todos os semestres?

**Não posso rodar as consultas:** esta sessão não tem `DATABASE_URL` definido
(`echo "$DATABASE_URL"` devolve vazio). Não vou inventar números. O que posso
fazer é apontar, pelo código, as **três** causas possíveis — e a mais provável
é a terceira.

**Causa 1 — a linha não tem nenhuma das duas datas.** `backup.ts:99` faz
`r.vencimento ?? r.dataRecebimento`; com os dois nulos, `semKeyOfInternalDate`
devolve `null` e o `bump` sai na primeira linha (`backup.ts:77`).

**Causa 2 — formato diferente de `"MM/DD/YYYY"`.** `semKeyOfInternalDate`
exige exatamente três partes separadas por `/` (`backup.ts:46–47`). Uma data
ISO (`"2026-03-15"`) tem uma parte só e devolve `null`, em silêncio. O schema
declara o formato esperado (`schema.ts:1260–1262`):

```ts
  /** data prevista "MM/DD/YYYY". */
  vencimento: text("vencimento"),
  dataRecebimento: text("data_recebimento"),
```

**Causa 3 — a tabela está vazia.** É a hipótese que o código torna mais
provável. `conta_receber` só recebe linha por **três** caminhos, todos de
lançamento manual ou conversão de extrato:

| Onde | Função | Origem |
|---|---|---|
| `src/lib/actions/contas-receber.ts:49` | `createContaReceber` | lançamento manual na tela |
| `src/lib/actions/caixa.ts:717` | `criarContaFromExtrato` | conversão de um crédito do extrato |
| `src/lib/actions/caixa.ts:1167` | `criarLancamentoDoExtrato` | conciliação que cria a conta já recebida |

**Os recebíveis do plano de pagamento não estão nessa tabela.** Eles são
calculados em memória por `expandUnitReceivables`
(`src/lib/calc/receivables.ts:17`) a partir do `paymentPlan` da unidade, e
nunca inseridos. Ou seja: um tenant que só tenha vendas com plano de pagamento
— e nenhum lançamento manual de conta a receber — tem `conta_receber`
**vazia**, e a coluna aparece zerada em todos os semestres, corretamente.

Some-se a isso o filtro `cancelado = false` de `getContasReceber`
(`queries.ts:1816`), que também remove linhas da contagem.

Segue a consulta, somente leitura, para separar as três causas. Substitua
`:tenant_id` pelo UUID do tenant.

```sql
SELECT
  COUNT(*)                                                             AS total,
  COUNT(*) FILTER (WHERE NOT cancelado)                                AS nao_canceladas,
  COUNT(*) FILTER (WHERE vencimento IS NOT NULL
                     AND btrim(vencimento) <> '')                      AS com_vencimento,
  COUNT(*) FILTER (WHERE data_recebimento IS NOT NULL
                     AND btrim(data_recebimento) <> '')                AS com_data_receb,
  COUNT(*) FILTER (WHERE (vencimento IS NULL OR btrim(vencimento) = '')
                     AND (data_recebimento IS NULL
                          OR btrim(data_recebimento) = ''))            AS sem_nenhuma_data,
  COUNT(*) FILTER (WHERE vencimento ~ '^\d{2}/\d{2}/\d{4}$')          AS formato_mm_dd_yyyy,
  COUNT(*) FILTER (WHERE vencimento IS NOT NULL
                     AND vencimento !~ '^\d{2}/\d{2}/\d{4}$')         AS formato_diferente
  FROM conta_receber
 WHERE tenant_id = :tenant_id;
```

Amostra dos formatos realmente gravados, que é o que decide entre as causas 2 e 3:

```sql
SELECT vencimento, data_recebimento, tipo, status, cancelado, COUNT(*) AS n
  FROM conta_receber
 WHERE tenant_id = :tenant_id
 GROUP BY 1,2,3,4,5
 ORDER BY n DESC
 LIMIT 30;
```

E a contagem por semestre, reproduzindo o que a tela faria:

```sql
SELECT split_part(COALESCE(NULLIF(btrim(vencimento), ''), data_recebimento), '/', 3)
         || '-H'
         || CASE WHEN split_part(COALESCE(NULLIF(btrim(vencimento), ''),
                                          data_recebimento), '/', 1)::int <= 6
                 THEN '1' ELSE '2' END                                 AS semestre,
       COUNT(*)                                                        AS n
  FROM conta_receber
 WHERE tenant_id = :tenant_id
   AND NOT cancelado
   AND COALESCE(NULLIF(btrim(vencimento), ''), data_recebimento) ~ '^\d{2}/\d{2}/\d{4}$'
 GROUP BY 1
 ORDER BY 1 DESC;
```

Se a primeira consulta devolver `total = 0`, a resposta é a causa 3 e a coluna
zerada está **certa** — não há o que arquivar.

### d) As 42 despesas de 2027: competência futura legítima?

**Também não posso rodar.** Mas o código diz de onde uma competência futura
pode vir, e são exatamente duas origens — nenhuma delas é `despesa_parcela`.

**Origem 1 — recorrência.** `addDespesa` replica o lançamento nos próximos
meses quando o formulário marca "recorrente"
(`src/lib/actions/despesas.ts:531–544`):

```ts
  // Despesa recorrente: replica o lançamento nos próximos meses (competência e
  // vencimento avançam 1 mês a cada repetição). Cada réplica recebe seu próprio
  // número automático; parcelas/anexo ficam só no lançamento original.
  if (formData.get("recorrente")) {
    const meses = Math.min(60, Math.max(2, Number(formData.get("recorrenciaMeses")) || 0));
    for (let i = 1; i < meses; i++) {
      const numDocRec = await reserveDespesaNumber(ctx.tenant.id);
      await db.insert(schema.despesas).values({
        ...core,
        numDoc: numDocRec,
        competencia: addMonthsCompetencia(core.competencia, i),
        vencimento: addMonthsDate(core.vencimento, i),
      });
    }
```

Até **60 meses** (`despesas.ts:535`), cada réplica com `competencia` avançada
de um mês e **seu próprio PED**. Um lançamento recorrente feito em 2026 com 24
meses produz competências até 2028. Cada réplica gera a linha de log
`despesa.recorrente` (`despesas.ts:545`), com `meta: { meses, competencia }` —
é por ela que se identifica a origem.

**Origem 2 — lançamento avulso com competência digitada.** `addDespesa` grava
`competencia: s("competencia")` (`despesas.ts:342`) sem nenhuma validação de
intervalo: não há limite superior, não há aviso de data futura.
`updateDespesa` idem (`despesas.ts:635`).

**O que NÃO produz competência futura:** o parcelamento. As parcelas vivem em
`despesa_parcela`, com `vencimento` próprio (`schema.ts:957+`), e **a
competência continua sendo a do cabeçalho da despesa** — o comentário do
`addDespesa` é explícito (`despesas.ts:344–346`): *"O PED carrega SEMPRE o
custo total da compra; o fracionamento vive nas parcelas"*. Uma compra de 2026
parcelada em 18 vezes tem **uma** despesa com competência de 2026, não 18
espalhadas.

Consultas para separar as duas origens:

```sql
SELECT d.competencia,
       COUNT(*)                                         AS n,
       SUM(d.valor)                                     AS valor_total,
       COUNT(*) FILTER (WHERE d.status = 'A pagar')     AS a_pagar,
       COUNT(*) FILTER (WHERE d.status = 'Pago')        AS pago,
       COUNT(*) FILTER (WHERE d.cancelado)              AS canceladas,
       COUNT(*) FILTER (WHERE d.condicao_pagamento IS NOT NULL) AS com_condicao,
       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM despesa_parcela p
                                       WHERE p.despesa_id = d.id))    AS com_parcelas
  FROM despesa d
 WHERE d.tenant_id = :tenant_id
   AND d.competencia ~ '^\d{2}/\d{4}$'
   AND split_part(d.competencia, '/', 2)::int >= 2027
 GROUP BY d.competencia
 ORDER BY d.competencia;
```

Quais delas nasceram de recorrência — cruzando com o log de auditoria:

```sql
SELECT d.competencia, d.num_doc, d.valor, d.status, d.created_at,
       EXISTS (SELECT 1 FROM audit_log a
                WHERE a.tenant_id = d.tenant_id
                  AND a.entity = 'despesa'
                  AND a.action = 'despesa.recorrente'
                  AND a.created_at BETWEEN d.created_at - interval '5 seconds'
                                       AND d.created_at + interval '5 seconds')
         AS perto_de_um_lote_recorrente
  FROM despesa d
 WHERE d.tenant_id = :tenant_id
   AND d.competencia ~ '^\d{2}/\d{4}$'
   AND split_part(d.competencia, '/', 2)::int >= 2027
 ORDER BY d.created_at, d.num_doc;
```

O critério do `created_at` é aproximado de propósito: o log de
`despesa.recorrente` aponta para o **lançamento original** (`entityId: row.id`,
`despesas.ts:550`), não para cada réplica, então não há vínculo direto entre a
réplica e o log. Réplicas criadas no mesmo laço compartilham o instante de
criação — é o que o `BETWEEN` explora.

Uma pista adicional, sem consultar o log: réplicas de um mesmo lote têm PEDs
**consecutivos** e `created_at` idêntico ao segundo. Lançamentos avulsos, não.

### e) O ZIP é gerado sob demanda ou tem cache? Quanto leva? Há limite?

**Sob demanda, sempre, sem nenhum cache.** Três evidências no código:

1. A rota declara `export const dynamic = "force-dynamic"`
   (`download/route.ts:5`) — nunca é pré-renderizada nem armazenada.
2. A resposta manda `"Cache-Control": "no-store"`
   (`download/route.ts:24`) — o navegador e qualquer CDN no caminho são
   proibidos de guardar.
3. `buildSemesterZip` não consulta nem grava nenhum artefato: não há tabela de
   backups gerados, não há chave no R2 para o ZIP, não há verificação de "já
   existe". Cada clique em "Baixar ZIP" refaz o trabalho inteiro.

**Quanto tempo leva:** não é possível medir daqui — não há banco nem R2 nesta
sessão, e o tempo depende da latência do R2 e do tamanho dos arquivos. O que o
código determina é a **forma** do custo, e ela é a parte que importa:

- **Quatro consultas sem filtro de período** (`backup.ts:174–179`): as quatro
  funções trazem **tudo** do tenant e o recorte por semestre acontece depois,
  em memória (`:181–188`). Pedir o ZIP de 2024-H1 lê todas as despesas,
  contas a receber, lançamentos de caixa e documentos de toda a história.
- **Download dos documentos em SÉRIE.** O laço é sequencial, com `await`
  dentro (`backup.ts:257–267`): 400 documentos são 400 idas ao R2, uma após a
  outra. Não há `Promise.all`, não há concorrência limitada, não há streaming.
  Com 150 ms de latência por objeto, só o download soma ~60 s; com 400 ms,
  ~2,7 min.
- **Tudo em memória ao mesmo tempo.** `getObjectBytes` carrega o objeto
  inteiro (`r2.ts:58–67`), o JSZip acumula todos os bytes, e
  `zip.generateAsync({ type: "uint8array" })` (`backup.ts:291`) materializa o
  ZIP completo antes de responder. Com documentos de até 10 MB cada (o limite
  do upload), 400 documentos podem significar vários GB residentes no processo.

**Limite de tamanho: nenhum.** Não há teto de quantidade de documentos, de
bytes acumulados, de tempo de execução nem paginação. O único limite efetivo é
a memória do contêiner e o timeout da plataforma — e quando qualquer um deles
estourar, o efeito é a requisição morrer, porque a resposta só começa a ser
enviada depois que o ZIP inteiro está pronto.

**O que tem tratamento de falha** é o documento individual: o `try/catch` do
laço (`backup.ts:259–266`) registra o arquivo em `docsFalhos` e continua. O ZIP
sai incompleto, mas sai — e o `_leia-me.txt` lista os que faltaram
(`backup.ts:280`).

### f) Os documentos entram como arquivo ou como link?

**Como arquivo, e são baixados do R2 na hora.** O trecho
(`backup.ts:253–268`):

```ts
  const docsFolder = zip.folder("documentos");
  let docsIncluidos = 0;
  const docsFalhos: string[] = [];
  if (docRows.length > 0 && isR2Configured() && docsFolder) {
    for (let i = 0; i < docRows.length; i++) {
      const doc = docRows[i];
      try {
        const bytes = await getObjectBytes(doc.storageKey);
        const safe = (doc.filename || `documento_${i + 1}`).replace(/[^\w.\-]+/g, "_");
        docsFolder.file(`${String(i + 1).padStart(3, "0")}_${safe}`, bytes);
        docsIncluidos++;
      } catch {
        docsFalhos.push(doc.filename || doc.storageKey);
      }
    }
  }
```

`getObjectBytes(doc.storageKey)` (`backup.ts:260`) faz um `GetObject` no R2 e
devolve o conteúdo inteiro em memória — não é presigned URL, não é link. Os
bytes vão para dentro do ZIP, na pasta `documentos/`, com nome
`NNN_arquivo_sanitizado` (`backup.ts:262`): índice de 3 dígitos com zero à
esquerda, mais o `filename` original com tudo que não é `\w`, `.` ou `-`
trocado por `_`.

O prefixo numérico existe porque o `filename` não é único — dois documentos com
o mesmo nome sobrescreveriam um ao outro dentro do ZIP.

**Três condições precisam ser satisfeitas** para a pasta ter conteúdo
(`backup.ts:256`): haver documentos no período, o R2 estar configurado, e o
`zip.folder()` ter retornado. Sem R2 configurado, **o ZIP sai só com a planilha
e o leia-me**, e o aviso é registrado no `_leia-me.txt`
(`backup.ts:281–283`):

```ts
    !isR2Configured() && docRows.length
      ? "- Observação: storage (R2) não configurado — documentos não incluídos."
      : "",
```

### g) O download é registrado?

**Não. Não há `logAudit`, nem data, nem usuário.**

A rota inteira tem 27 linhas (seção 4) e **não importa `@/lib/audit`**. O
mesmo vale para `src/lib/backup.ts`: grep de `logAudit` nos dois arquivos não
devolve nada. Não existe tabela de downloads, coluna `ultimo_backup_em`, nem
registro de qual semestre foi baixado por quem.

Consequências verificáveis no código:

- Não há como saber, pelo sistema, se o backup de um semestre **já foi feito**.
  O aviso do layout (`hasPendingSemesterBackup`) responde outra pergunta — "o
  último semestre encerrado tem dados?" —, não "alguém já baixou". O aviso
  reaparece a cada carregamento de página enquanto houver dados, tenha o
  backup sido baixado ou não.
- O `pendingKey` de `listSemesters` (`backup.ts:112–113`) segue a mesma lógica:
  é o último semestre encerrado **com dados**, sem consultar histórico algum.
- Um usuário com `backup:ver` pode baixar **todos** os semestres, repetidas
  vezes, sem deixar rastro — inclusive o semestre corrente, ainda em
  andamento, porque a rota aceita qualquer `?sem=` que `semesterInfo` saiba
  interpretar (`download/route.ts:16–18`).

É a assimetria mais visível do módulo: o ZIP contém as despesas, as contas a
receber, o caixa e **todos os documentos fiscais** do período — e a extração
desse pacote é a única operação sensível do sistema que não passa pelo
`audit_log`.

### h) A planilha é XLSX ou CSV? Cabeçalho de cada aba

**XLSX**, um único arquivo com **três abas**. A escrita é
`XLSX.write(wb, { type: "buffer", bookType: "xlsx" })` (`backup.ts:246`), e o
arquivo entra no ZIP como `dados_<chave>.xlsx` (`backup.ts:251`), com a chave
higienizada (`backup.ts:250`).

**Aba 1 — "Despesas"** (`backup.ts:193–209`), 8 colunas:

```ts
      ["Competência", "Nº Doc", "Projeto", "Conta CEF", "Categoria DRE", "Vencimento", "Valor", "Status"],
```

| Coluna | Origem | Transformação |
|---|---|---|
| Competência | `d.competencia` | texto cru `"MM/YYYY"` |
| Nº Doc | `d.numDoc` | — |
| Projeto | `d.projectName` | vem do join de `getDespesasByTenant` |
| Conta CEF | `d.contaCef` | — |
| Categoria DRE | `d.categoriaDre` | — |
| Vencimento | `d.vencimento` | `dateBR(...)` → `DD/MM/AAAA` |
| Valor | `d.valor` | `Number(...)` — vira número, não texto |
| Status | `d.status` | — |

**Aba 2 — "Contas a Receber"** (`backup.ts:211–229`), 10 colunas:

```ts
      ["Projeto", "Unidade", "Cliente", "Descrição", "Tipo", "Vencimento", "Recebimento", "Valor", "Recebido", "Status"],
```

| Coluna | Origem |
|---|---|
| Projeto | `r.projectName` (join) |
| Unidade | `r.unitCode` |
| Cliente | `r.clienteNome` (join com `cliente`) |
| Descrição | `r.descricao` |
| Tipo | `r.tipo` |
| Vencimento | `dateBR(r.vencimento)` |
| Recebimento | `dateBR(r.dataRecebimento)` |
| Valor | `Number(r.valor)` |
| Recebido | `Number(r.valorRecebido)` |
| Status | `r.status` |

**Aba 3 — "Caixa"** (`backup.ts:231–244`), 5 colunas:

```ts
      ["Data", "Descrição", "Categoria", "Valor", "Conciliado"],
```

| Coluna | Origem |
|---|---|
| Data | `dateBR(c.data)` |
| Descrição | `c.descricao` |
| Categoria | `c.cat` |
| Valor | `Number(c.valor)` |
| Conciliado | `c.rec ? "Sim" : "Não"` |

As três abas são montadas com `XLSX.utils.aoa_to_sheet` via o helper
`sheetFromAoa` (`backup.ts:156–158`) — array de arrays, sem formatação, sem
largura de coluna, sem congelar o cabeçalho. Valores monetários viram números
(`Number(...)`), então o Excel os soma; datas viram **texto** `DD/MM/AAAA`
(`dateBR`), então não são datas para o Excel.

Além da planilha, o ZIP leva o `_leia-me.txt` (`backup.ts:270–289`), com o
nome do tenant, o semestre, o instante da geração e a contagem de cada fonte.

### i) O que "Encerrado" e "Em andamento" significam?

São a renderização do booleano `closed` (`backup/page.tsx:81–83`):

```tsx
                  <TD>
                    <Badge tone={s.closed ? "neutral" : "success"}>
                      {s.closed ? "Encerrado" : "Em andamento"}
                    </Badge>
                  </TD>
```

E `closed` é calculado em `listSemesters` (`backup.ts:103–109`):

```ts
  const currentKey = currentSemesterKey(today);
  const lastClosedKey = lastClosedSemesterKey(today);
  const lastClosedOrd = semesterOrdinal(lastClosedKey);

  const semesters = [...acc.values()]
    .map((s) => ({ ...s, closed: semesterOrdinal(s.key) <= lastClosedOrd }))
    .sort((a, b) => semesterOrdinal(b.key) - semesterOrdinal(a.key));
```

A regra, em uma linha: **um semestre é "Encerrado" quando seu ordinal é menor
ou igual ao do último semestre encerrado** — ou seja, quando ele já terminou no
calendário. "Em andamento" é o semestre corrente (e qualquer semestre futuro,
se houver lançamento com competência à frente — caso do item (d)).

As três funções envolvidas, todas puras:

| Função | O que faz | Linha |
|---|---|---|
| `currentSemesterKey(today)` | semestre da data de hoje | `semester.ts:30–32` |
| `previousSemesterKey(key)` | H1 → H2 do ano anterior; H2 → H1 do mesmo ano | `semester.ts:35–39` |
| `lastClosedSemesterKey(today)` | `previousSemesterKey(currentSemesterKey(today))` | `semester.ts:42–44` |
| `semesterOrdinal(key)` | `year * 2 + (half - 1)` — número comparável | `semester.ts:82–86` |

O corte é **calendário puro**: nada consulta fechamento contábil,
`daily_closing`, `version.locked` nem qualquer marca de "período fechado". Um
semestre encerrado continua recebendo lançamento normalmente — o rótulo diz
apenas que a data passou. O texto da tela é explícito
(`backup/page.tsx:52–54`): *"nenhum dado é apagado e a visualização não muda"*.

O `pendingKey` — o que dispara o card de aviso no topo — é o **primeiro
semestre encerrado que tenha dados** (`backup.ts:112–113`), na lista já
ordenada do mais recente para o mais antigo.

### j) Qual permissão governa? Está em `SCREENS`? Em `CONTADOR_VE`?

**Está em `SCREENS`; NÃO está em `CONTADOR_VE`.**

`SCREENS` (`permissions.ts:64`):

```ts
  { id: "backup", label: "Backup & Arquivamento", modulo: "Backup" },
```

É a **única tela do módulo `Backup`** — o módulo tem exatamente um item.

`CONTADOR_VE` (`permissions.ts:84–93`) lista oito telas: `dre`, `fluxocaixa`,
`medicao`, `resumo`, `consolidado`, `planocontas`, `despesas` e `acoes`.
**`backup` não está entre elas** — o perfil contador **não** enxerga esta tela
nem consegue baixar o ZIP.

A chave é `backup:ver`, conferida em **três** lugares:

| Camada | Código | Linha |
|---|---|---|
| Enforcement central | `screenIdOfPath("/backup")` → `"backup"` → `can(..., "ver")` | `layout.tsx:92–95` |
| Página | `can(ctx.perms, "backup", "ver")` → `return null` | `backup/page.tsx:14` |
| **Rota do download** | `can(ctx.perms, "backup", "ver")` → **403** | `download/route.ts:13–15` |

A rota é a barreira que importa, e ela é conferida de verdade:

```ts
export async function GET(req: Request) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "backup", "ver")) {
    return new Response("Não autorizado", { status: 403 });
  }
```

Dois pontos sobre o alcance dessa chave:

1. **`ver` autoriza o download.** Não há distinção entre ver a tela e extrair o
   pacote — não existe `backup:criar` nem `backup:excluir` conferido em lugar
   nenhum (as três caixas de escrita da matriz são mortas para esta tela).
   Quem pode abrir `/backup` pode baixar tudo.
2. **O enforcement central cobre `/backup` mas não `/backup/download`… e
   cobre.** `screenIdOfPath` pega o primeiro segmento
   (`permissions.ts:138–142`), que é `"backup"` nos dois casos. A rota está em
   `src/app/(app)/`, dentro do grupo que usa o layout — mas Route Handlers não
   passam pelo layout, e é por isso que ela repete o `can()` por conta própria.

Perfis padrão para `backup` (`permissions.ts:96–112`): `owner` e `admin` →
`FULL`; `membro` → `EDIT`, porque o módulo é `Backup` e não `Config`, ou seja
**`membro` vê e baixa por padrão**; `engenheiro` → `NONE`; `contador` →
`NONE`.

### k) Há `tenant_id` no `where` de cada consulta?

**Sim, nas seis.**

| Operação | Arquivo:linha | `where` | Filtra? |
|---|---|---|---|
| `getDespesasByTenant` | `queries.ts:304–309` | `and(eq(despesas.tenantId, …), eq(versions.kind, "atual"))` | ✅ |
| `getContasReceber` | `queries.ts:1813–1818` | `and(eq(contasReceber.tenantId, …), eq(cancelado, false))` | ✅ |
| `getCashByTenant` | `queries.ts:1075` | `and(eq(cashEntries.tenantId, …), eq(versions.kind, "atual"))` | ✅ |
| `getDocuments` | `queries.ts:1038` | `eq(documents.tenantId, …)` | ✅ |
| `hasPendingSemesterBackup` — despesas | `backup.ts:133–138` | `and(eq(despesas.tenantId, …), inArray(competencia, info.months))` | ✅ |
| `hasPendingSemesterBackup` — documentos | `backup.ts:144–150` | `and(eq(documents.tenantId, …), gte/lte uploadedAt)` | ✅ |

Nenhuma escrita: **o módulo inteiro é somente leitura** — não há `insert`,
`update` nem `delete` em `backup.ts` nem na rota.

O `tenantId` chega por parâmetro em `listSemesters(tenantId)` e
`buildSemesterZip(tenantId, …)`, e quem o fornece é sempre `ctx.tenant.id`,
resolvido pela sessão (`backup/page.tsx:16`, `download/route.ts:17`,
`layout.tsx:100`). O cliente controla apenas o `?sem=`
(`download/route.ts:16`) — que é validado por `semesterInfo` e, se não casar o
padrão `^(\d{4})-H([12])$`, devolve 400 (`download/route.ts:18`).

Uma observação sobre o acesso ao R2: a chave do objeto vem de
`doc.storageKey` (`backup.ts:260`), e `doc` saiu de uma consulta já filtrada
por tenant — não há como pedir um objeto de outro tenant pela rota. As chaves
seguem o padrão `tenants/<tenantId>/…`, mas o isolamento aqui é da consulta,
não do formato da chave.

### l) Existe restauração, ou o ZIP é só para guardar fora?

**Não existe restauração. O ZIP é só para guardar fora.**

Verificações:

- Não há rota, action ou tela de import/restore. Grep por `restore`,
  `restaurar` e `importBackup` no `src/` não devolve nada relacionado.
- `src/lib/backup.ts` não tem nenhuma operação de escrita — só `select` e
  `getObjectBytes`.
- O ZIP não é reversível por construção (item (a)): a planilha leva 8, 10 e 5
  colunas de tabelas que têm 36, 15 e ~20; não leva `id`, `tenant_id`,
  `version_id` nem nenhuma chave estrangeira. Não há como recompor os vínculos
  a partir dele.
- A única importação que existe no app é de **dados de versão**
  (`importVersionData`, `src/lib/actions/version-io.ts:25`), que lê uma
  planilha de planejamento — formato diferente, propósito diferente, e ela
  **apaga** as despesas da versão antes de inserir
  (`version-io.ts:87`).

O próprio produto diz isso em três lugares, com a mesma palavra:

| Onde | Texto |
|---|---|
| Docstring de `buildSemesterZip` (`backup.ts:163`) | *"NÃO remove nada do banco — é apenas uma cópia de segurança."* |
| Card da tela (`backup/page.tsx:52–54`) | *"Esta é apenas uma cópia de segurança: nenhum dado é apagado e a visualização não muda."* |
| `_leia-me.txt` dentro do ZIP (`backup.ts:285`) | *"este backup é apenas uma cópia. Nenhum dado foi removido do sistema."* |

Ou seja: o pacote serve para entregar à contabilidade e para guardar fora do
sistema. Recuperar o banco a partir dele não é possível — isso depende do dump
do Postgres e do bucket R2, que estão fora do escopo desta tela. É coerente com
a trava do SOW de que o backup do banco é obrigatório antes de qualquer
migração: esse backup é outro, e não é este.
