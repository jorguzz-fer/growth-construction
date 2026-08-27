"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStakeholder,
  extractFornecedorFromDoc,
} from "@/lib/actions/despesas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { UploadDocumentos } from "@/components/ui/upload-documentos";
import { CampoIA, ResumoLeituraIA } from "@/components/ui/campo-ia";
import { legivelPelaIa, type Alerta } from "@/lib/ai/campos";
import {
  ROTULO_CAMPO_FORNECEDOR,
  montarPreenchimentoFornecedor,
  type CampoFornecedor,
} from "@/lib/ai/fornecedor-doc";

export function FornecedorForm({
  papeis,
  aiConfigured,
}: {
  papeis: readonly string[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Falha da leitura por IA — mostrada no próprio bloco de upload. */
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [tipo, setTipo] = useState("PJ");
  const [doc, setDoc] = useState("");
  const [contato, setContato] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [site, setSite] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [cep, setCep] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  /**
   * Alertas por campo (mesma regra da tela de despesas): o que a IA não achou
   * fica "faltando", o que ela leu sem certeza fica "conferir". A marca some
   * quando o usuário edita o campo.
   */
  const [alertas, setAlertas] = useState<Partial<Record<CampoFornecedor, Alerta>>>({});
  const [leitura, setLeitura] = useState<{ preenchidos: string[] } | null>(null);

  const limparAlerta = (campo: CampoFornecedor) =>
    setAlertas((prev) => {
      if (!prev[campo]) return prev;
      const next = { ...prev };
      delete next[campo];
      return next;
    });

  const limparLeitura = () => {
    setAlertas({});
    setLeitura(null);
    setErroLeitura(null);
  };

  const toggle = (p: string) => {
    limparAlerta("papeis");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  /** Setter que limpa o alerta do campo assim que ele é editado. */
  const editando =
    (campo: CampoFornecedor, setter: (v: string) => void) =>
    (e: { target: { value: string } }) => {
      setter(e.target.value);
      limparAlerta(campo);
    };

  function ler(arquivo: File | null = file) {
    if (!arquivo) {
      setErroLeitura("Suba um PDF ou uma imagem para preencher o cadastro.");
      return;
    }
    setErroLeitura(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("file", arquivo);
    startReading(async () => {
      try {
        const x = await extractFornecedorFromDoc(fd);
        // A regra de "não sobrescrever o que o usuário digitou" e a decisão do
        // que vira alerta moram em `fornecedor-doc.ts` (puro e testado).
        const res = montarPreenchimentoFornecedor(
          x,
          {
            nome,
            nomeFantasia,
            tipo: tipo === "PJ" ? "" : tipo,
            doc,
            contato,
            email,
            tel,
            whatsapp,
            site,
            endereco,
            numero,
            complemento,
            bairro,
            cidade,
            estado,
            cep,
          },
          [...selected],
        );
        const v = res.valores;
        if (v.nome) setNome(v.nome);
        if (v.nomeFantasia) setNomeFantasia(v.nomeFantasia);
        if (v.tipo) setTipo(v.tipo);
        if (v.doc) setDoc(v.doc);
        if (v.contato) setContato(v.contato);
        if (v.email) setEmail(v.email);
        if (v.tel) setTel(v.tel);
        if (v.whatsapp) setWhatsapp(v.whatsapp);
        if (v.site) setSite(v.site);
        if (v.endereco) setEndereco(v.endereco);
        if (v.numero) setNumero(v.numero);
        if (v.complemento) setComplemento(v.complemento);
        if (v.bairro) setBairro(v.bairro);
        if (v.cidade) setCidade(v.cidade);
        if (v.estado) setEstado(v.estado);
        if (v.cep) setCep(v.cep);
        if (res.papeis) setSelected(new Set(res.papeis));
        setAlertas(res.alertas);
        setLeitura({ preenchidos: res.preenchidos });
        setNotice(null);
      } catch (e) {
        // Erro da leitura aparece no bloco de upload, não no rodapé do
        // formulário — é onde a pessoa acabou de clicar.
        setErroLeitura(e instanceof Error ? e.message : "Falha ao ler o documento.");
      }
    });
  }

  function salvar() {
    setError(null);
    if (!nome.trim()) {
      setError("Informe o nome do fornecedor.");
      return;
    }
    const fd = new FormData();
    fd.set("nome", nome);
    fd.set("nomeFantasia", nomeFantasia);
    fd.set("tipo", tipo);
    fd.set("doc", doc);
    fd.set("contato", contato);
    fd.set("email", email);
    fd.set("tel", tel);
    fd.set("whatsapp", whatsapp);
    fd.set("site", site);
    fd.set("endereco", endereco);
    fd.set("numero", numero);
    fd.set("complemento", complemento);
    fd.set("bairro", bairro);
    fd.set("cidade", cidade);
    fd.set("estado", estado);
    fd.set("cep", cep);
    for (const p of selected) fd.append("papeis", p);
    if (file) fd.set("file", file);
    startSaving(async () => {
      try {
        await addStakeholder(fd);
        setNome("");
        setNomeFantasia("");
        setTipo("PJ");
        setDoc("");
        setContato("");
        setEmail("");
        setTel("");
        setWhatsapp("");
        setSite("");
        setEndereco("");
        setNumero("");
        setComplemento("");
        setBairro("");
        setCidade("");
        setEstado("");
        setCep("");
        setSelected(new Set());
        limparLeitura();
        setFile(null);
        setNotice(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao cadastrar o fornecedor.");
      }
    });
  }

  const busy = reading || saving;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-4 p-5">
        {/* Documento + leitura por IA */}
        <UploadDocumentos
          titulo="Documento do fornecedor"
          descricao={
            aiConfigured
              ? "Suba o cartão CNPJ, o contrato social, o cabeçalho de uma nota ou até um cartão de visita — PDF ou imagem. A IA lê e preenche o cadastro abaixo."
              : "Suba o cartão CNPJ, o contrato social ou o cabeçalho de uma nota — PDF ou imagem. O arquivo fica vinculado ao cadastro."
          }
          arquivos={file ? [file] : []}
          multiplo={false}
          accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
          onArquivos={(lista, adicionados) => {
            const escolhido = lista[0] ?? null;
            setFile(escolhido);
            setNotice(null);
            setError(null);
            limparLeitura();
            // Subiu → já preenche (mesmo comportamento da tela de despesas).
            if (aiConfigured && adicionados.length > 0 && escolhido && legivelPelaIa(escolhido.type)) {
              ler(escolhido);
            }
          }}
          desabilitado={busy}
          acao={{
            label: "Preencher cadastro",
            labelOcupado: "Lendo documento…",
            labelRepetir: "Preencher novamente",
            repetiu: !!leitura,
            ocupado: reading,
            desabilitada: !aiConfigured || !file,
            motivoVisivel: aiConfigured,
            motivo: !aiConfigured
              ? "Preenchimento automático indisponível neste servidor."
              : !file
                ? "Suba um PDF ou uma imagem para preencher o cadastro."
                : "Ler o documento e preencher os campos abaixo",
            onClick: () => ler(),
          }}
          avisos={
            erroLeitura
              ? [{ tom: "erro", texto: erroLeitura }]
              : aiConfigured
              ? [
                  {
                    tom: "info",
                    texto:
                      "O que a IA não achar — ou achar com dúvida — fica marcado com alerta no campo. Nada é gravado antes de você conferir e cadastrar.",
                  },
                ]
              : [
                  {
                    tom: "atencao",
                    texto: (
                      <>
                        <strong>Preenchimento automático indisponível.</strong> A chave
                        de IA não está configurada neste servidor
                        (ANTHROPIC_API_KEY), então os campos precisam ser preenchidos
                        à mão.{" "}
                        <a
                          href="/diagnosticoia"
                          className="font-medium text-[var(--color-accent2)] underline"
                        >
                          Abrir Diagnóstico de IA
                        </a>
                      </>
                    ),
                  },
                ]
          }
        />

        {leitura && (
          <ResumoLeituraIA
            titulo="Cadastro de fornecedor"
            preenchidos={leitura.preenchidos}
            alertas={alertas as Record<string, Alerta>}
            rotulos={ROTULO_CAMPO_FORNECEDOR}
            onFechar={limparLeitura}
          />
        )}

        {/* Campos do fornecedor */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CampoIA label="Nome" alerta={alertas.nome} className="sm:col-span-2">
            <Input
              value={nome}
              onChange={editando("nome", setNome)}
              placeholder="Razão social / nome"
            />
          </CampoIA>
          <CampoIA label="Tipo" alerta={alertas.tipo}>
            <Select value={tipo} onChange={editando("tipo", setTipo)}>
              <option>PJ</option>
              <option>PF</option>
            </Select>
          </CampoIA>
          <CampoIA label="CNPJ / CPF" alerta={alertas.doc}>
            <Input value={doc} onChange={editando("doc", setDoc)} />
          </CampoIA>
          <CampoIA label="Nome fantasia" alerta={alertas.nomeFantasia} className="sm:col-span-2">
            <Input value={nomeFantasia} onChange={editando("nomeFantasia", setNomeFantasia)} />
          </CampoIA>
          <CampoIA label="Pessoa de contato" alerta={alertas.contato} className="sm:col-span-2">
            <Input value={contato} onChange={editando("contato", setContato)} />
          </CampoIA>
          <CampoIA label="E-mail" alerta={alertas.email} className="sm:col-span-2">
            <Input type="email" value={email} onChange={editando("email", setEmail)} />
          </CampoIA>
          <CampoIA label="Telefone" alerta={alertas.tel}>
            <Input value={tel} onChange={editando("tel", setTel)} />
          </CampoIA>
          <CampoIA label="WhatsApp" alerta={alertas.whatsapp}>
            <Input value={whatsapp} onChange={editando("whatsapp", setWhatsapp)} />
          </CampoIA>
          <CampoIA label="Site" alerta={alertas.site} className="sm:col-span-2">
            <Input value={site} onChange={editando("site", setSite)} />
          </CampoIA>
          <CampoIA label="Endereço" alerta={alertas.endereco} className="sm:col-span-3">
            <Input value={endereco} onChange={editando("endereco", setEndereco)} />
          </CampoIA>
          <CampoIA label="Número" alerta={alertas.numero}>
            <Input value={numero} onChange={editando("numero", setNumero)} />
          </CampoIA>
          <CampoIA label="Complemento" alerta={alertas.complemento} className="sm:col-span-2">
            <Input value={complemento} onChange={editando("complemento", setComplemento)} />
          </CampoIA>
          <CampoIA label="Bairro" alerta={alertas.bairro} className="sm:col-span-2">
            <Input value={bairro} onChange={editando("bairro", setBairro)} />
          </CampoIA>
          <CampoIA label="Cidade" alerta={alertas.cidade} className="sm:col-span-2">
            <Input value={cidade} onChange={editando("cidade", setCidade)} />
          </CampoIA>
          <CampoIA label="Estado" alerta={alertas.estado}>
            <Input value={estado} onChange={editando("estado", setEstado)} maxLength={2} />
          </CampoIA>
          <CampoIA label="CEP" alerta={alertas.cep}>
            <Input value={cep} onChange={editando("cep", setCep)} />
          </CampoIA>
        </div>

        <CampoIA label="Papéis" alerta={alertas.papeis}>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {papeis.map((p) => (
              <label
                key={p}
                className="flex items-center gap-1.5 text-[13px] text-[var(--color-ink2)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p)}
                  onChange={() => toggle(p)}
                />
                {p}
              </label>
            ))}
          </div>
        </CampoIA>

        <div className="flex items-center gap-3">
          <Button type="button" disabled={busy} onClick={salvar}>
            {saving ? "Cadastrando…" : "Cadastrar fornecedor"}
          </Button>
          {notice && <span className="text-xs text-[var(--color-accent)]">{notice}</span>}
        </div>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
