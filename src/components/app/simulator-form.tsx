"use client";

import { useMemo, useState } from "react";
import { simulate, validarSimulacao, MAX_PARCELAS, TAXA_MENSAL_PADRAO, type FinancingType, type InccRow, type Reforco, type SimulatorInput } from "@/lib/calc";
import { brl0, brl } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface ClienteParaSimular {
  id: string;
  nome: string;
  /** Só chega quando o usuário tem `clientesdados:ver` (BN-3); senão a lista vem sem renda. */
  renda: number | null;
}

/**
 * Simulador de unidade — tela (Prompt N, seções 3 e 4). Calculadora: nada é
 * gravado. Abre VAZIA (3.2); a taxa de juros é campo (BN-2, premissa mensal);
 * cada reforço tem o mês (2.7); a renda pode vir do cadastro para quem tem a
 * permissão de dados sensíveis (BN-3) — a página decide o que chega aqui.
 */
const hojeISO = () => new Date().toISOString().slice(0, 10);
const num = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(",", ".")));
const intOuNaN = (v: string) => (v.trim() === "" ? 0 : Number(v));

type ReforcoTexto = { valor: string; mes: string };
const vazio = (mes: number): ReforcoTexto => ({ valor: "", mes: String(mes) });
const reforco = (r: ReforcoTexto): Reforco => ({ valor: num(r.valor), mes: intOuNaN(r.mes) });

export function SimulatorForm({ incc, obra, janelaObra, clientes, podeVerRenda }: { incc: InccRow[]; obra: { nome: string; variante: string | null }; janelaObra: { inicio: string; fim: string } | null; clientes: ClienteParaSimular[]; podeVerRenda: boolean }) {
  const [tipo, setTipo] = useState<FinancingType>("SAC");
  const [valorImovel, setValorImovel] = useState("");
  const [entrada, setEntrada] = useState("");
  const [s1, setS1] = useState<ReforcoTexto>(vazio(2));
  const [s2, setS2] = useState<ReforcoTexto>(vazio(3));
  const [s3, setS3] = useState<ReforcoTexto>(vazio(4));
  const [anual1, setAnual1] = useState<ReforcoTexto>(vazio(12));
  const [anual2, setAnual2] = useState<ReforcoTexto>(vazio(24));
  const [fgts, setFgts] = useState<ReforcoTexto>(vazio(1));
  const [subsidio, setSubsidio] = useState<ReforcoTexto>(vazio(1));
  const [mensais, setMensais] = useState("");
  const [financiamento, setFinanciamento] = useState("");
  const [renda, setRenda] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [taxa, setTaxa] = useState(String(TAXA_MENSAL_PADRAO * 100));
  const [dataInicio, setDataInicio] = useState(hojeISO());

  const input: SimulatorInput = useMemo(
    () => ({
      tipo,
      valorImovel: num(valorImovel),
      entrada: num(entrada),
      s1: reforco(s1),
      s2: reforco(s2),
      s3: reforco(s3),
      anual1: reforco(anual1),
      anual2: reforco(anual2),
      mensais: intOuNaN(mensais),
      fgts: reforco(fgts),
      subsidio: reforco(subsidio),
      financiamento: num(financiamento),
      renda: num(renda),
      dataInicio,
      taxaMensal: num(taxa) / 100,
      janelaObra,
    }),
    [tipo, valorImovel, entrada, s1, s2, s3, anual1, anual2, mensais, fgts, subsidio, financiamento, renda, dataInicio, taxa, janelaObra],
  );
  const erros = useMemo(() => validarSimulacao(input), [input]);
  const preenchido = input.valorImovel > 0 && input.mensais > 0;
  const result = useMemo(() => (preenchido && erros.length === 0 ? simulate(input, incc) : null), [input, incc, preenchido, erros]);

  const escolherCliente = (id: string) => {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (c && c.renda != null) setRenda(String(c.renda));
  };

  const campoReforco = (rotulo: string, r: ReforcoTexto, set: (v: ReforcoTexto) => void) => (
    <div className="grid grid-cols-[1fr_72px] gap-2" key={rotulo}>
      <div>
        <Label>{rotulo}</Label>
        <Input type="number" min="0" step="0.01" value={r.valor} onChange={(e) => set({ ...r, valor: e.target.value })} placeholder="0" />
      </div>
      <div>
        <Label>mês</Label>
        <Input type="number" min="1" step="1" value={r.mes} onChange={(e) => set({ ...r, mes: e.target.value })} aria-label={`Mês de ${rotulo}`} />
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {/* Entradas */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[11.5px] leading-snug text-[var(--color-ink3)]">
            Tabela INCC da obra <strong className="text-[var(--color-ink)]">{obra.nome}</strong> ({incc.length} meses{obra.variante ? `, ${obra.variante}` : ", variante a confirmar"}).
            Nada é gravado: esta tela é uma calculadora.
          </p>
          <div>
            <Label>Tipo de financiamento</Label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as FinancingType)}>
              <option value="SAC">SAC</option>
              <option value="PRICE">PRICE</option>
              <option value="SBPE">SBPE</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Data da 1ª parcela</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <Label>Juros ao mês % (premissa)</Label>
              <Input type="number" min="0" step="0.01" value={taxa} onChange={(e) => setTaxa(e.target.value)} aria-label="Juros ao mês" />
            </div>
          </div>
          <div>
            <Label>Valor do imóvel</Label>
            <Input type="number" min="0" step="0.01" value={valorImovel} onChange={(e) => setValorImovel(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Entrada (mês 1)</Label>
            <Input type="number" min="0" step="0.01" value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="0" />
          </div>
          {campoReforco("Sinal 1", s1, setS1)}
          {campoReforco("Sinal 2", s2, setS2)}
          {campoReforco("Sinal 3", s3, setS3)}
          {campoReforco("Anual 1", anual1, setAnual1)}
          {campoReforco("Anual 2", anual2, setAnual2)}
          {campoReforco("FGTS", fgts, setFgts)}
          {campoReforco("Subsídio", subsidio, setSubsidio)}
          <div>
            <Label>Nº de mensais (até {MAX_PARCELAS})</Label>
            <Input type="number" min="1" step="1" value={mensais} onChange={(e) => setMensais(e.target.value)} placeholder="ex.: 90" />
          </div>
          <div>
            <Label>Financiamento</Label>
            <Input type="number" min="0" step="0.01" value={financiamento} onChange={(e) => setFinanciamento(e.target.value)} placeholder="0" />
          </div>
          {clientes.length > 0 && (
            <div>
              <Label>Cliente (opcional)</Label>
              <Select value={clienteId} onChange={(e) => escolherCliente(e.target.value)}>
                <option value="">— sem cliente —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
              {!podeVerRenda && <p className="mt-1 text-[11px] text-[var(--color-ink3)]">A renda do cadastro só é puxada para quem tem a permissão de dados financeiros do cliente; digite abaixo.</p>}
            </div>
          )}
          <div>
            <Label>Renda mensal</Label>
            <Input type="number" min="0" step="0.01" value={renda} onChange={(e) => setRenda(e.target.value)} placeholder="0" />
          </div>
          {erros.length > 0 && preenchido && (
            <ul role="alert" className="list-disc rounded-[8px] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-2 pl-6 text-[12px] text-[var(--color-danger)]">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Resultados */}
      <div className="space-y-4">
        {!result ? (
          <Card>
            <CardContent className="p-6 text-sm text-[var(--color-ink3)]">
              {preenchido ? "Corrija os campos marcados para ver o fluxo." : "Informe o valor do imóvel e o número de mensais para simular. A tela abre vazia: nenhum número aqui é de cliente real."}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Entrada efetiva" value={brl0(result.entradaEfetiva)} sub={`${result.pctEntrada.toFixed(1)}% do imóvel`} />
              <Kpi label="Recursos futuros" value={brl0(result.totalRecursosFuturos)} sub={result.recursosFuturos.map((r) => `${r.nome} m${r.mes}`).join(" · ") || "—"} />
              <Kpi label="Financiamento" value={brl0(result.financiamento)} />
              <Kpi label="Saldo parcelado" value={brl0(result.saldoMensal)} sub={`${result.meses.length} parcelas · base ${brl0(result.parcMensal)}`} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
              <span className="text-[var(--color-ink3)]">
                Maior parcela <strong className="text-[var(--color-ink)]">{brl(result.maiorParcela)}</strong> (mês {result.mesDaMaiorParcela}) × limite de 30% da renda{" "}
                <strong className="text-[var(--color-ink)]">{brl(result.maxParcela)}</strong>:
              </span>
              <Badge tone={result.dentroLimite ? "success" : "danger"}>{result.dentroLimite ? "dentro do limite" : "acima do limite"}</Badge>
            </div>

            <div className="max-h-[520px] overflow-auto rounded-[12px] border border-[var(--color-line)]">
              <Table>
                <THead>
                  <tr className="sticky top-0 z-10 bg-[var(--color-surface2)]">
                    <TH>#</TH>
                    <TH>Mês</TH>
                    <TH className="text-right">Obra % {result.origemDaEvolucao === "premissa" ? "(premissa)" : "(janela da obra)"}</TH>
                    <TH className="text-right">INCC ac. %</TH>
                    <TH className="text-right">Parcela base</TH>
                    <TH className="text-right">Correção</TH>
                    <TH className="text-right">Parcela</TH>
                    <TH className="text-right">Reforço</TH>
                    <TH className="text-right">Total</TH>
                  </tr>
                </THead>
                <tbody>
                  {result.meses.map((m) => (
                    <TR key={m.n} className={m.n === result.mesDaMaiorParcela ? "bg-[var(--color-warning)]/[0.06]" : undefined}>
                      <TD className="font-[family-name:var(--font-mono)]">{m.n}</TD>
                      <TD className="font-[family-name:var(--font-mono)]">{m.mm}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{m.evolucao.toFixed(0)}%</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{m.inccAc.toFixed(2)}%</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(m.parcBase)}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{m.correcao > 0 ? brl0(m.correcao) : "—"}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(m.parcTotal)}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)]">{m.especial > 0 ? brl0(m.especial) : "—"}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">{brl0(m.total)}</TD>
                    </TR>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-[var(--color-surface2)] text-[13px]">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 font-medium text-[var(--color-ink)]">
                      Total pago {brl0(result.totalPago)}
                    </td>
                    <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">corr. {brl0(result.totalCorrecao)}</td>
                    <td colSpan={3} className="px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      juros {brl0(result.totalJuros)}
                    </td>
                  </tr>
                </tfoot>
              </Table>
            </div>
            <p className="text-[11.5px] leading-snug text-[var(--color-ink3)]">
              {result.origemDaEvolucao === "premissa"
                ? "Obra %: premissa linear ao longo das parcelas — não é medição. Cadastre início e fim da obra em Projetos para derivar da janela."
                : "Obra %: derivado da janela da obra cadastrada (início e fim), linear — não é medição."}{" "}
              Juros: premissa mensal, não taxa de contrato. Correção INCC a partir da 5ª parcela, pelo acumulado do mês, nos três tipos.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">{label}</p>
        <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-[var(--color-ink3)]">{sub}</p>}
      </CardContent>
    </Card>
  );
}
