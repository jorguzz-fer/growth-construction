"use client";

import { useMemo, useState } from "react";
import { simulate, validarSimulacao, MAX_PARCELAS, TAXA_MENSAL_PADRAO, type FinancingType, type InccRow, type Reforco, type SimulatorInput } from "@/lib/calc";
import { brl0, brl } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { AssistenteSimulador } from "@/components/app/assistente-simulador";
import { CrisDaTela, useCrisFormulario } from "@/components/app/cris-contexto";
import {
  FORMULARIO_DA_PROPOSTA,
  dadosDoSimuladorParaCris,
  formularioDoSimulador,
  parametrosDaProposta,
  resumoDaProposta,
  type UnidadeParaSimular,
} from "@/lib/simulador-proposta";

export interface ClienteParaSimular {
  id: string;
  nome: string;
  /** Só chega quando o usuário tem `clientesdados:ver` (BN-3); senão a lista vem sem renda. */
  renda: number | null;
}

/**
 * Simulador de unidade (Prompt N; Prompt N2 devolve o caráter da planilha do
 * cliente). É o simulador de parcelamento que o vendedor usa ANTES de vender:
 * ato, sinais, anuais, mensais corrigidas pelo INCC, FGTS, subsídio e o
 * financiamento bancário nas chaves. Calculadora: nada é gravado (BN-1).
 *
 * N2: a tela volta ao jeito da planilha (cinco números, comprometimento de
 * renda em %, fluxo de sete colunas com a evolução da obra); os detalhes
 * técnicos ficam em "Detalhar". A proposta ao cliente sai em PDF, com o texto
 * que a Cris ajuda a escrever — sem renda nem limite, que são internos.
 */
const hojeISO = () => new Date().toISOString().slice(0, 10);
const num = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(",", ".")));
const intOuNaN = (v: string) => (v.trim() === "" ? 0 : Number(v));

type ReforcoTexto = { valor: string; mes: string };
type ChaveReforco = "s1" | "s2" | "s3" | "anual1" | "anual2" | "fgts" | "subsidio";
const vazio = (mes: number): ReforcoTexto => ({ valor: "", mes: String(mes) });
const reforco = (r: ReforcoTexto): Reforco => ({ valor: num(r.valor), mes: intOuNaN(r.mes) });
const MESES_PADRAO: Record<ChaveReforco, number> = { s1: 2, s2: 3, s3: 4, anual1: 12, anual2: 24, fgts: 1, subsidio: 1 };
const ROTULOS: Record<ChaveReforco, string> = { s1: "Sinal 1", s2: "Sinal 2", s3: "Sinal 3", anual1: "Anual 1", anual2: "Anual 2", fgts: "FGTS", subsidio: "Subsídio" };

export function SimulatorForm({
  incc,
  obra,
  janelaObra,
  clientes,
  podeVerRenda,
  usuario,
  unidades = [],
  empresa = "",
}: {
  incc: InccRow[];
  obra: { nome: string; variante: string | null };
  janelaObra: { inicio: string; fim: string } | null;
  clientes: ClienteParaSimular[];
  podeVerRenda: boolean;
  usuario: string;
  unidades?: UnidadeParaSimular[];
  empresa?: string;
}) {
  const [tipo, setTipo] = useState<FinancingType>("SAC");
  const [unidadeId, setUnidadeId] = useState("");
  const [valorImovel, setValorImovel] = useState("");
  const [entrada, setEntrada] = useState("");
  const [ref, setRef] = useState<Record<ChaveReforco, ReforcoTexto>>(() => Object.fromEntries(Object.entries(MESES_PADRAO).map(([k, m]) => [k, vazio(m)])) as Record<ChaveReforco, ReforcoTexto>);
  const [mensais, setMensais] = useState("");
  const [financiamento, setFinanciamento] = useState("");
  const [renda, setRenda] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [taxa, setTaxa] = useState(String(TAXA_MENSAL_PADRAO * 100));
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [detalhar, setDetalhar] = useState(false);
  // Proposta ao cliente (N2): nome digitado aqui fica só nesta tela.
  const [nomeNaProposta, setNomeNaProposta] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [validade, setValidade] = useState("7 dias");
  const [crisMsg, setCrisMsg] = useState<string | null>(null);

  const setReforco = (k: ChaveReforco, v: ReforcoTexto) => setRef((x) => ({ ...x, [k]: v }));

  const input: SimulatorInput = useMemo(
    () => ({
      tipo,
      valorImovel: num(valorImovel),
      entrada: num(entrada),
      s1: reforco(ref.s1),
      s2: reforco(ref.s2),
      s3: reforco(ref.s3),
      anual1: reforco(ref.anual1),
      anual2: reforco(ref.anual2),
      mensais: intOuNaN(mensais),
      fgts: reforco(ref.fgts),
      subsidio: reforco(ref.subsidio),
      financiamento: num(financiamento),
      renda: num(renda),
      dataInicio,
      taxaMensal: num(taxa) / 100,
      janelaObra,
    }),
    [tipo, valorImovel, entrada, ref, mensais, financiamento, renda, dataInicio, taxa, janelaObra],
  );
  const erros = useMemo(() => validarSimulacao(input), [input]);
  const preenchido = input.valorImovel > 0 && input.mensais > 0;
  const result = useMemo(() => (preenchido && erros.length === 0 ? simulate(input, incc) : null), [input, incc, preenchido, erros]);
  const unidade = unidades.find((u) => u.id === unidadeId) ?? null;
  const proposta = useMemo(() => (result ? resumoDaProposta(input, result) : null), [input, result]);
  const comJuros = tipo !== "SBPE";
  const pctRenda = result && input.renda > 0 ? (result.maiorParcela / input.renda) * 100 : null;

  const escolherCliente = (id: string) => {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (c && c.renda != null) setRenda(String(c.renda));
    if (c && !nomeNaProposta) setNomeNaProposta(c.nome);
  };
  const escolherUnidade = (id: string) => {
    setUnidadeId(id);
    const u = unidades.find((x) => x.id === id);
    if (u) setValorImovel(String(u.valor));
  };

  // N2 — o vendedor dita a simulação; a Cris preenche (sem renda nem cliente).
  useCrisFormulario(formularioDoSimulador(unidades), (p) => {
    const { parametros: q, avisos } = parametrosDaProposta(p.valores, unidades);
    if (q.unidadeId) setUnidadeId(q.unidadeId);
    if (q.tipo) setTipo(q.tipo);
    if (q.valorImovel) setValorImovel(q.valorImovel);
    if (q.ato) setEntrada(q.ato);
    if (q.mensais) setMensais(q.mensais);
    if (q.financiamento) setFinanciamento(q.financiamento);
    if (q.dataInicio) setDataInicio(q.dataInicio);
    if (q.juros) setTaxa(q.juros);
    if (q.reforcos)
      setRef((x) => {
        const n = { ...x };
        for (const [k, v] of Object.entries(q.reforcos!) as [ChaveReforco, { valor?: string; mes?: string }][]) n[k] = { valor: v.valor ?? x[k].valor, mes: v.mes ?? x[k].mes };
        return n;
      });
    setCrisMsg(["A Cris preencheu a simulação. Confira os números; a renda você digita.", ...avisos].join(" "));
  });
  useCrisFormulario(result ? FORMULARIO_DA_PROPOSTA : null, (p) => {
    if (p.valores.mensagem) setMensagem(p.valores.mensagem.slice(0, 1500));
    if (p.valores.validade) setValidade(p.valores.validade.slice(0, 40));
    setCrisMsg("A Cris escreveu o texto da proposta. Leia e ajuste antes de gerar o PDF.");
  });

  const imprimirProposta = () => {
    const antes = document.title;
    document.title = `Proposta ${unidade?.rotulo ?? obra.nome}`.slice(0, 80);
    document.body.dataset.imprimir = "proposta";
    const voltar = () => {
      document.title = antes;
      delete document.body.dataset.imprimir;
      window.removeEventListener("afterprint", voltar);
    };
    window.addEventListener("afterprint", voltar);
    window.print();
  };

  const campoReforco = (k: ChaveReforco) => (
    <div className="grid grid-cols-[1fr_64px] gap-2" key={k}>
      <div>
        <Label>{ROTULOS[k]}</Label>
        <Input type="number" min="0" step="0.01" value={ref[k].valor} onChange={(e) => setReforco(k, { ...ref[k], valor: e.target.value })} placeholder="0" aria-label={ROTULOS[k]} />
      </div>
      <div>
        <Label>mês</Label>
        <Input type="number" min="1" step="1" value={ref[k].mes} onChange={(e) => setReforco(k, { ...ref[k], mes: e.target.value })} aria-label={`Mês de ${ROTULOS[k]}`} />
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr] min-[1180px]:grid-cols-[320px_minmax(0,1fr)_300px] print:block">
      <CrisDaTela
        titulo={`Simulador de Unidade — ${obra.nome}`}
        dados={dadosDoSimuladorParaCris(input, result, { obra: obra.nome, unidade: unidade?.rotulo ?? null })}
        sugestoes={["Escreva o texto da proposta para o cliente", "Explique este fluxo em linguagem simples", "E se o ato for maior, quanto cai a mensal?", "Simule 90 mensais com ato de 30 mil"]}
      />
      {/* Parâmetros da simulação */}
      <Card data-fora-da-proposta>
        <CardContent className="space-y-3 p-5">
          <p className="rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[11.5px] leading-snug text-[var(--color-ink3)]">
            INCC da obra <strong className="text-[var(--color-ink)]">{obra.nome}</strong> ({incc.length} meses{obra.variante ? `, ${obra.variante}` : ""}). Nada é gravado: é uma simulação.
          </p>
          {crisMsg && (
            <p data-cris-preencheu role="status" className="text-[12px] text-[var(--color-accent)]">
              {crisMsg}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipo de financiamento</Label>
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as FinancingType)}>
                <option value="SAC">SAC</option>
                <option value="PRICE">PRICE</option>
                <option value="SBPE">SBPE</option>
              </Select>
            </div>
            <div>
              <Label>Data de início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} aria-label="Data da 1ª parcela" />
            </div>
          </div>
          {unidades.length > 0 && (
            <div>
              <Label>Unidade (opcional)</Label>
              <Select value={unidadeId} onChange={(e) => escolherUnidade(e.target.value)} aria-label="Unidade">
                <option value="">— digitar o valor —</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.rotulo} · {brl0(u.valor)}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Valor do imóvel</Label>
              <Input type="number" min="0" step="0.01" value={valorImovel} onChange={(e) => setValorImovel(e.target.value)} placeholder="0" aria-label="Valor do imóvel" />
            </div>
            <div>
              <Label>Renda familiar</Label>
              <Input type="number" min="0" step="0.01" value={renda} onChange={(e) => setRenda(e.target.value)} placeholder="0" aria-label="Renda familiar" />
            </div>
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
              {!podeVerRenda && <p className="mt-1 text-[11px] text-[var(--color-ink3)]">A renda do cadastro só é puxada para quem tem a permissão de dados financeiros do cliente; digite acima.</p>}
            </div>
          )}
          <div>
            <Label>Ato de assinatura</Label>
            <Input type="number" min="0" step="0.01" value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="0" aria-label="Ato de assinatura" />
          </div>
          {(["s1", "s2", "s3", "anual1", "anual2"] as const).map(campoReforco)}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Nº de mensais</Label>
              <Input type="number" min="1" max={MAX_PARCELAS} step="1" value={mensais} onChange={(e) => setMensais(e.target.value)} placeholder="ex.: 90" aria-label="Nº de mensais" />
            </div>
            <div>
              <Label>Financiamento banco</Label>
              <Input type="number" min="0" step="0.01" value={financiamento} onChange={(e) => setFinanciamento(e.target.value)} placeholder="0" aria-label="Financiamento bancário" />
            </div>
          </div>
          {(["fgts", "subsidio"] as const).map(campoReforco)}
          {comJuros && (
            <div>
              <Label>Juros ao mês % (premissa do {tipo})</Label>
              <Input type="number" min="0" step="0.01" value={taxa} onChange={(e) => setTaxa(e.target.value)} aria-label="Juros ao mês" />
            </div>
          )}
          {erros.length > 0 && preenchido && (
            <ul role="alert" className="list-disc rounded-[8px] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-2 pl-6 text-[12px] text-[var(--color-danger)]">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Resultado */}
      <div className="space-y-4">
        {!result || !proposta ? (
          <Card data-fora-da-proposta>
            <CardContent className="p-6 text-sm text-[var(--color-ink3)]">
              {preenchido ? "Corrija os campos marcados para ver o fluxo." : "Informe o valor do imóvel (ou escolha a unidade) e o número de mensais para simular. Pode também pedir à Cris: “simule 90 mensais com ato de 30 mil”."}
            </CardContent>
          </Card>
        ) : (
          <>
            <div data-fora-da-proposta className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-kpis-simulador>
                <Kpi label="Valor do imóvel" value={brl0(input.valorImovel)} />
                <Kpi label="Ato e sinais" value={brl0(result.entradaEfetiva)} sub={`${result.pctEntrada.toFixed(1)}% do imóvel`} />
                <Kpi label="Anuais, FGTS e subsídio" value={brl0(result.totalRecursosFuturos)} sub={result.recursosFuturos.map((r) => `${r.nome} m${r.mes}`).join(" · ") || "—"} />
                <Kpi label="Financiamento banco" value={brl0(result.financiamento)} sub="nas chaves" />
                <Kpi label="Saldo em mensais" value={brl0(result.saldoMensal)} sub={`${result.meses.length} × base ${brl0(result.parcMensal)}`} tom={input.renda > 0 && !result.dentroLimite ? "danger" : undefined} />
              </div>

              {input.renda > 0 && pctRenda != null && (
                <p role="status" className={`rounded-[10px] border px-3 py-2 text-[12.5px] ${result.dentroLimite ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/5" : "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5"}`} data-comprometimento>
                  Comprometimento de renda: <strong>{pctRenda.toFixed(1)}%</strong> (maior mensal {brl(result.maiorParcela)}, mês {result.mesDaMaiorParcela}){" "}
                  <Badge tone={result.dentroLimite ? "success" : "danger"}>{result.dentroLimite ? "dentro do limite de 30%" : "acima do limite de 30%"}</Badge>
                </p>
              )}

              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                  Fluxo de parcelas <Badge tone="accent">{tipo} · {result.meses.length} meses</Badge>
                </h2>
                <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-ink2)]">
                  <input type="checkbox" checked={detalhar} onChange={(e) => setDetalhar(e.target.checked)} data-detalhar /> Detalhar (base, correção e juros)
                </label>
              </div>
              <div className="max-h-[520px] overflow-auto rounded-[12px] border border-[var(--color-line)]">
                <TabelaDoFluxo result={result} detalhar={detalhar} />
              </div>
              <p className="text-[11.5px] leading-snug text-[var(--color-ink3)]">
                {result.origemDaEvolucao === "premissa" ? "Evolução da obra: linear ao longo das mensais (cadastre início e fim da obra em Projetos para usar a janela real)." : "Evolução da obra: pela janela da obra cadastrada, linear."} Mensais corrigidas pelo INCC
                acumulado do mês a partir da 5ª.{comJuros ? ` Juros de ${taxa}% ao mês: premissa, não taxa de contrato.` : ""}
              </p>
            </div>

            {/* N2 — a proposta para o cliente final: sai em PDF, sem renda nem limite. */}
            <Card data-proposta>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">{empresa}</p>
                    <h2 className="text-base font-semibold text-[var(--color-ink)]">Proposta de pagamento</h2>
                    <p className="text-[12.5px] text-[var(--color-ink2)]">
                      {obra.nome}
                      {unidade ? ` · unidade ${unidade.rotulo}` : ""} · valor {brl0(input.valorImovel)}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="print:hidden" onClick={imprimirProposta} data-gerar-proposta>
                    Gerar PDF da proposta
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 print:hidden">
                  <div>
                    <Label>Cliente (só no PDF; não vai à Cris)</Label>
                    <Input value={nomeNaProposta} onChange={(e) => setNomeNaProposta(e.target.value)} placeholder="Nome do cliente" aria-label="Cliente na proposta" />
                  </div>
                  <div>
                    <Label>Validade</Label>
                    <Input value={validade} onChange={(e) => setValidade(e.target.value)} aria-label="Validade da proposta" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Mensagem ao cliente (peça à Cris: “escreva o texto da proposta”)</Label>
                    <textarea
                      value={mensagem}
                      onChange={(e) => setMensagem(e.target.value)}
                      rows={4}
                      aria-label="Mensagem ao cliente"
                      className="w-full rounded-[8px] border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40"
                    />
                  </div>
                </div>
                {nomeNaProposta && <p className="hidden text-[13px] print:block">Para: {nomeNaProposta}</p>}
                {mensagem && <p className="hidden whitespace-pre-line text-[13px] leading-relaxed text-[var(--color-ink)] print:block">{mensagem}</p>}
                <table className="w-full text-[13px]" data-plano-da-proposta>
                  <thead>
                    <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
                      <th className="py-1.5">Pagamento</th>
                      <th className="py-1.5">Quando</th>
                      <th className="py-1.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposta.linhas.map((l) => (
                      <tr key={l.rotulo} className="border-b border-[var(--color-line)]/60">
                        <td className="py-1.5">{l.rotulo}</td>
                        <td className="py-1.5 text-[var(--color-ink2)]">{l.quando}</td>
                        <td className="py-1.5 text-right tabular-nums">{brl0(l.valor)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1.5" colSpan={2}>
                        Total
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{brl0(proposta.total)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="hidden print:block">
                  <TabelaDoFluxo result={result} detalhar={false} />
                </div>
                <p className="text-[11px] leading-snug text-[var(--color-ink3)]">
                  Simulação, não é contrato. As mensais são corrigidas pelo INCC acumulado do mês do vencimento a partir da 5ª parcela; os valores das mensais futuras são estimativas.
                  {input.financiamento > 0 ? " O financiamento bancário depende de aprovação do banco." : ""} Validade: {validade || "—"}.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Seção 5 — assistente somente leitura, puro, sobre o que a tela calculou. */}
      <div data-fora-da-proposta>
        <AssistenteSimulador usuario={usuario} input={input} result={result} incc={incc} />
      </div>
    </div>
  );
}

function TabelaDoFluxo({ result, detalhar }: { result: NonNullable<ReturnType<typeof simulate>>; detalhar: boolean }) {
  return (
    <Table>
      <THead>
        <tr className="sticky top-0 z-10 bg-[var(--color-surface2)]">
          <TH>#</TH>
          <TH>Mês</TH>
          <TH>Evolução da obra</TH>
          <TH className="text-right">INCC acum.</TH>
          {detalhar && <TH className="text-right">Base</TH>}
          {detalhar && <TH className="text-right">Correção</TH>}
          {detalhar && <TH className="text-right">Juros</TH>}
          <TH className="text-right">Parcela</TH>
          <TH className="text-right">Pgto especial</TH>
          <TH className="text-right">Total do mês</TH>
        </tr>
      </THead>
      <tbody>
        {result.meses.map((m) => (
          <TR key={m.n} className={m.especial > 0 ? "bg-[var(--color-warning)]/[0.08]" : undefined}>
            <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{m.n}</TD>
            <TD className="font-[family-name:var(--font-mono)]">{m.mm}</TD>
            <TD>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-14 rounded-full bg-[var(--color-surface3)]">
                  <span className="block h-full rounded-full bg-[var(--color-accent2)]" style={{ width: `${Math.round(m.evolucao)}%` }} />
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">{m.evolucao.toFixed(0)}%</span>
              </span>
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{m.inccAc.toFixed(2)}%</TD>
            {detalhar && <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(m.parcBase)}</TD>}
            {detalhar && <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{m.correcao > 0 ? brl0(m.correcao) : "—"}</TD>}
            {detalhar && <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{m.juros > 0 ? brl0(m.juros) : "—"}</TD>}
            <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(m.parcTotal)}</TD>
            <TD className={`text-right font-[family-name:var(--font-mono)] ${m.especial > 0 ? "font-semibold" : "text-[var(--color-ink3)]"}`}>{m.especial > 0 ? brl0(m.especial) : "—"}</TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">{brl0(m.total)}</TD>
          </TR>
        ))}
      </tbody>
      <tfoot className="sticky bottom-0 bg-[var(--color-surface2)] text-[12.5px]">
        <tr>
          <td colSpan={detalhar ? 10 : 7} className="px-3 py-2 text-[var(--color-ink2)]">
            Total do fluxo (sem o financiamento bancário) <strong className="text-[var(--color-ink)]">{brl0(result.totalPago)}</strong> · correção INCC {brl0(result.totalCorrecao)}
            {result.totalJuros > 0 ? ` · juros ${brl0(result.totalJuros)}` : ""}
          </td>
        </tr>
      </tfoot>
    </Table>
  );
}

function Kpi({ label, value, sub, tom }: { label: string; value: string; sub?: string; tom?: "danger" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">{label}</p>
        <p className={`mt-1 text-lg font-semibold ${tom === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}>{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-[var(--color-ink3)]">{sub}</p>}
      </CardContent>
    </Card>
  );
}
