# TELA-acerto — código na íntegra

Coleta do código da tela **Acerto Contábil** (`/acerto`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria (recursiva):**

```
acerto/page.tsx
├── components/app/page-header.tsx
├── components/app/access-denied.tsx
│   └── components/app/page-header.tsx            (já listado)
└── components/app/acerto-manager.tsx
    ├── AcertoManager      — só a barra de abas
    ├── VincularDespesas   — aba "Vincular despesas"
    ├── Linha              — auxiliar do painel de fechamento
    ├── RateioObras        — aba "Rateio entre obras"
    └── Historico          — aba "Acertos do período"

`acerto-manager.tsx` é um arquivo único com os cinco componentes acima;
não importa nenhum outro componente próprio. As demais importações são
primitivas de UI (card, button, input, date-field, badge, table) e libs
(calc/acerto, utils).

queries.ts chamadas:  getBankAccounts · getStakeholders · getChartAccounts
actions de leitura:   getDespesasAbativeis, getAcertos
actions de escrita:   concluirAcerto, ratearEntreObras, estornarAcerto
```

---

## 1. Página

### `src/app/(app)/acerto/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getAcertos, getDespesasAbativeis } from "@/lib/actions/acerto";
import { getBankAccounts, getStakeholders, getChartAccounts } from "@/lib/queries";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { categoriasDeDespesa } from "@/lib/calc/natureza-dre";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { AcertoManager } from "@/components/app/acerto-manager";

export const dynamic = "force-dynamic";

/**
 * ACERTO CONTÁBIL — Módulo 5.
 *
 * Resolve os dois casos que não tinham solução: um pagamento único quitando
 * várias despesas de várias obras, e a diferença entre o somatório das despesas
 * e o valor efetivamente transferido (juros de atraso ou desconto negociado).
 */
export default async function AcertoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  // Acerto é operação de nível financeiro (RNF de permissões).
  if (!can(ctx.perms, "despesas", "editar") || !can(ctx.perms, "caixa", "ver")) {
    return <AccessDenied />;
  }

  const [despesas, acertos, bancos, stakeholders, contas] = await Promise.all([
    getDespesasAbativeis(),
    getAcertos(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Acerto Contábil"
        subtitle="Um pagamento único quitando várias despesas, inclusive de obras diferentes. A saída de caixa é uma só; a diferença vai para despesa/receita financeira, nunca para o custo da obra."
      />
      <AcertoManager
        despesas={despesas}
        acertos={acertos}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        favorecidos={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        categorias={categoriasDeDespesa(CATEGORIAS_DRE)}
        contas={[...contas]
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map((c) => ({ code: c.code, name: c.name }))}
        canEstornar={can(ctx.perms, "despesas", "excluir")}
      />
    </>
  );
}
```

---

## 2. Componentes próprios (recursivo)

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

### `src/components/app/access-denied.tsx`

Importa `page-header.tsx`, já listado acima.

```tsx
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";

export function AccessDenied() {
  return (
    <>
      <PageHeader title="Acesso negado" />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink4)]">
            Sem permissão
          </span>
          <p className="text-sm text-[var(--color-ink3)]">
            Você não tem permissão de <strong>Ver</strong> esta tela. Fale com um
            administrador em Gestão de Acessos.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
```

### `src/components/app/acerto-manager.tsx`

```tsx
"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  concluirAcerto,
  estornarAcerto,
  ratearEntreObras,
  type AcertoResumo,
  type DespesaAbativel,
} from "@/lib/actions/acerto";
import { calcularDiferenca, calcularRateio, validarRateio } from "@/lib/calc/acerto";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField, MonthField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

interface Opt {
  id: string;
  nome: string;
}

/** Chave de idempotência por tentativa (§16 / CA-34). */
function novaChave(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

type Aba = "vincular" | "rateio" | "historico";

export function AcertoManager({
  despesas,
  acertos,
  bancos,
  favorecidos,
  projetos,
  categorias,
  contas,
  canEstornar,
}: {
  despesas: DespesaAbativel[];
  acertos: AcertoResumo[];
  bancos: Opt[];
  favorecidos: Opt[];
  projetos: Opt[];
  categorias: string[];
  contas: { code: string; name: string }[];
  canEstornar: boolean;
}) {
  const [aba, setAba] = useState<Aba>("vincular");
  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
        {(
          [
            ["vincular", "Vincular despesas"],
            ["rateio", "Rateio entre obras"],
            ["historico", "Acertos do período"],
          ] as [Aba, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
              aba === k
                ? "bg-white text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "vincular" && (
        <VincularDespesas
          despesas={despesas}
          bancos={bancos}
          favorecidos={favorecidos}
          categorias={categorias}
        />
      )}
      {aba === "rateio" && (
        <RateioObras
          projetos={projetos}
          bancos={bancos}
          favorecidos={favorecidos}
          categorias={categorias}
          contas={contas}
        />
      )}
      {aba === "historico" && <Historico acertos={acertos} canEstornar={canEstornar} />}
    </div>
  );
}

/** Item 5.1 — cabeçalho da saída + grade de vinculação + painel de fechamento. */
function VincularDespesas({
  despesas,
  bancos,
  favorecidos,
  categorias,
}: {
  despesas: DespesaAbativel[];
  bancos: Opt[];
  favorecidos: Opt[];
  categorias: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const chave = useRef(novaChave());

  const [cab, setCab] = useState({
    dataPagamento: "",
    bankAccountId: "",
    valorTransferido: "",
    formaPagamento: "",
    favorecidoId: "",
    obs: "",
    categoriaDiferenca: "Despesas Financeiras",
  });
  const [filtro, setFiltro] = useState({ fornecedor: "", obra: "", busca: "" });
  /** despesaId → valor a abater (editável, permite abatimento parcial). */
  const [sel, setSel] = useState<Record<string, number>>({});

  const opts = useMemo(() => {
    const forn = new Map<string, string>();
    const obras = new Map<string, string>();
    for (const d of despesas) {
      if (d.fornecedorId && d.fornecedorNome) forn.set(d.fornecedorId, d.fornecedorNome);
      obras.set(d.projectId, d.projectName);
    }
    return {
      fornecedores: [...forn].map(([id, nome]) => ({ id, nome })),
      obras: [...obras].map(([id, nome]) => ({ id, nome })),
    };
  }, [despesas]);

  const visiveis = useMemo(
    () =>
      despesas.filter((d) => {
        if (filtro.fornecedor && d.fornecedorId !== filtro.fornecedor) return false;
        if (filtro.obra && d.projectId !== filtro.obra) return false;
        if (filtro.busca.trim()) {
          const q = filtro.busca.trim().toLowerCase();
          const alvo = `${d.numDoc ?? ""} ${d.fornecedorNome ?? ""} ${d.projectName} ${d.competencia ?? ""}`.toLowerCase();
          if (!alvo.includes(q)) return false;
        }
        return true;
      }),
    [despesas, filtro],
  );

  const itens = Object.entries(sel)
    .filter(([, v]) => v > 0)
    .map(([despesaId, valor]) => ({ despesaId, valor }));
  const totalVinculado = Math.round(itens.reduce((a, i) => a + i.valor, 0) * 100) / 100;
  const transferido = Number(cab.valorTransferido) || 0;
  const diferenca = calcularDiferenca(transferido, totalVinculado);

  const alternar = (d: DespesaAbativel) =>
    setSel((s) => {
      const n = { ...s };
      if (n[d.id] != null) delete n[d.id];
      else n[d.id] = d.saldo;
      return n;
    });

  const confirmar = () => {
    if (pending) return;
    setErro(null);
    setMsg(null);
    start(async () => {
      const res = await concluirAcerto({
        dataPagamento: cab.dataPagamento,
        bankAccountId: cab.bankAccountId || null,
        valorTransferido: transferido,
        formaPagamento: cab.formaPagamento || null,
        favorecidoId: cab.favorecidoId || null,
        obs: cab.obs || null,
        itens,
        categoriaDiferenca: cab.categoriaDiferenca,
        idempotencyKey: chave.current,
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao concluir o acerto.");
        return;
      }
      chave.current = novaChave();
      setMsg(`Acerto ${res.numDoc ?? ""} concluído. ${itens.length} despesa(s) quitada(s).`);
      setSel({});
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label>Data do pagamento</Label>
            <DateField
              value={cab.dataPagamento}
              onChange={(v) => setCab({ ...cab, dataPagamento: v })}
            />
          </div>
          <div>
            <Label>Banco / conta</Label>
            <Select
              value={cab.bankAccountId}
              onChange={(e) => setCab({ ...cab, bankAccountId: e.target.value })}
            >
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Valor transferido</Label>
            <Input
              type="number"
              step="0.01"
              value={cab.valorTransferido}
              onChange={(e) => setCab({ ...cab, valorTransferido: e.target.value })}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label>Forma</Label>
            <Select
              value={cab.formaPagamento}
              onChange={(e) => setCab({ ...cab, formaPagamento: e.target.value })}
            >
              <option value="">—</option>
              {["PIX", "Transferência bancária", "Boleto", "Cheque", "Dinheiro"].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Favorecido</Label>
            <Select
              value={cab.favorecidoId}
              onChange={(e) => setCab({ ...cab, favorecidoId: e.target.value })}
            >
              <option value="">—</option>
              {favorecidos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Input value={cab.obs} onChange={(e) => setCab({ ...cab, obs: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
          <div>
            <Label>Buscar</Label>
            <Input
              value={filtro.busca}
              onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })}
              placeholder="PED, fornecedor, obra"
            />
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Select
              value={filtro.fornecedor}
              onChange={(e) => setFiltro({ ...filtro, fornecedor: e.target.value })}
            >
              <option value="">Todos</option>
              {opts.fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Obra</Label>
            <Select
              value={filtro.obra}
              onChange={(e) => setFiltro({ ...filtro, obra: e.target.value })}
            >
              <option value="">Todas</option>
              {opts.obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table wrapperClassName="max-h-[45vh] scroll-x-always" className="min-w-[1000px]">
            <THead className="sticky top-0 z-10">
              <tr>
                <TH className="w-8"></TH>
                <TH>PED</TH>
                <TH>Obra</TH>
                <TH>Fornecedor</TH>
                <TH>Competência</TH>
                <TH>Vencimento</TH>
                <TH className="text-right">Em aberto</TH>
                <TH className="text-right">A abater</TH>
              </tr>
            </THead>
            <tbody>
              {visiveis.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={sel[d.id] != null}
                      onChange={() => alternar(d)}
                      aria-label={`Vincular ${d.numDoc ?? d.id}`}
                    />
                  </TD>
                  <TD className="whitespace-nowrap font-[family-name:var(--font-mono)]">
                    {d.numDoc ?? "—"}
                  </TD>
                  <TD className="whitespace-nowrap">{d.projectName}</TD>
                  <TD className="max-w-[180px] truncate">{d.fornecedorNome ?? "—"}</TD>
                  <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {d.competencia ?? "—"}
                  </TD>
                  <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {d.vencimento ? dateBR(d.vencimento) : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brl0(d.saldo)}
                  </TD>
                  <TD className="text-right">
                    {/* Abatimento PARCIAL é permitido: o pagamento pode cobrir
                        só parte de um PED. */}
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 w-28 text-right"
                      value={sel[d.id] ?? ""}
                      disabled={sel[d.id] == null}
                      onChange={(e) =>
                        setSel((s) => ({ ...s, [d.id]: Number(e.target.value) || 0 }))
                      }
                    />
                  </TD>
                </TR>
              ))}
              {visiveis.length === 0 && (
                <TR>
                  <TD colSpan={8} className="py-8 text-center text-[var(--color-ink4)]">
                    Nenhuma despesa em aberto com os filtros aplicados.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* Painel de fechamento — sempre visível (item 5.1). */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-2 font-[family-name:var(--font-mono)] text-[13px] sm:max-w-md">
            <Linha label="Valor transferido" valor={transferido} />
            <Linha label="Total vinculado" valor={totalVinculado} />
            <div className="border-t border-[var(--color-accent2)]/15 pt-2">
              <Linha
                label="Diferença"
                valor={diferenca.tipo === "DESCONTO" ? -diferenca.valor : diferenca.valor}
                destaque
              />
            </div>
          </div>
          {diferenca.tipo !== "NENHUMA" && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[220px]">
                <Label>
                  Classificar como{" "}
                  {diferenca.tipo === "JUROS" ? "juros e multas" : "desconto obtido"}
                </Label>
                <Select
                  value={cab.categoriaDiferenca}
                  onChange={(e) => setCab({ ...cab, categoriaDiferenca: e.target.value })}
                >
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="max-w-lg text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
                A diferença é lançada como{" "}
                {diferenca.tipo === "JUROS" ? "despesa" : "receita"} financeira do
                período, na competência do pagamento. <strong>Não é rateada no
                custo de nenhuma obra</strong> — juros de mora são perda
                operacional, não custo de obtenção de recursos (RG-07).
              </p>
            </div>
          )}
          {erro && <p className="mt-3 text-sm text-[var(--color-danger)]">{erro}</p>}
          {msg && <p className="mt-3 text-sm text-[var(--color-success)]">{msg}</p>}
          <div className="mt-4">
            <Button
              onClick={confirmar}
              disabled={pending || itens.length === 0 || transferido <= 0 || !cab.dataPagamento}
            >
              {pending ? "Concluindo…" : `Concluir acerto (${itens.length} despesa(s))`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Linha({
  label,
  valor,
  destaque,
}: {
  label: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[var(--color-ink3)]">{label}</span>
      <span
        className={
          destaque
            ? valor === 0
              ? "font-semibold text-[var(--color-ink3)]"
              : valor > 0
                ? "font-semibold text-[var(--color-danger)]"
                : "font-semibold text-[var(--color-success)]"
            : "text-[var(--color-ink)]"
        }
      >
        {brl0(valor)}
      </span>
    </div>
  );
}

/** Item 5.3 — um PIX, várias obras, um comprovante. */
function RateioObras({
  projetos,
  bancos,
  favorecidos,
  categorias,
  contas,
}: {
  projetos: Opt[];
  bancos: Opt[];
  favorecidos: Opt[];
  categorias: string[];
  contas: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const chave = useRef(novaChave());

  const [f, setF] = useState({
    prestadorId: "",
    valorTotal: "",
    dataPagamento: "",
    bankAccountId: "",
    competencia: "",
    categoriaDre: categorias[0] ?? "Custo Variável",
    contaCef: "",
    baseRateio: "",
    descricao: "",
  });
  const [linhas, setLinhas] = useState<{ projectId: string; percentual: string }[]>([
    { projectId: projetos[0]?.id ?? "", percentual: "" },
  ]);

  const valorTotal = Number(f.valorTotal) || 0;
  const rateio = calcularRateio(
    valorTotal,
    linhas
      .filter((l) => l.projectId)
      .map((l) => ({ projectId: l.projectId, percentual: Number(l.percentual) || 0 })),
  );
  const erroRateio = valorTotal > 0 ? validarRateio(valorTotal, rateio) : null;

  const confirmar = () => {
    if (pending) return;
    setErro(null);
    setMsg(null);
    start(async () => {
      const res = await ratearEntreObras({
        prestadorId: f.prestadorId || null,
        valorTotal,
        dataPagamento: f.dataPagamento,
        bankAccountId: f.bankAccountId || null,
        competencia: f.competencia || null,
        categoriaDre: f.categoriaDre,
        contaCef: f.contaCef || null,
        baseRateio: f.baseRateio || null,
        descricao: f.descricao || null,
        linhas: linhas
          .filter((l) => l.projectId)
          .map((l) => ({ projectId: l.projectId, percentual: Number(l.percentual) || 0 })),
        idempotencyKey: chave.current,
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao ratear.");
        return;
      }
      chave.current = novaChave();
      setMsg(
        `Rateio ${res.numDoc ?? ""} concluído: ${rateio.length} PED(s) gerados, uma única saída de caixa.`,
      );
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
          Rateio de mão de obra entre obras
        </h2>
        <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          Um pagamento único a um prestador que trabalhou em várias obras. Gera{" "}
          <strong>um PED por obra</strong> (custo correto por centro de custo) e{" "}
          <strong>uma única saída de caixa</strong>. A memória de cálculo fica
          gravada — é o documento que sustenta o custo por obra perante a
          contabilidade.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label>Prestador</Label>
            <Select
              value={f.prestadorId}
              onChange={(e) => setF({ ...f, prestadorId: e.target.value })}
            >
              <option value="">—</option>
              {favorecidos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Valor total pago</Label>
            <Input
              type="number"
              step="0.01"
              value={f.valorTotal}
              onChange={(e) => setF({ ...f, valorTotal: e.target.value })}
            />
          </div>
          <div>
            <Label>Data do pagamento</Label>
            <DateField value={f.dataPagamento} onChange={(v) => setF({ ...f, dataPagamento: v })} />
          </div>
          <div>
            <Label>Competência</Label>
            <MonthField value={f.competencia} onChange={(v) => setF({ ...f, competencia: v })} />
          </div>
          <div>
            <Label>Banco / conta</Label>
            <Select
              value={f.bankAccountId}
              onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}
            >
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Categoria DRE</Label>
            <Select
              value={f.categoriaDre}
              onChange={(e) => setF({ ...f, categoriaDre: e.target.value })}
            >
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Conta CEF</Label>
            <Select value={f.contaCef} onChange={(e) => setF({ ...f, contaCef: e.target.value })}>
              <option value="">—</option>
              {contas.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Base do rateio</Label>
            <Input
              value={f.baseRateio}
              onChange={(e) => setF({ ...f, baseRateio: e.target.value })}
              placeholder="ex.: dias trabalhados"
            />
          </div>
          <div className="sm:col-span-4">
            <Label>Descrição</Label>
            <Input
              value={f.descricao}
              onChange={(e) => setF({ ...f, descricao: e.target.value })}
              placeholder="ex.: mão de obra semana 12"
            />
          </div>
        </div>

        <h3 className="mb-2 mt-5 text-[13px] font-semibold text-[var(--color-ink)]">
          Distribuição entre obras
        </h3>
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <Label>Obra</Label>
                <Select
                  value={l.projectId}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, j) => (j === i ? { ...x, projectId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">—</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-28">
                <Label>%</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={l.percentual}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, j) => (j === i ? { ...x, percentual: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <div className="w-32 pb-2 text-right font-[family-name:var(--font-mono)] text-[13px]">
                {brl0(rateio[i]?.valor ?? 0)}
              </div>
              {linhas.length > 1 && (
                <button
                  onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                  className="pb-2 text-[12px] text-[var(--color-danger)] hover:underline"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setLinhas((ls) => [...ls, { projectId: "", percentual: "" }])}
          className="mt-2 text-[12px] text-[var(--color-accent2)] hover:underline"
        >
          + Adicionar obra
        </button>

        {/* CA-27 — rateio que não fecha é bloqueado com mensagem clara. */}
        {erroRateio && (
          <p className="mt-3 rounded-[8px] bg-[var(--color-danger)]/10 p-2.5 text-[12.5px] text-[var(--color-danger)]">
            {erroRateio}
          </p>
        )}
        {erro && <p className="mt-3 text-sm text-[var(--color-danger)]">{erro}</p>}
        {msg && <p className="mt-3 text-sm text-[var(--color-success)]">{msg}</p>}

        <div className="mt-4">
          <Button
            onClick={confirmar}
            disabled={pending || !!erroRateio || valorTotal <= 0 || !f.dataPagamento}
          >
            {pending ? "Rateando…" : `Gerar ${rateio.length} PED(s) e a saída única`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Item 5.5 — relatório "Acertos do período", o pacote para a contabilidade. */
function Historico({
  acertos,
  canEstornar,
}: {
  acertos: AcertoResumo[];
  canEstornar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const estornar = (a: AcertoResumo) => {
    const motivo = window.prompt(`Motivo do estorno do acerto ${a.numDoc ?? ""}:`);
    if (motivo === null) return;
    setErro(null);
    start(async () => {
      try {
        await estornarAcerto(a.id, motivo);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao estornar.");
      }
    });
  };

  return (
    <Card>
      <CardContent className="p-0">
        {erro && <p className="p-3 text-sm text-[var(--color-danger)]">{erro}</p>}
        <Table wrapperClassName="max-h-[70vh] scroll-x-always" className="min-w-[1100px]">
          <THead className="sticky top-0 z-10">
            <tr>
              <TH>Documento</TH>
              <TH>Data</TH>
              <TH>Favorecido</TH>
              <TH className="text-right">Transferido</TH>
              <TH className="text-right">Vinculado</TH>
              <TH className="text-right">Diferença</TH>
              <TH>Obras</TH>
              <TH>Status</TH>
              {canEstornar && <TH className="text-right">Ação</TH>}
            </tr>
          </THead>
          <tbody>
            {acertos.map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap font-[family-name:var(--font-mono)]">
                  {a.numDoc ?? "—"}
                </TD>
                <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {a.dataPagamento ? dateBR(a.dataPagamento) : "—"}
                </TD>
                <TD className="max-w-[180px] truncate">{a.favorecido ?? "—"}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {brl0(a.valorTransferido)}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {brl0(a.totalVinculado)}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {a.diferencaTipo === "NENHUMA" ? (
                    "—"
                  ) : (
                    <span
                      className={
                        a.diferencaTipo === "JUROS"
                          ? "text-[var(--color-danger)]"
                          : "text-[var(--color-success)]"
                      }
                      title={
                        a.diferencaTipo === "JUROS"
                          ? "Juros e multas — despesa financeira do período"
                          : "Desconto obtido — receita financeira do período"
                      }
                    >
                      {brl0(a.diferencaValor)}
                    </span>
                  )}
                </TD>
                <TD className="max-w-[220px] truncate text-[var(--color-ink3)]">
                  {a.obras.join(", ") || "—"}
                </TD>
                <TD>
                  {a.estornado ? (
                    <Badge tone="neutral">Estornado</Badge>
                  ) : (
                    <Badge tone="success">Concluído</Badge>
                  )}
                </TD>
                {canEstornar && (
                  <TD className="text-right">
                    {!a.estornado && (
                      <button
                        onClick={() => estornar(a)}
                        disabled={pending}
                        className="text-sm text-[var(--color-danger)] hover:underline"
                      >
                        Estornar
                      </button>
                    )}
                  </TD>
                )}
              </TR>
            ))}
            {acertos.length === 0 && (
              <TR>
                <TD colSpan={canEstornar ? 9 : 8} className="py-8 text-center text-[var(--color-ink4)]">
                  Nenhum acerto registrado.
                </TD>
              </TR>
            )}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

---

## 3. Funções de `queries.ts` chamadas pela página

Três, todas no `Promise.all` das linhas 28–34 do `page.tsx`. Nenhuma filtra
por versão ou projeto — o escopo é o tenant.

### `src/lib/queries.ts` · linhas 219–227

```ts
export async function getBankAccounts(
  tenantId: string,
): Promise<BankAccountRow[]> {
  return db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, tenantId))
    .orderBy(asc(schema.bankAccounts.banco));
}
```

### `src/lib/queries.ts` · linhas 192–200

```ts
export async function getStakeholders(
  tenantId: string,
): Promise<StakeholderRow[]> {
  return db
    .select()
    .from(schema.stakeholders)
    .where(eq(schema.stakeholders.tenantId, tenantId))
    .orderBy(asc(schema.stakeholders.nome));
}
```

### `src/lib/queries.ts` · linhas 229–236

```ts
export async function getChartAccounts(
  tenantId: string,
): Promise<ChartAccountRow[]> {
  return db
    .select()
    .from(schema.chartAccounts)
    .where(eq(schema.chartAccounts.tenantId, tenantId));
}
```

---

## 4. `src/lib/actions/acerto.ts` — arquivo inteiro

### `src/lib/actions/acerto.ts`

```ts
"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import {
  abaterFifo,
  abaterManual,
  acertoFecha,
  calcularDiferenca,
  calcularRateio,
  validarRateio,
  type LinhaRateio,
} from "@/lib/calc/acerto";
import { CONTAS_CONTROLADORIA } from "@/lib/calc/constants";
import type { CategoriaDRE } from "@/lib/calc/constants";
import { getAtualVersion } from "@/lib/queries";

/**
 * ACERTO CONTÁBIL — Módulo 5.
 *
 * Resolve os dois casos que o sistema não suportava:
 *   (a) um pagamento único quitando várias despesas, de várias obras;
 *   (b) a diferença entre o somatório das despesas e o valor transferido.
 *
 * Invariantes (RG-07 e RG-08):
 *   - a saída de caixa é UMA, no valor efetivamente transferido;
 *   - soma dos abatimentos + diferença financeira == valor transferido;
 *   - a diferença vai para despesa/receita FINANCEIRA do período, jamais
 *     rateada no custo das obras.
 */

export interface DespesaAbativel {
  id: string;
  numDoc: string | null;
  projectId: string;
  projectName: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: number;
  /** quanto ainda falta pagar (valor − já abatido por outros acertos). */
  saldo: number;
  status: string | null;
}

/**
 * Despesas em aberto que podem ser vinculadas a um acerto.
 *
 * Traz de TODAS as obras do tenant de propósito (item 5.1): o pagamento único
 * que motiva este módulo cruza obras. Já descontado o que outros acertos
 * abateram, para o mesmo PED não ser pago duas vezes.
 */
export async function getDespesasAbativeis(
  favorecidoId?: string | null,
): Promise<DespesaAbativel[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return [];

  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(
      and(
        eq(schema.despesas.tenantId, ctx.tenant.id),
        eq(schema.despesas.cancelado, false),
        ne(schema.despesas.status, "Pago"),
      ),
    );

  const ids = rows.map((r) => r.d.id);
  const abatidos = new Map<string, number>();
  if (ids.length > 0) {
    const itens = await db
      .select({
        despesaId: schema.acertoItens.despesaId,
        valor: schema.acertoItens.valorAbatido,
        estornado: schema.acertos.estornado,
      })
      .from(schema.acertoItens)
      .innerJoin(schema.acertos, eq(schema.acertoItens.acertoId, schema.acertos.id))
      .where(inArray(schema.acertoItens.despesaId, ids));
    for (const i of itens) {
      // Acerto estornado não conta: as despesas dele foram reabertas.
      if (i.estornado) continue;
      abatidos.set(i.despesaId, (abatidos.get(i.despesaId) ?? 0) + Number(i.valor));
    }
  }

  return rows
    .filter((r) => !favorecidoId || r.d.fornecedorId === favorecidoId)
    .map((r) => {
      const saldo =
        Math.round((Number(r.d.valor) - (abatidos.get(r.d.id) ?? 0)) * 100) / 100;
      return {
        id: r.d.id,
        numDoc: r.d.numDoc,
        projectId: r.projectId,
        projectName: r.projectName,
        fornecedorId: r.d.fornecedorId,
        fornecedorNome: r.fornecedorNome,
        competencia: r.d.competencia,
        vencimento: r.d.vencimento,
        valor: Number(r.d.valor),
        saldo,
        status: r.d.status,
      };
    })
    .filter((r) => r.saldo > 0.004);
}

export interface AcertoInput {
  dataPagamento: string;
  bankAccountId?: string | null;
  valorTransferido: number;
  formaPagamento?: string | null;
  favorecidoId?: string | null;
  obs?: string | null;
  /** despesas a abater: `{id, valor}` com valor editável (abatimento parcial). */
  itens: { despesaId: string; valor: number }[];
  /** categoria da diferença; sem ela, usa o default financeiro (RG-07). */
  categoriaDiferenca?: string | null;
  idempotencyKey?: string | null;
}

export interface AcertoResult {
  ok: boolean;
  error?: string;
  acertoId?: string;
  numDoc?: string;
  jaExistia?: boolean;
}

/**
 * Conclui um acerto contábil (itens 5.1, 5.2 e 5.4).
 *
 * Tudo numa transação: ou o acerto inteiro existe, ou nada dele existe. Um
 * acerto meio aplicado deixaria despesas quitadas sem a saída de caixa
 * correspondente.
 */
export async function concluirAcerto(input: AcertoInput): Promise<AcertoResult> {
  const ctx = await getActiveContext();
  // Item 6 dos RNF: acerto é operação de nível financeiro.
  if (!ctx || !can(ctx.perms, "despesas", "editar") || !can(ctx.perms, "caixa", "criar")) {
    return { ok: false, error: "Sem permissão para concluir acertos contábeis." };
  }
  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
      .from(schema.acertos)
      .where(
        and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
      )
      .limit(1);
    if (existente)
      return {
        ok: true,
        acertoId: existente.id,
        numDoc: existente.numDoc ?? undefined,
        jaExistia: true,
      };
  }

  const valorTransferido = Math.abs(input.valorTransferido);
  if (!(valorTransferido > 0)) {
    return { ok: false, error: "Informe o valor transferido." };
  }
  if (input.itens.length === 0) {
    return { ok: false, error: "Vincule ao menos uma despesa ao acerto." };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const ids = input.itens.map((i) => i.despesaId);
      const despesas = await tx
        .select()
        .from(schema.despesas)
        .where(
          and(eq(schema.despesas.tenantId, ctx.tenant.id), inArray(schema.despesas.id, ids)),
        );
      if (despesas.length !== ids.length) {
        throw new Error("Alguma despesa vinculada não foi encontrada.");
      }
      const porId = new Map(despesas.map((d) => [d.id, d]));

      // O valor abatido nunca excede o valor da despesa.
      const abatimentos = abaterManual(
        input.itens.map((i) => ({ id: i.despesaId, valor: i.valor })),
        despesas.map((d) => ({
          id: d.id,
          competencia: d.competencia,
          numDoc: d.numDoc,
          saldo: Number(d.valor),
        })),
      );
      const totalVinculado = abatimentos.totalAbatido;
      const diferenca = calcularDiferenca(valorTransferido, totalVinculado);
      if (!acertoFecha(valorTransferido, totalVinculado, diferenca)) {
        throw new Error(
          "O acerto não fecha: a soma dos abatimentos mais a diferença precisa ser igual ao valor transferido.",
        );
      }

      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [acerto] = await tx
        .insert(schema.acertos)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          dataPagamento: input.dataPagamento || null,
          bankAccountId: input.bankAccountId || null,
          valorTransferido: String(valorTransferido),
          formaPagamento: input.formaPagamento || null,
          favorecidoId: input.favorecidoId || null,
          diferencaValor: String(diferenca.valor),
          diferencaTipo: diferenca.tipo,
          obs: input.obs || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      // Cada despesa vinculada vira "Pago", guardando o status anterior para
      // que o estorno saiba ao que voltar (item 5.4).
      for (const a of abatimentos.abatimentos) {
        const d = porId.get(a.id)!;
        await tx.insert(schema.acertoItens).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          despesaId: a.id,
          valorAbatido: String(a.valorAbatido),
          statusAnterior: d.status,
        });
        if (a.quitado) {
          await tx
            .update(schema.despesas)
            .set({ status: "Pago", dataCaixa: input.dataPagamento || null })
            .where(eq(schema.despesas.id, a.id));
        } else {
          await tx
            .update(schema.despesas)
            .set({ status: "Parcialmente paga" })
            .where(eq(schema.despesas.id, a.id));
        }
      }

      // RG-07 — a diferença é despesa/receita FINANCEIRA do período, na
      // competência da DATA DO PAGAMENTO, e não é rateada no custo de obra
      // nenhuma. Vira uma despesa própria, com PED próprio, para aparecer na
      // DRE na linha certa.
      let diferencaDespesaId: string | null = null;
      if (diferenca.tipo !== "NENHUMA") {
        const projetoDaDiferenca = porId.get(abatimentos.abatimentos[0].id)!;
        const [versaoDif] = await tx
          .select({ id: schema.versions.id })
          .from(schema.versions)
          .where(eq(schema.versions.id, projetoDaDiferenca.versionId))
          .limit(1);
        const compet = (input.dataPagamento || "").split("/");
        const competencia =
          compet.length === 3 ? `${compet[0]}/${compet[2]}` : projetoDaDiferenca.competencia;
        const numDif = await reserveDespesaNumber(ctx.tenant.id);
        const [despDif] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versaoDif.id,
            tenantId: ctx.tenant.id,
            numDoc: numDif,
            fornecedorId: input.favorecidoId || null,
            contaCef:
              diferenca.tipo === "JUROS"
                ? CONTAS_CONTROLADORIA.jurosMora
                : CONTAS_CONTROLADORIA.descontosObtidos,
            // Sempre "Despesas Financeiras": mesmo o desconto obtido entra como
            // valor NEGATIVO nesta categoria, para não abrir uma categoria de
            // receita num lançamento de despesa (RG-01).
            categoriaDre: (input.categoriaDiferenca as CategoriaDRE) ?? "Despesas Financeiras",
            competencia,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor:
              diferenca.tipo === "JUROS"
                ? String(diferenca.valor)
                : String(-diferenca.valor),
            status: "Pago",
            obs:
              diferenca.tipo === "JUROS"
                ? `Juros e multas — acerto ${numDoc}`
                : `Desconto obtido — acerto ${numDoc}`,
          })
          .returning();
        diferencaDespesaId = despDif.id;
      }

      // RG-08 — UMA saída de caixa, no valor efetivamente transferido.
      const [cash] = await tx
        .insert(schema.cashEntries)
        .values({
          versionId: porId.get(abatimentos.abatimentos[0].id)!.versionId,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataPagamento || null,
          descricao: `Acerto ${numDoc}`,
          valor: String(-valorTransferido),
          cat: "acerto",
          rec: true,
        })
        .returning();

      await tx
        .update(schema.acertos)
        .set({ diferencaDespesaId, cashEntryId: cash.id })
        .where(eq(schema.acertos.id, acerto.id));

      return { acertoId: acerto.id, numDoc, diferenca, totalVinculado };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "acerto.create",
      entity: "acerto",
      entityId: out.acertoId,
      meta: {
        numDoc: out.numDoc,
        valorTransferido,
        totalVinculado: out.totalVinculado,
        diferenca: out.diferenca,
        despesas: input.itens.length,
      },
    });
    revalidatePath("/acerto");
    revalidatePath("/contaspagar");
    revalidatePath("/caixa");
    revalidatePath("/fluxocaixa");
    revalidatePath("/dre");
    return { ok: true, acertoId: out.acertoId, numDoc: out.numDoc };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao concluir o acerto.";
    if (idem && /duplicate key|acerto_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
        .from(schema.acertos)
        .where(
          and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
        )
        .limit(1);
      if (existente)
        return {
          ok: true,
          acertoId: existente.id,
          numDoc: existente.numDoc ?? undefined,
          jaExistia: true,
        };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Estorna um acerto (item 5.4).
 *
 * Reabre TODAS as despesas vinculadas ao status que tinham antes, reverte a
 * saída de caixa e cancela a despesa de diferença financeira. O acerto não é
 * apagado — fica marcado como estornado, preservando a trilha (RG-09).
 */
export async function estornarAcerto(acertoId: string, motivo: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) {
    throw new Error("Sem permissão para estornar acertos.");
  }
  const [acerto] = await db
    .select()
    .from(schema.acertos)
    .where(and(eq(schema.acertos.id, acertoId), eq(schema.acertos.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!acerto) throw new Error("Acerto não encontrado.");
  if (acerto.estornado) throw new Error("Este acerto já foi estornado.");

  await db.transaction(async (tx) => {
    const itens = await tx
      .select()
      .from(schema.acertoItens)
      .where(eq(schema.acertoItens.acertoId, acertoId));

    // Cada despesa volta ao status ANTERIOR ao acerto — não a um status
    // arbitrário. Por isso `statusAnterior` é gravado na conclusão.
    for (const i of itens) {
      await tx
        .update(schema.despesas)
        .set({ status: i.statusAnterior ?? "A pagar", dataCaixa: null })
        .where(eq(schema.despesas.id, i.despesaId));
    }

    // A diferença financeira é cancelada logicamente, não apagada (RG-09).
    if (acerto.diferencaDespesaId) {
      await tx
        .update(schema.despesas)
        .set({
          cancelado: true,
          canceladoPor: ctx.userEmail || ctx.userId || null,
          motivoCancelamento: `Estorno do acerto ${acerto.numDoc ?? ""}: ${motivo}`.trim(),
        })
        .where(eq(schema.despesas.id, acerto.diferencaDespesaId));
    }

    // Estorno da saída de caixa: entrada compensatória, preservando o
    // lançamento original.
    if (acerto.cashEntryId) {
      const [orig] = await tx
        .select()
        .from(schema.cashEntries)
        .where(eq(schema.cashEntries.id, acerto.cashEntryId))
        .limit(1);
      if (orig) {
        await tx.insert(schema.cashEntries).values({
          versionId: orig.versionId,
          tenantId: ctx.tenant.id,
          bankAccountId: orig.bankAccountId,
          data: orig.data,
          descricao: `Estorno do acerto ${acerto.numDoc ?? ""}`.trim(),
          valor: String(Math.abs(Number(orig.valor))),
          cat: "ajuste",
          rec: true,
        });
      }
    }

    await tx
      .update(schema.acertos)
      .set({
        estornado: true,
        estornadoEm: new Date().toISOString().slice(0, 10),
        estornadoPor: ctx.userEmail || ctx.userId || null,
        obs: `${acerto.obs ?? ""}\nEstornado: ${motivo}`.trim(),
      })
      .where(eq(schema.acertos.id, acertoId));
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "acerto.estorno",
    entity: "acerto",
    entityId: acertoId,
    meta: { numDoc: acerto.numDoc, motivo },
  });
  revalidatePath("/acerto");
  revalidatePath("/contaspagar");
  revalidatePath("/caixa");
  revalidatePath("/dre");
}

export interface RateioInput {
  prestadorId: string | null;
  valorTotal: number;
  dataPagamento: string;
  bankAccountId?: string | null;
  competencia?: string | null;
  categoriaDre?: string | null;
  contaCef?: string | null;
  baseRateio?: string | null;
  descricao?: string | null;
  linhas: LinhaRateio[];
  idempotencyKey?: string | null;
}

/**
 * Rateio de mão de obra entre obras — item 5.3.
 *
 * "Um PIX, várias obras, um comprovante": gera **um PED por obra** (custo
 * correto por centro de custo) e **uma única saída de caixa**. A memória de
 * cálculo fica gravada e é o documento que sustenta o custo por obra perante a
 * contabilidade e eventual fiscalização.
 */
export async function ratearEntreObras(
  input: RateioInput,
): Promise<AcertoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar") || !can(ctx.perms, "caixa", "criar")) {
    return { ok: false, error: "Sem permissão para ratear pagamentos entre obras." };
  }
  const valorTotal = Math.abs(input.valorTotal);
  const rateio = calcularRateio(valorTotal, input.linhas);
  // CA-27 — rateio que não fecha é BLOQUEADO: ele determina o custo por centro
  // de custo, e um erro aqui contamina o resultado de cada obra.
  const erro = validarRateio(valorTotal, rateio);
  if (erro) return { ok: false, error: erro };

  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
      .from(schema.acertos)
      .where(
        and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
      )
      .limit(1);
    if (existente)
      return {
        ok: true,
        acertoId: existente.id,
        numDoc: existente.numDoc ?? undefined,
        jaExistia: true,
      };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [acerto] = await tx
        .insert(schema.acertos)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          dataPagamento: input.dataPagamento || null,
          bankAccountId: input.bankAccountId || null,
          valorTransferido: String(valorTotal),
          favorecidoId: input.prestadorId || null,
          diferencaValor: "0",
          diferencaTipo: "NENHUMA",
          obs: input.descricao || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      let versaoPrimeira: string | null = null;
      for (const linha of rateio) {
        const versao = await getAtualVersion(ctx.tenant.id, linha.projectId);
        if (!versao) {
          throw new Error(
            "Uma das obras do rateio não tem versão Atual — crie-a antes de ratear.",
          );
        }
        versaoPrimeira ??= versao.id;
        const numObra = await reserveDespesaNumber(ctx.tenant.id);
        const [desp] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versao.id,
            tenantId: ctx.tenant.id,
            numDoc: numObra,
            fornecedorId: input.prestadorId || null,
            contaCef: input.contaCef || null,
            categoriaDre: (input.categoriaDre as CategoriaDRE) ?? "Custo Variável",
            competencia: input.competencia || null,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor: String(linha.valor),
            status: "Pago",
            obs: `${input.descricao ?? "Rateio de mão de obra"} — acerto ${numDoc}`,
            // A saída de caixa é do ACERTO, uma só. Marcar aqui evitaria que a
            // despesa gerasse uma segunda saída no fluxo.
            pagoPorTerceiro: false,
          })
          .returning();

        await tx.insert(schema.rateiosObra).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          projectId: linha.projectId,
          despesaId: desp.id,
          valor: String(linha.valor),
          percentual: String(linha.percentual),
          baseRateio: input.baseRateio || null,
          memoriaCalculo: {
            valorTotalPago: valorTotal,
            criterio: input.baseRateio ?? "percentual informado",
            percentual: linha.percentual,
            valorDaObra: linha.valor,
            acerto: numDoc,
            calculadoEm: input.dataPagamento,
          },
        });

        await tx.insert(schema.acertoItens).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          despesaId: desp.id,
          valorAbatido: String(linha.valor),
          statusAnterior: "A pagar",
        });
      }

      // RG-08 — uma saída de caixa só, no valor total pago.
      const [cash] = await tx
        .insert(schema.cashEntries)
        .values({
          versionId: versaoPrimeira!,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataPagamento || null,
          descricao: `Rateio entre obras — acerto ${numDoc}`,
          valor: String(-valorTotal),
          cat: "acerto",
          rec: true,
        })
        .returning();
      await tx
        .update(schema.acertos)
        .set({ cashEntryId: cash.id })
        .where(eq(schema.acertos.id, acerto.id));

      return { acertoId: acerto.id, numDoc };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "acerto.rateio",
      entity: "acerto",
      entityId: out.acertoId,
      meta: { numDoc: out.numDoc, valorTotal, obras: rateio.length, rateio },
    });
    revalidatePath("/acerto");
    revalidatePath("/despesas");
    revalidatePath("/caixa");
    revalidatePath("/dre");
    return { ok: true, acertoId: out.acertoId, numDoc: out.numDoc };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao ratear o pagamento.",
    };
  }
}

export interface AcertoResumo {
  id: string;
  numDoc: string | null;
  dataPagamento: string | null;
  favorecido: string | null;
  valorTransferido: number;
  totalVinculado: number;
  diferencaValor: number;
  diferencaTipo: string;
  qtdDespesas: number;
  obras: string[];
  estornado: boolean;
}

/**
 * Relatório "Acertos do período" (item 5.5) — o pacote entregue à contabilidade.
 */
export async function getAcertos(tenantId: string): Promise<AcertoResumo[]> {
  const acertos = await db
    .select({
      a: schema.acertos,
      favorecido: schema.stakeholders.nome,
    })
    .from(schema.acertos)
    .leftJoin(schema.stakeholders, eq(schema.acertos.favorecidoId, schema.stakeholders.id))
    .where(eq(schema.acertos.tenantId, tenantId));
  if (acertos.length === 0) return [];

  const itens = await db
    .select({
      acertoId: schema.acertoItens.acertoId,
      valor: schema.acertoItens.valorAbatido,
      projectName: schema.projects.name,
    })
    .from(schema.acertoItens)
    .innerJoin(schema.despesas, eq(schema.acertoItens.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(eq(schema.acertoItens.tenantId, tenantId));

  const porAcerto = new Map<string, { total: number; qtd: number; obras: Set<string> }>();
  for (const i of itens) {
    let e = porAcerto.get(i.acertoId);
    if (!e) {
      e = { total: 0, qtd: 0, obras: new Set() };
      porAcerto.set(i.acertoId, e);
    }
    e.total += Number(i.valor);
    e.qtd += 1;
    e.obras.add(i.projectName);
  }

  return acertos
    .map(({ a, favorecido }) => {
      const agg = porAcerto.get(a.id);
      return {
        id: a.id,
        numDoc: a.numDoc,
        dataPagamento: a.dataPagamento,
        favorecido,
        valorTransferido: Number(a.valorTransferido),
        totalVinculado: Math.round((agg?.total ?? 0) * 100) / 100,
        diferencaValor: Number(a.diferencaValor),
        diferencaTipo: a.diferencaTipo,
        qtdDespesas: agg?.qtd ?? 0,
        obras: [...(agg?.obras ?? [])].sort(),
        estornado: a.estornado,
      };
    })
    .sort((x, y) => (y.dataPagamento ?? "").localeCompare(x.dataPagamento ?? ""));
}

/** Preview do abatimento FIFO, para a tela mostrar antes de confirmar. */
export async function previewAbatimentoFifo(
  valor: number,
  favorecidoId?: string | null,
) {
  const despesas = await getDespesasAbativeis(favorecidoId);
  return {
    despesas,
    resultado: abaterFifo(
      valor,
      despesas.map((d) => ({
        id: d.id,
        competencia: d.competencia,
        numDoc: d.numDoc,
        saldo: d.saldo,
      })),
    ),
  };
}
```

---

## 5. A aba "Rateio entre obras"


### 5.1 Onde fica

A tela tem três abas, definidas no `AcertoManager` (`acerto-manager.tsx:56–76`)
e trocadas por estado local — `useState<Aba>("vincular")`, linha 53. Não há
rota nem `searchParams`: recarregar a página volta sempre para *Vincular
despesas*.

| Aba | Componente | Action |
|---|---|---|
| Vincular despesas | `VincularDespesas` (101–435) | `concluirAcerto` |
| Rateio entre obras | `RateioObras` (467–722) | `ratearEntreObras` |
| Acertos do período | `Historico` (725–841) | `estornarAcerto` |

### 5.2 O que a aba faz

Um pagamento único a um prestador que trabalhou em **várias obras**. O
usuário informa o valor total, o prestador, a data, o banco, a competência, a
conta CEF, a categoria DRE, a *base do rateio* (texto livre — ex.: "dias
trabalhados") e uma linha por obra com o percentual.

O rateio é calculado **no cliente** por `calcularRateio` a cada digitação
(`acerto-manager.tsx:502`) e validado por `validarRateio` (linha 508). O botão
de envio fica desabilitado enquanto `erroRateio` existir, enquanto
`valorTotal <= 0` ou sem data de pagamento (linha 714) — é o CA-27: rateio que
não fecha é **bloqueado**, não arredondado.

No servidor, `ratearEntreObras` recalcula `calcularRateio` e revalida com
`validarRateio` antes de gravar (`acerto.ts:498–502`) — a validação do cliente
não é a que vale.

O resultado da action é **um PED por obra** (cada um na versão *Atual* do seu
projeto, via `getAtualVersion`) e **uma única saída de caixa**. O registro em
`acerto` nasce com `diferencaValor: "0"` e `diferencaTipo: "NENHUMA"`
(`acerto.ts:534–535`): **o rateio nunca gera diferença financeira** — ele
distribui exatamente o valor total.

Permissão exigida pela action: `despesas:criar` **e** `caixa:criar`
(`acerto.ts:494`) — mais estrita do que a da página, que pede
`despesas:editar` + `caixa:ver`.

### `src/components/app/acerto-manager.tsx` · linhas 467–722

O componente `RateioObras` inteiro.

```tsx
function RateioObras({
  projetos,
  bancos,
  favorecidos,
  categorias,
  contas,
}: {
  projetos: Opt[];
  bancos: Opt[];
  favorecidos: Opt[];
  categorias: string[];
  contas: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const chave = useRef(novaChave());

  const [f, setF] = useState({
    prestadorId: "",
    valorTotal: "",
    dataPagamento: "",
    bankAccountId: "",
    competencia: "",
    categoriaDre: categorias[0] ?? "Custo Variável",
    contaCef: "",
    baseRateio: "",
    descricao: "",
  });
  const [linhas, setLinhas] = useState<{ projectId: string; percentual: string }[]>([
    { projectId: projetos[0]?.id ?? "", percentual: "" },
  ]);

  const valorTotal = Number(f.valorTotal) || 0;
  const rateio = calcularRateio(
    valorTotal,
    linhas
      .filter((l) => l.projectId)
      .map((l) => ({ projectId: l.projectId, percentual: Number(l.percentual) || 0 })),
  );
  const erroRateio = valorTotal > 0 ? validarRateio(valorTotal, rateio) : null;

  const confirmar = () => {
    if (pending) return;
    setErro(null);
    setMsg(null);
    start(async () => {
      const res = await ratearEntreObras({
        prestadorId: f.prestadorId || null,
        valorTotal,
        dataPagamento: f.dataPagamento,
        bankAccountId: f.bankAccountId || null,
        competencia: f.competencia || null,
        categoriaDre: f.categoriaDre,
        contaCef: f.contaCef || null,
        baseRateio: f.baseRateio || null,
        descricao: f.descricao || null,
        linhas: linhas
          .filter((l) => l.projectId)
          .map((l) => ({ projectId: l.projectId, percentual: Number(l.percentual) || 0 })),
        idempotencyKey: chave.current,
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao ratear.");
        return;
      }
      chave.current = novaChave();
      setMsg(
        `Rateio ${res.numDoc ?? ""} concluído: ${rateio.length} PED(s) gerados, uma única saída de caixa.`,
      );
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
          Rateio de mão de obra entre obras
        </h2>
        <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          Um pagamento único a um prestador que trabalhou em várias obras. Gera{" "}
          <strong>um PED por obra</strong> (custo correto por centro de custo) e{" "}
          <strong>uma única saída de caixa</strong>. A memória de cálculo fica
          gravada — é o documento que sustenta o custo por obra perante a
          contabilidade.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label>Prestador</Label>
            <Select
              value={f.prestadorId}
              onChange={(e) => setF({ ...f, prestadorId: e.target.value })}
            >
              <option value="">—</option>
              {favorecidos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Valor total pago</Label>
            <Input
              type="number"
              step="0.01"
              value={f.valorTotal}
              onChange={(e) => setF({ ...f, valorTotal: e.target.value })}
            />
          </div>
          <div>
            <Label>Data do pagamento</Label>
            <DateField value={f.dataPagamento} onChange={(v) => setF({ ...f, dataPagamento: v })} />
          </div>
          <div>
            <Label>Competência</Label>
            <MonthField value={f.competencia} onChange={(v) => setF({ ...f, competencia: v })} />
          </div>
          <div>
            <Label>Banco / conta</Label>
            <Select
              value={f.bankAccountId}
              onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}
            >
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Categoria DRE</Label>
            <Select
              value={f.categoriaDre}
              onChange={(e) => setF({ ...f, categoriaDre: e.target.value })}
            >
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Conta CEF</Label>
            <Select value={f.contaCef} onChange={(e) => setF({ ...f, contaCef: e.target.value })}>
              <option value="">—</option>
              {contas.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Base do rateio</Label>
            <Input
              value={f.baseRateio}
              onChange={(e) => setF({ ...f, baseRateio: e.target.value })}
              placeholder="ex.: dias trabalhados"
            />
          </div>
          <div className="sm:col-span-4">
            <Label>Descrição</Label>
            <Input
              value={f.descricao}
              onChange={(e) => setF({ ...f, descricao: e.target.value })}
              placeholder="ex.: mão de obra semana 12"
            />
          </div>
        </div>

        <h3 className="mb-2 mt-5 text-[13px] font-semibold text-[var(--color-ink)]">
          Distribuição entre obras
        </h3>
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <Label>Obra</Label>
                <Select
                  value={l.projectId}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, j) => (j === i ? { ...x, projectId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">—</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-28">
                <Label>%</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={l.percentual}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, j) => (j === i ? { ...x, percentual: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <div className="w-32 pb-2 text-right font-[family-name:var(--font-mono)] text-[13px]">
                {brl0(rateio[i]?.valor ?? 0)}
              </div>
              {linhas.length > 1 && (
                <button
                  onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                  className="pb-2 text-[12px] text-[var(--color-danger)] hover:underline"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setLinhas((ls) => [...ls, { projectId: "", percentual: "" }])}
          className="mt-2 text-[12px] text-[var(--color-accent2)] hover:underline"
        >
          + Adicionar obra
        </button>

        {/* CA-27 — rateio que não fecha é bloqueado com mensagem clara. */}
        {erroRateio && (
          <p className="mt-3 rounded-[8px] bg-[var(--color-danger)]/10 p-2.5 text-[12.5px] text-[var(--color-danger)]">
            {erroRateio}
          </p>
        )}
        {erro && <p className="mt-3 text-sm text-[var(--color-danger)]">{erro}</p>}
        {msg && <p className="mt-3 text-sm text-[var(--color-success)]">{msg}</p>}

        <div className="mt-4">
          <Button
            onClick={confirmar}
            disabled={pending || !!erroRateio || valorTotal <= 0 || !f.dataPagamento}
          >
            {pending ? "Rateando…" : `Gerar ${rateio.length} PED(s) e a saída única`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### `src/lib/actions/acerto.ts` · linhas 468–641

`RateioInput` e `ratearEntreObras` — a action inteira.

```ts
export interface RateioInput {
  prestadorId: string | null;
  valorTotal: number;
  dataPagamento: string;
  bankAccountId?: string | null;
  competencia?: string | null;
  categoriaDre?: string | null;
  contaCef?: string | null;
  baseRateio?: string | null;
  descricao?: string | null;
  linhas: LinhaRateio[];
  idempotencyKey?: string | null;
}

/**
 * Rateio de mão de obra entre obras — item 5.3.
 *
 * "Um PIX, várias obras, um comprovante": gera **um PED por obra** (custo
 * correto por centro de custo) e **uma única saída de caixa**. A memória de
 * cálculo fica gravada e é o documento que sustenta o custo por obra perante a
 * contabilidade e eventual fiscalização.
 */
export async function ratearEntreObras(
  input: RateioInput,
): Promise<AcertoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar") || !can(ctx.perms, "caixa", "criar")) {
    return { ok: false, error: "Sem permissão para ratear pagamentos entre obras." };
  }
  const valorTotal = Math.abs(input.valorTotal);
  const rateio = calcularRateio(valorTotal, input.linhas);
  // CA-27 — rateio que não fecha é BLOQUEADO: ele determina o custo por centro
  // de custo, e um erro aqui contamina o resultado de cada obra.
  const erro = validarRateio(valorTotal, rateio);
  if (erro) return { ok: false, error: erro };

  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
      .from(schema.acertos)
      .where(
        and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
      )
      .limit(1);
    if (existente)
      return {
        ok: true,
        acertoId: existente.id,
        numDoc: existente.numDoc ?? undefined,
        jaExistia: true,
      };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [acerto] = await tx
        .insert(schema.acertos)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          dataPagamento: input.dataPagamento || null,
          bankAccountId: input.bankAccountId || null,
          valorTransferido: String(valorTotal),
          favorecidoId: input.prestadorId || null,
          diferencaValor: "0",
          diferencaTipo: "NENHUMA",
          obs: input.descricao || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      let versaoPrimeira: string | null = null;
      for (const linha of rateio) {
        const versao = await getAtualVersion(ctx.tenant.id, linha.projectId);
        if (!versao) {
          throw new Error(
            "Uma das obras do rateio não tem versão Atual — crie-a antes de ratear.",
          );
        }
        versaoPrimeira ??= versao.id;
        const numObra = await reserveDespesaNumber(ctx.tenant.id);
        const [desp] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versao.id,
            tenantId: ctx.tenant.id,
            numDoc: numObra,
            fornecedorId: input.prestadorId || null,
            contaCef: input.contaCef || null,
            categoriaDre: (input.categoriaDre as CategoriaDRE) ?? "Custo Variável",
            competencia: input.competencia || null,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor: String(linha.valor),
            status: "Pago",
            obs: `${input.descricao ?? "Rateio de mão de obra"} — acerto ${numDoc}`,
            // A saída de caixa é do ACERTO, uma só. Marcar aqui evitaria que a
            // despesa gerasse uma segunda saída no fluxo.
            pagoPorTerceiro: false,
          })
          .returning();

        await tx.insert(schema.rateiosObra).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          projectId: linha.projectId,
          despesaId: desp.id,
          valor: String(linha.valor),
          percentual: String(linha.percentual),
          baseRateio: input.baseRateio || null,
          memoriaCalculo: {
            valorTotalPago: valorTotal,
            criterio: input.baseRateio ?? "percentual informado",
            percentual: linha.percentual,
            valorDaObra: linha.valor,
            acerto: numDoc,
            calculadoEm: input.dataPagamento,
          },
        });

        await tx.insert(schema.acertoItens).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          despesaId: desp.id,
          valorAbatido: String(linha.valor),
          statusAnterior: "A pagar",
        });
      }

      // RG-08 — uma saída de caixa só, no valor total pago.
      const [cash] = await tx
        .insert(schema.cashEntries)
        .values({
          versionId: versaoPrimeira!,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataPagamento || null,
          descricao: `Rateio entre obras — acerto ${numDoc}`,
          valor: String(-valorTotal),
          cat: "acerto",
          rec: true,
        })
        .returning();
      await tx
        .update(schema.acertos)
        .set({ cashEntryId: cash.id })
        .where(eq(schema.acertos.id, acerto.id));

      return { acertoId: acerto.id, numDoc };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "acerto.rateio",
      entity: "acerto",
      entityId: out.acertoId,
      meta: { numDoc: out.numDoc, valorTotal, obras: rateio.length, rateio },
    });
    revalidatePath("/acerto");
    revalidatePath("/despesas");
    revalidatePath("/caixa");
    revalidatePath("/dre");
    return { ok: true, acertoId: out.acertoId, numDoc: out.numDoc };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao ratear o pagamento.",
    };
  }
}
```

### `src/lib/calc/acerto.ts` · linhas 194–237

`LinhaRateio`, `RateioCalculado` e `calcularRateio`.

```ts
export interface LinhaRateio {
  projectId: string;
  /** informado em valor OU em percentual — o outro é derivado. */
  valor?: number;
  percentual?: number;
}

export interface RateioCalculado {
  projectId: string;
  valor: number;
  percentual: number;
}

/**
 * Distribui um pagamento único entre obras, por valor ou por percentual.
 *
 * A diferença de arredondamento vai para a ÚLTIMA obra, para que a soma feche
 * exatamente com o total pago — senão o rateio "perde" centavos e o caixa não
 * bate com a soma dos PEDs gerados.
 */
export function calcularRateio(
  valorTotal: number,
  linhas: readonly LinhaRateio[],
): RateioCalculado[] {
  if (linhas.length === 0) return [];
  const usaPercentual = linhas.some((l) => l.percentual != null);
  const brutos = linhas.map((l) =>
    usaPercentual
      ? round2((valorTotal * (l.percentual ?? 0)) / 100)
      : round2(l.valor ?? 0),
  );
  const soma = round2(brutos.reduce((a, v) => a + v, 0));
  // Só ajusta quando a intenção era distribuir o total inteiro (percentual);
  // em modo valor, uma soma diferente é divergência a ser reportada, não
  // corrigida em silêncio.
  if (usaPercentual && soma !== valorTotal) {
    brutos[brutos.length - 1] = round2(brutos[brutos.length - 1] + (valorTotal - soma));
  }
  return linhas.map((l, i) => ({
    projectId: l.projectId,
    valor: brutos[i],
    percentual: valorTotal === 0 ? 0 : round2((brutos[i] / valorTotal) * 100),
  }));
}
```

### `src/lib/calc/acerto.ts` · linhas 239–275

`rateioFecha` e `validarRateio` — a trava CA-27.

```ts
/**
 * O rateio fecha em 100% / no valor total? (CA-27)
 *
 * Tolerância de 1 centavo. Um rateio que não fecha é bloqueado: ele determina
 * o custo por centro de custo e um erro aqui contamina o resultado de cada obra.
 */
export function rateioFecha(
  valorTotal: number,
  rateio: readonly RateioCalculado[],
): boolean {
  const soma = round2(rateio.reduce((a, r) => a + r.valor, 0));
  return Math.abs(soma - valorTotal) <= 0.01;
}

/** Mensagem de bloqueio do rateio, ou `null` quando ele fecha. */
export function validarRateio(
  valorTotal: number,
  rateio: readonly RateioCalculado[],
): string | null {
  if (rateio.length === 0) return "Informe ao menos uma obra no rateio.";
  if (rateio.some((r) => r.valor < 0)) return "Nenhuma obra pode receber valor negativo.";
  if (!rateioFecha(valorTotal, rateio)) {
    const soma = round2(rateio.reduce((a, r) => a + r.valor, 0));
    const dif = round2(soma - valorTotal);
    return `O rateio soma ${soma.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })} e o pagamento foi ${valorTotal.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })} — diferença de ${dif.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })}. Ajuste antes de confirmar.`;
  }
  return null;
}
```

---

## 6. Como a "diferença" é tratada


### 6.1 Onde ela é calculada

`calcularDiferenca(valorTransferido, totalVinculado)` devolve um
`{ tipo, valor }` com `tipo` em `"JUROS" | "DESCONTO" | "NENHUMA"`. É chamada
duas vezes: no cliente, para o painel de fechamento
(`acerto-manager.tsx:164`), e no servidor, dentro da transação
(`acerto.ts:211`), onde o resultado é confrontado com `acertoFecha` antes de
gravar qualquer coisa (`acerto.ts:212`).

### 6.2 Onde ela vira despesa ou receita

**No banco, a diferença vira sempre uma linha em `despesa` — nunca uma linha
de receita.** O bloco é `acerto.ts:265–307`, e só roda quando
`diferenca.tipo !== "NENHUMA"`. A linha criada é uma despesa com PED próprio
(`reserveDespesaNumber`), `status: "Pago"`, e:

| | JUROS | DESCONTO |
|---|---|---|
| `contaCef` | `CONTAS_CONTROLADORIA.jurosMora` | `CONTAS_CONTROLADORIA.descontosObtidos` |
| `valor` | `String(diferenca.valor)` — **positivo** | `String(-diferenca.valor)` — **negativo** |
| `obs` | `Juros e multas — acerto {numDoc}` | `Desconto obtido — acerto {numDoc}` |
| `categoriaDre` | `input.categoriaDiferenca ?? "Despesas Financeiras"` | idem |

O comentário no próprio código explica a escolha (`acerto.ts:288–290`):
*"Sempre 'Despesas Financeiras': mesmo o desconto obtido entra como valor
NEGATIVO nesta categoria, para não abrir uma categoria de receita num
lançamento de despesa (RG-01)."*

A categoria, porém, é **escolhida pelo usuário** no `Select` da tela
(`acerto-manager.tsx:401–410`, alimentado por
`categoriasDeDespesa(CATEGORIAS_DRE)`); `"Despesas Financeiras"` é apenas o
fallback quando `input.categoriaDiferenca` vem nulo.

### 6.3 Competência e centro de custo

A competência da despesa de diferença é derivada da **data do pagamento**,
não da competência das despesas abatidas: `"MM/DD/YYYY"` → `"MM/YYYY"`
(`acerto.ts:273–275`), com fallback para a competência do projeto da primeira
despesa vinculada quando a data não tem três partes.

A `versionId` e, portanto, o projeto que recebe a linha é o da **primeira
despesa abatida** (`abatimentos.abatimentos[0]`, `acerto.ts:267`). Ou seja: a
diferença não é rateada entre as obras — cai inteira em uma delas, escolhida
pela ordem do array de abatimentos.

`impactoNoCustoDaObra()` existe em `calc/acerto.ts` e devolve `0`, fixo.

### 6.4 O que a tela diz

O texto exibido ao usuário (`acerto-manager.tsx:413–414`) é *"A diferença é
lançada como **despesa** / **receita** financeira do período"* — "receita"
quando o tipo é `DESCONTO`. No banco, como visto acima, os dois casos gravam
em `despesa`; o desconto é uma despesa de valor negativo. O painel também
exibe a diferença com o sinal invertido no caso `DESCONTO`
(`acerto-manager.tsx:389`).

### 6.5 No estorno

`estornarAcerto` **cancela logicamente** a despesa de diferença — não a apaga
(`acerto.ts:409–418`, RG-09), e só quando `acerto.diferencaDespesaId` existe.

### `src/lib/calc/acerto.ts` · linhas 139–190

`TipoDiferenca`, `DiferencaAcerto`, `calcularDiferenca`, `impactoNoCustoDaObra` e `acertoFecha`.

```ts

export type TipoDiferenca = "JUROS" | "DESCONTO" | "NENHUMA";

export interface DiferencaAcerto {
  valor: number;
  tipo: TipoDiferenca;
}

/**
 * Diferença entre o que saiu do banco e o que foi vinculado.
 *
 * Positiva (pagou mais) → **juros e multas**, despesa financeira do período.
 * Negativa (pagou menos) → **descontos obtidos**, receita financeira.
 *
 * Em nenhum dos casos a diferença é rateada no custo das obras: juros de mora
 * são perda operacional, não custo de obtenção de recursos (RG-07 / CPC 20).
 * Capitalizá-los inflaria o custo da obra e adiaria o reconhecimento do
 * prejuízo.
 *
 * Tolerância de 1 centavo: abaixo disso é arredondamento, não diferença.
 */
export function calcularDiferenca(
  valorTransferido: number,
  totalVinculado: number,
): DiferencaAcerto {
  const dif = round2(valorTransferido - totalVinculado);
  if (Math.abs(dif) <= 0.01) return { valor: 0, tipo: "NENHUMA" };
  return { valor: Math.abs(dif), tipo: dif > 0 ? "JUROS" : "DESCONTO" };
}

/**
 * A diferença financeira NUNCA entra no custo da obra (RG-07).
 *
 * Existe como função para ficar explícito no código e quebrar o teste se
 * alguém decidir "distribuir os juros entre as obras para fechar".
 */
export function impactoNoCustoDaObra(): number {
  return 0;
}

/**
 * RG-08 — o acerto fecha? A soma dos abatimentos mais a diferença financeira
 * tem de ser exatamente o valor que saiu da conta.
 */
export function acertoFecha(
  valorTransferido: number,
  totalVinculado: number,
  diferenca: DiferencaAcerto,
): boolean {
  const sinal = diferenca.tipo === "DESCONTO" ? -1 : 1;
  return Math.abs(totalVinculado + sinal * diferenca.valor - valorTransferido) <= 0.01;
}
```

### `src/lib/actions/acerto.ts` · linhas 261–330

O bloco que grava a diferença, e a saída única de caixa logo em seguida.

```ts
      // RG-07 — a diferença é despesa/receita FINANCEIRA do período, na
      // competência da DATA DO PAGAMENTO, e não é rateada no custo de obra
      // nenhuma. Vira uma despesa própria, com PED próprio, para aparecer na
      // DRE na linha certa.
      let diferencaDespesaId: string | null = null;
      if (diferenca.tipo !== "NENHUMA") {
        const projetoDaDiferenca = porId.get(abatimentos.abatimentos[0].id)!;
        const [versaoDif] = await tx
          .select({ id: schema.versions.id })
          .from(schema.versions)
          .where(eq(schema.versions.id, projetoDaDiferenca.versionId))
          .limit(1);
        const compet = (input.dataPagamento || "").split("/");
        const competencia =
          compet.length === 3 ? `${compet[0]}/${compet[2]}` : projetoDaDiferenca.competencia;
        const numDif = await reserveDespesaNumber(ctx.tenant.id);
        const [despDif] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versaoDif.id,
            tenantId: ctx.tenant.id,
            numDoc: numDif,
            fornecedorId: input.favorecidoId || null,
            contaCef:
              diferenca.tipo === "JUROS"
                ? CONTAS_CONTROLADORIA.jurosMora
                : CONTAS_CONTROLADORIA.descontosObtidos,
            // Sempre "Despesas Financeiras": mesmo o desconto obtido entra como
            // valor NEGATIVO nesta categoria, para não abrir uma categoria de
            // receita num lançamento de despesa (RG-01).
            categoriaDre: (input.categoriaDiferenca as CategoriaDRE) ?? "Despesas Financeiras",
            competencia,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor:
              diferenca.tipo === "JUROS"
                ? String(diferenca.valor)
                : String(-diferenca.valor),
            status: "Pago",
            obs:
              diferenca.tipo === "JUROS"
                ? `Juros e multas — acerto ${numDoc}`
                : `Desconto obtido — acerto ${numDoc}`,
          })
          .returning();
        diferencaDespesaId = despDif.id;
      }

      // RG-08 — UMA saída de caixa, no valor efetivamente transferido.
      const [cash] = await tx
        .insert(schema.cashEntries)
        .values({
          versionId: porId.get(abatimentos.abatimentos[0].id)!.versionId,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataPagamento || null,
          descricao: `Acerto ${numDoc}`,
          valor: String(-valorTransferido),
          cat: "acerto",
          rec: true,
        })
        .returning();

      await tx
        .update(schema.acertos)
        .set({ diferencaDespesaId, cashEntryId: cash.id })
        .where(eq(schema.acertos.id, acerto.id));

      return { acertoId: acerto.id, numDoc, diferenca, totalVinculado };
    });
```

### `src/lib/actions/acerto.ts` · linhas 405–420

O cancelamento lógico da despesa de diferença, no estorno.

```ts
        .set({ status: i.statusAnterior ?? "A pagar", dataCaixa: null })
        .where(eq(schema.despesas.id, i.despesaId));
    }

    // A diferença financeira é cancelada logicamente, não apagada (RG-09).
    if (acerto.diferencaDespesaId) {
      await tx
        .update(schema.despesas)
        .set({
          cancelado: true,
          canceladoPor: ctx.userEmail || ctx.userId || null,
          motivoCancelamento: `Estorno do acerto ${acerto.numDoc ?? ""}: ${motivo}`.trim(),
        })
        .where(eq(schema.despesas.id, acerto.diferencaDespesaId));
    }
```

### `src/components/app/acerto-manager.tsx` · linhas 380–432

O painel de fechamento e o texto exibido ao usuário.

```tsx
      {/* Painel de fechamento — sempre visível (item 5.1). */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-2 font-[family-name:var(--font-mono)] text-[13px] sm:max-w-md">
            <Linha label="Valor transferido" valor={transferido} />
            <Linha label="Total vinculado" valor={totalVinculado} />
            <div className="border-t border-[var(--color-accent2)]/15 pt-2">
              <Linha
                label="Diferença"
                valor={diferenca.tipo === "DESCONTO" ? -diferenca.valor : diferenca.valor}
                destaque
              />
            </div>
          </div>
          {diferenca.tipo !== "NENHUMA" && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[220px]">
                <Label>
                  Classificar como{" "}
                  {diferenca.tipo === "JUROS" ? "juros e multas" : "desconto obtido"}
                </Label>
                <Select
                  value={cab.categoriaDiferenca}
                  onChange={(e) => setCab({ ...cab, categoriaDiferenca: e.target.value })}
                >
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="max-w-lg text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
                A diferença é lançada como{" "}
                {diferenca.tipo === "JUROS" ? "despesa" : "receita"} financeira do
                período, na competência do pagamento. <strong>Não é rateada no
                custo de nenhuma obra</strong> — juros de mora são perda
                operacional, não custo de obtenção de recursos (RG-07).
              </p>
            </div>
          )}
          {erro && <p className="mt-3 text-sm text-[var(--color-danger)]">{erro}</p>}
          {msg && <p className="mt-3 text-sm text-[var(--color-success)]">{msg}</p>}
          <div className="mt-4">
            <Button
              onClick={confirmar}
              disabled={pending || itens.length === 0 || transferido <= 0 || !cab.dataPagamento}
            >
              {pending ? "Concluindo…" : `Concluir acerto (${itens.length} despesa(s))`}
            </Button>
          </div>
        </CardContent>
      </Card>
```

---

## 7. A verificação de permissão


### 7.1 A tela NÃO chama `can(ctx.perms, "acerto", "ver")`

O `page.tsx` verifica **outras duas telas** (`page.tsx:24`):

```tsx
if (!can(ctx.perms, "despesas", "editar") || !can(ctx.perms, "caixa", "ver")) {
  return <AccessDenied />;
}
```

com o comentário `// Acerto é operação de nível financeiro (RNF de
permissões).` na linha 23. A string `"acerto"` **não aparece em lugar nenhum**
de `permissions.ts` nem de `context.ts`.

### 7.2 O que aconteceria se chamasse

`can` é um lookup direto com fallback (`permissions.ts:129–135`):

```ts
return perms[screenId]?.[action] ?? false;
```

`defaultPermissions` e `effectivePermissions` iteram **apenas sobre `SCREENS`**
(linhas 98 e 121), então `perms` nunca ganha a chave `"acerto"` — nem por
default, nem por override de membro: `effectivePermissions` descarta qualquer
override cuja chave não esteja em `SCREENS`.

Logo `perms["acerto"]` é `undefined`, o `?.` curto-circuita e o `?? false`
devolve **`false` para todo mundo — inclusive `owner` e `admin`**. Se a página
chamasse `can(ctx.perms, "acerto", "ver")`, a tela estaria fechada para
todos os perfis, sem exceção e sem erro.

### 7.3 O enforcement central também não alcança `/acerto`

O layout faz o *enforcement* de "Ver" mapeando a rota para uma tela governada
(`layout.tsx:92–95`):

```tsx
const screenId = screenIdOfPath(pathname);
const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;
```

`screenIdOfPath("/acerto")` devolve `null`, porque `"acerto"` não está em
`SCREEN_IDS` (`permissions.ts:138–142`). Com `screenId` nulo, `denied` é
`false`: a rota passa pelo enforcement central **sem ser verificada**. A única
barreira é a checagem explícita dentro do `page.tsx`.

### 7.4 O que isso implica em cada camada

| Camada | Chave usada | Efeito em `/acerto` |
|---|---|---|
| `layout.tsx` (enforcement central) | `screenIdOfPath("/acerto") → null` | não verifica |
| `page.tsx` | `despesas:editar` **e** `caixa:ver` | `<AccessDenied />` se faltar qualquer uma |
| `sidebar.tsx:91` + `:160` | `perm: "despesas"` → `can(perms, "despesas", "ver")` | item do menu some sem `despesas:ver` |
| `getDespesasAbativeis` (`acerto.ts:63`) | `despesas:ver` | devolve `[]` |
| `concluirAcerto` (`acerto.ts:157`) | `despesas:editar` **e** `caixa:criar` | `{ ok: false, error }` |
| `ratearEntreObras` (`acerto.ts:494`) | `despesas:criar` **e** `caixa:criar` | `{ ok: false, error }` |
| `estornarAcerto` (`acerto.ts:383`) | `despesas:excluir` | **lança `Error`** (não devolve `{ ok: false }`) |
| Botão Estornar | `canEstornar = despesas:excluir` (`page.tsx:53`) | botão não é renderizado |

Note que a página exige `caixa:**ver**` para abrir, mas as duas actions de
escrita exigem `caixa:**criar**`: quem tem `despesas:editar` + `caixa:ver` sem
`caixa:criar` vê a tela inteira e recebe o erro só ao confirmar.

Nenhuma tela de Gestão de Acessos consegue conceder ou revogar "acerto"
isoladamente: a matriz de permissões é construída a partir de `SCREENS`, e
`acerto` não está lá.

### `src/app/(app)/acerto/page.tsx` · linhas 20–34

A checagem, no `page.tsx`.

```tsx
export default async function AcertoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  // Acerto é operação de nível financeiro (RNF de permissões).
  if (!can(ctx.perms, "despesas", "editar") || !can(ctx.perms, "caixa", "ver")) {
    return <AccessDenied />;
  }

  const [despesas, acertos, bancos, stakeholders, contas] = await Promise.all([
    getDespesasAbativeis(),
    getAcertos(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
  ]);
```

### `src/lib/permissions.ts` · linhas 34–74

`SCREENS` — sem `acerto`.

```ts
/** Todas as telas governadas (rota → tela). `perfil` é pessoal e não entra aqui. */
export const SCREENS: Screen[] = [
  { id: "dashboard", label: "Dashboard", modulo: "Reports" },
  { id: "projecao", label: "Projeção de Receitas", modulo: "Reports" },
  { id: "consolidado", label: "Consolidado", modulo: "Reports" },
  { id: "caixa", label: "Controle de Caixa", modulo: "Conciliação de Caixa" },
  { id: "fechamento", label: "Fechamento de Caixa", modulo: "Conciliação de Caixa" },
  { id: "balancodia", label: "Balanço do Dia", modulo: "Reports" },
  { id: "dre", label: "DRE", modulo: "Reports" },
  { id: "fluxocaixa", label: "Fluxo de Caixa", modulo: "Reports" },
  { id: "medicao", label: "Medição de Obra", modulo: "Reports" },
  { id: "resumo", label: "Resumo Executivo", modulo: "Reports" },
  { id: "unidades", label: "Unidades / Dados de Venda", modulo: "Receitas" },
  { id: "budget", label: "Lançamento Budget", modulo: "Planejamento" },
  { id: "forecast", label: "Lançamento Forecast", modulo: "Planejamento" },
  { id: "clientes", label: "Clientes (Compradores)", modulo: "Receitas" },
  { id: "contasreceber", label: "Contas a Receber", modulo: "Receitas" },
  { id: "medicaolanc", label: "Lançamento de Medição", modulo: "Despesas" },
  { id: "simulador", label: "Simulador", modulo: "Receitas" },
  { id: "reembolso", label: "Reembolso", modulo: "Receitas" },
  { id: "permuta", label: "Inventário de Permuta", modulo: "Receitas" },
  { id: "parametros", label: "Parâmetros / INCC", modulo: "Receitas" },
  { id: "despesas", label: "Lançamentos de Despesas", modulo: "Despesas" },
  { id: "contaspagar", label: "Contas a Pagar", modulo: "Despesas" },
  { id: "restituicoes", label: "Restituições (pago por terceiro)", modulo: "Despesas" },
  { id: "fornecedores", label: "Fornecedores & Stakeholders", modulo: "Despesas" },
  { id: "planocontas", label: "Plano de Contas", modulo: "Planejamento" },
  { id: "contas", label: "Contas Correntes", modulo: "Despesas" },
  { id: "estoque", label: "Controle de Estoques", modulo: "Despesas" },
  { id: "ponto", label: "Controle de Ponto", modulo: "Despesas" },
  { id: "backup", label: "Backup & Arquivamento", modulo: "Backup" },
  { id: "usuarios", label: "Usuários & Acessos", modulo: "Config" },
  { id: "acessos", label: "Gestão de Acessos", modulo: "Config" },
  { id: "acoes", label: "Log de Auditoria", modulo: "Config" },
  { id: "contabilidade", label: "Acesso Contabilidade", modulo: "Config" },
  { id: "empresa", label: "Empresa", modulo: "Config" },
  { id: "projeto", label: "Projetos", modulo: "Config" },
  { id: "numeracao", label: "Numeração de Despesas", modulo: "Config" },
  { id: "versao", label: "Configuração da Versão", modulo: "Config" },
  { id: "diagnosticoia", label: "Diagnóstico de IA", modulo: "Config" },
];
```

### `src/lib/permissions.ts` · linhas 95–142

`defaultPermissions`, `effectivePermissions`, `can` e `screenIdOfPath`.

```ts
/** Permissões padrão por perfil (role). */
export function defaultPermissions(role: Role): PermMatrix {
  const out: PermMatrix = {};
  for (const s of SCREENS) {
    if (role === "owner" || role === "admin") {
      out[s.id] = { ...FULL };
    } else if (role === "membro") {
      out[s.id] = s.modulo === "Config" ? { ...NONE } : { ...EDIT };
    } else if (role === "engenheiro") {
      // engenheiro: acesso apenas ao Lançamento de Medição
      out[s.id] = s.id === "medicaolanc" ? { ...FULL } : { ...NONE };
    } else {
      // contador: somente leitura de um subconjunto
      out[s.id] = CONTADOR_VE.has(s.id) ? { ...VIEW } : { ...NONE };
    }
  }
  return out;
}

/** Permissões efetivas: overrides do membro (se houver) por tela, senão default. */
export function effectivePermissions(
  role: Role,
  overrides?: PermMatrix | null,
): PermMatrix {
  const base = defaultPermissions(role);
  if (!overrides) return base;
  for (const s of SCREENS) {
    const o = overrides[s.id];
    if (o) base[s.id] = { ...base[s.id], ...o };
  }
  return base;
}

/** O usuário pode executar `action` na `screenId`? */
export function can(
  perms: PermMatrix,
  screenId: string,
  action: PermAction,
): boolean {
  return perms[screenId]?.[action] ?? false;
}

/** Primeiro segmento da rota → id de tela (ou null se não governada). */
export function screenIdOfPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const seg = pathname.replace(/^\//, "").split("/")[0];
  return SCREEN_IDS.includes(seg) ? seg : null;
}
```

### `src/app/(app)/layout.tsx` · linhas 92–95

O enforcement central de "Ver", no layout.

```tsx
  // Enforcement central de "Ver": mapeia a rota atual para a tela governada.
  const pathname = (await headers()).get("x-pathname");
  const screenId = screenIdOfPath(pathname);
  const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;
```

### `src/components/app/sidebar.tsx` · linhas 91–91

A entrada do menu lateral — usa a permissão de `despesas`.

```tsx
        { href: "/acerto", label: "Acerto Contábil", perm: "despesas" },
```
