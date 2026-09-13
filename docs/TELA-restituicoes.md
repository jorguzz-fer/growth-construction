# TELA-restituicoes — código na íntegra

Coleta do código da tela **Restituições — pago por terceiro** (`/restituicoes`),
em `main` (commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria (recursiva):**

```
restituicoes/page.tsx
├── components/app/page-header.tsx
├── components/app/access-denied.tsx
│   └── components/app/page-header.tsx              (já listado)
├── components/app/conta-corrente-terceiros.tsx
├── components/app/restituicao-lote.tsx
└── components/app/restituicoes-manager.tsx

Nenhum desses componentes importa outro componente próprio além dos acima:
as demais importações são primitivas de UI (card, button, input, date-field,
badge, table) e libs (utils, calc/restituicao, calc/natureza-dre,
calc/recebimento-terceiro, calc/constants, context, permissions).

queries.ts chamadas:  getStakeholders · getChartAccounts · getBankAccounts
actions chamadas:     getDespesaTerceiros, getContaCorrenteTerceiros
                        (actions/restituicoes.ts — leitura)
                      getSaldosConsolidadosTerceiros
                        (actions/recebimento-terceiro.ts — leitura)
actions dos clientes: buscarDespesasPorPed, criarDespesaTerceiro,
                      registrarRestituicao      (manager)
                      previewRestituicaoLote, confirmarRestituicaoLote,
                      compensarSaldos           (lote)
```

---

## 1. Página

### `src/app/(app)/restituicoes/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getBankAccounts, getChartAccounts, getStakeholders } from "@/lib/queries";
import { getContaCorrenteTerceiros, getDespesaTerceiros } from "@/lib/actions/restituicoes";
import { ContaCorrenteTerceiros } from "@/components/app/conta-corrente-terceiros";
import { RestituicaoLote } from "@/components/app/restituicao-lote";
import { getSaldosConsolidadosTerceiros } from "@/lib/actions/recebimento-terceiro";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { ymd } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { RestituicoesManager } from "@/components/app/restituicoes-manager";

export const dynamic = "force-dynamic";

/** Dias em aberto entre a data-base e hoje. */
function diasEmAberto(base: string | null): number {
  const b = ymd(base);
  if (b == null) return 0;
  const now = new Date();
  const hoje = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  // diferença aproximada em dias via datas UTC
  const toDate = (n: number) =>
    Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100);
  return Math.max(0, Math.round((toDate(hoje) - toDate(b)) / 86_400_000));
}

export default async function RestituicoesPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "restituicoes", "ver")) return <AccessDenied />;

  const [stakeholders, contas, bancos, lista, contasCorrentes] = await Promise.all([
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getDespesaTerceiros(ctx.tenant.id, ctx.version.id),
    // Conta corrente por terceiro (§13) — escopo TENANT: a dívida com um sócio
    // é da empresa e não muda porque o usuário trocou o projeto ativo.
    getContaCorrenteTerceiros(ctx.tenant.id),
  ]);
  // Saldos dos DOIS lados por terceiro — base do encontro de contas (RG-05).
  const saldosConsolidados = await getSaldosConsolidadosTerceiros(ctx.tenant.id);
  const rows = lista.map((r) => ({
    ...r,
    diasEmAberto: diasEmAberto(r.dataPrevistaRestituicao ?? r.dataPagamentoOriginal),
  }));

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Restituições — pago por terceiro"
        subtitle="Restituição de valores pagos para fornecedores anteriormente. A despesa é reconhecida 1× na DRE; a saída de caixa ocorre só na restituição."
      />

      {/* Conta corrente por terceiro: saldo devido e o extrato dos movimentos
          que o formam. NÃO é saldo bancário disponível — é obrigação. */}
      <ContaCorrenteTerceiros contas={contasCorrentes} />

      {/* Item 4.1 — o cliente não restitui item a item: fecha o combo e paga um
          valor único, distribuído entre os PEDs em aberto por FIFO. */}
      <RestituicaoLote
        terceiros={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        saldos={saldosConsolidados}
        canEditar={can(ctx.perms, "restituicoes", "editar")}
      />

      <RestituicoesManager
        rows={rows}
        stakeholders={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        contas={[...contas]
          .filter((c) => c.kind === "cef")
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map((c) => ({ code: c.code, name: c.name }))}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        bancos={bancos.map((b) => ({ id: b.id, banco: b.banco, tipo: b.tipo }))}
        categorias={CATEGORIAS_DRE}
        canCriar={can(ctx.perms, "restituicoes", "criar")}
        canEditar={can(ctx.perms, "restituicoes", "editar")}
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

### `src/components/app/conta-corrente-terceiros.tsx`

```tsx
"use client";

import { useState } from "react";
import type { ContaCorrenteTerceiro } from "@/lib/actions/restituicoes";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Conta corrente de terceiros/sócios (§13).
 *
 * Responde "quanto ainda devo ao sócio X" e mostra COMO se chegou nesse número:
 *
 *     Saldo devido = total desembolsado por ele − total já restituído
 *
 * Cada linha do extrato é um fato: um desembolso (ele pagou um fornecedor pela
 * empresa, aumentando a dívida) ou uma restituição (a empresa devolveu, e a
 * dívida caiu). O saldo acumulado é recalculado a cada movimento, em ordem de
 * data, para que o número final seja conferível linha a linha.
 *
 * Este saldo NÃO é caixa disponível da empresa — é obrigação com terceiros.
 */
export function ContaCorrenteTerceiros({
  contas,
}: {
  contas: ContaCorrenteTerceiro[];
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  if (contas.length === 0) return null;

  const totalDevido = contas.reduce((a, c) => a + c.saldoDevido, 0);

  return (
    <Card className="mb-5">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Conta corrente de terceiros
          </h2>
          <span className="text-[12px] text-[var(--color-ink3)]">
            Saldo devido total{" "}
            <strong className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">
              {brl0(totalDevido)}
            </strong>
          </span>
          <span className="text-[11.5px] text-[var(--color-ink4)]">
            obrigação com terceiros — não é saldo bancário disponível
          </span>
        </div>

        <div className="tbl-scroll overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-accent2)]/12 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                <th className="px-2 py-2">Terceiro / sócio</th>
                <th className="px-2 py-2 text-right">Movimentos</th>
                <th className="px-2 py-2 text-right">Total desembolsado</th>
                <th className="px-2 py-2 text-right">Total restituído</th>
                <th className="px-2 py-2 text-right">Saldo devido</th>
                <th className="px-2 py-2 text-right">Extrato</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => {
                const chave = c.pagadorId ?? c.pagador;
                const aberto = aberta === chave;
                return (
                  <>
                    <tr key={chave} className="border-b border-[var(--color-accent2)]/8">
                      <td className="px-2 py-2 font-medium text-[var(--color-ink)]">
                        {c.pagador}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {c.movimentos.length}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)]">
                        {brl0(c.totalDesembolsado)}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                        {brl0(c.totalRestituido)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-[family-name:var(--font-mono)] font-semibold ${
                          c.saldoDevido > 0
                            ? "text-[var(--color-warning)]"
                            : c.saldoDevido < 0
                              ? "text-[var(--color-danger)]"
                              : "text-[var(--color-ink3)]"
                        }`}
                        title={
                          c.saldoDevido < 0
                            ? "Restituído a mais do que o desembolsado — conferir."
                            : undefined
                        }
                      >
                        {brl0(c.saldoDevido)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => setAberta(aberto ? null : chave)}
                          className="text-[12px] text-[var(--color-accent2)] hover:underline"
                        >
                          {aberto ? "Fechar" : "Ver"}
                        </button>
                      </td>
                    </tr>
                    {aberto && (
                      <tr key={`${chave}-ext`} className="border-b border-[var(--color-accent2)]/8">
                        <td colSpan={6} className="bg-[var(--color-surface2)]/60 px-2 py-3">
                          <table className="w-full border-collapse text-[12.5px]">
                            <thead>
                              <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink4)]">
                                <th className="px-2 py-1">Data</th>
                                <th className="px-2 py-1">Movimento</th>
                                <th className="px-2 py-1">Documento</th>
                                <th className="px-2 py-1 text-right">Valor</th>
                                <th className="px-2 py-1 text-right">Saldo devido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.movimentos.map((m) => (
                                <tr key={`${m.tipo}-${m.id}`}>
                                  <td className="px-2 py-1 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {m.data ? dateBR(m.data) : "—"}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Badge
                                      tone={m.tipo === "desembolso" ? "warning" : "success"}
                                    >
                                      {m.tipo === "desembolso" ? "Desembolso" : "Restituição"}
                                    </Badge>{" "}
                                    <span className="text-[var(--color-ink3)]">
                                      {m.descricao}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {m.numDoc ?? "—"}
                                  </td>
                                  <td
                                    className={`px-2 py-1 text-right font-[family-name:var(--font-mono)] ${
                                      m.tipo === "desembolso"
                                        ? "text-[var(--color-ink)]"
                                        : "text-[var(--color-success)]"
                                    }`}
                                  >
                                    {m.tipo === "desembolso" ? "+" : "−"}
                                    {brl0(m.valor)}
                                  </td>
                                  <td className="px-2 py-1 text-right font-[family-name:var(--font-mono)] font-medium">
                                    {brl0(m.saldoAcumulado)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

### `src/components/app/restituicao-lote.tsx`

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  compensarSaldos,
  confirmarRestituicaoLote,
  previewRestituicaoLote,
} from "@/lib/actions/restituicao-lote";
import type { SaldoConsolidadoTerceiro } from "@/lib/actions/recebimento-terceiro";
import { podeCompensar, valorCompensavel } from "@/lib/calc/recebimento-terceiro";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";

interface Opt {
  id: string;
  nome: string;
}

function novaChave(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

type Preview = Awaited<ReturnType<typeof previewRestituicaoLote>>;

/**
 * Restituição em LOTE por terceiro — item 4.1.
 *
 * O cliente fecha o combo e paga um valor único; a tela distribui esse valor
 * entre os PEDs em aberto daquele terceiro, do mais antigo para o mais novo
 * (FIFO por competência), deixando o último parcialmente abatido.
 *
 * O preview é obrigatório: nada é gravado antes de o usuário ver exatamente
 * quais PEDs serão abatidos e em que valor.
 */
export function RestituicaoLote({
  terceiros,
  bancos,
  saldos,
  canEditar,
}: {
  terceiros: Opt[];
  bancos: Opt[];
  saldos: SaldoConsolidadoTerceiro[];
  canEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const chave = useRef(novaChave());

  const [f, setF] = useState({
    terceiroId: "",
    valor: "",
    dataRestituicao: "",
    bankAccountId: "",
    comprovante: "",
    obs: "",
  });
  const [preview, setPreview] = useState<Preview | null>(null);

  const carregarPreview = () => {
    if (!f.terceiroId || !(Number(f.valor) > 0)) {
      setErro("Escolha o terceiro e informe o valor da restituição.");
      return;
    }
    setErro(null);
    setMsg(null);
    start(async () => {
      const p = await previewRestituicaoLote(f.terceiroId, Number(f.valor));
      setPreview(p);
      if (p.linhas.length === 0) {
        setErro("Este terceiro não tem saldo em aberto para abater.");
      }
    });
  };

  const confirmar = () => {
    if (pending || !preview) return;
    setErro(null);
    start(async () => {
      const res = await confirmarRestituicaoLote({
        terceiroId: f.terceiroId,
        valor: Number(f.valor),
        dataRestituicao: f.dataRestituicao,
        bankAccountId: f.bankAccountId || null,
        comprovante: f.comprovante || null,
        obs: f.obs || null,
        idempotencyKey: chave.current,
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao registrar a restituição.");
        return;
      }
      chave.current = novaChave();
      setMsg(
        `Restituição ${res.numDoc ?? ""} registrada — ${res.abatidos} PED(s) abatido(s). Uma única saída de caixa.`,
      );
      setPreview(null);
      setF({ ...f, valor: "", comprovante: "", obs: "" });
      router.refresh();
    });
  };

  const compensar = (s: SaldoConsolidadoTerceiro) => {
    if (!s.terceiroId) return;
    const v = valorCompensavel(s);
    if (
      !window.confirm(
        `Compensar ${brl0(v)} entre o que a empresa deve a ${s.terceiro} (${brl0(
          s.saldoARestituir,
        )}) e o que ele deve à empresa (${brl0(s.saldoARepassar)})?\n\n` +
          "A compensação não movimenta caixa nem altera a DRE.",
      )
    )
      return;
    setErro(null);
    start(async () => {
      const res = await compensarSaldos({
        terceiroId: s.terceiroId!,
        data: new Date().toISOString().slice(0, 10),
        obs: "Encontro de contas",
        idempotencyKey: novaChave(),
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao compensar.");
        return;
      }
      setMsg(`Compensação ${res.numDoc ?? ""} registrada: ${brl0(res.valor ?? 0)}.`);
      router.refresh();
    });
  };

  const compensaveis = saldos.filter(podeCompensar);

  if (!canEditar) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
            Restituição em lote
          </h2>
          <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
            Pague um valor único e o sistema distribui entre os PEDs em aberto do
            terceiro, do mais antigo para o mais novo. O último PED da fila pode
            ficar parcialmente abatido. A restituição ganha documento próprio — é
            ele que vai para a contabilidade como comprovação da saída de caixa.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Label>Terceiro</Label>
              <Select
                value={f.terceiroId}
                onChange={(e) => {
                  setF({ ...f, terceiroId: e.target.value });
                  setPreview(null);
                }}
              >
                <option value="">Selecione...</option>
                {terceiros.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Valor da restituição</Label>
              <Input
                type="number"
                step="0.01"
                value={f.valor}
                onChange={(e) => {
                  setF({ ...f, valor: e.target.value });
                  setPreview(null);
                }}
              />
            </div>
            <div>
              <Label>Data do pagamento</Label>
              <DateField
                value={f.dataRestituicao}
                onChange={(v) => setF({ ...f, dataRestituicao: v })}
              />
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
              <Label>Comprovante / obs.</Label>
              <Input
                value={f.comprovante}
                onChange={(e) => setF({ ...f, comprovante: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" onClick={carregarPreview} disabled={pending}>
              {pending && !preview ? "Calculando…" : "Ver o que será abatido"}
            </Button>
            {preview && preview.linhas.length > 0 && (
              <Button onClick={confirmar} disabled={pending || !f.dataRestituicao}>
                {pending ? "Registrando…" : "Confirmar restituição"}
              </Button>
            )}
          </div>
          {erro && <p className="mt-3 text-sm text-[var(--color-danger)]">{erro}</p>}
          {msg && <p className="mt-3 text-sm text-[var(--color-success)]">{msg}</p>}
        </CardContent>
      </Card>

      {/* Extrato + aging + preview do abatimento. */}
      {preview && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
              <span className="text-[var(--color-ink3)]">
                Saldo em aberto{" "}
                <strong className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">
                  {brl0(preview.saldo)}
                </strong>
              </span>
              {preview.aging && (
                <>
                  <Badge tone="neutral">0–30: {brl0(preview.aging.ate30)}</Badge>
                  <Badge tone="neutral">31–60: {brl0(preview.aging.de31a60)}</Badge>
                  <Badge tone="warning">61–90: {brl0(preview.aging.de61a90)}</Badge>
                  <Badge tone="danger">90+: {brl0(preview.aging.acima90)}</Badge>
                </>
              )}
            </div>
            <p className="mb-2 text-[12.5px] text-[var(--color-ink2)]">
              Confira antes de confirmar — estes são os PEDs que serão abatidos e
              em que valor:
            </p>
            <div className="tbl-scroll overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-accent2)]/12 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    <th className="px-2 py-2">PED</th>
                    <th className="px-2 py-2">Obra</th>
                    <th className="px-2 py-2">Competência</th>
                    <th className="px-2 py-2 text-right">A abater</th>
                    <th className="px-2 py-2 text-right">Sobra no PED</th>
                    <th className="px-2 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.linhas.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--color-accent2)]/8">
                      <td className="px-2 py-2 font-[family-name:var(--font-mono)]">
                        {l.numDoc ?? "—"}
                      </td>
                      <td className="px-2 py-2">{l.projectName ?? "—"}</td>
                      <td className="px-2 py-2 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {l.competencia ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)]">
                        {brl0(l.valorAbatido)}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {l.saldoRestante > 0 ? brl0(l.saldoRestante) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone={l.quitado ? "success" : "warning"}>
                          {l.quitado ? "Quitado" : "Parcial"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12.5px] text-[var(--color-ink3)]">
              Total a abater{" "}
              <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
                {brl0(preview.totalAbatido)}
              </strong>
              {preview.sobra > 0 && (
                <span className="text-[var(--color-danger)]">
                  {" "}
                  · sobra sem destino {brl0(preview.sobra)} — reduza o valor
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* RG-05 — encontro de contas, quando existem os DOIS saldos. */}
      {compensaveis.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
              Encontro de contas
            </h3>
            <p className="mb-3 text-[11.5px] text-[var(--color-ink3)]">
              Estes terceiros têm saldo nos dois lados. A compensação não
              movimenta caixa nem altera a DRE — os saldos brutos continuam
              visíveis acima.
            </p>
            <div className="space-y-2">
              {compensaveis.map((s) => (
                <div
                  key={s.terceiroId ?? s.terceiro}
                  className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[var(--color-accent2)]/15 p-2.5 text-[13px]"
                >
                  <strong className="text-[var(--color-ink)]">{s.terceiro}</strong>
                  <span className="text-[var(--color-ink3)]">
                    a restituir{" "}
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">
                      {brl0(s.saldoARestituir)}
                    </span>
                  </span>
                  <span className="text-[var(--color-ink3)]">
                    a repassar{" "}
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                      {brl0(s.saldoARepassar)}
                    </span>
                  </span>
                  <span className="text-[var(--color-ink3)]">
                    compensável{" "}
                    <strong className="font-[family-name:var(--font-mono)] text-[var(--color-accent2)]">
                      {brl0(valorCompensavel(s))}
                    </strong>
                  </span>
                  <button
                    onClick={() => compensar(s)}
                    disabled={pending}
                    className="ml-auto text-[12px] text-[var(--color-accent2)] hover:underline"
                  >
                    Compensar saldos
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### `src/components/app/restituicoes-manager.tsx`

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  buscarDespesasPorPed,
  criarDespesaTerceiro,
  registrarRestituicao,
  type DespesaPorPed,
  type DespesaTerceiroView,
} from "@/lib/actions/restituicoes";
import { rotuloStatusObrigacao } from "@/lib/calc/restituicao";
import { categoriasDeDespesa } from "@/lib/calc/natureza-dre";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MonthField, DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

interface Opt {
  id: string;
  nome: string;
}
interface ContaOpt {
  code: string;
  name: string;
}

const statusTone = (s: string) =>
  s === "Restituído"
    ? "success"
    : s === "Cancelado"
      ? "danger"
      : s === "Parcialmente restituído"
        ? "info"
        : "warning";

/**
 * Chave de idempotência de uma tentativa (§16): identifica o FATO que o usuário
 * está registrando. Enquanto a chave não for renovada, reenviar o formulário
 * (duplo clique, Enter repetido, refresh que reposta) devolve o registro já
 * criado em vez de criar um segundo.
 */
function novaChave(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function RestituicoesManager({
  rows,
  stakeholders,
  contas,
  projetos,
  bancos,
  categorias,
  canCriar,
  canEditar,
}: {
  rows: (DespesaTerceiroView & { diasEmAberto: number })[];
  stakeholders: Opt[];
  contas: ContaOpt[];
  projetos: Opt[];
  bancos: { id: string; banco: string; tipo: string }[];
  categorias: readonly string[];
  canCriar: boolean;
  canEditar: boolean;
}) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sel, setSel] = useState<DespesaTerceiroView | null>(null);
  const [filtro, setFiltro] = useState("");
  /** Lançamento já existente escolhido pelo PED (§9). null = despesa nova. */
  const [ped, setPed] = useState<DespesaPorPed | null>(null);
  // Uma chave por tentativa. Só é renovada depois de um registro bem-sucedido —
  // assim o reenvio do MESMO preenchimento nunca vira dois registros.
  const chave = useRef(novaChave());
  const categoriasDespesa = useMemo(() => categoriasDeDespesa(categorias), [categorias]);

  const submit = (fd: FormData) => {
    if (saving) return; // trava de duplo clique antes mesmo de chamar o servidor
    setError(null);
    setAviso(null);
    fd.set("idempotencyKey", chave.current);
    if (ped) fd.set("despesaId", ped.id);
    start(async () => {
      const res = await criarDespesaTerceiro(fd);
      if (!res.ok) {
        setError(res.error ?? "Falha ao registrar.");
        return;
      }
      chave.current = novaChave();
      if (res.jaExistia) {
        setAviso(
          "Este lançamento já tinha uma obrigação de restituição — ela está na lista abaixo. Nada foi duplicado.",
        );
      }
      setPed(null);
      router.refresh();
    });
  };

  const filtrados = filtro ? rows.filter((r) => r.status === filtro) : rows;

  return (
    <div className="space-y-6">
      {canCriar && (
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
              Nova despesa paga por terceiro
            </h2>
            <p className="mb-3 text-[11.5px] text-[var(--color-ink3)]">
              Se a despesa já foi lançada, localize-a pelo número PED — a
              obrigação é amarrada ao lançamento existente e nada dele é
              sobrescrito. Sem PED, a despesa é criada junto com a obrigação.
            </p>

            <BuscaPed selecionado={ped} onSelecionar={setPed} />

            <form action={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label>Quem desembolsou (terceiro)</Label>
                <Select name="pagadorTerceiroId" defaultValue="">
                  <option value="">—</option>
                  {stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Beneficiário original</Label>
                <Select
                  name="fornecedorId"
                  // Vindo de um PED, o beneficiário é o do lançamento original e
                  // não pode ser trocado por aqui: quem desembolsou (o terceiro)
                  // é um relacionamento diferente, no campo ao lado.
                  key={ped?.id ?? "novo"}
                  defaultValue={ped?.fornecedorId ?? ""}
                  disabled={!!ped}
                >
                  <option value="">—</option>
                  {stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Empresa responsável</Label>
                <Select name="empresaResponsavelId" defaultValue="">
                  <option value="">—</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Categoria DRE</Label>
                {/* Item 4.6 — mesmo bug do formulário de despesa: a lista
                    completa oferecia "Receita" para um lançamento de despesa.
                    Só naturezas devedoras, e sem default silencioso. */}
                <Select
                  name="categoriaDre"
                  key={`cat-${ped?.id ?? "novo"}`}
                  defaultValue={ped?.categoriaDre ?? ""}
                  disabled={!!ped}
                >
                  <option value="">Selecione...</option>
                  {categoriasDespesa.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Conta CEF (opcional)</Label>
                <Select
                  name="contaCef"
                  key={`cef-${ped?.id ?? "novo"}`}
                  defaultValue={ped?.contaCef ?? ""}
                  disabled={!!ped}
                >
                  <option value="">—</option>
                  {contas.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Valor</Label>
                {/* Vindo de um PED, o valor é o do lançamento original e não é
                    editável aqui — alterá-lo mudaria a despesa já registrada. */}
                <Input
                  name="valor"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  key={`val-${ped?.id ?? "novo"}`}
                  defaultValue={ped ? String(ped.valor) : ""}
                  readOnly={!!ped}
                  required={!ped}
                />
              </div>
              <div>
                <Label>Competência</Label>
                {/* A competência é a do lançamento original e NÃO muda com a
                    data da restituição — são fatos distintos (§8). */}
                <MonthField
                  name="competencia"
                  key={`comp-${ped?.id ?? "novo"}`}
                  defaultValue={ped?.competencia ?? ""}
                  disabled={!!ped}
                />
              </div>
              <div>
                <Label>Data do pagamento (terceiro)</Label>
                <DateField name="dataPagamentoOriginal" />
              </div>
              <div>
                <Label>Restituição prevista para</Label>
                <DateField name="dataPrevistaRestituicao" />
              </div>
              <div className="sm:col-span-3">
                <Label>Observações</Label>
                <Input name="obs" />
              </div>
              <div className="col-span-2 flex items-end sm:col-span-4">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? "Registrando…"
                    : ped
                      ? "Registrar obrigação para este PED"
                      : "Registrar despesa por terceiro"}
                </Button>
              </div>
            </form>
            <p className="mt-2 text-[11.5px] text-[var(--color-ink3)]">
              A despesa entra na DRE 1× (competência/categoria); NÃO há saída de
              caixa agora. A saída ocorre só quando você registrar a restituição
              — e a data dela não altera a competência da despesa.
            </p>
            {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
            {aviso && <p className="mt-2 text-sm text-[var(--color-warning)]">{aviso}</p>}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Label className="mb-0">Filtrar status:</Label>
        {/* O `value` é o status GRAVADO; o texto é o rótulo da tela. */}
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 w-auto">
          <option value="">Todos</option>
          <option value="Aguardando restituição">Pendente</option>
          <option value="Parcialmente restituído">Parcialmente restituído</option>
          <option value="Restituído">Restituído</option>
          <option value="Cancelado">Cancelado</option>
        </Select>
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Documento</TH>
            <TH>Terceiro</TH>
            <TH className="text-right">Valor</TH>
            <TH className="text-right">Restituído</TH>
            <TH className="text-right">Saldo</TH>
            <TH>Prevista</TH>
            <TH className="text-right">Dias</TH>
            <TH>Status</TH>
            {canEditar && <TH className="text-right">Ação</TH>}
          </tr>
        </THead>
        <tbody>
          {filtrados.map((r) => (
            <TR key={r.id}>
              <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{r.numDoc ?? "—"}</TD>
              <TD>{r.pagador ?? "—"}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(r.valorTotal)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">{brl0(r.valorRestituido)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-warning)]">{brl0(r.saldoPendente)}</TD>
              <TD className="font-[family-name:var(--font-mono)]">{dateBR(r.dataPrevistaRestituicao)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.saldoPendente > 0 ? r.diasEmAberto : "—"}
              </TD>
              {/* Rótulo "Pendente" para o status gravado "Aguardando
                  restituição": só o texto na tela muda; nenhum registro é
                  reclassificado no banco (§12). */}
              <TD><Badge tone={statusTone(r.status)}>{rotuloStatusObrigacao(r.status)}</Badge></TD>
              {canEditar && (
                <TD className="text-right">
                  {r.saldoPendente > 0 && r.status !== "Cancelado" ? (
                    <button onClick={() => setSel(r)} className="text-sm text-[var(--color-accent2)] hover:underline">
                      Registrar restituição
                    </button>
                  ) : null}
                </TD>
              )}
            </TR>
          ))}
          {filtrados.length === 0 && (
            <TR>
              <TD colSpan={canEditar ? 9 : 8} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhuma despesa paga por terceiro.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>

      {sel && <RestituicaoModal dt={sel} bancos={bancos} onClose={() => setSel(null)} />}
    </div>
  );
}

/**
 * Localiza um lançamento já existente pelo número PED (§9).
 *
 * O que o usuário digita é o PED, mas o que amarra a obrigação é o **ID interno**
 * do lançamento — o número é só o rótulo humano. PED inexistente não seleciona
 * nada; lançamento cancelado, com valor zero ou que já tem obrigação ativa é
 * mostrado com o motivo e não pode ser escolhido para duplicar.
 */
function BuscaPed({
  selecionado,
  onSelecionar,
}: {
  selecionado: DespesaPorPed | null;
  onSelecionar: (d: DespesaPorPed | null) => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<DespesaPorPed[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);

  useEffect(() => {
    const q = termo.trim();
    if (selecionado || q.length < 2) {
      setResultados([]);
      setBuscou(false);
      return;
    }
    let vivo = true;
    setBuscando(true);
    // Debounce: evita disparar uma consulta por tecla digitada.
    const t = setTimeout(async () => {
      const r = await buscarDespesasPorPed(q);
      if (!vivo) return;
      setResultados(r);
      setBuscou(true);
      setBuscando(false);
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
      setBuscando(false);
    };
  }, [termo, selecionado]);

  if (selecionado) {
    return (
      <div className="mb-3 rounded-[8px] border border-[var(--color-accent2)]/30 bg-[var(--color-surface2)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[13px]">
            <p className="font-medium text-[var(--color-ink)]">
              <span className="font-[family-name:var(--font-mono)]">
                {selecionado.numDoc ?? "sem número"}
              </span>{" "}
              · {brl0(selecionado.valor)}
            </p>
            <p className="text-[12px] text-[var(--color-ink3)]">
              {selecionado.projectName}
              {selecionado.fornecedorNome ? ` · ${selecionado.fornecedorNome}` : ""}
              {selecionado.competencia ? ` · competência ${selecionado.competencia}` : ""}
            </p>
            <p className="mt-1 text-[11.5px] text-[var(--color-ink4)]">
              Valor, competência, vencimento, categoria e número PED deste
              lançamento não serão alterados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelecionar(null);
              setTermo("");
            }}
            className="shrink-0 text-[12px] text-[var(--color-accent2)] hover:underline"
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <Label>Vincular a um lançamento existente (nº PED) — opcional</Label>
      <Input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Digite o número do PED (ex.: 000070 ou PED-000070)"
      />
      {buscando && (
        <p className="mt-1 text-[11.5px] text-[var(--color-ink4)]">Procurando…</p>
      )}
      {buscou && resultados.length === 0 && (
        <p className="mt-1 text-[11.5px] text-[var(--color-danger)]">
          Nenhum lançamento com esse número. Confira o PED ou deixe em branco
          para criar uma despesa nova.
        </p>
      )}
      {resultados.length > 0 && (
        <ul className="mt-1 max-h-56 overflow-auto rounded-[8px] border border-[var(--color-accent2)]/15">
          {resultados.map((d) => {
            const impedimento = d.cancelado
              ? "lançamento cancelado"
              : d.valor <= 0
                ? "valor zero"
                : d.obrigacaoId
                  ? "já possui obrigação de restituição"
                  : null;
            return (
              <li key={d.id} className="border-b border-[var(--color-accent2)]/8 last:border-0">
                <button
                  type="button"
                  disabled={!!impedimento}
                  onClick={() => onSelecionar(d)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] ${
                    impedimento
                      ? "cursor-not-allowed opacity-55"
                      : "hover:bg-[var(--color-surface2)]"
                  }`}
                >
                  <span>
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
                      {d.numDoc ?? "sem número"}
                    </span>{" "}
                    <span className="text-[var(--color-ink3)]">
                      · {d.projectName}
                      {d.fornecedorNome ? ` · ${d.fornecedorNome}` : ""}
                    </span>
                    {impedimento && (
                      <span className="block text-[11px] text-[var(--color-warning)]">
                        {impedimento}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-[family-name:var(--font-mono)]">
                    {brl0(d.valor)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RestituicaoModal({
  dt,
  bancos,
  onClose,
}: {
  dt: DespesaTerceiroView;
  bancos: { id: string; banco: string; tipo: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    valor: String(dt.saldoPendente),
    dataRestituicao: "",
    bankAccountId: "",
    comprovante: "",
    obs: "",
  });

  // Uma chave por abertura do modal: confirmar duas vezes (duplo clique, Enter
  // repetido) registra UMA restituição — a segunda chamada devolve a primeira.
  const chave = useRef(novaChave());

  const confirmar = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await registrarRestituicao({
        despesaTerceiroId: dt.id,
        valor: Number(f.valor) || 0,
        dataRestituicao: f.dataRestituicao,
        bankAccountId: f.bankAccountId || null,
        comprovante: f.comprovante,
        obs: f.obs,
        idempotencyKey: chave.current,
      });
      if (!res.ok) {
        setError(res.error ?? "Falha ao registrar restituição.");
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6" onClick={(e) => e.stopPropagation()}>
          <h2 className="mb-1 text-lg font-semibold text-[var(--color-ink)]">Registrar restituição</h2>
          <p className="mb-4 text-[12px] text-[var(--color-ink3)]">
            {dt.pagador} · saldo pendente {brl0(dt.saldoPendente)}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor a restituir</Label>
              <Input type="number" step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
            </div>
            <div>
              <Label>Data</Label>
              <DateField value={f.dataRestituicao} onChange={(v) => setF({ ...f, dataRestituicao: v })} />
            </div>
            <div className="col-span-2">
              <Label>Conta bancária</Label>
              <Select value={f.bankAccountId} onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}>
                <option value="">—</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>{b.banco} · {b.tipo}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Comprovante / observação</Label>
              <Input value={f.comprovante} onChange={(e) => setF({ ...f, comprovante: e.target.value })} />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-[var(--color-ink3)]">
            Gera a saída de caixa na data informada e liquida a obrigação. Não
            cria nova despesa na DRE.
          </p>
          {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button onClick={confirmar} disabled={pending || (Number(f.valor) || 0) <= 0}>
              {pending ? "Registrando…" : "Confirmar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 3. Funções de `queries.ts` chamadas pela página

A página chama três, todas na linha 33–41 do `page.tsx`. Nenhuma delas filtra
por versão ou projeto — o escopo é o tenant.

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

## 4. `src/lib/actions/restituicoes.ts` — arquivo inteiro

### `src/lib/actions/restituicoes.ts`

```ts
"use server";

import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { statusRestituicao } from "@/lib/calc";
import { restituicaoCabe } from "@/lib/calc/restituicao";
import { validarCategoriaDespesa } from "@/lib/calc/natureza-dre";
import type { CategoriaDRE } from "@/lib/calc/constants";

/**
 * Busca uma despesa já lançada pelo número PED (§9).
 *
 * A busca é por NÚMERO, mas o vínculo devolvido é o **ID interno** da despesa —
 * é ele que amarra a obrigação ao lançamento original. O PED é apenas o rótulo
 * que o usuário conhece; nunca é alterado por este fluxo.
 */
export interface DespesaPorPed {
  id: string;
  numDoc: string | null;
  valor: number;
  competencia: string | null;
  vencimento: string | null;
  categoriaDre: string | null;
  contaCef: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  projectId: string;
  projectName: string;
  status: string | null;
  cancelado: boolean;
  pagoPorTerceiro: boolean;
  /** Obrigação já existente para esta despesa (não se cria uma segunda). */
  obrigacaoId: string | null;
  obrigacaoStatus: string | null;
}

export async function buscarDespesasPorPed(termo: string): Promise<DespesaPorPed[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "ver")) return [];
  const q = termo.trim();
  if (q.length < 2) return [];

  const rows = await db
    .select({
      d: schema.despesas,
      fornecedorNome: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      dtId: schema.despesaTerceiros.id,
      dtStatus: schema.despesaTerceiros.status,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .leftJoin(
      schema.despesaTerceiros,
      and(
        eq(schema.despesaTerceiros.despesaId, schema.despesas.id),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    )
    .where(
      and(
        eq(schema.despesas.tenantId, ctx.tenant.id),
        or(
          ilike(schema.despesas.numDoc, `%${q}%`),
          // Permite colar só o número ("70") ou o PED completo ("PED-000070").
          ilike(schema.despesas.obs, `%${q}%`),
        ),
      ),
    )
    .orderBy(desc(schema.despesas.createdAt))
    .limit(20);

  return rows.map((r) => ({
    id: r.d.id,
    numDoc: r.d.numDoc,
    valor: Number(r.d.valor),
    competencia: r.d.competencia,
    vencimento: r.d.vencimento,
    categoriaDre: r.d.categoriaDre,
    contaCef: r.d.contaCef,
    fornecedorId: r.d.fornecedorId,
    fornecedorNome: r.fornecedorNome,
    projectId: r.projectId,
    projectName: r.projectName,
    status: r.d.status,
    cancelado: r.d.cancelado,
    pagoPorTerceiro: r.d.pagoPorTerceiro,
    obrigacaoId: r.dtId,
    obrigacaoStatus: r.dtStatus,
  }));
}

export interface CriarObrigacaoResult {
  ok: boolean;
  error?: string;
  /** Obrigação criada OU a que já existia para o mesmo fato. */
  obrigacaoId?: string;
  /** true quando a obrigação já existia — a tela deve abri-la, não duplicar. */
  jaExistia?: boolean;
}

/**
 * Cria a OBRIGAÇÃO com quem desembolsou o dinheiro (§6–§11).
 *
 * Os quatro fatos ficam separados:
 *   1. a despesa existe (competência própria, 1× na DRE);
 *   2. um terceiro pagou o fornecedor (não houve saída de caixa da empresa);
 *   3. nasce uma obrigação da empresa com esse terceiro;
 *   4. a restituição — quando ocorrer — é a saída de caixa, em data própria.
 *
 * Dois modos:
 *   - `despesaId` informado → vincula-se a uma despesa JÁ LANÇADA (localizada
 *     pelo PED). O lançamento original NÃO é sobrescrito: valor, competência,
 *     vencimento, categoria, fornecedor e número PED permanecem como estão. A
 *     única marcação é `pagoPorTerceiro = true`, que impede a despesa de contar
 *     como saída de caixa na competência (ela já foi paga por outra pessoa).
 *   - sem `despesaId` → cria a despesa e a obrigação juntas, como antes.
 *
 * Tudo dentro de UMA transação (§16): ou existem despesa + obrigação, ou não
 * existe nenhuma das duas. `idempotencyKey` bloqueia o mesmo fato reenviado.
 */
export async function criarDespesaTerceiro(
  formData: FormData,
): Promise<CriarObrigacaoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "criar")) {
    return { ok: false, error: "Sem permissão para registrar despesas pagas por terceiros." };
  }
  if (ctx.version.locked) return { ok: false, error: "Versão congelada." };

  const s = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  const despesaId = s("despesaId");
  const idem = s("idempotencyKey");
  const pagadorTerceiroId = s("pagadorTerceiroId");
  const dataPagamentoOriginal = s("dataPagamentoOriginal");
  const dataPrevistaRestituicao = s("dataPrevistaRestituicao");
  const obs = s("obs");

  // Reenvio do MESMO fato (duplo clique, refresh, resubmit): devolve a
  // obrigação já criada em vez de criar outra.
  if (idem) {
    const [existente] = await db
      .select({ id: schema.despesaTerceiros.id })
      .from(schema.despesaTerceiros)
      .where(
        and(
          eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
          eq(schema.despesaTerceiros.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente) return { ok: true, obrigacaoId: existente.id, jaExistia: true };
  }

  try {
    const resultado = await db.transaction(async (tx) => {
      let despesaAlvo: typeof schema.despesas.$inferSelect;
      let valorObrigacao: string;

      if (despesaId) {
        // ── Modo vínculo por PED ──────────────────────────────────────────
        const [d] = await tx
          .select()
          .from(schema.despesas)
          .where(
            and(
              eq(schema.despesas.id, despesaId),
              eq(schema.despesas.tenantId, ctx.tenant.id),
            ),
          )
          .limit(1);
        // PED inexistente ou de outro tenant: bloqueia, não cria nada.
        if (!d) throw new Error("PED não encontrado. Confira o número informado.");
        if (d.cancelado)
          throw new Error(
            `O lançamento ${d.numDoc ?? ""} está cancelado e não pode receber uma obrigação de restituição.`.trim(),
          );
        if (Number(d.valor) <= 0)
          throw new Error("O lançamento tem valor zero — incompatível com uma restituição.");

        // Uma obrigação ATIVA por despesa (§16). Se já existe, devolve a
        // existente para a tela abri-la, em vez de criar a segunda.
        const [jaTem] = await tx
          .select({ id: schema.despesaTerceiros.id })
          .from(schema.despesaTerceiros)
          .where(
            and(
              eq(schema.despesaTerceiros.despesaId, d.id),
              ne(schema.despesaTerceiros.status, "Cancelado"),
            ),
          )
          .limit(1);
        if (jaTem) return { obrigacaoId: jaTem.id, jaExistia: true, despesaId: d.id };

        // Só a marcação de "pago por terceiro" muda no lançamento original.
        // Valor, competência, vencimento, categoria, fornecedor e PED ficam
        // exatamente como o usuário lançou.
        if (!d.pagoPorTerceiro) {
          await tx
            .update(schema.despesas)
            .set({ pagoPorTerceiro: true })
            .where(eq(schema.despesas.id, d.id));
        }
        despesaAlvo = d;
        valorObrigacao = String(d.valor);
      } else {
        // ── Modo despesa nova ─────────────────────────────────────────────
        // Item 4.6 / RG-01 — a despesa criada aqui é despesa como qualquer
        // outra: não pode nascer classificada em conta de natureza credora.
        const erroCat = validarCategoriaDespesa(formData.get("categoriaDre") as string);
        if (erroCat) throw new Error(erroCat);
        const valor = (formData.get("valor") as string) || "0";
        if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) {
          throw new Error("Informe um valor maior que zero para a despesa paga por terceiro.");
        }
        const numDoc = await reserveDespesaNumber(ctx.tenant.id);
        const [nova] = await tx
          .insert(schema.despesas)
          .values({
            versionId: ctx.version.id,
            tenantId: ctx.tenant.id,
            numDoc,
            fornecedorId: s("fornecedorId"),
            contaCef: s("contaCef"),
            categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
            competencia: s("competencia"),
            vencimento: dataPagamentoOriginal,
            valor,
            status: "Pago",
            obs,
            pagoPorTerceiro: true,
          })
          .returning();
        despesaAlvo = nova;
        valorObrigacao = valor;
      }

      const [dt] = await tx
        .insert(schema.despesaTerceiros)
        .values({
          tenantId: ctx.tenant.id,
          despesaId: despesaAlvo.id,
          pagadorTerceiroId,
          empresaResponsavelId: s("empresaResponsavelId") || ctx.project.id,
          valorTotal: valorObrigacao,
          // A data da restituição NÃO altera a competência da despesa: são
          // fatos distintos e a DRE continua reconhecendo pela competência
          // original do lançamento.
          dataPagamentoOriginal: dataPagamentoOriginal ?? despesaAlvo.vencimento,
          dataPrevistaRestituicao,
          status: "Aguardando restituição",
          obs,
          idempotencyKey: idem,
        })
        .returning();

      return { obrigacaoId: dt.id, jaExistia: false, despesaId: despesaAlvo.id };
    });

    if (!resultado.jaExistia) {
      await logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "despesaTerceiro.create",
        entity: "despesa_terceiro",
        entityId: resultado.obrigacaoId,
        meta: { despesaId: resultado.despesaId, vinculadoPorPed: !!despesaId },
      });
    }
    revalidatePath("/restituicoes");
    revalidatePath("/contaspagar");
    revalidatePath("/dre");
    return {
      ok: true,
      obrigacaoId: resultado.obrigacaoId,
      jaExistia: resultado.jaExistia,
    };
  } catch (e) {
    // Colisão no índice de idempotência = o mesmo fato chegou duas vezes em
    // paralelo. Não é erro para o usuário: devolve a obrigação que venceu.
    const msg = e instanceof Error ? e.message : "Falha ao registrar a obrigação.";
    if (idem && /idempotency|duplicate key|despesa_terceiro_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.despesaTerceiros.id })
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
            eq(schema.despesaTerceiros.idempotencyKey, idem),
          ),
        )
        .limit(1);
      if (existente) return { ok: true, obrigacaoId: existente.id, jaExistia: true };
    }
    if (/despesa_terceiro_despesa_ativa_uq/i.test(msg)) {
      return { ok: false, error: "Este lançamento já possui uma obrigação de restituição ativa." };
    }
    return { ok: false, error: msg };
  }
}

export interface RestituicaoInput {
  despesaTerceiroId: string;
  valor: number;
  dataRestituicao: string;
  bankAccountId?: string | null;
  comprovante?: string;
  obs?: string;
  /** Trava de reenvio (§16). Gerada pelo formulário, uma por tentativa real. */
  idempotencyKey?: string | null;
  /**
   * Item do extrato que pagou esta restituição (§14). Quando informado, a
   * restituição É a conciliação daquele lançamento: não se cria saída de caixa
   * nova (o extrato já a contém) nem nova despesa.
   */
  cashEntryId?: string | null;
}

export interface RestituicaoResult {
  ok: boolean;
  error?: string;
  restituicaoId?: string;
  jaExistia?: boolean;
}

/**
 * Registra uma restituição, parcial ou integral (§10, §12).
 *
 * O que ela faz: gera a SAÍDA de caixa da empresa na data efetiva e abate o
 * saldo devido ao terceiro.
 *
 * O que ela deliberadamente NÃO faz:
 *   - não cria despesa nova (a despesa já foi reconhecida na competência dela);
 *   - não altera a competência, o valor, o vencimento nem o status da despesa
 *     original — a data da restituição é um fato separado;
 *   - não duplica a saída de caixa quando o pagamento vem de um item do extrato
 *     já lançado (`cashEntryId`): nesse caso só vincula.
 *
 * Tudo em UMA transação e com chave de idempotência: duplo clique, reenvio de
 * formulário ou refresh não geram duas restituições.
 */
export async function registrarRestituicao(
  input: RestituicaoInput,
): Promise<RestituicaoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    return { ok: false, error: "Sem permissão para registrar restituições." };
  }
  const idem = input.idempotencyKey?.trim() || null;

  if (idem) {
    const [existente] = await db
      .select({ id: schema.restituicoes.id })
      .from(schema.restituicoes)
      .where(
        and(
          eq(schema.restituicoes.tenantId, ctx.tenant.id),
          eq(schema.restituicoes.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente) return { ok: true, restituicaoId: existente.id, jaExistia: true };
  }

  try {
    const restId = await db.transaction(async (tx) => {
      // SELECT ... FOR UPDATE: duas restituições simultâneas sobre a mesma
      // obrigação são serializadas, então a segunda enxerga o saldo já abatido
      // pela primeira e é recusada se não couber.
      const [dt] = await tx
        .select()
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.id, input.despesaTerceiroId),
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
          ),
        )
        .for("update")
        .limit(1);
      if (!dt) throw new Error("Obrigação não encontrada.");
      if (dt.status === "Cancelado") throw new Error("Obrigação cancelada.");

      const valor = Math.abs(input.valor);
      if (!(valor > 0)) throw new Error("Informe um valor maior que zero.");
      const saldo = Number(dt.valorTotal) - Number(dt.valorRestituido);
      if (!restituicaoCabe(Number(dt.valorTotal), Number(dt.valorRestituido), valor)) {
        throw new Error(
          `Valor acima do saldo devido (${saldo.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}). Ajuste o valor da restituição.`,
        );
      }

      // §14 — item do extrato já usado por outra restituição não pode ser
      // reaproveitado: geraria uma segunda baixa para o mesmo dinheiro.
      if (input.cashEntryId) {
        const [usado] = await tx
          .select({ id: schema.restituicoes.id })
          .from(schema.restituicoes)
          .where(eq(schema.restituicoes.cashEntryId, input.cashEntryId))
          .limit(1);
        if (usado)
          throw new Error("Este lançamento do extrato já foi vinculado a outra restituição.");
      }

      const [rest] = await tx
        .insert(schema.restituicoes)
        .values({
          tenantId: ctx.tenant.id,
          despesaTerceiroId: dt.id,
          valor: String(valor),
          dataRestituicao: input.dataRestituicao || null,
          bankAccountId: input.bankAccountId || null,
          comprovante: input.comprovante || null,
          obs: input.obs || null,
          cashEntryId: input.cashEntryId || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      const restituido = Number(dt.valorRestituido) + valor;
      await tx
        .update(schema.despesaTerceiros)
        .set({
          valorRestituido: String(restituido),
          status: statusRestituicao(Number(dt.valorTotal), restituido),
        })
        .where(eq(schema.despesaTerceiros.id, dt.id));

      if (input.cashEntryId) {
        // A saída já existe no extrato — só é marcada como conciliada. Criar um
        // cash_entry aqui duplicaria a saída de caixa (§16).
        await tx
          .update(schema.cashEntries)
          .set({ rec: true, cat: "restituicao" })
          .where(eq(schema.cashEntries.id, input.cashEntryId));
      } else {
        await tx.insert(schema.cashEntries).values({
          versionId: ctx.version.id,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataRestituicao || null,
          descricao: "Restituição a terceiro",
          valor: String(-valor),
          cat: "restituicao",
          rec: true,
        });
      }
      return rest.id;
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "restituicao.create",
      entity: "restituicao",
      entityId: restId,
      meta: {
        despesaTerceiroId: input.despesaTerceiroId,
        valor: Math.abs(input.valor),
        cashEntryId: input.cashEntryId ?? null,
      },
    });
    revalidatePath("/restituicoes");
    revalidatePath("/contaspagar");
    revalidatePath("/caixa");
    revalidatePath("/fluxocaixa");
    return { ok: true, restituicaoId: restId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar restituição.";
    if (idem && /duplicate key|restituicao_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.restituicoes.id })
        .from(schema.restituicoes)
        .where(
          and(
            eq(schema.restituicoes.tenantId, ctx.tenant.id),
            eq(schema.restituicoes.idempotencyKey, idem),
          ),
        )
        .limit(1);
      if (existente) return { ok: true, restituicaoId: existente.id, jaExistia: true };
    }
    return { ok: false, error: msg };
  }
}

/** Cancela uma restituição: estorna o valor e a saída de caixa (compensação). */
export async function cancelarRestituicao(restituicaoId: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "excluir")) {
    throw new Error("Sem permissão para cancelar restituições.");
  }
  const [rest] = await db
    .select()
    .from(schema.restituicoes)
    .where(
      and(
        eq(schema.restituicoes.id, restituicaoId),
        eq(schema.restituicoes.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!rest) throw new Error("Restituição não encontrada.");

  const [dt] = await db
    .select()
    .from(schema.despesaTerceiros)
    .where(eq(schema.despesaTerceiros.id, rest.despesaTerceiroId))
    .limit(1);
  if (!dt) throw new Error("Obrigação não encontrada.");

  const valor = Number(rest.valor);
  // Estorno em UMA transação: o saldo da obrigação, a remoção da restituição e
  // a compensação de caixa não podem ficar meio aplicados.
  await db.transaction(async (tx) => {
    const restituido = Math.max(0, Number(dt.valorRestituido) - valor);
    await tx
      .update(schema.despesaTerceiros)
      .set({
        valorRestituido: String(restituido),
        status: statusRestituicao(Number(dt.valorTotal), restituido),
      })
      .where(eq(schema.despesaTerceiros.id, dt.id));
    await tx.delete(schema.restituicoes).where(eq(schema.restituicoes.id, rest.id));

    if (rest.cashEntryId) {
      // A saída veio do extrato: desfaz apenas a conciliação. Lançar um estorno
      // aqui inventaria uma entrada que nunca aconteceu no banco.
      await tx
        .update(schema.cashEntries)
        .set({ rec: false })
        .where(eq(schema.cashEntries.id, rest.cashEntryId));
    } else {
      // Saída criada por nós — compensa com uma entrada de estorno.
      await tx.insert(schema.cashEntries).values({
        versionId: ctx.version.id,
        tenantId: ctx.tenant.id,
        bankAccountId: rest.bankAccountId,
        data: rest.dataRestituicao,
        descricao: "Estorno de restituição",
        valor: String(valor),
        cat: "ajuste",
        rec: true,
      });
    }
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "restituicao.cancel",
    entity: "restituicao",
    entityId: rest.id,
    meta: { despesaTerceiroId: dt.id, valor },
  });
  revalidatePath("/restituicoes");
  revalidatePath("/caixa");
}

export interface DespesaTerceiroView {
  id: string;
  numDoc: string | null;
  pagador: string | null;
  valorTotal: number;
  valorRestituido: number;
  saldoPendente: number;
  dataPagamentoOriginal: string | null;
  dataPrevistaRestituicao: string | null;
  status: string;
}

/** Lista as obrigações (paga por terceiro) da versão ativa, com pagador. */
export async function getDespesaTerceiros(
  tenantId: string,
  versionId: string,
): Promise<DespesaTerceiroView[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      pagador: schema.stakeholders.nome,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, tenantId),
        eq(schema.despesas.versionId, versionId),
      ),
    )
    .orderBy(desc(schema.despesaTerceiros.createdAt));
  return rows.map((r) => {
    const total = Number(r.dt.valorTotal);
    const rest = Number(r.dt.valorRestituido);
    return {
      id: r.dt.id,
      numDoc: r.numDoc,
      pagador: r.pagador,
      valorTotal: total,
      valorRestituido: rest,
      saldoPendente: Math.max(0, total - rest),
      dataPagamentoOriginal: r.dt.dataPagamentoOriginal,
      dataPrevistaRestituicao: r.dt.dataPrevistaRestituicao,
      status: r.dt.status,
    };
  });
}

/**
 * Obrigações com terceiros em aberto, no formato das linhas de Contas a Pagar
 * (§11).
 *
 * Uma obrigação NÃO é uma despesa nova: a despesa já foi reconhecida na
 * competência dela e aparece em Contas a Pagar como "Pago" (quem pagou foi o
 * terceiro). O que continua em aberto é a dívida da empresa COM o terceiro —
 * é isso que estas linhas representam, com o saldo ainda devido.
 *
 * Query própria, deliberadamente separada de `getContasPagar`: aquela alimenta
 * também Dashboard, Fechamento e a conciliação do extrato, cujo comportamento
 * não deve mudar.
 */
export interface ObrigacaoContaPagarRow {
  id: string;
  obrigacaoId: string;
  numDoc: string | null;
  terceiro: string | null;
  descricao: string;
  valorSaldo: number;
  dataPrevista: string | null;
  competencia: string | null;
  status: string;
  projectId: string;
  projectName: string;
}

export async function getObrigacoesTerceiroPendentes(
  tenantId: string,
): Promise<ObrigacaoContaPagarRow[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      competencia: schema.despesas.competencia,
      terceiro: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, tenantId),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    );

  return rows
    .map((r) => ({
      id: `obr:${r.dt.id}`,
      obrigacaoId: r.dt.id,
      numDoc: r.numDoc,
      terceiro: r.terceiro,
      descricao: `Restituir a ${r.terceiro ?? "terceiro"} — ref. ${r.numDoc ?? "lançamento"}`,
      valorSaldo:
        Math.round((Number(r.dt.valorTotal) - Number(r.dt.valorRestituido)) * 100) / 100,
      dataPrevista: r.dt.dataPrevistaRestituicao,
      competencia: r.competencia,
      status: r.dt.status,
      projectId: r.projectId,
      projectName: r.projectName,
    }))
    .filter((r) => r.valorSaldo > 0.004);
}

export interface SaldoTerceiroView {
  pagadorId: string | null;
  pagador: string;
  obrigacoes: number;
  valorTotal: number;
  valorRestituido: number;
  saldoDevido: number;
}

/**
 * Conta corrente de um terceiro (§13): todos os movimentos que formam o saldo.
 *
 * `desembolso` = o terceiro pagou um fornecedor pela empresa (aumenta a dívida).
 * `restituicao` = a empresa devolveu dinheiro a ele (diminui a dívida).
 *
 * Saldo devido = total desembolsado − total restituído.
 */
export interface MovimentoTerceiro {
  id: string;
  tipo: "desembolso" | "restituicao";
  data: string | null;
  descricao: string;
  numDoc: string | null;
  valor: number;
  /** Saldo devido acumulado APÓS este movimento. */
  saldoAcumulado: number;
}

export interface ContaCorrenteTerceiro {
  pagadorId: string | null;
  pagador: string;
  totalDesembolsado: number;
  totalRestituido: number;
  saldoDevido: number;
  movimentos: MovimentoTerceiro[];
}

/** "MM/DD/YYYY" → número comparável; sem data vai para o fim da ordenação. */
function ordData(d: string | null): number {
  const p = (d ?? "").split("/");
  if (p.length !== 3) return Number.MAX_SAFE_INTEGER;
  const n = Number(p[2]) * 10000 + Number(p[0]) * 100 + Number(p[1]);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Conta corrente completa de cada terceiro/sócio do tenant (§13).
 *
 * Escopo TENANT, não versão: a dívida com um sócio é da empresa e não some
 * porque o usuário trocou o projeto ativo na tela. Obrigações canceladas ficam
 * de fora do saldo, mas nada é apagado — o cancelamento é lógico.
 */
export async function getContaCorrenteTerceiros(
  tenantId: string,
): Promise<ContaCorrenteTerceiro[]> {
  const obrigacoes = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      pagadorId: schema.stakeholders.id,
      pagador: schema.stakeholders.nome,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(eq(schema.despesaTerceiros.tenantId, tenantId));

  const ativas = obrigacoes.filter((o) => o.dt.status !== "Cancelado");
  const idsAtivas = ativas.map((o) => o.dt.id);
  const rests = idsAtivas.length
    ? await db
        .select()
        .from(schema.restituicoes)
        .where(
          and(
            eq(schema.restituicoes.tenantId, tenantId),
            sql`${schema.restituicoes.despesaTerceiroId} IN ${idsAtivas}`,
          ),
        )
    : [];
  const obrigacaoPorId = new Map(ativas.map((o) => [o.dt.id, o]));

  const contas = new Map<string, ContaCorrenteTerceiro>();
  const chaveDe = (id: string | null) => id ?? "—";
  const abrir = (id: string | null, nome: string | null): ContaCorrenteTerceiro => {
    const k = chaveDe(id);
    let c = contas.get(k);
    if (!c) {
      c = {
        pagadorId: id,
        pagador: nome ?? "Não identificado",
        totalDesembolsado: 0,
        totalRestituido: 0,
        saldoDevido: 0,
        movimentos: [],
      };
      contas.set(k, c);
    }
    return c;
  };

  for (const o of ativas) {
    const c = abrir(o.pagadorId ?? null, o.pagador);
    c.totalDesembolsado += Number(o.dt.valorTotal);
    c.movimentos.push({
      id: o.dt.id,
      tipo: "desembolso",
      data: o.dt.dataPagamentoOriginal,
      descricao: "Pagamento a fornecedor pela empresa",
      numDoc: o.numDoc,
      valor: Number(o.dt.valorTotal),
      saldoAcumulado: 0,
    });
  }
  for (const r of rests) {
    const o = obrigacaoPorId.get(r.despesaTerceiroId);
    if (!o) continue;
    const c = abrir(o.pagadorId ?? null, o.pagador);
    c.totalRestituido += Number(r.valor);
    c.movimentos.push({
      id: r.id,
      tipo: "restituicao",
      data: r.dataRestituicao,
      descricao: r.cashEntryId ? "Restituição (conciliada no extrato)" : "Restituição",
      numDoc: o.numDoc,
      valor: Number(r.valor),
      saldoAcumulado: 0,
    });
  }

  for (const c of contas.values()) {
    c.movimentos.sort((a, b) => ordData(a.data) - ordData(b.data) || a.id.localeCompare(b.id));
    let acc = 0;
    for (const m of c.movimentos) {
      acc += m.tipo === "desembolso" ? m.valor : -m.valor;
      m.saldoAcumulado = Math.round(acc * 100) / 100;
    }
    c.totalDesembolsado = Math.round(c.totalDesembolsado * 100) / 100;
    c.totalRestituido = Math.round(c.totalRestituido * 100) / 100;
    c.saldoDevido = Math.round((c.totalDesembolsado - c.totalRestituido) * 100) / 100;
  }
  return [...contas.values()].sort((a, b) => b.saldoDevido - a.saldoDevido);
}

/**
 * Extrato CONSOLIDADO por terceiro/sócio: quanto a empresa deve a cada um,
 * quanto já foi restituído e o saldo remanescente.
 *
 * Até aqui só existia a visão por obrigação individual (uma linha por despesa),
 * sem nenhum lugar que respondesse "quanto ainda devo ao sócio X". Este saldo
 * NÃO é saldo bancário disponível da empresa — é obrigação com terceiros.
 */
export async function getSaldosPorTerceiro(
  tenantId: string,
  versionId: string,
): Promise<SaldoTerceiroView[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      pagadorId: schema.stakeholders.id,
      pagador: schema.stakeholders.nome,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, tenantId),
        eq(schema.despesas.versionId, versionId),
      ),
    );

  const porPagador = new Map<string, SaldoTerceiroView>();
  for (const r of rows) {
    if (r.dt.status === "Cancelado") continue;
    const chave = r.pagadorId ?? "—";
    const atual =
      porPagador.get(chave) ??
      ({
        pagadorId: r.pagadorId ?? null,
        pagador: r.pagador ?? "Não identificado",
        obrigacoes: 0,
        valorTotal: 0,
        valorRestituido: 0,
        saldoDevido: 0,
      } satisfies SaldoTerceiroView);
    atual.obrigacoes += 1;
    atual.valorTotal += Number(r.dt.valorTotal);
    atual.valorRestituido += Number(r.dt.valorRestituido);
    atual.saldoDevido = Math.max(0, atual.valorTotal - atual.valorRestituido);
    porPagador.set(chave, atual);
  }
  return [...porPagador.values()].sort((a, b) => b.saldoDevido - a.saldoDevido);
}

/** Saldo pendente de restituições por mês previsto (para o fluxo de caixa). */
export async function getRestituicoesPendentesByVersion(
  versionId: string,
): Promise<{ despesaIds: string[]; saidasPrevistas: Record<string, number> }> {
  const rows = await db
    .select({ dt: schema.despesaTerceiros, despesaId: schema.despesas.id })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesaTerceiros.dataPrevistaRestituicao));
  const saidas: Record<string, number> = {};
  const despesaIds: string[] = [];
  for (const r of rows) {
    despesaIds.push(r.despesaId);
    if (r.dt.status === "Cancelado") continue;
    const saldo = Number(r.dt.valorTotal) - Number(r.dt.valorRestituido);
    const p = (r.dt.dataPrevistaRestituicao ?? "").split("/");
    const mm = p.length === 3 ? `${p[0]}/${p[2]}` : null;
    if (mm && saldo > 0) saidas[mm] = (saidas[mm] || 0) + saldo;
  }
  return { despesaIds, saidasPrevistas: saidas };
}
```

---

## 5. `src/lib/calc/restituicao.ts` — arquivo inteiro

### `src/lib/calc/restituicao.ts`

```ts
/** Status de uma obrigação "paga por terceiro" conforme o valor restituído. */
export function statusRestituicao(
  valorTotal: number,
  restituido: number,
): "Aguardando restituição" | "Parcialmente restituído" | "Restituído" {
  if (restituido <= 0) return "Aguardando restituição";
  if (restituido + 0.01 >= valorTotal) return "Restituído";
  return "Parcialmente restituído";
}

/** Saldo pendente de restituição (nunca negativo). */
export function saldoPendente(valorTotal: number, restituido: number): number {
  return Math.max(0, Math.round((valorTotal - restituido) * 100) / 100);
}

/**
 * Rótulo do status da obrigação na interface (§12).
 *
 * O banco continua gravando "Aguardando restituição" — o valor histórico. A
 * troca é só de vocabulário na tela: nenhum registro antigo é reclassificado,
 * nenhum UPDATE é emitido. Qualquer status desconhecido é devolvido como veio,
 * para nunca esconder um estado que não previmos.
 */
export function rotuloStatusObrigacao(status: string): string {
  if (status === "Aguardando restituição") return "Pendente";
  return status;
}

/**
 * Saldo devido a um terceiro: total desembolsado por ele − total já restituído
 * (§13). Diferente de `saldoPendente`, NÃO faz clamp em zero: um saldo negativo
 * significa que se restituiu mais do que se devia e precisa ficar visível, não
 * ser mascarado.
 */
export function saldoDevidoTerceiro(
  totalDesembolsado: number,
  totalRestituido: number,
): number {
  return Math.round((totalDesembolsado - totalRestituido) * 100) / 100;
}

/**
 * A restituição cabe no saldo devido? Tolerância de 1 centavo para
 * arredondamento. Restituir acima do saldo geraria saída de caixa indevida.
 */
export function restituicaoCabe(
  valorTotal: number,
  jaRestituido: number,
  novoValor: number,
): boolean {
  if (!(novoValor > 0)) return false;
  return novoValor <= valorTotal - jaRestituido + 0.01;
}
```

---

## 6. Definições no schema

### `src/lib/db/schema.ts` · linhas 618–660

```ts
/**
 * Despesa paga por terceiro com restituição posterior (Fase 4). A despesa é
 * reconhecida 1× na DRE (competência); esta tabela registra a OBRIGAÇÃO da
 * empresa com quem desembolsou. A saída de caixa ocorre só nas restituições.
 */
export const despesaTerceiros = pgTable("despesa_terceiro", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  despesaId: uuid("despesa_id")
    .notNull()
    .references(() => despesas.id, { onDelete: "cascade" }),
  /** quem desembolsou o dinheiro (consultora/sócio/funcionário/empresa). */
  pagadorTerceiroId: uuid("pagador_terceiro_id").references(() => stakeholders.id, {
    onDelete: "set null",
  }),
  /** empresa/projeto responsável pela obrigação. */
  empresaResponsavelId: uuid("empresa_responsavel_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }).notNull().default("0"),
  valorRestituido: numeric("valor_restituido", { precision: 15, scale: 2 }).notNull().default("0"),
  dataPagamentoOriginal: text("data_pagamento_original"),
  dataPrevistaRestituicao: text("data_prevista_restituicao"),
  /**
   * Aguardando restituição | Parcialmente restituído | Restituído | Cancelado
   *
   * "Aguardando restituição" é o valor histórico e continua sendo gravado —
   * nenhum registro antigo é reclassificado. Na interface ele é exibido como
   * "Pendente" (ver `rotuloStatusObrigacao`), que é o vocabulário pedido.
   */
  status: text("status").notNull().default("Aguardando restituição"),
  obs: text("obs"),
  /**
   * Chave de idempotência (§16): duas submissões do MESMO fato (duplo clique,
   * reenvio de formulário, refresh) colidem aqui em vez de criar duas
   * obrigações. Nulo nos registros anteriores à trava — por isso o índice é
   * parcial (WHERE NOT NULL).
   */
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 662–690

```ts
/** Restituição (parcial ou integral) de uma despesa paga por terceiro. Fase 4. */
export const restituicoes = pgTable("restituicao", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  despesaTerceiroId: uuid("despesa_terceiro_id")
    .notNull()
    .references(() => despesaTerceiros.id, { onDelete: "cascade" }),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  dataRestituicao: text("data_restituicao"),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  comprovante: text("comprovante"),
  obs: text("obs"),
  /**
   * Item do extrato que pagou esta restituição (§14). A conciliação vincula o
   * pagamento ao lançamento do extrato SEM criar nova despesa: a despesa já foi
   * reconhecida na competência original.
   */
  cashEntryId: uuid("cash_entry_id").references((): AnyPgColumn => cashEntries.id, {
    onDelete: "set null",
  }),
  /** Chave de idempotência (§16) — ver `despesaTerceiros.idempotencyKey`. */
  idempotencyKey: text("idempotency_key"),
  usuarioId: text("usuario_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 896–922

```ts
/**
 * Vínculo N:N entre uma RESTITUIÇÃO e os PEDs que ela abate — item 4.2.
 *
 * O cliente não restitui item a item: ele fecha o combo (paga a fatura inteira
 * do cartão pessoal e é ressarcido em um único valor). Uma restituição abate
 * vários PEDs, e um PED pode ser abatido por mais de uma restituição (parciais).
 *
 * `valorAbatido` guarda quanto DESTA restituição foi para AQUELE PED — é o que
 * permite o abatimento parcial do último PED da fila FIFO.
 */
export const restituicaoItens = pgTable("restituicao_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  restituicaoId: uuid("restituicao_id")
    .notNull()
    .references(() => restituicoes.id, { onDelete: "cascade" }),
  /** obrigação (PED de origem) abatida por esta restituição. */
  despesaTerceiroId: uuid("despesa_terceiro_id")
    .notNull()
    .references(() => despesaTerceiros.id, { onDelete: "cascade" }),
  valorAbatido: numeric("valor_abatido", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 924–954

```ts
/**
 * Compensação (encontro de contas) entre o que a empresa deve a um terceiro e o
 * que ele deve a ela — RG-05.
 *
 * Não transita pela DRE: é baixa simultânea de um passivo e de um ativo. Os
 * dois saldos brutos continuam sendo exibidos antes da compensação.
 */
export const compensacoes = pgTable("compensacao", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** PED próprio da compensação. */
  numDoc: text("num_doc"),
  terceiroId: uuid("terceiro_id").references(() => stakeholders.id, {
    onDelete: "set null",
  }),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  data: text("data"),
  /** saldos BRUTOS no momento da compensação, para a trilha de conferência. */
  saldoRestituirAntes: numeric("saldo_restituir_antes", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  saldoRepassarAntes: numeric("saldo_repassar_antes", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  obs: text("obs"),
  idempotencyKey: text("idempotency_key"),
  usuarioId: text("usuario_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

---

## 7. Como a coluna DIAS é calculada, e a partir de qual data

A coluna existe no `RestituicoesManager` (cabeçalho `Dias`,
`restituicoes-manager.tsx:271`), mas o número **não é calculado no cliente**:
ele chega pronto do servidor, no campo `diasEmAberto` de cada linha.

**Data-base:** `dataPrevistaRestituicao`, com *fallback* para
`dataPagamentoOriginal` quando a prevista é nula
(`page.tsx:46`). São as colunas `data_prevista_restituicao` e
`data_pagamento_original` de `despesa_terceiro`, ambas `text` no formato
interno `"MM/DD/YYYY"`.

**Data final:** `new Date()` no momento da renderização do Server Component —
a página é `dynamic = "force-dynamic"` (`page.tsx:14`), então é recalculado a
cada request. Lido em UTC (`getUTCFullYear`/`getUTCMonth`/`getUTCDate`).

**Fórmula:** as duas datas viram inteiros `YYYYMMDD` (via `ymd` para a base,
montado à mão para hoje), voltam a `Date.UTC(...)` e a diferença em
milissegundos é dividida por `86_400_000` e arredondada. O resultado passa por
`Math.max(0, …)`: **nunca é negativo** — uma previsão futura exibe `0`, não
dias a vencer. Base nula (ambas as datas ausentes) também devolve `0`.

**Exibição:** o número só aparece quando `saldoPendente > 0`; com saldo zerado
a célula mostra `—` (`restituicoes-manager.tsx:286`). O valor `0` é, portanto,
ambíguo na tela: pode ser data-base ausente, data futura, ou hoje.

### `src/app/(app)/restituicoes/page.tsx` · linhas 16–26

A função, em `page.tsx`. `ymd` converte `"MM/DD/YYYY"` em `YYYYMMDD`.

```tsx
/** Dias em aberto entre a data-base e hoje. */
function diasEmAberto(base: string | null): number {
  const b = ymd(base);
  if (b == null) return 0;
  const now = new Date();
  const hoje = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  // diferença aproximada em dias via datas UTC
  const toDate = (n: number) =>
    Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100);
  return Math.max(0, Math.round((toDate(hoje) - toDate(b)) / 86_400_000));
}
```

### `src/lib/utils.ts` · linhas 91–99

`ymd`, em `utils.ts` — devolve `null` para qualquer string que não tenha três partes separadas por `/`.

```ts
/** "MM/DD/YYYY" → número YYYYMMDD (comparável); null se inválido. */
export function ymd(s: string | null | undefined): number | null {
  if (!s) return null;
  const p = s.trim().split("/");
  if (p.length !== 3) return null;
  const [mo, d, y] = p.map(Number);
  if (!y || !mo || !d) return null;
  return y * 10000 + mo * 100 + d;
}
```

### `src/app/(app)/restituicoes/page.tsx` · linhas 44–47

Onde o campo é anexado a cada linha, antes de descer para o componente.

```tsx
  const rows = lista.map((r) => ({
    ...r,
    diasEmAberto: diasEmAberto(r.dataPrevistaRestituicao ?? r.dataPagamentoOriginal),
  }));
```

### `src/components/app/restituicoes-manager.tsx` · linhas 262–287

O cabeçalho `Dias` e a célula, no `RestituicoesManager`.

```tsx
      <Table>
        <THead>
          <tr>
            <TH>Documento</TH>
            <TH>Terceiro</TH>
            <TH className="text-right">Valor</TH>
            <TH className="text-right">Restituído</TH>
            <TH className="text-right">Saldo</TH>
            <TH>Prevista</TH>
            <TH className="text-right">Dias</TH>
            <TH>Status</TH>
            {canEditar && <TH className="text-right">Ação</TH>}
          </tr>
        </THead>
        <tbody>
          {filtrados.map((r) => (
            <TR key={r.id}>
              <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{r.numDoc ?? "—"}</TD>
              <TD>{r.pagador ?? "—"}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(r.valorTotal)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">{brl0(r.valorRestituido)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-warning)]">{brl0(r.saldoPendente)}</TD>
              <TD className="font-[family-name:var(--font-mono)]">{dateBR(r.dataPrevistaRestituicao)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.saldoPendente > 0 ? r.diasEmAberto : "—"}
              </TD>
```

---

## 8. O que o "Ver" do extrato de terceiros abre, e onde a compensação aparece


### 8.1 O "Ver"

O botão **Ver** fica na última coluna do card *Conta corrente de terceiros*
(`conta-corrente-terceiros.tsx:99–104`). Não abre modal, não navega, não faz
requisição: é um *toggle* de estado local (`aberta`, `useState<string|null>`,
linha 28) que expande uma linha `<tr>` extra **dentro da mesma tabela**,
logo abaixo da linha do terceiro (`colSpan={6}`, linha 109). O rótulo alterna
entre `Ver` e `Fechar`, e só um terceiro fica aberto por vez.

O conteúdo expandido é o extrato daquele terceiro, com cinco colunas — **Data,
Movimento, Documento, Valor, Saldo devido**. Os dados já vieram no payload
inicial da página: `c.movimentos`, montado por `getContaCorrenteTerceiros`
no servidor. Cada movimento é `desembolso` (badge `warning`, valor com `+`) ou
`restituicao` (badge `success`, valor com `−`), e a última coluna mostra o
`saldoAcumulado` recalculado movimento a movimento, em ordem de data.

### `src/components/app/conta-corrente-terceiros.tsx` · linhas 98–106

O botão.

```tsx
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => setAberta(aberto ? null : chave)}
                          className="text-[12px] text-[var(--color-accent2)] hover:underline"
                        >
                          {aberto ? "Fechar" : "Ver"}
                        </button>
                      </td>
                    </tr>
```

### `src/components/app/conta-corrente-terceiros.tsx` · linhas 107–158

O que ele revela.

```tsx
                    {aberto && (
                      <tr key={`${chave}-ext`} className="border-b border-[var(--color-accent2)]/8">
                        <td colSpan={6} className="bg-[var(--color-surface2)]/60 px-2 py-3">
                          <table className="w-full border-collapse text-[12.5px]">
                            <thead>
                              <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink4)]">
                                <th className="px-2 py-1">Data</th>
                                <th className="px-2 py-1">Movimento</th>
                                <th className="px-2 py-1">Documento</th>
                                <th className="px-2 py-1 text-right">Valor</th>
                                <th className="px-2 py-1 text-right">Saldo devido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.movimentos.map((m) => (
                                <tr key={`${m.tipo}-${m.id}`}>
                                  <td className="px-2 py-1 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {m.data ? dateBR(m.data) : "—"}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Badge
                                      tone={m.tipo === "desembolso" ? "warning" : "success"}
                                    >
                                      {m.tipo === "desembolso" ? "Desembolso" : "Restituição"}
                                    </Badge>{" "}
                                    <span className="text-[var(--color-ink3)]">
                                      {m.descricao}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {m.numDoc ?? "—"}
                                  </td>
                                  <td
                                    className={`px-2 py-1 text-right font-[family-name:var(--font-mono)] ${
                                      m.tipo === "desembolso"
                                        ? "text-[var(--color-ink)]"
                                        : "text-[var(--color-success)]"
                                    }`}
                                  >
                                    {m.tipo === "desembolso" ? "+" : "−"}
                                    {brl0(m.valor)}
                                  </td>
                                  <td className="px-2 py-1 text-right font-[family-name:var(--font-mono)] font-medium">
                                    {brl0(m.saldoAcumulado)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
```


### 8.2 Onde a compensação aparece

Em **um** lugar da interface: o card **"Encontro de contas"**, o último bloco
do componente `RestituicaoLote` (`restituicao-lote.tsx:311–360`). O card só é
renderizado quando `compensaveis.length > 0`, ou seja, quando existe pelo menos
um terceiro com saldo nos **dois** lados — `podeCompensar` aplicado sobre os
`saldos` recebidos da página (linha 140).

Cada terceiro compensável vira uma linha com o nome, *a restituir*, *a
repassar*, o *compensável* (`valorCompensavel`) e o botão **Compensar saldos**.
O botão chama `compensar(s)`, que pede confirmação via `window.confirm` — texto
que diz explicitamente "A compensação não movimenta caixa nem altera a DRE" —
e então dispara a action `compensarSaldos`, passando `obs: "Encontro de
contas"`, uma `idempotencyKey` nova e `data: new Date().toISOString().slice(0,
10)` (formato `AAAA-MM-DD`, diferente do `"MM/DD/YYYY"` usado nas demais
colunas de data do app). Em caso de sucesso a tela mostra
`Compensação {numDoc} registrada: {valor}.` e chama `router.refresh()`.

O card inteiro — e com ele o "Encontro de contas" — está atrás de
`if (!canEditar) return null;` (`restituicao-lote.tsx:142`): quem tem apenas
`restituicoes:ver` não vê o `RestituicaoLote` de forma alguma.

Não há tela, listagem ou histórico de compensações: a tabela `compensacao` é
gravada mas **nenhuma consulta do repositório a lê de volta para exibição**. O
rastro visível fica no campo `obs` das obrigações e dos recebimentos abatidos,
onde a action acrescenta `"Compensado em {numDoc}"`
(`restituicao-lote.ts:463` e `:483`).

Os saldos exibidos acima do card continuam **brutos** — a action
`getSaldosConsolidadosTerceiros` devolve os dois lados sem líquido, por decisão
documentada no próprio código.

### `src/components/app/restituicao-lote.tsx` · linhas 111–140

O handler do botão, no cliente.

```tsx
  const compensar = (s: SaldoConsolidadoTerceiro) => {
    if (!s.terceiroId) return;
    const v = valorCompensavel(s);
    if (
      !window.confirm(
        `Compensar ${brl0(v)} entre o que a empresa deve a ${s.terceiro} (${brl0(
          s.saldoARestituir,
        )}) e o que ele deve à empresa (${brl0(s.saldoARepassar)})?\n\n` +
          "A compensação não movimenta caixa nem altera a DRE.",
      )
    )
      return;
    setErro(null);
    start(async () => {
      const res = await compensarSaldos({
        terceiroId: s.terceiroId!,
        data: new Date().toISOString().slice(0, 10),
        obs: "Encontro de contas",
        idempotencyKey: novaChave(),
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao compensar.");
        return;
      }
      setMsg(`Compensação ${res.numDoc ?? ""} registrada: ${brl0(res.valor ?? 0)}.`);
      router.refresh();
    });
  };

  const compensaveis = saldos.filter(podeCompensar);
```

### `src/components/app/restituicao-lote.tsx` · linhas 311–360

O card "Encontro de contas".

```tsx
      {/* RG-05 — encontro de contas, quando existem os DOIS saldos. */}
      {compensaveis.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
              Encontro de contas
            </h3>
            <p className="mb-3 text-[11.5px] text-[var(--color-ink3)]">
              Estes terceiros têm saldo nos dois lados. A compensação não
              movimenta caixa nem altera a DRE — os saldos brutos continuam
              visíveis acima.
            </p>
            <div className="space-y-2">
              {compensaveis.map((s) => (
                <div
                  key={s.terceiroId ?? s.terceiro}
                  className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[var(--color-accent2)]/15 p-2.5 text-[13px]"
                >
                  <strong className="text-[var(--color-ink)]">{s.terceiro}</strong>
                  <span className="text-[var(--color-ink3)]">
                    a restituir{" "}
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">
                      {brl0(s.saldoARestituir)}
                    </span>
                  </span>
                  <span className="text-[var(--color-ink3)]">
                    a repassar{" "}
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                      {brl0(s.saldoARepassar)}
                    </span>
                  </span>
                  <span className="text-[var(--color-ink3)]">
                    compensável{" "}
                    <strong className="font-[family-name:var(--font-mono)] text-[var(--color-accent2)]">
                      {brl0(valorCompensavel(s))}
                    </strong>
                  </span>
                  <button
                    onClick={() => compensar(s)}
                    disabled={pending}
                    className="ml-auto text-[12px] text-[var(--color-accent2)] hover:underline"
                  >
                    Compensar saldos
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
```

### `src/lib/actions/recebimento-terceiro.ts` · linhas 386–393

```ts
export interface SaldoConsolidadoTerceiro {
  terceiroId: string | null;
  terceiro: string;
  /** quanto a empresa DEVE a ele (RG-03). */
  saldoARestituir: number;
  /** quanto ELE deve à empresa (RG-04). */
  saldoARepassar: number;
}
```

### `src/lib/actions/recebimento-terceiro.ts` · linhas 395–480

`getSaldosConsolidadosTerceiros` — a fonte dos dois saldos.

```ts
/**
 * Os DOIS saldos de cada terceiro, lado a lado — base do encontro de contas
 * (RG-05).
 *
 * Os saldos são sempre devolvidos BRUTOS. A compensação, quando acontecer, é um
 * documento próprio; exibir só o líquido aqui esconderia a dimensão real de
 * cada obrigação (princípio da não compensação indevida).
 */
export async function getSaldosConsolidadosTerceiros(
  tenantId: string,
): Promise<SaldoConsolidadoTerceiro[]> {
  const [obrigacoes, recebimentos] = await Promise.all([
    db
      .select({
        id: schema.despesaTerceiros.pagadorTerceiroId,
        nome: schema.stakeholders.nome,
        total: sql<string>`sum(${schema.despesaTerceiros.valorTotal})`,
        pago: sql<string>`sum(${schema.despesaTerceiros.valorRestituido})`,
      })
      .from(schema.despesaTerceiros)
      .leftJoin(
        schema.stakeholders,
        eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
      )
      .where(
        and(
          eq(schema.despesaTerceiros.tenantId, tenantId),
          ne(schema.despesaTerceiros.status, "Cancelado"),
        ),
      )
      .groupBy(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.nome),
    db
      .select({
        id: schema.recebimentosTerceiros.recebedorTerceiroId,
        nome: schema.stakeholders.nome,
        total: sql<string>`sum(${schema.recebimentosTerceiros.valorTotal})`,
        pago: sql<string>`sum(${schema.recebimentosTerceiros.valorRepassado})`,
      })
      .from(schema.recebimentosTerceiros)
      .leftJoin(
        schema.stakeholders,
        eq(schema.recebimentosTerceiros.recebedorTerceiroId, schema.stakeholders.id),
      )
      .where(
        and(
          eq(schema.recebimentosTerceiros.tenantId, tenantId),
          ne(schema.recebimentosTerceiros.status, "Cancelado"),
        ),
      )
      .groupBy(
        schema.recebimentosTerceiros.recebedorTerceiroId,
        schema.stakeholders.nome,
      ),
  ]);

  const mapa = new Map<string, SaldoConsolidadoTerceiro>();
  const abrir = (id: string | null, nome: string | null) => {
    const k = id ?? "—";
    let c = mapa.get(k);
    if (!c) {
      c = {
        terceiroId: id,
        terceiro: nome ?? "Não identificado",
        saldoARestituir: 0,
        saldoARepassar: 0,
      };
      mapa.set(k, c);
    }
    return c;
  };
  for (const o of obrigacoes) {
    abrir(o.id, o.nome).saldoARestituir +=
      Number(o.total ?? 0) - Number(o.pago ?? 0);
  }
  for (const r of recebimentos) {
    abrir(r.id, r.nome).saldoARepassar += Number(r.total ?? 0) - Number(r.pago ?? 0);
  }
  for (const c of mapa.values()) {
    c.saldoARestituir = Math.round(c.saldoARestituir * 100) / 100;
    c.saldoARepassar = Math.round(c.saldoARepassar * 100) / 100;
  }
  return [...mapa.values()].sort(
    (a, b) =>
      b.saldoARestituir + b.saldoARepassar - (a.saldoARestituir + a.saldoARepassar),
  );
}
```

### `src/lib/actions/restituicao-lote.ts` · linhas 340–346

```ts
export interface CompensacaoResult {
  ok: boolean;
  error?: string;
  compensacaoId?: string;
  numDoc?: string;
  valor?: number;
}
```

### `src/lib/actions/restituicao-lote.ts` · linhas 348–516

`compensarSaldos` — a action inteira: idempotência, FIFO nos dois lados, gravação em `compensacao` e log de auditoria. Nenhum lançamento de caixa.

```ts
/**
 * Encontro de contas com um terceiro — RG-05 / item 4.5.
 *
 * Quando o mesmo terceiro tem, ao mesmo tempo, saldo a restituir (a empresa
 * deve a ele) e saldo a repassar (ele deve à empresa), os dois podem ser
 * compensados.
 *
 * A compensação **não transita pela DRE** e **não move o caixa**: é baixa
 * simultânea de um passivo e de um ativo. Os saldos BRUTOS do momento ficam
 * gravados no documento, para a conferência ver o que existia antes de compensar.
 */
export async function compensarSaldos(input: {
  terceiroId: string;
  data: string;
  obs?: string | null;
  idempotencyKey?: string | null;
}): Promise<CompensacaoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    return { ok: false, error: "Sem permissão para compensar saldos." };
  }
  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.compensacoes.id, numDoc: schema.compensacoes.numDoc })
      .from(schema.compensacoes)
      .where(
        and(
          eq(schema.compensacoes.tenantId, ctx.tenant.id),
          eq(schema.compensacoes.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente)
      return { ok: true, compensacaoId: existente.id, numDoc: existente.numDoc ?? undefined };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const obrigacoes = await tx
        .select()
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
            eq(schema.despesaTerceiros.pagadorTerceiroId, input.terceiroId),
            ne(schema.despesaTerceiros.status, "Cancelado"),
          ),
        )
        .for("update");
      const recebimentos = await tx
        .select()
        .from(schema.recebimentosTerceiros)
        .where(
          and(
            eq(schema.recebimentosTerceiros.tenantId, ctx.tenant.id),
            eq(schema.recebimentosTerceiros.recebedorTerceiroId, input.terceiroId),
            ne(schema.recebimentosTerceiros.status, "Cancelado"),
          ),
        )
        .for("update");

      const saldoARestituir =
        Math.round(
          obrigacoes.reduce(
            (a, o) => a + Number(o.valorTotal) - Number(o.valorRestituido),
            0,
          ) * 100,
        ) / 100;
      const saldoARepassar =
        Math.round(
          recebimentos.reduce(
            (a, r) => a + Number(r.valorTotal) - Number(r.valorRepassado),
            0,
          ) * 100,
        ) / 100;

      const valor = valorCompensavel({ saldoARestituir, saldoARepassar });
      if (valor <= 0) {
        throw new Error(
          "Não há o que compensar: é preciso haver saldo nos DOIS lados (a restituir e a repassar).",
        );
      }

      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [comp] = await tx
        .insert(schema.compensacoes)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          terceiroId: input.terceiroId,
          valor: String(valor),
          data: input.data || null,
          saldoRestituirAntes: String(saldoARestituir),
          saldoRepassarAntes: String(saldoARepassar),
          obs: input.obs || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      // Abate os dois lados pelo mesmo valor, do mais antigo para o mais novo.
      let restante = valor;
      for (const o of obrigacoes) {
        if (restante <= 0.004) break;
        const saldo = Number(o.valorTotal) - Number(o.valorRestituido);
        if (saldo <= 0.004) continue;
        const abate = Math.min(saldo, restante);
        restante = Math.round((restante - abate) * 100) / 100;
        const novo = Number(o.valorRestituido) + abate;
        await tx
          .update(schema.despesaTerceiros)
          .set({
            valorRestituido: String(novo),
            status: statusRestituicao(Number(o.valorTotal), novo),
            obs: `${o.obs ?? ""}${o.obs ? " · " : ""}Compensado em ${numDoc}`,
          })
          .where(eq(schema.despesaTerceiros.id, o.id));
      }
      restante = valor;
      for (const r of recebimentos) {
        if (restante <= 0.004) break;
        const saldo = Number(r.valorTotal) - Number(r.valorRepassado);
        if (saldo <= 0.004) continue;
        const abate = Math.min(saldo, restante);
        restante = Math.round((restante - abate) * 100) / 100;
        const novo = Number(r.valorRepassado) + abate;
        await tx
          .update(schema.recebimentosTerceiros)
          .set({
            valorRepassado: String(novo),
            status:
              novo + 0.01 >= Number(r.valorTotal)
                ? "Repassado"
                : "Parcialmente repassado",
            obs: `${r.obs ?? ""}${r.obs ? " · " : ""}Compensado em ${numDoc}`,
          })
          .where(eq(schema.recebimentosTerceiros.id, r.id));
      }

      // Nenhum lançamento de caixa: compensar não move dinheiro.
      return { id: comp.id, numDoc, valor, saldoARestituir, saldoARepassar };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "compensacao.create",
      entity: "compensacao",
      entityId: out.id,
      meta: {
        numDoc: out.numDoc,
        valor: out.valor,
        saldoRestituirAntes: out.saldoARestituir,
        saldoRepassarAntes: out.saldoARepassar,
        // Explícito no log: RG-05 — compensação não transita pela DRE.
        impactoDre: 0,
        impactoCaixa: 0,
      },
    });
    revalidatePath("/restituicoes");
    return { ok: true, compensacaoId: out.id, numDoc: out.numDoc, valor: out.valor };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao compensar os saldos.",
    };
  }
}
```
