"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDespesa, extractDespesaFromDoc } from "@/lib/actions/despesas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField, MonthField } from "@/components/ui/date-field";
import {
  gerarParcelas,
  FORMAS_PAGAMENTO,
  CONDICOES_PAGAMENTO,
} from "@/lib/calc";

interface Projeto {
  id: string;
  nome: string;
}
interface Fornecedor {
  id: string;
  nome: string;
  doc: string | null;
}
interface Conta {
  code: string;
  name: string;
}
interface Banco {
  id: string;
  banco: string;
  tipo: string;
}

const STRIP_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(STRIP_MARKS, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const digits = (s: string) => s.replace(/\D+/g, "");

export function DespesaForm({
  projetos,
  projetoId,
  fornecedores,
  contas,
  bancos,
  categorias,
  aiConfigured,
  r2Configured,
  canEditNumero = false,
}: {
  projetos: Projeto[];
  projetoId: string;
  fornecedores: Fornecedor[];
  contas: Conta[];
  bancos: Banco[];
  categorias: readonly string[];
  aiConfigured: boolean;
  r2Configured: boolean;
  canEditNumero?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [projeto, setProjeto] = useState(projetoId);
  const [fornecedorId, setFornecedorId] = useState("");
  const [contaCef, setContaCef] = useState("");
  const [categoriaDre, setCategoriaDre] = useState(categorias[0] ?? "Custo Variável");
  const [bancoId, setBancoId] = useState("");
  const [numDoc, setNumDoc] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [valor, setValor] = useState("");
  const [status, setStatus] = useState("A pagar");
  const [file, setFile] = useState<File | null>(null);

  // Despesa recorrente: repete o mesmo lançamento nos próximos meses.
  const [recorrente, setRecorrente] = useState(false);
  const [recMeses, setRecMeses] = useState("12");

  // Fase 2 — forma/condição de pagamento e parcelas
  const [formaPagamento, setFormaPagamento] = useState("");
  const [formaDesc, setFormaDesc] = useState("");
  const [condicao, setCondicao] = useState("");
  const [qtdPers, setQtdPers] = useState("2");
  const [parcelas, setParcelas] = useState<{ vencimento: string; valor: string }[]>([]);
  const [bo, setBo] = useState({ linha: "", barras: "", banco: "" });
  const [ch, setCh] = useState({
    numero: "", banco: "", ag: "", conta: "", emitente: "", emissao: "", compensacao: "", status: "",
  });

  const regerarParcelas = () => {
    const total = Number(valor) || 0;
    if (!condicao || total <= 0) {
      setParcelas([]);
      return;
    }
    const base = vencimento || competencia || "";
    const ger = gerarParcelas({
      valorTotal: total,
      condicao,
      dataBase: base,
      qtd: condicao === "personalizado" ? Number(qtdPers) || 1 : undefined,
    });
    setParcelas(ger.map((p) => ({ vencimento: p.vencimento, valor: String(p.valor) })));
  };

  const somaParcelas = parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0);
  const totalOk = Math.abs(somaParcelas - (Number(valor) || 0)) < 0.01;

  const contaCodes = useMemo(() => new Set(contas.map((c) => c.code)), [contas]);

  function matchFornecedor(nome: string, doc: string): string | null {
    const d = digits(doc);
    if (d) {
      const byDoc = fornecedores.find((f) => f.doc && digits(f.doc) === d);
      if (byDoc) return byDoc.id;
    }
    const n = norm(nome);
    if (!n) return null;
    const exact = fornecedores.find((f) => norm(f.nome) === n);
    if (exact) return exact.id;
    const partial = fornecedores.find(
      (f) => norm(f.nome).includes(n) || n.includes(norm(f.nome)),
    );
    return partial?.id ?? null;
  }

  function ler() {
    const f = file;
    if (!f) {
      setError("Selecione um documento (PDF ou imagem) primeiro.");
      return;
    }
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("file", f);
    startReading(async () => {
      try {
        const x = await extractDespesaFromDoc(fd);
        const filled: string[] = [];
        const fid = matchFornecedor(x.fornecedorNome, x.fornecedorDoc);
        if (fid) {
          setFornecedorId(fid);
          filled.push("fornecedor");
        }
        if (x.contaCef && contaCodes.has(x.contaCef)) {
          setContaCef(x.contaCef);
          filled.push("conta");
        }
        if (x.categoriaDre && categorias.includes(x.categoriaDre)) {
          setCategoriaDre(x.categoriaDre);
          filled.push("categoria DRE");
        }
        if (x.valor > 0) {
          setValor(String(x.valor));
          filled.push("valor");
        }
        if (x.competencia) {
          setCompetencia(x.competencia);
          filled.push("competência");
        }
        if (x.vencimento) {
          setVencimento(x.vencimento);
          filled.push("vencimento");
        }
        if (x.numDoc) {
          setNumDoc(x.numDoc);
          filled.push("nº doc");
        }
        setNotice(
          filled.length
            ? `Campos preenchidos pela IA: ${filled.join(", ")}. Revise e ajuste antes de lançar.`
            : "A IA não conseguiu identificar campos com confiança — preencha manualmente.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao ler o documento.");
      }
    });
  }

  function salvar() {
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projeto);
    fd.set("fornecedorId", fornecedorId);
    fd.set("contaCef", contaCef);
    fd.set("categoriaDre", categoriaDre);
    fd.set("bancoId", bancoId);
    fd.set("numDoc", numDoc);
    fd.set("competencia", competencia);
    fd.set("vencimento", vencimento);
    fd.set("valor", valor || "0");
    fd.set("status", status);
    if (recorrente) {
      fd.set("recorrente", "1");
      fd.set("recorrenciaMeses", recMeses);
    }
    // Fase 2 — forma/condição de pagamento e parcelas
    if (formaPagamento) fd.set("formaPagamento", formaPagamento);
    if (formaPagamento === "Outro" && formaDesc) fd.set("formaPagamentoDesc", formaDesc);
    if (condicao) fd.set("condicaoPagamento", condicao);
    if (condicao === "personalizado") fd.set("qtdParcelas", qtdPers);
    if (parcelas.length > 0) fd.set("parcelasJson", JSON.stringify(parcelas));
    if (formaPagamento === "Boleto") {
      fd.set("boletoLinhaDigitavel", bo.linha);
      fd.set("boletoCodigoBarras", bo.barras);
      fd.set("boletoBanco", bo.banco);
    }
    if (formaPagamento === "Cheque") {
      fd.set("chequeNumero", ch.numero);
      fd.set("chequeBanco", ch.banco);
      fd.set("chequeAg", ch.ag);
      fd.set("chequeConta", ch.conta);
      fd.set("chequeEmitente", ch.emitente);
      fd.set("chequeDataEmissao", ch.emissao);
      fd.set("chequeDataCompensacao", ch.compensacao);
      fd.set("chequeStatus", ch.status);
    }
    if (file) fd.set("file", file);
    startSaving(async () => {
      try {
        await addDespesa(fd);
        // limpa o formulário
        setFornecedorId("");
        setContaCef("");
        setCategoriaDre(categorias[0] ?? "Custo Variável");
        setBancoId("");
        setNumDoc("");
        setCompetencia("");
        setVencimento("");
        setValor("");
        setStatus("A pagar");
        setRecorrente(false);
        setRecMeses("12");
        setFormaPagamento("");
        setFormaDesc("");
        setCondicao("");
        setParcelas([]);
        setBo({ linha: "", barras: "", banco: "" });
        setCh({ numero: "", banco: "", ag: "", conta: "", emitente: "", emissao: "", compensacao: "", status: "" });
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        setNotice(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao lançar a despesa.");
      }
    });
  }

  const busy = reading || saving;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-4 p-5">
        {/* Documento + leitura por IA */}
        <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label>Documento (PDF ou imagem — NF, boleto, contrato)</Label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                className="text-xs"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setNotice(null);
                }}
              />
            </div>
            {aiConfigured && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || !file}
                onClick={ler}
              >
                {reading ? "Lendo documento…" : "Ler com IA"}
              </Button>
            )}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
            {aiConfigured
              ? "A IA lê o documento e preenche os campos abaixo — revise antes de lançar."
              : "Leitura automática por IA desativada (defina ANTHROPIC_API_KEY para habilitar)."}
            {r2Configured
              ? " O arquivo é anexado e vinculado à despesa ao lançar."
              : " Configure as variáveis R2_* para armazenar o arquivo."}
          </p>
        </div>

        {/* Campos da despesa */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Projeto</Label>
            <Select value={projeto} onChange={(e) => setProjeto(e.target.value)}>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Fornecedor</Label>
            <Select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
              <option value="">Selecione...</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Conta CEF / Plano de Contas</Label>
            <Select value={contaCef} onChange={(e) => setContaCef(e.target.value)}>
              <option value="">Selecione...</option>
              {contas.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Categoria DRE</Label>
            <Select value={categoriaDre} onChange={(e) => setCategoriaDre(e.target.value)}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Banco</Label>
            <Select value={bancoId} onChange={(e) => setBancoId(e.target.value)}>
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.banco} · {b.tipo}
                </option>
              ))}
            </Select>
          </div>
          {canEditNumero ? (
            <div>
              <Label>Nº Documento (opcional)</Label>
              <Input
                value={numDoc}
                onChange={(e) => setNumDoc(e.target.value)}
                placeholder="vazio = automático"
              />
            </div>
          ) : (
            <div>
              <Label>Nº Documento</Label>
              <Input value="Gerado automaticamente" disabled readOnly />
            </div>
          )}
          <div>
            <Label>Competência</Label>
            <MonthField value={competencia} onChange={setCompetencia} />
          </div>
          <div>
            <Label>Vencimento</Label>
            <DateField value={vencimento} onChange={setVencimento} />
          </div>
          <div>
            <Label>Valor</Label>
            <MoneyInput value={valor} onChange={setValor} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>A pagar</option>
              <option>Pago</option>
            </Select>
          </div>
          {/* Despesa recorrente — repete nos próximos meses */}
          <div className="col-span-2 flex flex-wrap items-end gap-4 rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4 sm:col-span-4">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={recorrente}
                onChange={(e) => setRecorrente(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent2)]"
              />
              Despesa recorrente (repete nos próximos meses)
            </label>
            {recorrente && (
              <div className="flex items-end gap-2">
                <div>
                  <Label>Repetir por (meses)</Label>
                  <Input
                    type="number"
                    min={2}
                    max={60}
                    value={recMeses}
                    onChange={(e) => setRecMeses(e.target.value)}
                    className="w-28"
                  />
                </div>
                <p className="pb-2 text-[11.5px] text-[var(--color-ink3)]">
                  Serão criados {Math.max(1, Number(recMeses) || 1)} lançamentos mensais
                  (competência e vencimento avançam 1 mês a cada um).
                </p>
              </div>
            )}
          </div>
          {/* Pagamento & parcelamento (Fase 2) */}
          <div className="col-span-2 space-y-3 rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4 sm:col-span-4">
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">
              Pagamento & parcelamento
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label>Forma de pagamento</Label>
                <Select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                >
                  <option value="">—</option>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
              {formaPagamento === "Outro" && (
                <div>
                  <Label>Descrição da forma</Label>
                  <Input value={formaDesc} onChange={(e) => setFormaDesc(e.target.value)} />
                </div>
              )}
              <div>
                <Label>Condição</Label>
                <Select value={condicao} onChange={(e) => setCondicao(e.target.value)}>
                  <option value="">—</option>
                  {CONDICOES_PAGAMENTO.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              {condicao === "personalizado" && (
                <div>
                  <Label>Nº de parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    value={qtdPers}
                    onChange={(e) => setQtdPers(e.target.value)}
                  />
                </div>
              )}
              {condicao && (
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={regerarParcelas}>
                    Gerar parcelas
                  </Button>
                </div>
              )}
            </div>

            {/* Campos de boleto */}
            {formaPagamento === "Boleto" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Input placeholder="Linha digitável" value={bo.linha} onChange={(e) => setBo({ ...bo, linha: e.target.value })} />
                <Input placeholder="Código de barras" value={bo.barras} onChange={(e) => setBo({ ...bo, barras: e.target.value })} />
                <Input placeholder="Banco emissor" value={bo.banco} onChange={(e) => setBo({ ...bo, banco: e.target.value })} />
              </div>
            )}
            {/* Campos de cheque */}
            {formaPagamento === "Cheque" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Input placeholder="Nº do cheque" value={ch.numero} onChange={(e) => setCh({ ...ch, numero: e.target.value })} />
                <Input placeholder="Banco" value={ch.banco} onChange={(e) => setCh({ ...ch, banco: e.target.value })} />
                <Input placeholder="Agência" value={ch.ag} onChange={(e) => setCh({ ...ch, ag: e.target.value })} />
                <Input placeholder="Conta" value={ch.conta} onChange={(e) => setCh({ ...ch, conta: e.target.value })} />
                <Input placeholder="Emitente" value={ch.emitente} onChange={(e) => setCh({ ...ch, emitente: e.target.value })} />
                <div><DateField value={ch.emissao} onChange={(v) => setCh({ ...ch, emissao: v })} /></div>
                <div><DateField value={ch.compensacao} onChange={(v) => setCh({ ...ch, compensacao: v })} /></div>
                <Input placeholder="Status do cheque" value={ch.status} onChange={(e) => setCh({ ...ch, status: e.target.value })} />
              </div>
            )}

            {/* Parcelas editáveis */}
            {parcelas.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[40px_1fr_1fr] gap-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  <div>#</div>
                  <div>Vencimento</div>
                  <div>Valor</div>
                </div>
                {parcelas.map((p, i) => (
                  <div key={i} className="grid grid-cols-[40px_1fr_1fr] items-center gap-2">
                    <div className="text-[13px] text-[var(--color-ink3)]">{i + 1}</div>
                    <DateField
                      value={p.vencimento}
                      onChange={(v) =>
                        setParcelas((s) => s.map((x, j) => (j === i ? { ...x, vencimento: v } : x)))
                      }
                    />
                    <MoneyInput
                      value={p.valor}
                      onChange={(v) =>
                        setParcelas((s) => s.map((x, j) => (j === i ? { ...x, valor: v } : x)))
                      }
                    />
                  </div>
                ))}
                <div className={`text-[12px] ${totalOk ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                  Soma das parcelas: {somaParcelas.toFixed(2)} / total {(Number(valor) || 0).toFixed(2)}
                  {totalOk ? " ✓" : " — ajuste para bater com o total"}
                </div>
              </div>
            )}
          </div>

          <div className="col-span-2 flex items-end sm:col-span-4">
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={busy || (parcelas.length > 0 && !totalOk)}
              onClick={salvar}
            >
              {saving ? "Lançando…" : "Lançar despesa"}
            </Button>
          </div>
        </div>

        {notice && (
          <p className="text-xs text-[var(--color-accent)]">{notice}</p>
        )}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
