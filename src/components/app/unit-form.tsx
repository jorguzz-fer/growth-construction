"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcUnitTotal, type PaymentPlan, type UnitStatus } from "@/lib/calc";
import { saveUnit, deleteUnit, type SaveUnitInput } from "@/lib/actions/units";
import { brl0 } from "@/lib/utils";
import { saldoFecha, saldoFormatado } from "@/lib/unidade-exibicao";
import type { Alerta } from "@/lib/ai/campos";
import { CHAVE_PROPOSTA_UNIDADE, ROTULO_CAMPO_UNIDADE, type CampoUnidade, type PropostaGuardada } from "@/lib/ai/unidade-doc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { CampoIA, ResumoLeituraIA, SeloAlerta } from "@/components/ui/campo-ia";
import { avisoDeDiaInexistente } from "@/lib/plano-vencimento";

export interface UnitFormValue {
  id?: string;
  projetoId: string;
  itemType: "unidade" | "condominio";
  code: string;
  bloco: string;
  tipo: string;
  m2: string;
  andar: string;
  valor: string;
  status: UnitStatus;
  mesVenda: string;
  plan: PaymentPlan;
}

const n = (v: string) => (v === "" ? 0 : Number(v));

export function UnitForm({
  initial,
  projetos,
  propostaDoAssistente = false,
}: {
  initial: UnitFormValue;
  projetos: { id: string; nome: string }[];
  /** A tela foi aberta pelo assistente: ler a proposta guardada no navegador (6.3). */
  propostaDoAssistente?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<UnitFormValue>(initial);
  const plan = v.plan;
  // 6.3 / BJ-3 — proposta do assistente: preenche, marca campo a campo e PARA.
  // A origem vai na auditoria quando o usuário clicar em salvar (E, 4.2.3).
  const [origem, setOrigem] = useState<"formulario" | "assistente">("formulario");
  const [alertas, setAlertas] = useState<Partial<Record<CampoUnidade, Alerta>>>({});
  const [leitura, setLeitura] = useState<{ resumo: string; preenchidos: string[]; observacoes: string[] } | null>(null);
  const limparAlerta = (campo: CampoUnidade) =>
    setAlertas((a) => {
      if (!a[campo]) return a;
      const { [campo]: _fora, ...resto } = a;
      void _fora;
      return resto;
    });

  useEffect(() => {
    if (!propostaDoAssistente || initial.id) return;
    let guardada: PropostaGuardada | null = null;
    try {
      const bruto = window.sessionStorage.getItem(CHAVE_PROPOSTA_UNIDADE);
      guardada = bruto ? (JSON.parse(bruto) as PropostaGuardada) : null;
      window.sessionStorage.removeItem(CHAVE_PROPOSTA_UNIDADE);
    } catch {
      guardada = null;
    }
    if (!guardada?.proposta) {
      setError("A proposta do assistente não foi encontrada — descreva a venda de novo ou preencha à mão.");
      return;
    }
    const { proposta, projectId } = guardada;
    setV((s) => ({
      ...s,
      projetoId: projectId || s.projetoId,
      ...proposta.valores,
    }));
    setAlertas(proposta.alertas);
    setLeitura({ resumo: proposta.resumo, preenchidos: proposta.preenchidos, observacoes: proposta.observacoes });
    setOrigem("assistente");
  }, [propostaDoAssistente, initial.id]);

  const setPlan = (patch: Partial<PaymentPlan>) =>
    setV((s) => ({ ...s, plan: { ...s.plan, ...patch } }));
  // atualiza um campo de uma fonte
  const setSrc = <K extends keyof PaymentPlan>(
    key: K,
    field: string,
    value: unknown,
  ) =>
    setPlan({
      [key]: { ...(plan[key] as object), [field]: value },
    } as Partial<PaymentPlan>);

  const total = useMemo(
    () =>
      calcUnitTotal({
        code: v.code,
        status: v.status,
        valor: n(v.valor),
        ...plan,
      }),
    [v, plan],
  );
  const saldo = total - n(v.valor);
  // 3.4 — a mesma tolerância da lista (R$ 0,01), num helper só.
  const ok = v.status !== "Vendido" || saldoFecha(saldo);

  function submit() {
    setError(null);
    // Prompt A — a obra é sempre escolhida; nunca cai numa obra implícita.
    if (!v.projetoId) {
      setError("Escolha o projeto da unidade.");
      return;
    }
    const input: SaveUnitInput = {
      id: v.id,
      projectId: v.projetoId,
      itemType: v.itemType,
      code: v.code,
      bloco: v.bloco,
      tipo: v.tipo,
      m2: v.m2 ? n(v.m2) : undefined,
      andar: v.andar ? n(v.andar) : undefined,
      valor: n(v.valor),
      status: v.status,
      mesVenda: v.mesVenda,
      plan,
      origem,
    };
    start(async () => {
      try {
        // 5.1 — a action devolve { ok, error }; a mensagem aparece aqui, e o
        // sucesso fica visível na lista ("Unidade X salva").
        const r = await saveUnit(input);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        router.push(`/unidades?proj=${v.projetoId}&salva=${encodeURIComponent(r.code)}`);
      } catch {
        setError("Não foi possível salvar. Tente de novo.");
      }
    });
  }

  function remove() {
    if (!v.id) return;
    // §12 — exclusão física exige o código digitado; o servidor confere e
    // recusa com cliente, venda, contas a receber, documento ou permuta.
    const digitado = window.prompt(
      `Excluir a unidade "${v.code}"? Esta ação não pode ser desfeita.\n\nDigite o código da unidade para confirmar:`,
    );
    if (digitado === null) return;
    setError(null);
    start(async () => {
      try {
        const r = await deleteUnit(v.id!, digitado);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        router.push(`/unidades?proj=${v.projetoId}&excluida=${encodeURIComponent(v.code)}`);
      } catch {
        setError("Não foi possível excluir. Tente de novo.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {leitura && (
        <ResumoLeituraIA
          origem="Descrição da venda"
          titulo="Lançamento assistido"
          resumo={leitura.resumo}
          preenchidos={leitura.preenchidos}
          alertas={alertas as Record<string, Alerta>}
          rotulos={ROTULO_CAMPO_UNIDADE}
          observacoes={leitura.observacoes}
          onFechar={() => setAlertas({})}
        />
      )}
      {/* Dados básicos */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          <Field label="Projeto">
            <Select
              value={v.projetoId}
              onChange={(e) => setV({ ...v, projetoId: e.target.value })}
            >
              {!v.projetoId && (
                <option value="" disabled>
                  Selecione o projeto
                </option>
              )}
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo de cadastro">
            <Select
              value={v.itemType}
              onChange={(e) =>
                setV({ ...v, itemType: e.target.value as "unidade" | "condominio" })
              }
            >
              <option value="unidade">Unidade</option>
              <option value="condominio">Condomínio</option>
            </Select>
          </Field>
          <CampoIA label="Código" alerta={alertas.code}>
            <Input
              value={v.code}
              onChange={(e) => {
                limparAlerta("code");
                setV({ ...v, code: e.target.value });
              }}
            />
          </CampoIA>
          <CampoIA label="Bloco" alerta={alertas.bloco}>
            <Input
              value={v.bloco}
              onChange={(e) => {
                limparAlerta("bloco");
                setV({ ...v, bloco: e.target.value });
              }}
            />
          </CampoIA>
          <CampoIA label="Tipo" alerta={alertas.tipo}>
            <Input
              value={v.tipo}
              onChange={(e) => {
                limparAlerta("tipo");
                setV({ ...v, tipo: e.target.value });
              }}
            />
          </CampoIA>
          <CampoIA label="Status" alerta={alertas.status}>
            <Select
              value={v.status}
              onChange={(e) => {
                limparAlerta("status");
                setV({ ...v, status: e.target.value as UnitStatus });
              }}
            >
              <option>Disponivel</option>
              <option>Reservado</option>
              <option>Vendido</option>
              <option>Permutado</option>
            </Select>
          </CampoIA>
          <CampoIA label="m²" alerta={alertas.m2}>
            <Input
              type="number"
              value={v.m2}
              onChange={(e) => {
                limparAlerta("m2");
                setV({ ...v, m2: e.target.value });
              }}
            />
          </CampoIA>
          <CampoIA label="Andar" alerta={alertas.andar}>
            <Input
              type="number"
              value={v.andar}
              onChange={(e) => {
                limparAlerta("andar");
                setV({ ...v, andar: e.target.value });
              }}
            />
          </CampoIA>
          <CampoIA label="VGV (valor)" alerta={alertas.valor}>
            <Input
              type="number"
              value={v.valor}
              onChange={(e) => {
                limparAlerta("valor");
                setV({ ...v, valor: e.target.value });
              }}
            />
          </CampoIA>
          <CampoIA label="Data da venda" alerta={alertas.mesVenda}>
            <DateField
              value={v.mesVenda}
              onChange={(x) => {
                limparAlerta("mesVenda");
                setV({ ...v, mesVenda: x });
              }}
            />
          </CampoIA>
        </CardContent>
      </Card>

      {/* Total / saldo ao vivo */}
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--color-accent2)]/12 bg-white p-4">
        <span className="text-sm text-[var(--color-ink3)]">Total contratado:</span>
        <span className="font-[family-name:var(--font-mono)] font-semibold">{brl0(total)}</span>
        <span className="text-sm text-[var(--color-ink3)]">· Saldo vs VGV:</span>
        <Badge tone={ok ? "success" : "danger"}>{saldoFormatado(saldo)}</Badge>
        {v.status !== "Vendido" && (
          <span className="text-xs text-[var(--color-ink4)]">
            (o plano só projeta receita quando a unidade está &quot;Vendido&quot;)
          </span>
        )}
      </div>

      {/* Cascata do plano de pagamento */}
      {alertas.plano && (
        <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-[#92400e]">
          <span className="font-medium">Plano de pagamento</span>
          <SeloAlerta alerta={alertas.plano} />
          <span>{alertas.plano.motivo}</span>
        </p>
      )}
      <div className="space-y-2" onChangeCapture={() => limparAlerta("plano")}>
        <SourceGroup
          title="Ato de Assinatura (AS)"
          enabled={plan.usarAS}
          onToggle={(b) => setPlan({ usarAS: b })}
        >
          <Money label="Valor" value={plan.AS.val} onChange={(x) => setSrc("AS", "val", x)} />
          <Dt label="Vencimento" value={plan.AS.venc} onChange={(x) => setSrc("AS", "venc", x)} />
          <Num label="Parcelas" value={plan.AS.n} onChange={(x) => setSrc("AS", "n", x)} />
          <Flag label="Usar Sinal 1" value={plan.AS.usarS1} onChange={(b) => setSrc("AS", "usarS1", b)} />
        </SourceGroup>

        {(["S1", "S2", "S3"] as const).map((k, i) => {
          const nextFlag = (["usarS2", "usarS3", "usarMens"] as const)[i];
          const nextLabel = ["Usar Sinal 2", "Usar Sinal 3", "Usar Mensais"][i];
          const src = plan[k];
          return (
            <SourceGroup key={k} title={`Sinal ${i + 1} (${k})`}>
              <Money label="Valor" value={src.val} onChange={(x) => setSrc(k, "val", x)} />
              <Dt label="Vencimento" value={src.venc} onChange={(x) => setSrc(k, "venc", x)} />
              <Num label="Parcelas" value={src.n} onChange={(x) => setSrc(k, "n", x)} />
              <Flag
                label={nextLabel}
                value={(src as unknown as Record<string, boolean>)[nextFlag]}
                onChange={(b) => setSrc(k, nextFlag, b)}
              />
            </SourceGroup>
          );
        })}

        <SourceGroup title="Mensais" aviso={avisoDeDiaInexistente(plan.Mensais.venc, plan.Mensais.n, 1, "mensal")}>
          <Money label="Valor" value={plan.Mensais.val} onChange={(x) => setSrc("Mensais", "val", x)} />
          <Dt label="1º Vencimento" value={plan.Mensais.venc} onChange={(x) => setSrc("Mensais", "venc", x)} />
          <Num label="Parcelas" value={plan.Mensais.n} onChange={(x) => setSrc("Mensais", "n", x)} />
          <Flag label="Usar Semestrais" value={plan.Mensais.usarSem} onChange={(b) => setSrc("Mensais", "usarSem", b)} />
        </SourceGroup>
        <SourceGroup title="Semestrais" aviso={avisoDeDiaInexistente(plan.Semestrais.venc, plan.Semestrais.n, 6, "semestral")}>
          <Money label="Valor" value={plan.Semestrais.val} onChange={(x) => setSrc("Semestrais", "val", x)} />
          <Dt label="1º Vencimento" value={plan.Semestrais.venc} onChange={(x) => setSrc("Semestrais", "venc", x)} />
          <Num label="Parcelas" value={plan.Semestrais.n} onChange={(x) => setSrc("Semestrais", "n", x)} />
          <Flag label="Usar Anuais" value={plan.Semestrais.usarAnu} onChange={(b) => setSrc("Semestrais", "usarAnu", b)} />
        </SourceGroup>
        <SourceGroup title="Anuais" aviso={avisoDeDiaInexistente(plan.Anuais.venc, plan.Anuais.n, 12, "anual")}>
          <Money label="Valor" value={plan.Anuais.val} onChange={(x) => setSrc("Anuais", "val", x)} />
          <Dt label="1º Vencimento" value={plan.Anuais.venc} onChange={(x) => setSrc("Anuais", "venc", x)} />
          <Num label="Parcelas" value={plan.Anuais.n} onChange={(x) => setSrc("Anuais", "n", x)} />
          <Flag label="Usar FGTS" value={plan.Anuais.usarFGTS} onChange={(b) => setSrc("Anuais", "usarFGTS", b)} />
        </SourceGroup>
        <SourceGroup title="FGTS">
          <Money label="Valor" value={plan.FGTS.val} onChange={(x) => setSrc("FGTS", "val", x)} />
          <Dt label="Data prevista" value={plan.FGTS.dataPrev} onChange={(x) => setSrc("FGTS", "dataPrev", x)} />
          <Flag label="Usar Subsídio" value={plan.FGTS.usarSub} onChange={(b) => setSrc("FGTS", "usarSub", b)} />
        </SourceGroup>
        <SourceGroup title="Subsídio">
          <Money label="Valor" value={plan.Subsidio.val} onChange={(x) => setSrc("Subsidio", "val", x)} />
          <Dt label="Data prevista" value={plan.Subsidio.dataPrev} onChange={(x) => setSrc("Subsidio", "dataPrev", x)} />
          <Field label="Status subsídio">
            <Select
              value={plan.Subsidio.statusSub}
              onChange={(e) => setSrc("Subsidio", "statusSub", e.target.value)}
            >
              <option>Aguardando Caixa</option>
              <option>Recebido</option>
            </Select>
          </Field>
          <Flag label="Usar Permuta" value={plan.Subsidio.usarPer} onChange={(b) => setSrc("Subsidio", "usarPer", b)} />
        </SourceGroup>
        <SourceGroup title="Permuta">
          <Txt label="Descrição" value={plan.Permuta.desc} onChange={(x) => setSrc("Permuta", "desc", x)} />
          <Money label="Valor" value={plan.Permuta.val} onChange={(x) => setSrc("Permuta", "val", x)} />
          <Dt label="Data prevista" value={plan.Permuta.dataPrev} onChange={(x) => setSrc("Permuta", "dataPrev", x)} />
          <Flag label="Usar Financiamento" value={plan.Permuta.usarFinanc} onChange={(b) => setSrc("Permuta", "usarFinanc", b)} />
        </SourceGroup>
        <SourceGroup title="Financiamento Bancário">
          <Money label="Valor financiado" value={plan.Banco.valFinanc} onChange={(x) => setSrc("Banco", "valFinanc", x)} />
          <Dt label="Data entrada" value={plan.Banco.dataEntrada} onChange={(x) => setSrc("Banco", "dataEntrada", x)} />
          <Dt label="1ª parcela" value={plan.Banco.dataPrimParc} onChange={(x) => setSrc("Banco", "dataPrimParc", x)} />
          <Txt label="Status" value={plan.Banco.statusFinanc} onChange={(x) => setSrc("Banco", "statusFinanc", x)} />
        </SourceGroup>
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Salvando..." : "Salvar unidade"}
        </Button>
        <Button variant="ghost" onClick={() => router.push("/unidades")} disabled={pending}>
          Cancelar
        </Button>
        {v.id && (
          <button
            onClick={remove}
            disabled={pending}
            className="ml-auto text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
          >
            Excluir
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── subcomponentes ─────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Money({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(n(e.target.value))} />
    </Field>
  );
}
function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Input type="number" value={value} onChange={(e) => onChange(n(e.target.value))} />
    </Field>
  );
}
function Txt({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
function Dt({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <DateField value={value} onChange={onChange} />
    </Field>
  );
}
function Flag({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-5 flex items-center gap-2 text-[13px] text-[var(--color-ink2)]">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function SourceGroup({
  title,
  enabled,
  onToggle,
  aviso,
  children,
}: {
  title: string;
  enabled?: boolean;
  onToggle?: (b: boolean) => void;
  /** Prompt AN, 6.3 — dia de vencimento que não existe em algum mês da série. */
  aviso?: string | null;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-[12px] border border-[var(--color-accent2)]/12 bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--color-ink)]">
        {title}
        {aviso && (
          <span className="rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-[11px] font-normal text-[var(--color-ink2)]">
            vencimento a conferir
          </span>
        )}
        {onToggle && (
          <label
            className="ml-auto flex items-center gap-1.5 text-xs font-normal text-[var(--color-ink2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <input type="checkbox" checked={!!enabled} onChange={(e) => onToggle(e.target.checked)} />
            ativo
          </label>
        )}
      </summary>
      <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-accent2)]/8 p-4 sm:grid-cols-4">
        {children}
      </div>
      {aviso && (
        <p role="status" className="mx-4 mb-4 rounded-[8px] bg-[var(--color-warning)]/10 px-3 py-2 text-[12.5px] text-[var(--color-ink2)]">
          {aviso}
        </p>
      )}
    </details>
  );
}
