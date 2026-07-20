"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStakeholder,
  extractFornecedorFromDoc,
} from "@/lib/actions/despesas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export function FornecedorForm({
  papeis,
  aiConfigured,
}: {
  papeis: readonly string[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
  /** Campos que a IA sinalizou como baixa confiança (para o usuário conferir). */
  const [lowConf, setLowConf] = useState<Set<string>>(new Set());

  const toggle = (p: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  /** Marca de "baixa confiança" ao lado do rótulo de um campo lido pela IA. */
  const lc = (field: string) =>
    lowConf.has(field) ? (
      <span
        className="ml-1 text-[10px] font-normal text-[var(--color-warning)]"
        title="Preenchido com baixa confiança pela IA — confira"
      >
        ⚠ conferir
      </span>
    ) : null;

  function ler() {
    if (!file) {
      setError("Selecione um documento (PDF ou imagem) primeiro.");
      return;
    }
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("file", file);
    startReading(async () => {
      try {
        const x = await extractFornecedorFromDoc(fd);
        const filled: string[] = [];
        // Não sobrescreve campos já preenchidos manualmente sem necessidade:
        // só preenche o que a IA trouxe E o campo está vazio.
        const set = (
          val: string,
          cur: string,
          setter: (v: string) => void,
          label: string,
        ) => {
          if (val && !cur.trim()) {
            setter(val);
            filled.push(label);
          }
        };
        set(x.nome, nome, setNome, "nome");
        set(x.nomeFantasia, nomeFantasia, setNomeFantasia, "nome fantasia");
        if (x.tipo && tipo === "PJ") {
          setTipo(x.tipo);
        }
        set(x.doc, doc, setDoc, "documento");
        set(x.contato, contato, setContato, "contato");
        set(x.email, email, setEmail, "e-mail");
        set(x.tel, tel, setTel, "telefone");
        set(x.whatsapp, whatsapp, setWhatsapp, "whatsapp");
        set(x.site, site, setSite, "site");
        set(x.endereco, endereco, setEndereco, "endereço");
        set(x.numero, numero, setNumero, "número");
        set(x.complemento, complemento, setComplemento, "complemento");
        set(x.bairro, bairro, setBairro, "bairro");
        set(x.cidade, cidade, setCidade, "cidade");
        set(x.estado, estado, setEstado, "estado");
        set(x.cep, cep, setCep, "CEP");
        if (x.papeis.length && selected.size === 0) {
          setSelected(new Set(x.papeis));
          filled.push("papéis");
        }
        setLowConf(new Set(x.baixaConfianca ?? []));
        setNotice(
          filled.length
            ? `Campos preenchidos pela IA: ${filled.join(", ")}. Revise e ajuste antes de cadastrar.` +
                (x.baixaConfianca?.length
                  ? ` Confira os campos com baixa confiança: ${x.baixaConfianca.join(", ")}.`
                  : "")
            : "A IA não conseguiu identificar campos com confiança — preencha manualmente.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao ler o documento.");
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
        setLowConf(new Set());
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
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
        <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label>
                Documento (PDF ou imagem — cartão CNPJ, contrato, cartão de visita)
              </Label>
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
              ? "A IA lê o documento e preenche os campos abaixo — revise antes de cadastrar."
              : "Leitura automática por IA desativada (defina ANTHROPIC_API_KEY para habilitar)."}
          </p>
        </div>

        {/* Campos do fornecedor */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Razão social / nome"
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option>PJ</option>
              <option>PF</option>
            </Select>
          </div>
          <div>
            <Label>CNPJ / CPF</Label>
            <Input value={doc} onChange={(e) => setDoc(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Nome fantasia{lc("nomeFantasia")}</Label>
            <Input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Pessoa de contato{lc("contato")}</Label>
            <Input value={contato} onChange={(e) => setContato(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>E-mail{lc("email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Telefone{lc("tel")}</Label>
            <Input value={tel} onChange={(e) => setTel(e.target.value)} />
          </div>
          <div>
            <Label>WhatsApp{lc("whatsapp")}</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Site{lc("site")}</Label>
            <Input value={site} onChange={(e) => setSite(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Label>Endereço{lc("endereco")}</Label>
            <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </div>
          <div>
            <Label>Número{lc("numero")}</Label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Complemento{lc("complemento")}</Label>
            <Input value={complemento} onChange={(e) => setComplemento(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Bairro{lc("bairro")}</Label>
            <Input value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Cidade{lc("cidade")}</Label>
            <Input value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </div>
          <div>
            <Label>Estado{lc("estado")}</Label>
            <Input value={estado} onChange={(e) => setEstado(e.target.value)} maxLength={2} />
          </div>
          <div>
            <Label>CEP{lc("cep")}</Label>
            <Input value={cep} onChange={(e) => setCep(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Papéis</Label>
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
        </div>

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
