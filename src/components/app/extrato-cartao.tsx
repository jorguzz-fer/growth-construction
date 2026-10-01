"use client";

import { useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { importarExtratoCartao, registrarEstorno, vincularCreditoAoEstorno } from "@/lib/actions/cartao-extrato";
import { parseSheet } from "@/lib/extrato-parse";
import type { Conferencia, CompraParaConferir, ItemDoExtrato } from "@/lib/calc/conferencia-cartao";
import { brl0, dateBR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Extrato do cartão (Prompt U, seção 5) e estorno (seção 6). A função é
 * CONFERÊNCIA, não lançamento: o arquivo é lido no navegador (mesmo leitor
 * do Caixa), o servidor guarda só o registro do extrato (sem duplicar, 5.3)
 * e a conferência é calculada em código puro. Compra sem lançamento vira
 * uma PROPOSTA (BU-2): o link abre /despesas já preenchido, e é lá que se
 * lança. Crédito do extrato vira estorno só por ação do usuário; crédito já
 * antecipado aparece como par (6.3).
 */
export function ExtratoCartao({ cartoes, cartaoId, conferencia, compras, projetos, canEditar }: { cartoes: { id: string; nome: string }[]; cartaoId: string | null; conferencia: Conferencia | null; compras: CompraParaConferir[]; projetos: { id: string; nome: string }[]; canEditar: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [estornoDe, setEstornoDe] = useState<{ itemId: string | null; valor: string; despesaId: string; data: string } | null>(null);
  const obra = projetos[0]?.id ?? "";

  async function subir(file: File) {
    setErro(null);
    setMsg(null);
    if (!cartaoId) return setErro("Escolha o cartão antes de subir o extrato.");
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });
      const res = parseSheet(aoa);
      // No extrato do cartão, a convenção é a inversa do extrato bancário: a
      // compra aparece como débito. Mantemos: positivo = compra, negativo = crédito.
      const itens = res.rows.map((r) => ({ data: r.data, descricao: r.descricao, valor: r.valor }));
      start(async () => {
        const r = await importarExtratoCartao({ cartaoId, itens });
        if (r.ok) setMsg(`${r.inseridos} lançamento(s) registrado(s); ${r.ignorados} já estavam (não duplicados); ${r.vinculados} crédito(s) reconhecido(s) como estorno antecipado.`);
        else setErro(r.error);
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    }
  }

  const propor = (i: ItemDoExtrato) => {
    const q = new URLSearchParams({ proj: obra, tab: "lancamentos", novo: "1", pf_valor: String(i.valor), pf_forma: "Cartão de crédito", pf_cartao: cartaoId ?? "", pf_data: i.data ?? "", pf_obs: i.descricao ?? "", pf_comp: i.data ? `${i.data.slice(0, 2)}/${i.data.slice(6)}` : "" });
    return `/despesas?${q.toString()}`;
  };

  return (
    <Card className="mt-6">
      <CardContent className="p-5">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Extrato do cartão — conferência</h2>
        <p className="mt-1 text-[12.5px] text-[var(--color-ink2)]">
          Suba o extrato (XLSX/CSV com colunas de data, descrição e valor; positivo = compra, negativo = crédito). Nada é lançado por aqui: a tela aponta o que está no cartão e não foi lançado, e o contrário. O lançamento acontece em Despesas.
        </p>
        <form method="get" action="/cartoes" className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label>Cartão</Label>
            <Select name="extrato" defaultValue={cartaoId ?? ""} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Cartão do extrato">
              <option value="">— escolha —</option>
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          {canEditar && cartaoId && (
            <div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
              <Button type="button" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
                {pending ? "Subindo…" : "Subir extrato"}
              </Button>
            </div>
          )}
        </form>
        {msg && <p className="mt-2 text-[12px] text-[var(--color-ink2)]" role="status">{msg}</p>}
        {erro && <p className="mt-2 text-[12px] text-[var(--color-danger)]" role="alert">{erro}</p>}

        {conferencia && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Bloco titulo="No extrato, sem lançamento" contador={conferencia.semLancamento.length} tom="danger" vazio="Tudo que o cartão cobrou está lançado.">
              {conferencia.semLancamento.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{dateBR(i.data)} · {i.descricao ?? "—"} · <strong>{brl0(i.valor)}</strong></span>
                  <Link href={propor(i)} className="text-[var(--color-accent2)] hover:underline">Lançar em Despesas →</Link>
                </li>
              ))}
            </Bloco>
            <Bloco titulo="Lançado, sem correspondência no extrato" contador={conferencia.semExtrato.length} tom="warning" vazio="Todo lançamento das faturas cobertas apareceu no extrato.">
              {conferencia.semExtrato.map((c) => (
                <li key={c.parcelaId}>
                  {c.numDoc ?? "sem PED"} · {c.descricao ?? "—"} · parcela {c.numero}/{c.total} · fatura {dateBR(c.faturaFechamento)} · <strong>{brl0(c.valor)}</strong>
                </li>
              ))}
            </Bloco>
            <Bloco titulo="Divergências de valor ou data" contador={conferencia.divergentes.length} tom="warning" vazio="Nenhum par com diferença.">
              {conferencia.divergentes.map((d) => (
                <li key={d.item.id}>
                  <Badge tone="warning">{d.motivo}</Badge> extrato {dateBR(d.item.data)} {brl0(d.item.valor)} × {d.compra.numDoc ?? "sem PED"} parcela {d.compra.numero}/{d.compra.total} fatura {dateBR(d.compra.faturaFechamento)} {brl0(d.compra.valor)}
                </li>
              ))}
            </Bloco>
            <Bloco titulo="Créditos e estornos" contador={conferencia.creditos.length} tom="info" vazio="Nenhum crédito no extrato.">
              {conferencia.creditos.map((c) => (
                <li key={c.item.id} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{dateBR(c.item.data)} · {c.item.descricao ?? "—"} · <strong>{brl0(c.item.valor)}</strong></span>
                    {c.estorno ? (
                      c.vinculado ? (
                        <Badge tone="success">estorno {c.estorno.origem === "antecipado" ? "antecipado" : "registrado"} · {c.estorno.numDoc ?? "sem PED"}</Badge>
                      ) : canEditar ? (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await vincularCreditoAoEstorno(c.estorno!.id, c.item.id); if (!r.ok) setErro(r.error); })}>
                          Reconhecer como o antecipado de {c.estorno.numDoc ?? "sem PED"}
                        </Button>
                      ) : null
                    ) : canEditar ? (
                      <Button size="sm" variant="ghost" onClick={() => setEstornoDe({ itemId: c.item.id, valor: String(Math.abs(c.item.valor)), despesaId: "", data: c.item.data ?? "" })}>
                        Registrar estorno
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </Bloco>
          </div>
        )}
        {conferencia && conferencia.casados.length > 0 && (
          <p className="mt-3 text-[11.5px] text-[var(--color-ink3)]">{conferencia.casados.length} lançamento(s) conferem com o extrato (mesma fatura, mesmo valor). Faturas cobertas: {conferencia.faturasCobertas.map(dateBR).join(", ")}.</p>
        )}

        {canEditar && cartaoId && (
          <div className="mt-4 rounded-[10px] border border-[var(--color-line)] p-3">
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Estorno {estornoDe?.itemId ? "do crédito do extrato" : "antecipado"}</h3>
            <p className="text-[11.5px] text-[var(--color-ink3)]">Quando você já sabe da devolução antes de o extrato chegar, registre aqui. O crédito reduz a fatura; a compra original não é apagada nem editada. Quando o crédito vier no extrato, ele é reconhecido como este estorno, sem contar duas vezes.</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="col-span-2">
                <Label>Compra</Label>
                <Select value={estornoDe?.despesaId ?? ""} onChange={(e) => setEstornoDe({ itemId: estornoDe?.itemId ?? null, valor: estornoDe?.valor ?? "", data: estornoDe?.data ?? "", despesaId: e.target.value })} aria-label="Compra estornada">
                  <option value="">— escolha a compra —</option>
                  {[...new Map(compras.map((c) => [c.despesaId, c])).values()].map((c) => (
                    <option key={c.despesaId} value={c.despesaId}>
                      {c.numDoc ?? "sem PED"} · {c.descricao ?? "—"} · {brl0(c.valor * (c.total || 1))}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Valor</Label>
                <Input type="number" step="0.01" min="0.01" value={estornoDe?.valor ?? ""} onChange={(e) => setEstornoDe({ itemId: estornoDe?.itemId ?? null, despesaId: estornoDe?.despesaId ?? "", data: estornoDe?.data ?? "", valor: e.target.value })} aria-label="Valor do estorno" />
              </div>
              <div>
                <Label>Data</Label>
                <DateField value={estornoDe?.data ?? ""} onChange={(v) => setEstornoDe({ itemId: estornoDe?.itemId ?? null, despesaId: estornoDe?.despesaId ?? "", valor: estornoDe?.valor ?? "", data: v })} />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                disabled={pending || !estornoDe?.despesaId}
                onClick={() => {
                  if (!estornoDe) return;
                  setErro(null);
                  start(async () => {
                    const r = await registrarEstorno({ cartaoId, despesaId: estornoDe.despesaId, valor: Number(estornoDe.valor), data: estornoDe.data, extratoItemId: estornoDe.itemId });
                    if (r.ok) {
                      setMsg(`Estorno registrado na fatura que fecha ${dateBR(r.faturaFechamento)}.`);
                      setEstornoDe(null);
                    } else setErro(r.error);
                  });
                }}
              >
                Registrar estorno
              </Button>
              {estornoDe?.itemId && (
                <Button size="sm" variant="ghost" onClick={() => setEstornoDe(null)}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Bloco({ titulo, contador, tom, vazio, children }: { titulo: string; contador: number; tom: "danger" | "warning" | "info"; vazio: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[var(--color-line)] p-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-ink)]">
        {titulo}
        {contador > 0 && <Badge tone={tom}>{contador}</Badge>}
      </div>
      {contador === 0 ? <p className="mt-1 text-[12px] text-[var(--color-ink4)]">{vazio}</p> : <ul className="mt-2 space-y-1.5 text-[12px] text-[var(--color-ink2)]">{children}</ul>}
    </div>
  );
}
