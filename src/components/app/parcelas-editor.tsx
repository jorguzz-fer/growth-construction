"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ajustarNaUltimaParcela,
  chequesDuplicados,
  diferencaFechamento,
  gerarParcelasMensais,
  parcelamentoFecha,
  preencherSequenciaCheques,
  statusDisponiveis,
  totalDasParcelas,
  FORMAS_PAGAMENTO,
} from "@/lib/calc";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField } from "@/components/ui/date-field";

export interface ParcelaEditavel {
  vencimento: string;
  valor: string;
  forma: string;
  bancoContaId: string;
  numeroCheque: string;
  emitenteCheque: string;
  dataEmissaoCheque: string;
  dataBomPara: string;
  status: string;
}

interface Banco {
  id: string;
  banco: string;
  tipo: string;
}

/** Linha vazia, já herdando o banco e a forma do cabeçalho (item 2.2). */
export function parcelaVazia(
  formaPadrao: string,
  bancoPadrao: string,
  emitentePadrao: string,
): ParcelaEditavel {
  return {
    vencimento: "",
    valor: "",
    forma: formaPadrao,
    bancoContaId: bancoPadrao,
    numeroCheque: "",
    emitenteCheque: emitentePadrao,
    dataEmissaoCheque: "",
    dataBomPara: "",
    status: "Pendente",
  };
}

/**
 * Tela auxiliar de parcelas — item 2.1 do pacote de Controladoria.
 *
 * A grade antiga tinha três colunas (#, vencimento, valor) e vivia espremida
 * dentro do formulário. Não dava para registrar um talão de cheques real: a
 * numeração é salteada, cada parcela costuma ser um cheque diferente, e o
 * emitente pode ser de terceiro.
 *
 * Aqui a parcela é a unidade de trabalho. Cada linha carrega sua forma de
 * pagamento, seu cheque e seu status — e o banco/conta vem herdado do
 * cabeçalho do lançamento, só sendo editado na exceção.
 *
 * O painel é modal de propósito: configurar parcelas é uma tarefa em si, com
 * dezenas de campos, e disputar espaço com o resto do formulário é o que
 * tornava a grade antiga inutilizável.
 */
export function ParcelasEditor({
  aberto,
  parcelas,
  valorTotal,
  bancos,
  formaPadrao,
  bancoPadrao,
  emitentePadrao,
  dataBase,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  parcelas: ParcelaEditavel[];
  /** Total declarado no cabeçalho. Vazio/zero = modo bottom-up. */
  valorTotal: string;
  bancos: Banco[];
  formaPadrao: string;
  bancoPadrao: string;
  emitentePadrao: string;
  /** Vencimento do cabeçalho — base para gerar a série. */
  dataBase: string;
  onFechar: () => void;
  /** Devolve as parcelas e o total que o cabeçalho deve passar a exibir. */
  onConfirmar: (parcelas: ParcelaEditavel[], totalDasParcelas: number) => void;
}) {
  const [linhas, setLinhas] = useState<ParcelaEditavel[]>(parcelas);
  const [qtd, setQtd] = useState("2");
  const [diaVenc, setDiaVenc] = useState("");
  const [chequeInicial, setChequeInicial] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reabrir o painel recarrega o estado de fora — evita editar uma cópia velha.
  useEffect(() => {
    if (aberto) {
      setLinhas(parcelas.length > 0 ? parcelas : []);
      setAviso(null);
    }
  }, [aberto, parcelas]);

  // Esc fecha; foco entra no painel ao abrir.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto, onFechar]);

  const total = Number(valorTotal) || 0;
  const soma = totalDasParcelas(linhas.map((l) => ({ valor: Number(l.valor) || 0 })));
  // Modo BOTTOM-UP: sem total no cabeçalho, o total do pedido É a soma das
  // parcelas. Nesse caso não existe divergência a apontar (item 2.3).
  const bottomUp = total <= 0;
  const fecha =
    bottomUp ||
    parcelamentoFecha(total, linhas.map((l) => ({ valor: Number(l.valor) || 0 })));
  const diferenca = bottomUp
    ? 0
    : diferencaFechamento(total, linhas.map((l) => ({ valor: Number(l.valor) || 0 })));

  const temCheque = linhas.some((l) => l.forma === "Cheque");
  const duplicados = useMemo(
    () =>
      chequesDuplicados(
        linhas.map((l) => ({
          bancoContaId: l.bancoContaId || null,
          numeroCheque: l.numeroCheque || null,
          forma: l.forma,
        })),
      ),
    [linhas],
  );

  const set = (i: number, patch: Partial<ParcelaEditavel>) =>
    setLinhas((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  /** Modo TOP-DOWN: distribui o total em N parcelas mensais (item 2.3). */
  const gerar = () => {
    const n = Math.max(1, Number(qtd) || 1);
    if (!dataBase) {
      setAviso("Informe o vencimento no cabeçalho — ele é a data-base da série.");
      return;
    }
    setAviso(null);
    const dia = Number(diaVenc) > 0 ? Number(diaVenc) : undefined;
    // Sem total declarado, gera as datas e deixa os valores em branco para o
    // usuário preencher (bottom-up).
    const base = gerarParcelasMensais(total > 0 ? total : 0, n, dataBase, dia);
    setLinhas(
      base.map((p) => ({
        ...parcelaVazia(formaPadrao, bancoPadrao, emitentePadrao),
        vencimento: p.vencimento,
        valor: total > 0 ? String(p.valor) : "",
        // Cheque pré-datado é apresentado na data combinada: "bom para" nasce
        // igual ao vencimento e continua editável.
        dataBomPara: formaPadrao === "Cheque" ? p.vencimento : "",
      })),
    );
  };

  const adicionar = () =>
    setLinhas((s) => [...s, parcelaVazia(formaPadrao, bancoPadrao, emitentePadrao)]);

  const duplicar = (i: number) =>
    setLinhas((s) => [
      ...s.slice(0, i + 1),
      // O número do cheque NÃO é copiado: dois cheques com o mesmo número é
      // exatamente o erro que a duplicação facilitaria.
      { ...s[i], numeroCheque: "" },
      ...s.slice(i + 1),
    ]);

  const remover = (i: number) => setLinhas((s) => s.filter((_, j) => j !== i));

  const ajustarUltima = () => {
    const ajustado = ajustarNaUltimaParcela(
      total,
      linhas.map((l) => ({ ...l, valor: Number(l.valor) || 0 })),
    );
    setLinhas(ajustado.map((l) => ({ ...l, valor: String(l.valor) })));
  };

  const preencherCheques = () => {
    if (!chequeInicial.trim()) {
      setAviso("Informe o número do primeiro cheque.");
      return;
    }
    setAviso(null);
    const nums = preencherSequenciaCheques(chequeInicial, linhas.length);
    setLinhas((s) => s.map((l, i) => (l.forma === "Cheque" ? { ...l, numeroCheque: nums[i] } : l)));
  };

  if (!aberto) return null;

  return (
    <div
      onClick={onFechar}
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-6"
    >
      <Card
        className="my-auto w-full max-w-6xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <CardContent className="p-5">
          <div ref={dialogRef} tabIndex={-1} className="outline-none">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                Configurar parcelas
              </h2>
              <p className="mt-0.5 text-[12.5px] text-[var(--color-ink3)]">
                {bottomUp
                  ? "Sem total no cabeçalho: o total do pedido será a soma das parcelas."
                  : `Total do pedido ${brl0(total)} — distribua entre as parcelas.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="rounded-[6px] px-2 py-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"
            >
              ✕
            </button>
          </div>

          {/* Geração em série */}
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[8px] border border-[var(--color-accent2)]/15 bg-[var(--color-surface2)]/50 p-3">
            <div className="w-24">
              <Label>Nº de parcelas</Label>
              <Input type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} />
            </div>
            <div className="w-28">
              <Label>Vencer todo dia</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={diaVenc}
                onChange={(e) => setDiaVenc(e.target.value)}
                placeholder="do venc."
              />
            </div>
            <Button type="button" variant="outline" onClick={gerar}>
              Gerar parcelas
            </Button>
            <span className="text-[11.5px] text-[var(--color-ink3)]">
              Dia 31 cai no último dia dos meses curtos (30/04, 28/02) sem
              deslocar os meses seguintes.
            </span>
          </div>

          {/* Sequência de cheques */}
          {temCheque && (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[8px] border border-[var(--color-accent2)]/15 p-3">
              <div className="w-40">
                <Label>Nº do 1º cheque</Label>
                <Input
                  value={chequeInicial}
                  onChange={(e) => setChequeInicial(e.target.value)}
                  placeholder="000450"
                />
              </div>
              <Button type="button" variant="outline" onClick={preencherCheques}>
                Preencher sequência
              </Button>
              <span className="text-[11.5px] text-[var(--color-ink3)]">
                Preenche a partir do número informado. Toda linha continua
                editável — talão salteado é o normal.
              </span>
            </div>
          )}

          {aviso && (
            <p className="mb-3 text-sm text-[var(--color-warning)]">{aviso}</p>
          )}

          {/* Grade */}
          <div className="tbl-scroll overflow-x-auto rounded-[8px] border border-[var(--color-accent2)]/15">
            <table className="w-full border-collapse text-[13px]" style={{ minWidth: "62rem" }}>
              <thead className="bg-[var(--color-surface2)]">
                <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  <th className="px-2 py-2 w-8">#</th>
                  <th className="px-2 py-2 w-36">Vencimento</th>
                  <th className="px-2 py-2 w-32">Valor</th>
                  <th className="px-2 py-2 w-40">Forma</th>
                  <th className="px-2 py-2 w-28">Nº cheque</th>
                  <th className="px-2 py-2 w-40">Emitente</th>
                  <th className="px-2 py-2 w-44">Banco / conta</th>
                  <th className="px-2 py-2 w-36">Status</th>
                  <th className="px-2 py-2 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const ehCheque = l.forma === "Cheque";
                  const dup =
                    ehCheque && !!l.numeroCheque && duplicados.includes(l.numeroCheque.trim());
                  return (
                    <tr key={i} className="border-t border-[var(--color-accent2)]/10">
                      <td className="px-2 py-1.5 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {i + 1}
                      </td>
                      <td className="px-2 py-1.5">
                        <DateField
                          value={l.vencimento}
                          onChange={(v) =>
                            set(i, {
                              vencimento: v,
                              // "Bom para" acompanha o vencimento enquanto o
                              // usuário não o editar por conta própria.
                              dataBomPara:
                                ehCheque && (!l.dataBomPara || l.dataBomPara === l.vencimento)
                                  ? v
                                  : l.dataBomPara,
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <MoneyInput value={l.valor} onChange={(v) => set(i, { valor: v })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Select
                          value={l.forma}
                          onChange={(e) => {
                            const forma = e.target.value;
                            // Trocar a forma reposiciona o status: cheque tem
                            // ciclo próprio e "Pago" não existe nele.
                            const permitidos = statusDisponiveis(forma);
                            set(i, {
                              forma,
                              status: permitidos.includes(l.status) ? l.status : "Pendente",
                              numeroCheque: forma === "Cheque" ? l.numeroCheque : "",
                              dataBomPara: forma === "Cheque" ? l.dataBomPara || l.vencimento : "",
                            });
                          }}
                        >
                          <option value="">—</option>
                          {FORMAS_PAGAMENTO.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={l.numeroCheque}
                          disabled={!ehCheque}
                          onChange={(e) => set(i, { numeroCheque: e.target.value })}
                          placeholder={ehCheque ? "000450" : "—"}
                          className={
                            dup ? "border-[var(--color-warning)] bg-[var(--color-warning)]/10" : ""
                          }
                          title={dup ? "Nº repetido nesta mesma conta — confira" : undefined}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={l.emitenteCheque}
                          disabled={!ehCheque}
                          onChange={(e) => set(i, { emitenteCheque: e.target.value })}
                          placeholder={ehCheque ? "razão social" : "—"}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Select
                          value={l.bancoContaId}
                          onChange={(e) => set(i, { bancoContaId: e.target.value })}
                        >
                          <option value="">—</option>
                          {bancos.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.banco} · {b.tipo}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Select value={l.status} onChange={(e) => set(i, { status: e.target.value })}>
                          {statusDisponiveis(l.forma).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => duplicar(i)}
                          className="mr-2 text-[12px] text-[var(--color-accent2)] hover:underline"
                          title="Duplicar esta linha"
                        >
                          Duplicar
                        </button>
                        <button
                          type="button"
                          onClick={() => remover(i)}
                          className="text-[12px] text-[var(--color-danger)] hover:underline"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-[var(--color-ink4)]">
                      Nenhuma parcela ainda. Gere uma série acima ou adicione linha a linha.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={adicionar}
            className="mt-2 text-[12.5px] text-[var(--color-accent2)] hover:underline"
          >
            + Adicionar parcela
          </button>

          {duplicados.length > 0 && (
            <p className="mt-3 rounded-[8px] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-2.5 text-[12.5px] text-[var(--color-ink2)]">
              Cheque repetido na mesma conta: <strong>{duplicados.join(", ")}</strong>. É só um
              aviso — talões de contas diferentes podem repetir numeração.
            </p>
          )}

          {/* Fechamento — item 2.6 */}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--color-accent2)]/15 pt-3">
            <span className="font-[family-name:var(--font-mono)] text-[13px]">
              {linhas.length} parcela(s) · soma{" "}
              <strong className="text-[var(--color-ink)]">{brl0(soma)}</strong>
              {!bottomUp && (
                <>
                  {" "}
                  de <strong>{brl0(total)}</strong>
                </>
              )}
            </span>
            {!bottomUp && !fecha && (
              <>
                <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--color-danger)]">
                  Diferença {brl0(diferenca)}
                </span>
                <button
                  type="button"
                  onClick={ajustarUltima}
                  className="text-[12.5px] text-[var(--color-accent2)] hover:underline"
                >
                  Ajustar na última parcela
                </button>
              </>
            )}
            {fecha && linhas.length > 0 && (
              <span className="text-[13px] text-[var(--color-success)]">✓ fecha</span>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onFechar}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={linhas.length === 0 || !fecha}
                onClick={() => onConfirmar(linhas, soma)}
                title={
                  !fecha
                    ? "A soma das parcelas precisa bater com o total do pedido"
                    : undefined
                }
              >
                Aplicar {linhas.length} parcela(s)
              </Button>
            </div>
          </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
