"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDespesa,
  updateDespesa,
  extractDespesaFromDoc,
  addDespesaDocs,
  deleteDespesaDoc,
  deleteDespesa,
  cancelarDespesa,
} from "@/lib/actions/despesas";
import {
  categoriasDeDespesa,
  validarCategoriaDespesa,
} from "@/lib/calc/natureza-dre";
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

/**
 * Dados de uma despesa carregada para edição. Quando `edit` está presente, o
 * formulário abre com estes valores em vez de vazio e grava via `updateDespesa`
 * (em vez de criar uma nova despesa). Datas seguem o formato interno da tela
 * (competência "MM/YYYY", vencimento "MM/DD/YYYY").
 */
export interface DespesaAnexo {
  id: string;
  filename: string;
  tipo: string | null;
  size: number | null;
  uploadedAt: string | null;
  /** URL assinada para abrir/baixar; null quando o storage não está configurado. */
  url: string | null;
}

export interface EditDespesa {
  id: string;
  projectId: string;
  projectNome: string;
  fornecedorId: string | null;
  contaCef: string | null;
  categoriaDre: string | null;
  bancoId: string | null;
  numDoc: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: string;
  status: string | null;
  formaPagamento?: string | null;
  /** Descrição/observação da compra (campo separado do nº do pedido). */
  obs?: string | null;
  /** Documentos anexados à despesa (para visualizar/baixar na edição). */
  documentos?: DespesaAnexo[];
  /** Se o storage (R2) está configurado — habilita os links de download. */
  r2Configured?: boolean;
}

/**
 * Pré-preenchimento de uma NOVA despesa (ex.: a partir de uma linha do extrato).
 * Só é usado quando o formulário abre em modo criação (sem `edit`).
 */
export interface PrefillDespesa {
  valor?: string | null;
  /** vencimento "MM/DD/YYYY". */
  vencimento?: string | null;
  /** competência "MM/YYYY". */
  competencia?: string | null;
  numDoc?: string | null;
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
  socios = [],
  aiConfigured,
  r2Configured,
  canExcluir = false,
  edit = null,
  prefill = null,
}: {
  projetos: Projeto[];
  projetoId: string;
  fornecedores: Fornecedor[];
  contas: Conta[];
  bancos: Banco[];
  categorias: readonly string[];
  socios?: { id: string; nome: string }[];
  aiConfigured: boolean;
  r2Configured: boolean;
  /** Habilita cancelar/excluir a despesa a partir da tela de edição. */
  canExcluir?: boolean;
  /** Quando presente, o formulário abre em modo EDIÇÃO da despesa informada. */
  edit?: EditDespesa | null;
  /** Pré-preenchimento de nova despesa (ignorado em modo edição). */
  prefill?: PrefillDespesa | null;
}) {
  const router = useRouter();
  const isEdit = !!edit;
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [projeto, setProjeto] = useState(edit?.projectId ?? projetoId);
  const [fornecedorId, setFornecedorId] = useState(edit?.fornecedorId ?? "");
  const [contaCef, setContaCef] = useState(edit?.contaCef ?? "");
  // Item 1.3 — o default era `categorias[0]`, e a primeira categoria da lista é
  // "Receita": toda despesa nova nascia classificada como receita, inflando
  // receita e resultado na DRE ao mesmo tempo. Agora abre vazio ("Selecione…")
  // e o dropdown só oferece categorias de natureza devedora.
  const [categoriaDre, setCategoriaDre] = useState(edit?.categoriaDre ?? "");
  const categoriasDespesa = useMemo(() => categoriasDeDespesa(categorias), [categorias]);
  const [bancoId, setBancoId] = useState(edit?.bancoId ?? "");
  const [numDoc, setNumDoc] = useState(edit?.numDoc ?? prefill?.numDoc ?? "");
  const [competencia, setCompetencia] = useState(edit?.competencia ?? prefill?.competencia ?? "");
  const [vencimento, setVencimento] = useState(edit?.vencimento ?? prefill?.vencimento ?? "");
  const [valor, setValor] = useState(edit?.valor ?? prefill?.valor ?? "");
  const [status, setStatus] = useState(edit?.status ?? "A pagar");
  const [obs, setObs] = useState(edit?.obs ?? "");
  // Vários anexos podem ser enviados no mesmo lançamento. O primeiro arquivo é
  // o usado pela leitura por IA (que analisa um documento por vez).
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;

  // Anexos na EDIÇÃO: enviar novos e remover individualmente, em qualquer
  // estágio (inclusive com a despesa já paga e/ou conciliada).
  const addFileRef = useRef<HTMLInputElement>(null);
  const [novosAnexos, setNovosAnexos] = useState<File[]>([]);
  const [anexBusy, setAnexBusy] = useState(false);
  const [anexMsg, setAnexMsg] = useState<string | null>(null);
  const [anexErro, setAnexErro] = useState<string | null>(null);

  /** Limite de corpo das Server Actions (next.config: bodySizeLimit 12 MB). */
  const LIMITE_ENVIO = 11 * 1024 * 1024;

  async function enviarAnexos() {
    if (!edit || novosAnexos.length === 0) return;
    setAnexMsg(null);
    setAnexErro(null);

    // O envio inteiro (soma dos arquivos) precisa caber no corpo da Server
    // Action. Acima disso o Next rejeita a requisição ANTES da action rodar, e
    // sem este aviso o clique simplesmente não fazia nada.
    const total = novosAnexos.reduce((a, f) => a + f.size, 0);
    if (total > LIMITE_ENVIO) {
      setAnexErro(
        `Os arquivos somam ${(total / 1024 / 1024).toFixed(1)} MB e o limite por envio é 11 MB. ` +
          "Anexe em partes — os arquivos já enviados são preservados.",
      );
      return;
    }
    const grande = novosAnexos.find((f) => f.size > 10 * 1024 * 1024);
    if (grande) {
      setAnexErro(`"${grande.name}" excede 10 MB.`);
      return;
    }

    setAnexBusy(true);
    try {
      const fd = new FormData();
      fd.set("despesaId", edit.id);
      for (const f of novosAnexos) fd.append("file", f);
      const res = await addDespesaDocs(fd);
      if (res.ok) {
        setAnexMsg(`${res.added} arquivo(s) anexado(s).`);
        setNovosAnexos([]);
        if (addFileRef.current) addFileRef.current.value = "";
        router.refresh();
      } else {
        setAnexErro(res.error ?? "Falha ao anexar.");
      }
    } catch (e) {
      // Sem este catch, uma exceção (corpo grande demais, rede, sessão expirada)
      // rejeitava a promessa em silêncio: o botão voltava ao normal e nada
      // acontecia na tela.
      console.error("[despesa] falha ao anexar:", e);
      setAnexErro(
        e instanceof Error
          ? `Falha ao anexar: ${e.message}`
          : "Falha ao anexar os arquivos. Tente novamente ou envie um por vez.",
      );
    } finally {
      setAnexBusy(false);
    }
  }

  /** Volta para a lista removendo o ?edit= da URL. */
  function voltarParaLista() {
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    router.push(`${url.pathname}${url.search}`);
    router.refresh();
  }

  /**
   * Cancelamento LÓGICO: a despesa para de contar nos relatórios, mas o
   * registro e todo o histórico permanecem no banco. É a via recomendada.
   */
  function cancelarDespesaAtual() {
    if (!edit) return;
    const motivo = window.prompt(
      `Motivo do cancelamento da despesa ${edit.numDoc ?? ""}:`,
    );
    if (motivo === null) return;
    setError(null);
    startSaving(async () => {
      try {
        await cancelarDespesa(edit.id, motivo);
        voltarParaLista();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao cancelar a despesa.");
      }
    });
  }

  /**
   * Exclusão FÍSICA: apaga a despesa definitivamente. Irreversível, por isso a
   * confirmação é explícita e mostra o que está sendo apagado.
   */
  function excluirDespesa() {
    if (!edit) return;
    const anexos = edit.documentos?.length ?? 0;
    const aviso =
      `Excluir DEFINITIVAMENTE a despesa ${edit.numDoc ?? ""} ` +
      `(${Number(edit.valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })})?` +
      (anexos > 0 ? `\n\nOs ${anexos} anexo(s) vinculados também serão desvinculados.` : "") +
      `\n\nEsta ação NÃO pode ser desfeita. Para manter o histórico, use "Cancelar despesa".`;
    if (!window.confirm(aviso)) return;
    setError(null);
    startSaving(async () => {
      try {
        await deleteDespesa(edit.id);
        voltarParaLista();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao excluir a despesa.");
      }
    });
  }

  async function removerAnexo(documentId: string, filename: string) {
    if (!window.confirm(`Remover o anexo "${filename}"? Os demais permanecem.`)) return;
    setAnexBusy(true);
    setAnexMsg(null);
    setAnexErro(null);
    try {
      const res = await deleteDespesaDoc(documentId);
      if (res.ok) {
        setAnexMsg("Anexo removido.");
        router.refresh();
      } else {
        setAnexErro(res.error ?? "Falha ao remover.");
      }
    } finally {
      setAnexBusy(false);
    }
  }

  // Despesa recorrente: repete o mesmo lançamento nos próximos meses.
  const [recorrente, setRecorrente] = useState(false);
  const [recMeses, setRecMeses] = useState("12");

  // Despesa paga por sócio (Seção 3): reconhecida na DRE sem saída de caixa da
  // empresa; se reembolsável, gera obrigação a reembolsar (tela Restituições).
  const [pagoPorSocio, setPagoPorSocio] = useState(false);
  const [socioId, setSocioId] = useState("");
  const [socioData, setSocioData] = useState("");
  const [socioReembolsavel, setSocioReembolsavel] = useState(true);

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
        // A IA nunca pode sugerir categoria de receita para uma despesa.
        if (x.categoriaDre && categoriasDespesa.includes(x.categoriaDre)) {
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
    // Item 1.3 — trava também no cliente, para o usuário ver o erro no campo em
    // vez de só depois do round-trip. A trava que vale é a do servidor, em
    // `addDespesa`/`updateDespesa`: a Server Action é chamável diretamente.
    const erroCategoria = validarCategoriaDespesa(categoriaDre);
    if (erroCategoria) {
      setError(erroCategoria);
      return;
    }
    // Modo edição: grava as alterações na despesa existente (updateDespesa) e
    // volta para a lista. Não recria parcelas/recorrência nem mexe no caixa.
    if (isEdit && edit) {
      const patch: {
        fornecedorId: string | null;
        bancoId: string | null;
        contaCef: string | null;
        categoriaDre: string;
        numDoc?: string;
        competencia: string | null;
        vencimento: string | null;
        valor: string;
        status: string;
        obs: string | null;
      } = {
        fornecedorId: fornecedorId || null,
        bancoId: bancoId || null,
        contaCef: contaCef || null,
        categoriaDre,
        competencia: competencia || null,
        vencimento: vencimento || null,
        valor: valor || "0",
        status,
        obs: obs || null,
      };
      // O PED nunca é enviado na edição: é numeração interna imutável (RG-06).
      // Renumerar um documento já emitido quebraria a rastreabilidade com a
      // contabilidade e com os anexos que o referenciam.
      startSaving(async () => {
        try {
          await updateDespesa(edit.id, patch);
          const url = new URL(window.location.href);
          url.searchParams.delete("edit");
          router.push(`${url.pathname}${url.search}`);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Falha ao salvar as alterações.");
        }
      });
      return;
    }
    const fd = new FormData();
    fd.set("projectId", projeto);
    fd.set("fornecedorId", fornecedorId);
    fd.set("contaCef", contaCef);
    fd.set("categoriaDre", categoriaDre);
    fd.set("bancoId", bancoId);
    // `numDoc` não é enviado: o PED é reservado no servidor, na transação de
    // gravação (RG-06 / item 1.1).
    fd.set("obs", obs);
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
    // Despesa paga por sócio
    if (pagoPorSocio && socioId) {
      fd.set("pagoPorSocioId", socioId);
      fd.set("socioDataPagamento", socioData);
      if (socioReembolsavel) fd.set("socioReembolsavel", "1");
    }
    // Vários anexos já no lançamento inicial (boleto + NF + comprovante...).
    for (const f of files) fd.append("file", f);
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
        setObs("");
        setRecorrente(false);
        setRecMeses("12");
        setPagoPorSocio(false);
        setSocioId("");
        setSocioData("");
        setSocioReembolsavel(true);
        setFormaPagamento("");
        setFormaDesc("");
        setCondicao("");
        setParcelas([]);
        setBo({ linha: "", barras: "", banco: "" });
        setCh({ numero: "", banco: "", ag: "", conta: "", emitente: "", emissao: "", compensacao: "", status: "" });
        setFiles([]);
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
        {isEdit && (
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">
              Editar despesa {edit?.numDoc ? `nº ${edit.numDoc}` : ""}
            </h2>
            <span className="text-[12px] text-[var(--color-ink3)]">
              {edit?.projectNome}
            </span>
          </div>
        )}
        {/* Anexos da despesa — permite visualizar/baixar o documento original. */}
        {isEdit && (
          <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4">
            <h3 className="mb-2 text-[13px] font-semibold text-[var(--color-ink)]">
              Documento anexado
            </h3>
            {(edit?.documentos?.length ?? 0) === 0 ? (
              <p className="text-[12px] text-[var(--color-ink3)]">
                Nenhum documento anexado a esta despesa.
                {edit?.r2Configured === false
                  ? " (Storage não configurado — defina as variáveis R2_*.)"
                  : " Use o campo abaixo para anexar."}
              </p>
            ) : (
              <ul className="space-y-2">
                {edit?.documentos?.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                        {doc.filename}
                      </p>
                      <p className="text-[11px] text-[var(--color-ink3)]">
                        {doc.tipo ? `${doc.tipo} · ` : ""}
                        {doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ""}
                        {doc.uploadedAt
                          ? ` · ${new Date(doc.uploadedAt).toLocaleDateString("pt-BR")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener"
                          download
                          className="rounded-[6px] border border-[var(--color-accent2)]/30 px-3 py-1.5 text-[12px] font-medium text-[var(--color-accent2)] hover:bg-[var(--color-accent2)]/8"
                        >
                          Abrir / Baixar
                        </a>
                      ) : (
                        <span className="text-[11px] text-[var(--color-ink4)]">
                          indisponível
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={anexBusy}
                        onClick={() => removerAnexo(doc.id, doc.filename)}
                        className="rounded-[6px] border border-[var(--color-danger)]/30 px-2.5 py-1.5 text-[12px] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/8 disabled:opacity-50"
                        title="Remover este anexo (os demais permanecem)"
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Anexar MAIS documentos — disponível em qualquer momento do ciclo
                de vida: antes/depois do pagamento e antes/depois da conciliação. */}
            <div className="mt-3 border-t border-[var(--color-accent2)]/12 pt-3">
              <Label>
                Anexar mais documentos — quantos forem necessários
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {/* Sem restrição de tipo: além de PDF e imagem, a despesa pode
                    receber planilha, XML da nota, e-mail, contrato etc. O
                    `accept` anterior filtrava esses arquivos no seletor e o
                    usuário via "Nenhum arquivo escolhido" sem entender por quê. */}
                <input
                  ref={addFileRef}
                  type="file"
                  multiple
                  className="text-xs"
                  onChange={(e) => setNovosAnexos(Array.from(e.target.files ?? []))}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={anexBusy || novosAnexos.length === 0}
                  onClick={enviarAnexos}
                >
                  {anexBusy
                    ? "Enviando…"
                    : novosAnexos.length > 0
                      ? `Anexar ${novosAnexos.length} arquivo(s)`
                      : "Anexar"}
                </Button>
              </div>
              {novosAnexos.length > 0 ? (
                <p className="mt-1 text-[11.5px] text-[var(--color-ink3)]">
                  Selecionado(s): {novosAnexos.map((f) => f.name).join(", ")}
                </p>
              ) : (
                <p className="mt-1 text-[11.5px] text-[var(--color-ink4)]">
                  Escolha um ou mais arquivos (até 10 MB cada) e clique em Anexar. Os
                  anexos já existentes são preservados.
                </p>
              )}
              {anexMsg && (
                <p className="mt-1 text-[11.5px] text-[var(--color-success)]">{anexMsg}</p>
              )}
              {anexErro && (
                <p className="mt-1 text-[11.5px] text-[var(--color-danger)]">{anexErro}</p>
              )}
            </div>
          </div>
        )}
        {/* Documento + leitura por IA — só no cadastro de uma nova despesa. */}
        {!isEdit && (
        <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label>
                Documentos (PDF ou imagem — NF, boleto, comprovante, foto) — vários
              </Label>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="text-xs"
                onChange={(e) => {
                  setFiles(Array.from(e.target.files ?? []));
                  setNotice(null);
                }}
              />
              {files.length > 0 && (
                <p className="mt-1 text-[11px] text-[var(--color-ink3)]">
                  {files.length} arquivo(s): {files.map((f) => f.name).join(", ")}
                  {files.length > 1 && aiConfigured
                    ? " — a leitura por IA usa o primeiro."
                    : ""}
                </p>
              )}
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
              : "Leitura automática por IA desativada — verifique em Config → Diagnóstico de IA (defina ANTHROPIC_API_KEY)."}
            {r2Configured
              ? " O arquivo é anexado e vinculado à despesa ao lançar."
              : " Configure as variáveis R2_* para armazenar o arquivo."}
          </p>
        </div>
        )}

        {/* Campos da despesa */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Projeto</Label>
            <Select
              value={projeto}
              onChange={(e) => setProjeto(e.target.value)}
              disabled={isEdit}
            >
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
            {/* Só categorias de natureza devedora: uma despesa não pode ser
                classificada em conta de receita (item 1.3 / RG-01). */}
            <Select value={categoriaDre} onChange={(e) => setCategoriaDre(e.target.value)}>
              <option value="">Selecione...</option>
              {categoriasDespesa.map((c) => (
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
          {/* Item 1.1 — o PED é numeração INTERNA da empresa: gerada no
              servidor, dentro da transação de gravação, contínua e imutável
              depois de criada. Nunca foi editável por digitação (isso é papel
              do bloco Documento Fiscal, onde entra o número da nota). */}
          <div>
            <Label>Nº do pedido (interno)</Label>
            <div className="flex items-center gap-1.5">
              <Input
                value={isEdit ? numDoc || "—" : "Será gerado ao salvar"}
                disabled
                readOnly
                className={isEdit ? "font-[family-name:var(--font-mono)]" : ""}
              />
              {isEdit && numDoc && (
                <button
                  type="button"
                  title="Copiar o número"
                  onClick={() => {
                    navigator.clipboard?.writeText(numDoc).then(
                      () => setNotice(`Número ${numDoc} copiado.`),
                      () => setNotice(null),
                    );
                  }}
                  className="shrink-0 rounded-[6px] border border-[var(--color-accent2)]/20 px-2 py-1.5 text-[11px] text-[var(--color-accent2)] hover:bg-[var(--color-surface2)]"
                >
                  Copiar
                </button>
              )}
            </div>
          </div>
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
          {/* Descrição/observação da compra — campo PRÓPRIO, separado do nº do
              pedido. Serve para explicar o objeto da compra. */}
          <div className="col-span-2 sm:col-span-4">
            <Label>Descrição / observação da compra</Label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Objeto da compra (ex.: 20 sacos de cimento CP-II para a laje do 2º pav.)"
            />
          </div>
          {/* Recorrência, sócio pagador e parcelamento só valem no cadastro
              de uma nova despesa — a edição ajusta apenas os dados da despesa
              existente, sem recriar lançamentos, parcelas ou caixa. */}
          {!isEdit && (
          <>
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
          {/* Despesa paga por sócio (Seção 3) */}
          <div className="col-span-2 space-y-3 rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4 sm:col-span-4">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={pagoPorSocio}
                onChange={(e) => setPagoPorSocio(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent2)]"
              />
              Despesa paga por sócio (não movimenta o caixa da empresa no cadastro)
            </label>
            {pagoPorSocio && (
              <>
                {socios.length === 0 && (
                  <p className="text-[12px] text-[var(--color-warning)]">
                    Nenhum sócio cadastrado. Cadastre um stakeholder com o papel
                    &ldquo;Sócio/Quotista&rdquo; para usar esta opção.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <Label>Sócio pagador</Label>
                    <Select value={socioId} onChange={(e) => setSocioId(e.target.value)}>
                      <option value="">— selecione —</option>
                      {socios.map((so) => (
                        <option key={so.id} value={so.id}>
                          {so.nome}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Data do pagamento</Label>
                    <DateField value={socioData} onChange={setSocioData} />
                  </div>
                  <div className="flex items-end sm:col-span-2">
                    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--color-ink)]">
                      <input
                        type="checkbox"
                        checked={socioReembolsavel}
                        onChange={(e) => setSocioReembolsavel(e.target.checked)}
                        className="h-4 w-4 accent-[var(--color-accent2)]"
                      />
                      Será reembolsada pela empresa
                    </label>
                  </div>
                </div>
                <p className="text-[11.5px] text-[var(--color-ink3)]">
                  {socioReembolsavel
                    ? "Gera uma obrigação a reembolsar ao sócio. O caixa só se move quando o reembolso for registrado (tela Restituições)."
                    : "Paga definitivamente pelo sócio: registrada na DRE/projeto, sem obrigação e sem movimentar o caixa da empresa."}
                </p>
              </>
            )}
          </div>
          {/* Pagamento & parcelamento (Fase 2) */}
          <div
            className={`col-span-2 space-y-3 rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4 sm:col-span-4 ${
              pagoPorSocio ? "hidden" : ""
            }`}
          >
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
          </>
          )}

          <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={busy || (!isEdit && parcelas.length > 0 && !totalOk)}
              onClick={salvar}
            >
              {saving
                ? isEdit
                  ? "Salvando…"
                  : "Lançando…"
                : isEdit
                  ? "Salvar alterações"
                  : "Lançar despesa"}
            </Button>
            {isEdit && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("edit");
                  router.push(`${url.pathname}${url.search}`);
                }}
              >
                Voltar
              </Button>
            )}
            {isEdit && canExcluir && (
              <div className="ml-auto flex items-center gap-2">
                {/* Cancelamento LÓGICO — preserva o histórico. É a via segura e
                    por isso vem antes da exclusão física. */}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={cancelarDespesaAtual}
                  title="Cancelamento lógico: a despesa deixa de contar nos relatórios, mas o histórico é preservado"
                >
                  Cancelar despesa
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={excluirDespesa}
                  className="border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/8"
                  title="Exclusão física: apaga a despesa definitivamente"
                >
                  Excluir
                </Button>
              </div>
            )}
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
