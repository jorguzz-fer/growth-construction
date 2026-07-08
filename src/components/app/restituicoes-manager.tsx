"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarDespesaTerceiro,
  registrarRestituicao,
  type DespesaTerceiroView,
} from "@/lib/actions/restituicoes";
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
  const [sel, setSel] = useState<DespesaTerceiroView | null>(null);
  const [filtro, setFiltro] = useState("");

  const submit = (fd: FormData) => {
    setError(null);
    start(async () => {
      try {
        await criarDespesaTerceiro(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao registrar.");
      }
    });
  };

  const filtrados = filtro ? rows.filter((r) => r.status === filtro) : rows;

  return (
    <div className="space-y-6">
      {canCriar && (
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Nova despesa paga por terceiro
            </h2>
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
                <Select name="fornecedorId" defaultValue="">
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
                <Select name="categoriaDre" defaultValue={categorias[1] ?? "Custo Variável"}>
                  {categorias.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Conta CEF (opcional)</Label>
                <Select name="contaCef" defaultValue="">
                  <option value="">—</option>
                  {contas.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Valor</Label>
                <Input name="valor" type="number" step="0.01" placeholder="0" required />
              </div>
              <div>
                <Label>Competência</Label>
                <MonthField name="competencia" />
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
                  {saving ? "Registrando…" : "Registrar despesa por terceiro"}
                </Button>
              </div>
            </form>
            <p className="mt-2 text-[11.5px] text-[var(--color-ink3)]">
              A despesa entra na DRE 1× (competência/categoria); NÃO há saída de
              caixa agora. A saída ocorre só quando você registrar a restituição.
            </p>
            {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Label className="mb-0">Filtrar status:</Label>
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 w-auto">
          <option value="">Todos</option>
          <option>Aguardando restituição</option>
          <option>Parcialmente restituído</option>
          <option>Restituído</option>
          <option>Cancelado</option>
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
              <TD><Badge tone={statusTone(r.status)}>{r.status}</Badge></TD>
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

  const confirmar = () => {
    setError(null);
    start(async () => {
      try {
        await registrarRestituicao({
          despesaTerceiroId: dt.id,
          valor: Number(f.valor) || 0,
          dataRestituicao: f.dataRestituicao,
          bankAccountId: f.bankAccountId || null,
          comprovante: f.comprovante,
          obs: f.obs,
        });
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao registrar restituição.");
      }
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
