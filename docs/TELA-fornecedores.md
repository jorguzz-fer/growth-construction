# TELA-fornecedores — código na íntegra

Coleta do código da tela **Fornecedores & Stakeholders** (`/fornecedores`),
em `main` (commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria (recursiva):**

```
fornecedores/page.tsx
├── components/app/page-header.tsx
├── components/app/fornecedor-form.tsx
│   ├── components/ui/upload-documentos.tsx
│   └── components/ui/campo-ia.tsx        (CampoIA, ResumoLeituraIA)
└── components/app/fornecedores-table.tsx

`upload-documentos` e `campo-ia` moram em `components/ui/`, mas não são
primitivas genéricas como button/input/card — são componentes próprios deste
app, com lógica de leitura por IA. Por isso entram na coleta. As primitivas
de verdade (card, button, input, badge, table) ficam de fora, como nos
documentos anteriores.

query chamada:  getStakeholders   — é a ÚNICA
actions:        addStakeholder, updateStakeholder, setStakeholderAtivo,
                deleteStakeholder, extractFornecedorFromDoc
                — todas em actions/despesas.ts, não em arquivo próprio
```

> **A página não verifica permissão de "ver".** Só usa `can` para calcular
> `canEditar` e `canExcluir` (linhas 49–50). Quem a governa é o enforcement
> central do layout, já que `fornecedores` está em `SCREENS`.

---

## 1. Página

### `src/app/(app)/fornecedores/page.tsx`

```tsx
import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getStakeholders } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/despesa-extract";
import { PAPEIS_STAKEHOLDER } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { FornecedorForm } from "@/components/app/fornecedor-form";
import { FornecedoresTable } from "@/components/app/fornecedores-table";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const stakeholders = await getStakeholders(ctx.tenant.id);

  return (
    <>
      <PageHeader
        title="Fornecedores & Stakeholders"
        subtitle={`Registro global do tenant · ${stakeholders.length} cadastrados`}
        actions={
          <Link
            href="/contas"
            className="text-[12px] text-[var(--color-accent2)] hover:underline"
          >
            Contas correntes →
          </Link>
        }
      />

      {/* Novo stakeholder */}
      <FornecedorForm papeis={PAPEIS_STAKEHOLDER} aiConfigured={isAiConfigured()} />

      <FornecedoresTable
        stakeholders={stakeholders.map((s) => ({
          id: s.id,
          nome: s.nome,
          tipo: s.tipo,
          doc: s.doc,
          papeis: s.papeis,
          email: s.email,
          tel: s.tel,
          obs: s.obs,
          ativo: s.ativo,
        }))}
        papeis={PAPEIS_STAKEHOLDER}
        canEditar={can(ctx.perms, "fornecedores", "editar")}
        canExcluir={can(ctx.perms, "fornecedores", "excluir")}
      />
    </>
  );
}
```

---

## 2. Componentes próprios (recursivo)

### `src/components/app/page-header.tsx`

```tsx
import * as React from "react";

export function PageHeader({
  title,
  actions,
}: {
  /** Mantidos por compatibilidade; ocultados por ora para um visual mais clean. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
```

### `src/components/app/fornecedor-form.tsx`

```tsx
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
        // A action RETORNA o erro em vez de lançar: em produção o Next.js
        // esconde a mensagem de erro lançado por Server Action.
        const lido = await extractFornecedorFromDoc(fd);
        if (!lido.ok) {
          setErroLeitura(lido.error);
          return;
        }
        // A regra de "não sobrescrever o que o usuário digitou" e a decisão do
        // que vira alerta moram em `fornecedor-doc.ts` (puro e testado).
        const res = montarPreenchimentoFornecedor(
          lido.data,
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
      } catch {
        // Só resta o caso que a action não alcança (rede, sessão expirada).
        setErroLeitura("Falha ao ler o documento — verifique a conexão e tente novamente.");
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
```

### `src/components/app/fornecedores-table.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateStakeholder,
  setStakeholderAtivo,
  deleteStakeholder,
} from "@/lib/actions/despesas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface StakeholderView {
  id: string;
  nome: string;
  tipo: string;
  doc: string | null;
  papeis: string[];
  email: string | null;
  tel: string | null;
  obs: string | null;
  ativo: boolean;
}

export function FornecedoresTable({
  stakeholders,
  papeis,
  canEditar,
  canExcluir,
}: {
  stakeholders: StakeholderView[];
  papeis: readonly string[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const visiveis = stakeholders.filter((s) => mostrarInativos || s.ativo);

  return (
    <div className="space-y-3">
      <label className="flex w-fit cursor-pointer items-center gap-2 text-[12.5px] text-[var(--color-ink2)]">
        <input
          type="checkbox"
          checked={mostrarInativos}
          onChange={(e) => setMostrarInativos(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-accent2)]"
        />
        Mostrar inativos
      </label>

      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>Tipo</TH>
            <TH>Documento</TH>
            <TH>Papéis</TH>
            <TH>Status</TH>
            {(canEditar || canExcluir) && <TH className="text-right">Ações</TH>}
          </tr>
        </THead>
        <tbody>
          {visiveis.map((s) => (
            <StakeholderRow
              key={s.id}
              s={s}
              papeis={papeis}
              canEditar={canEditar}
              canExcluir={canExcluir}
            />
          ))}
          {visiveis.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum cadastro.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </div>
  );
}

function StakeholderRow({
  s,
  papeis,
  canEditar,
  canExcluir,
}: {
  s: StakeholderView;
  papeis: readonly string[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleAtivo = () =>
    start(async () => {
      try {
        await setStakeholderAtivo(s.id, !s.ativo);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha.");
      }
    });

  const excluir = () => {
    if (!window.confirm(`Excluir definitivamente "${s.nome}"? (Se houver histórico, prefira inativar.)`)) return;
    start(async () => {
      try {
        await deleteStakeholder(s.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao excluir.");
      }
    });
  };

  if (editing) {
    return (
      <TR>
        <TD colSpan={6}>
          <form
            action={async (fd) => {
              await updateStakeholder(fd);
              setEditing(false);
              router.refresh();
            }}
            className="rounded-[8px] border border-[var(--color-accent2)]/15 bg-[var(--color-surface2)] p-3"
          >
            <input type="hidden" name="id" value={s.id} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="sm:col-span-2"><Label>Nome</Label><Input name="nome" defaultValue={s.nome} required /></div>
              <div>
                <Label>Tipo</Label>
                <Select name="tipo" defaultValue={s.tipo}>
                  <option value="PJ">PJ</option>
                  <option value="PF">PF</option>
                </Select>
              </div>
              <div><Label>Documento</Label><Input name="doc" defaultValue={s.doc ?? ""} /></div>
              <div><Label>E-mail</Label><Input name="email" defaultValue={s.email ?? ""} /></div>
              <div><Label>Telefone</Label><Input name="tel" defaultValue={s.tel ?? ""} /></div>
              <div className="sm:col-span-2"><Label>Observação</Label><Input name="obs" defaultValue={s.obs ?? ""} /></div>
            </div>
            <div className="mt-2">
              <Label>Papéis (uma pessoa pode ter vários)</Label>
              <div className="flex flex-wrap gap-2">
                {papeis.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-[12.5px] text-[var(--color-ink2)]">
                    <input
                      type="checkbox"
                      name="papeis"
                      value={p}
                      defaultChecked={s.papeis.includes(p)}
                      className="h-4 w-4 accent-[var(--color-accent2)]"
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" type="submit" disabled={pending}>Salvar</Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
            </div>
          </form>
        </TD>
      </TR>
    );
  }

  return (
    <TR className={s.ativo ? undefined : "opacity-60"}>
      <TD className="font-medium text-[var(--color-ink)]">{s.nome}</TD>
      <TD><Badge tone={s.tipo === "PJ" ? "info" : "neutral"}>{s.tipo}</Badge></TD>
      <TD className="font-[family-name:var(--font-mono)]">{s.doc || "—"}</TD>
      <TD>
        <div className="flex flex-wrap gap-1">
          {s.papeis.length ? s.papeis.map((p) => <Badge key={p}>{p}</Badge>) : <span className="text-[var(--color-ink4)]">—</span>}
        </div>
      </TD>
      <TD><Badge tone={s.ativo ? "success" : "neutral"}>{s.ativo ? "Ativo" : "Inativo"}</Badge></TD>
      {(canEditar || canExcluir) && (
        <TD className="text-right">
          <div className="flex flex-wrap justify-end gap-2">
            {canEditar && (
              <button onClick={() => setEditing(true)} disabled={pending} className="text-sm text-[var(--color-accent2)] hover:underline disabled:opacity-50">Editar</button>
            )}
            {canEditar && (
              <button onClick={toggleAtivo} disabled={pending} className="text-sm text-[var(--color-warning)] hover:underline disabled:opacity-50">
                {s.ativo ? "Inativar" : "Reativar"}
              </button>
            )}
            {canExcluir && (
              <button onClick={excluir} disabled={pending} className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50">Excluir</button>
            )}
          </div>
          {error && <p className="mt-1 text-[11px] text-[var(--color-danger)]">{error}</p>}
        </TD>
      )}
    </TR>
  );
}
```

### `src/components/ui/upload-documentos.tsx`

Importado por `fornecedor-form.tsx`.

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { legivelPelaIa } from "@/lib/ai/campos";

/**
 * Bloco de upload de documentos — o mesmo em toda tela que aceita arquivo.
 *
 * O que ele resolve: o `<input type="file">` cru mostrava "Escolher arquivos /
 * Nenhum arquivo escolhido" (texto do navegador, fora do idioma e do visual do
 * app) e a única pista do que fazer depois era um parágrafo cinza misturando
 * três assuntos — leitura por IA, chave de ambiente e armazenamento. Ficava
 * confuso justamente para quem está lançando com o celular na mão.
 *
 * Agora a ação está em dois botões nomeados, na ordem em que se usa:
 *
 *   [ Subir arquivos ]  [ Preencher formulário ]
 *
 * O primeiro abre o seletor; o segundo executa o trabalho sobre o que foi
 * subido (ler e preencher, anexar ao lançamento — quem define é a tela). Cada
 * arquivo vira uma linha com nome, tamanho e um botão de remover, então dá
 * para conferir e corrigir antes de agir.
 *
 * Todo texto de domínio (o que subir, por que a ação está indisponível) vem da
 * tela via props: este componente não sabe o que é despesa nem fornecedor.
 */

export interface AcaoDocumentos {
  /** Rótulo normal, ex.: "Preencher formulário". */
  label: string;
  /** Rótulo enquanto executa, ex.: "Lendo documentos…". */
  labelOcupado: string;
  /** Rótulo depois da primeira execução, ex.: "Preencher novamente". */
  labelRepetir?: string;
  /** Já executou uma vez nesta seleção? (troca para `labelRepetir`) */
  repetiu?: boolean;
  ocupado: boolean;
  desabilitada?: boolean;
  /** Por que está desabilitada / o que ela faz — vira `title` do botão. */
  motivo?: string;
  /**
   * Repete o `motivo` ao lado do botão. Só vale a pena quando é algo que a
   * pessoa resolve ali mesmo ("suba um PDF"); motivo de configuração do
   * servidor já aparece no aviso e repetir vira ruído.
   */
  motivoVisivel?: boolean;
  onClick: () => void;
  variante?: "default" | "outline";
}

export type TomAviso = "info" | "atencao" | "erro" | "ok";

export interface AvisoDocumentos {
  tom: TomAviso;
  texto: React.ReactNode;
}

const TOM_AVISO: Record<TomAviso, string> = {
  info: "text-[var(--color-ink3)]",
  atencao:
    "rounded-[8px] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-2.5 py-2 text-[#92400e]",
  erro: "rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/8 px-2.5 py-2 text-[var(--color-danger)]",
  ok: "text-[var(--color-success)]",
};

function tamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function UploadDocumentos({
  titulo,
  descricao,
  arquivos,
  onArquivos,
  acao,
  avisos = [],
  multiplo = true,
  accept,
  desabilitado = false,
  marcarLegibilidade = false,
  limiteTotalBytes,
  className,
}: {
  titulo: string;
  /** Uma linha dizendo o que subir aqui. */
  descricao: React.ReactNode;
  arquivos: File[];
  /**
   * `adicionados` traz só os arquivos recém-escolhidos (vazio quando a mudança
   * foi uma remoção) — é o que permite à tela agir no upload sem reagir de
   * novo quando alguém tira um arquivo da lista.
   */
  onArquivos: (lista: File[], adicionados: File[]) => void;
  /** Botão de ação principal sobre os arquivos. Sem ele, só há o upload. */
  acao?: AcaoDocumentos;
  avisos?: AvisoDocumentos[];
  multiplo?: boolean;
  accept?: string;
  desabilitado?: boolean;
  /** Marca na lista os arquivos que a IA não consegue ler (XML, planilha…). */
  marcarLegibilidade?: boolean;
  /** Acima disto o envio não cabe na requisição — vira aviso, não bloqueio. */
  limiteTotalBytes?: number;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const total = arquivos.reduce((a, f) => a + f.size, 0);
  const estourou = !!limiteTotalBytes && total > limiteTotalBytes;

  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const novos = Array.from(e.target.files ?? []);
    // Zera o input para que escolher o MESMO arquivo de novo dispare o evento
    // (o navegador não emite change quando o valor não muda).
    e.target.value = "";
    if (novos.length === 0) return;
    const lista = multiplo ? [...arquivos, ...novos] : novos;
    onArquivos(lista, novos);
  };

  const remover = (i: number) => {
    onArquivos(
      arquivos.filter((_, idx) => idx !== i),
      [],
    );
  };

  const rotuloAcao = acao
    ? acao.ocupado
      ? acao.labelOcupado
      : acao.repetiu && acao.labelRepetir
        ? acao.labelRepetir
        : acao.label
    : "";

  return (
    <div
      className={cn(
        "rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4",
        className,
      )}
    >
      <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
        {titulo}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink2)]">
        {descricao}
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple={multiplo}
        accept={accept}
        hidden
        onChange={escolher}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={desabilitado}
          onClick={() => inputRef.current?.click()}
        >
          {arquivos.length > 0 ? "Adicionar mais arquivos" : "Subir arquivos"}
        </Button>
        {acao && (
          <Button
            type="button"
            variant={acao.variante ?? "default"}
            disabled={desabilitado || acao.desabilitada || acao.ocupado}
            title={acao.motivo}
            onClick={acao.onClick}
          >
            {rotuloAcao}
          </Button>
        )}
        {acao?.desabilitada && acao.motivoVisivel && acao.motivo && (
          <span className="text-[11.5px] text-[var(--color-ink3)]">{acao.motivo}</span>
        )}
      </div>

      {arquivos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {arquivos.map((f, i) => {
            const ilegivel = marcarLegibilidade && !legivelPelaIa(f.type);
            return (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface)] px-3 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[12.5px] text-[var(--color-ink)]">
                    {f.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--color-ink4)]">
                    {tamanho(f.size)}
                  </span>
                  {ilegivel && (
                    <span
                      className="shrink-0 rounded-full bg-[var(--color-surface3)] px-1.5 py-0.5 text-[9.5px] text-[var(--color-ink3)]"
                      title="A IA lê PDF e imagem. Este arquivo será apenas anexado."
                    >
                      só anexo
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={desabilitado}
                  onClick={() => remover(i)}
                  title={`Remover ${f.name} da lista`}
                  aria-label={`Remover ${f.name}`}
                  className="shrink-0 rounded-[6px] px-2 py-0.5 text-[13px] text-[var(--color-ink3)] hover:bg-[var(--color-surface3)] hover:text-[var(--color-danger)] disabled:opacity-50"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(avisos.length > 0 || estourou) && (
        <div className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed">
          {estourou && (
            <p className={TOM_AVISO.atencao}>
              Os arquivos somam {tamanho(total)} e o limite por envio é{" "}
              {tamanho(limiteTotalBytes!)}. Remova algum e envie em partes — os já
              enviados são preservados.
            </p>
          )}
          {avisos.map((a, i) => (
            <p key={i} className={TOM_AVISO[a.tom]}>
              {a.texto}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
```

### `src/components/ui/campo-ia.tsx`

Importado por `fornecedor-form.tsx` (`CampoIA` e `ResumoLeituraIA`).

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/input";
import { contarAlertas, type Alerta } from "@/lib/ai/campos";

/**
 * Marcação visual dos campos preenchidos por leitura de documento (IA).
 *
 * Regra da tela, igual em qualquer módulo que aceite subir documento:
 *
 *   - campo lido com certeza  → fica normal, sem ruído;
 *   - campo que a IA não achou → moldura de ALERTA "faltando" + motivo;
 *   - campo duvidoso/deduzido  → moldura de ALERTA "conferir" + motivo.
 *
 * O alerta some assim que o usuário mexe no campo: quem editou já conferiu, e
 * manter a marca depois disso vira poluição. Isso é responsabilidade da tela —
 * ela simplesmente para de passar o alerta (ver `limparAlerta` no formulário).
 *
 * Nada aqui bloqueia gravação: alerta é sinal, não trava.
 */

const TOM: Record<
  Alerta["nivel"],
  { borda: string; texto: string; chip: string; rotulo: string; titulo: string }
> = {
  faltando: {
    borda: "ring-2 ring-[var(--color-danger)]/35",
    texto: "text-[#b45309]",
    chip: "bg-[#fee2e2] text-[#991b1b]",
    rotulo: "⚠ faltando",
    titulo: "A IA não encontrou esta informação no documento",
  },
  conferir: {
    borda: "ring-2 ring-[var(--color-warning)]/45",
    texto: "text-[#92400e]",
    chip: "bg-[#fef3c7] text-[#92400e]",
    rotulo: "⚠ conferir",
    titulo: "Preenchido sem certeza — confira antes de gravar",
  },
};

/** Selo curto ao lado do rótulo do campo. */
export function SeloAlerta({ alerta }: { alerta: Alerta }) {
  const t = TOM[alerta.nivel];
  return (
    <span
      title={alerta.motivo || t.titulo}
      className={cn(
        "ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 align-middle text-[9.5px] font-medium normal-case tracking-normal font-[family-name:var(--font-mono)]",
        t.chip,
      )}
    >
      {t.rotulo}
    </span>
  );
}

/**
 * Envolve um campo do formulário: rótulo + selo + moldura + motivo.
 *
 * Uso: `<CampoIA label="Valor" alerta={alertas.valor}><MoneyInput …/></CampoIA>`
 * Com `alerta` nulo/ausente ele é apenas um `<Label>` + o campo — ou seja, dá
 * para trocar todos os campos da tela por `CampoIA` sem mudar a aparência de
 * quem nunca subiu documento.
 */
export function CampoIA({
  label,
  alerta,
  children,
  className,
  hint,
}: {
  label: React.ReactNode;
  alerta?: Alerta | null;
  children: React.ReactNode;
  className?: string;
  /** Texto auxiliar fixo do campo (aparece abaixo, sem relação com a IA). */
  hint?: React.ReactNode;
}) {
  const t = alerta ? TOM[alerta.nivel] : null;
  return (
    <div className={className}>
      <Label>
        {label}
        {alerta && <SeloAlerta alerta={alerta} />}
      </Label>
      <div className={cn("rounded-[9px]", t?.borda)}>{children}</div>
      {alerta?.motivo && (
        <p className={cn("mt-1 text-[11px] leading-snug", t?.texto)}>{alerta.motivo}</p>
      )}
      {hint && !alerta && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink3)]">{hint}</p>
      )}
    </div>
  );
}

/**
 * Resumo da leitura, no topo do formulário: o que a IA entendeu do documento,
 * o que preencheu e o que ficou pendente de conferência.
 *
 * Existe porque o alerta por campo, sozinho, obriga a varrer a tela inteira
 * para saber se sobrou algo — aqui o usuário vê o placar de uma vez.
 */
export function ResumoLeituraIA({
  titulo,
  resumo,
  preenchidos,
  alertas,
  rotulos,
  observacoes = [],
  onFechar,
}: {
  /** Ex.: "Comprovante de pagamento · 2 arquivos". */
  titulo: string;
  /** Frase da IA sobre o que é o documento. */
  resumo?: string;
  preenchidos: string[];
  alertas: Record<string, Alerta>;
  /** Tradução campo → rótulo exibido. */
  rotulos: Record<string, string>;
  observacoes?: string[];
  onFechar?: () => void;
}) {
  const { faltando, conferir, total } = contarAlertas(alertas);
  const lista = Object.entries(alertas);
  return (
    <div className="rounded-[10px] border border-[var(--color-accent2)]/25 bg-[var(--color-surface2)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            Leitura do documento · {titulo}
          </p>
          {resumo && (
            <p className="mt-1 text-[13px] text-[var(--color-ink)]">{resumo}</p>
          )}
        </div>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            title="Limpar as marcas de alerta desta leitura"
            className="shrink-0 rounded-[6px] border border-[var(--color-accent2)]/25 px-2 py-1 text-[11px] text-[var(--color-ink3)] hover:bg-[var(--color-surface3)]"
          >
            Limpar alertas
          </button>
        )}
      </div>

      <p className="mt-2 text-[12px] text-[var(--color-ink2)]">
        {preenchidos.length > 0
          ? `${preenchidos.length} campo(s) preenchido(s): ${preenchidos.join(", ")}.`
          : "Nenhum campo pôde ser preenchido automaticamente."}
        {total > 0
          ? ` ${faltando} faltando · ${conferir} para conferir — os campos estão marcados abaixo.`
          : " Nada pendente de conferência."}
      </p>

      {lista.length > 0 && (
        <ul className="mt-2 space-y-1">
          {lista.map(([campo, a]) => (
            <li key={campo} className="text-[11.5px] leading-snug">
              <span
                className={cn(
                  "font-medium",
                  a.nivel === "faltando" ? "text-[#991b1b]" : "text-[#92400e]",
                )}
              >
                {rotulos[campo] ?? campo}:
              </span>{" "}
              <span className="text-[var(--color-ink2)]">{a.motivo}</span>
            </li>
          ))}
        </ul>
      )}

      {observacoes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11.5px] text-[var(--color-ink3)]">
          {observacoes.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-[var(--color-ink4)]">
        A leitura é um rascunho: nada é gravado até você conferir e salvar.
      </p>
    </div>
  );
}
```

---

## 3. Funções de `queries.ts` chamadas pela página

Apenas uma. Sem filtro de `ativo`: a tela recebe ativos e inativos e decide
na interface o que fazer com cada um.

### `src/lib/queries.ts` · linhas 192–200

```ts
export async function getStakeholders(
  tenantId: string,
): Promise<StakeholderRow[]> {
  return db
    .select()
    .from(schema.stakeholders)
    .where(eq(schema.stakeholders.tenantId, tenantId))
    .orderBy(asc(schema.stakeholders.nome));
}
```

---

## 4. As Server Actions de fornecedor/stakeholder


Não existe `src/lib/actions/fornecedores.ts`. As cinco actions vivem dentro de
`src/lib/actions/despesas.ts`, nas primeiras 221 linhas do arquivo.

### `src/lib/actions/despesas.ts` · linhas 36–98

`addStakeholder` — sem permissão, faz `return` silencioso (não lança).

```ts
export async function addStakeholder(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) return;
  const papeis = formData.getAll("papeis").map(String).filter(Boolean);
  const g = (k: string) => ((formData.get(k) as string) || "").trim() || null;
  const [row] = await db
    .insert(schema.stakeholders)
    .values({
      tenantId: ctx.tenant.id,
      nome: (formData.get("nome") as string) || "Sem nome",
      tipo: (formData.get("tipo") as "PJ" | "PF") || "PJ",
      doc: g("doc"),
      papeis,
      email: g("email"),
      tel: g("tel"),
      obs: g("obs"),
      // Dados complementares (cadastro inteligente por imagem/PDF — Seção 1).
      nomeFantasia: g("nomeFantasia"),
      contato: g("contato"),
      whatsapp: g("whatsapp"),
      site: g("site"),
      endereco: g("endereco"),
      numero: g("numero"),
      complemento: g("complemento"),
      bairro: g("bairro"),
      cidade: g("cidade"),
      estado: g("estado"),
      cep: g("cep"),
    })
    .returning();

  // O arquivo original permanece anexado ao cadastro do fornecedor (auditoria).
  const file = formData.get("file") as File | null;
  if (file && file.size > 0 && isR2Configured()) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `tenants/${ctx.tenant.id}/fornecedores/${Date.now()}_${safe}`;
    await putObject(
      key,
      new Uint8Array(await file.arrayBuffer()),
      file.type || "application/octet-stream",
    );
    await db.insert(schema.documents).values({
      tenantId: ctx.tenant.id,
      stakeholderId: row.id,
      storageKey: key,
      filename: file.name,
      contentType: file.type || null,
      size: file.size,
      tipo: "Cadastro de fornecedor",
      uploadedBy: ctx.userEmail || ctx.userId || null,
    });
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "stakeholder.create",
    entity: "stakeholder",
    entityId: row.id,
    meta: { nome: row.nome, papeis, comDocumento: !!(file && file.size > 0) },
  });
  revalidatePath("/fornecedores");
}
```

### `src/lib/actions/despesas.ts` · linhas 100–133

`updateStakeholder`.

```ts
/**
 * Edita um cadastro de pessoa (fornecedor/prestador/corretor…). Permite ajustar
 * os múltiplos papéis sem perder o histórico e os vínculos (mesma id).
 */
export async function updateStakeholder(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "editar")) {
    throw new Error("Sem permissão para editar cadastros.");
  }
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  const papeis = formData.getAll("papeis").map(String).filter(Boolean);
  await db
    .update(schema.stakeholders)
    .set({
      nome: (formData.get("nome") as string) || "Sem nome",
      tipo: (formData.get("tipo") as "PJ" | "PF") || "PJ",
      doc: (formData.get("doc") as string) || null,
      papeis,
      email: (formData.get("email") as string) || null,
      tel: (formData.get("tel") as string) || null,
      obs: (formData.get("obs") as string) || null,
    })
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "stakeholder.update",
    entity: "stakeholder",
    entityId: id,
    meta: { papeis },
  });
  revalidatePath("/fornecedores");
}
```

### `src/lib/actions/despesas.ts` · linhas 135–153

`setStakeholderAtivo` — o "Inativar"/"Reativar".

```ts
/** Inativa/reativa (exclusão lógica) um cadastro, preservando vínculos. */
export async function setStakeholderAtivo(id: string, ativo: boolean) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "editar")) {
    throw new Error("Sem permissão.");
  }
  await db
    .update(schema.stakeholders)
    .set({ ativo })
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: ativo ? "stakeholder.reactivate" : "stakeholder.deactivate",
    entity: "stakeholder",
    entityId: id,
  });
  revalidatePath("/fornecedores");
}
```

### `src/lib/actions/despesas.ts` · linhas 155–185

`deleteStakeholder` — o "Excluir".

```ts
/**
 * Exclusão física de um cadastro — só quando não há despesas vinculadas. Caso
 * haja histórico, oriente a inativar (exclusão lógica) em vez de excluir.
 */
export async function deleteStakeholder(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "excluir")) {
    throw new Error("Sem permissão.");
  }
  const [vinc] = await db
    .select({ id: schema.despesas.id })
    .from(schema.despesas)
    .where(and(eq(schema.despesas.fornecedorId, id), eq(schema.despesas.tenantId, ctx.tenant.id)))
    .limit(1);
  if (vinc) {
    throw new Error(
      "Este cadastro possui despesas vinculadas — inative-o (exclusão lógica) para preservar o histórico.",
    );
  }
  await db
    .delete(schema.stakeholders)
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "stakeholder.delete",
    entity: "stakeholder",
    entityId: id,
  });
  revalidatePath("/fornecedores");
}
```

### `src/lib/actions/despesas.ts` · linhas 187–221

`extractFornecedorFromDoc` — leitura do documento por IA para pré-preencher o formulário. Devolve `{ ok, error }` em vez de lançar.

```ts
/**
 * Lê um documento (PDF/imagem) com IA e devolve os dados do fornecedor para o
 * cliente pré-preencher o formulário (o usuário revisa antes de cadastrar).
 *
 * Erros são RETORNADOS (não lançados): em produção o Next.js esconde a
 * mensagem de erro lançado por Server Action — ver `extractDespesaFromDoc`.
 */
export async function extractFornecedorFromDoc(
  formData: FormData,
): Promise<
  { ok: true; data: ExtractedFornecedor } | { ok: false; error: string }
> {
  const falha = (error: string) => ({ ok: false as const, error });
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) {
    return falha("Sem permissão para cadastrar fornecedores.");
  }
  if (!isAiConfigured()) {
    return falha("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return falha("Selecione um arquivo.");
  if (file.size > 10 * 1024 * 1024) return falha("Arquivo deve ter até 10 MB.");
  const mime = file.type || "";
  if (!(AI_ACCEPTED_MIME as readonly string[]).includes(mime)) {
    return falha("Envie um PDF ou imagem (PNG, JPG ou WebP).");
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { ok: true, data: await extractFornecedorFromDocument(bytes, mime) };
  } catch (e) {
    console.error("[fornecedor] falha na leitura por IA:", e);
    return falha(e instanceof Error ? e.message : "Falha ao ler o documento.");
  }
}
```

---

## 5. A tabela `stakeholder` e o formato da coluna `papeis`


### 5.1 O formato é array nativo do Postgres — `text[]`

Não é JSON em texto nem lista separada por vírgula. É uma coluna de **array**
de verdade, e isso está fixado desde a primeira migração, não só na camada
Drizzle:

| Fonte | Declaração |
|---|---|
| `src/lib/db/schema.ts:493` | `papeis: text("papeis").array().notNull().default([])` |
| `src/lib/db/migrations/0001_tan_misty_knight.sql:129` | `"papeis" text[] DEFAULT '{}' NOT NULL` |

Nenhuma migração posterior altera o tipo dessa coluna. O código sempre a trata
como array: `formData.getAll("papeis")` grava um `string[]`
(`despesas.ts:39` e `:111`), e a leitura usa `.includes(...)`
(`queries.ts:215`) e `.map(...)` (`fornecedores-table.tsx:186`) — nunca
`JSON.parse` nem `.split(",")`.

### 5.2 O que isso significa na prática

A representação em disco é a literal de array do Postgres: `{}` para vazio,
`{"Fornecedor de Material"}` para um papel, `{Incorporador,Construtora}` para
dois. Isso é *como o Postgres imprime um `text[]`* — não é o conteúdo gravado.
Papel com vírgula ou aspas no nome é escapado automaticamente pelo driver; os
19 nomes da lista não têm nenhum dos dois.

### 5.3 O que só uma consulta responde

O **tipo** está provado pelo DDL. O que o código não responde é se algum
registro de produção guarda conteúdo fora do esperado — papel que não está na
lista, array vazio, ou string única contendo vírgulas (o que aconteceria se
alguém tivesse importado dados por fora do app). Esta sessão não tem acesso ao
banco de produção. O SQL somente-leitura para conferir:

```sql
-- 1) Confirma o tipo real da coluna: espera-se udt_name = '_text' (array de text).
SELECT data_type, udt_name
  FROM information_schema.columns
 WHERE table_name = 'stakeholder' AND column_name = 'papeis';

-- 2) Distribuição: quantos cadastros por quantidade de papéis.
SELECT cardinality(papeis) AS qtd_papeis, count(*)
  FROM stakeholder GROUP BY 1 ORDER BY 1;

-- 3) Papéis distintos realmente gravados, com a contagem.
SELECT p AS papel, count(*)
  FROM stakeholder, unnest(papeis) AS p
 GROUP BY 1 ORDER BY 2 DESC;

-- 4) Papéis gravados que NÃO estão na lista de 19 (lixo ou importação por fora).
SELECT DISTINCT p
  FROM stakeholder, unnest(papeis) AS p
 WHERE p NOT IN (
   'Fornecedor de Material','Prestador de Serviço','Mão de Obra CLT',
   'Mão de Obra RPA','Banco/Financiador','Comprador de Unidade',
   'Sócio/Quotista','Responsável Técnico (RT)','Imobiliária Parceira',
   'Corretor Autônomo','Incorporador','Construtora','Escritório Contábil',
   'Escritório Jurídico','Agência de Marketing','Empresa de Tecnologia',
   'Órgão Público','Consultor/Assessor','Seguradora');

-- 5) Elemento que contenha vírgula — sinal de lista colada num só item.
SELECT id, nome, papeis
  FROM stakeholder, unnest(papeis) AS p
 WHERE p LIKE '%,%';
```

### `src/lib/db/schema.ts` · linhas 483–512

A tabela inteira.

```ts
/** Stakeholder global do tenant (compartilhado entre versões). §3 e §8.2 */
export const stakeholders = pgTable("stakeholder", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: stakeholderTypeEnum("tipo").notNull().default("PJ"),
  doc: text("doc"),
  /** múltiplos papéis (ver PAPEIS_STAKEHOLDER em src/lib/calc/constants). */
  papeis: text("papeis").array().notNull().default([]),
  email: text("email"),
  tel: text("tel"),
  obs: text("obs"),
  // Dados complementares (cadastro inteligente por imagem/PDF). Todos opcionais
  // e retrocompatíveis; `nome` segue sendo a razão social / nome principal.
  nomeFantasia: text("nome_fantasia"),
  contato: text("contato"),
  whatsapp: text("whatsapp"),
  site: text("site"),
  endereco: text("endereco"),
  numero: text("numero"),
  complemento: text("complemento"),
  bairro: text("bairro"),
  cidade: text("cidade"),
  estado: text("estado"),
  cep: text("cep"),
  /** cadastro ativo? Inativação lógica preserva histórico e vínculos. */
  ativo: boolean("ativo").notNull().default(true),
});
```

---

## 6. A lista de papéis: quantos são, onde, e quais governam comportamento


### 6.1 São 19, não 21

A lista tem **19** entradas, nas linhas 284–302 de `src/lib/calc/constants.ts`.
O comentário logo acima (`constants.ts:282`) também diz 19: *"Os 19 papéis
possíveis de um stakeholder. §3"*. Não há nenhuma outra lista de papéis no
repositório — `PAPEIS_STAKEHOLDER` é a declaração única, e tanto o formulário
quanto a tabela a recebem por prop vinda da página (`page.tsx:34` e `:48`).

| # | Papel | # | Papel |
|---|---|---|---|
| 1 | Fornecedor de Material | 11 | Incorporador |
| 2 | Prestador de Serviço | 12 | Construtora |
| 3 | Mão de Obra CLT | 13 | Escritório Contábil |
| 4 | Mão de Obra RPA | 14 | Escritório Jurídico |
| 5 | Banco/Financiador | 15 | Agência de Marketing |
| 6 | Comprador de Unidade | 16 | Empresa de Tecnologia |
| 7 | Sócio/Quotista | 17 | Órgão Público |
| 8 | Responsável Técnico (RT) | 18 | Consultor/Assessor |
| 9 | Imobiliária Parceira | 19 | Seguradora |
| 10 | Corretor Autônomo | | |

### 6.2 Um único papel governa comportamento

Busquei cada um dos 19 nomes como literal em todo o `src/`, descontando a
própria `constants.ts` e os testes. Resultado:

| Papel | Ocorrências fora da lista | O que são |
|---|---|---|
| **Sócio/Quotista** | `queries.ts:203` (comentário), `queries.ts:215` | **filtro real** — ver 6.3 |
| Fornecedor de Material | `db/seed.ts:169` | dado de seed |
| Mão de Obra RPA | `db/seed.ts:170` | dado de seed |
| Construtora | `db/seed.ts:171` | dado de seed |
| *(os outros 15)* | nenhuma | só rótulo |

As demais ocorrências da string `"Construtora"` no repositório
(`contas/page.tsx:72`, `actions/contas.ts:28`, `schema.ts:204` e `:524`) são
**homônimos**: o valor do enum `bankAccountTypeEnum` para tipo de conta
bancária, e o campo `tipoExecutor` do projeto. Não têm relação com o papel do
stakeholder. `"Escritório Contábil"` em `contabilidade/page.tsx:83` é um
`placeholder` de input.

### 6.3 O que "Sócio/Quotista" faz

`getSocios` (`queries.ts:206–217`) traz todos os stakeholders do tenant e
filtra em memória por `r.ativo && r.papeis.includes("Sócio/Quotista")`. É
chamada em um único lugar: `/despesas` (`despesas/page.tsx:104`), para montar
o seletor de "despesa paga por sócio" sem digitação livre.

Consequência: **inativar um stakeholder o remove desse seletor** (o filtro
exige `ativo`), enquanto `getStakeholders` — que alimenta esta tela e todos os
outros seletores de fornecedor do app — não filtra por `ativo`.

### 6.4 Onde os papéis aparecem sem decidir nada

| Local | Uso |
|---|---|
| `fornecedor-form.tsx:364–366` | checkboxes do cadastro |
| `fornecedores-table.tsx:155–161` | checkboxes da edição inline |
| `fornecedores-table.tsx:186` | badges na listagem |
| `ai/fornecedor-extract.ts:129,148–149` | filtra o que a IA devolveu contra a lista dos 19 |
| `ai/fornecedor-doc.ts:74` | `papeis` é campo ESSENCIAL — gera alerta se vier vazio |
| `actions/despesas.ts:95`, `:130` | vão para o `meta` do log de auditoria |

### `src/lib/calc/constants.ts` · linhas 282–304

A declaração única, com o comentário que diz 19.

```ts
/** Os 19 papéis possíveis de um stakeholder. §3 */
export const PAPEIS_STAKEHOLDER = [
  "Fornecedor de Material",
  "Prestador de Serviço",
  "Mão de Obra CLT",
  "Mão de Obra RPA",
  "Banco/Financiador",
  "Comprador de Unidade",
  "Sócio/Quotista",
  "Responsável Técnico (RT)",
  "Imobiliária Parceira",
  "Corretor Autônomo",
  "Incorporador",
  "Construtora",
  "Escritório Contábil",
  "Escritório Jurídico",
  "Agência de Marketing",
  "Empresa de Tecnologia",
  "Órgão Público",
  "Consultor/Assessor",
  "Seguradora",
] as const;
export type PapelStakeholder = (typeof PAPEIS_STAKEHOLDER)[number];
```

### `src/lib/queries.ts` · linhas 202–217

`getSocios` — o único ponto do repositório onde um papel decide algo.

```ts
/**
 * Sócios do tenant: stakeholders ATIVOS com o papel "Sócio/Quotista". Usado no
 * cadastro de "despesa paga por sócio" (seleção sem digitação livre).
 */
export async function getSocios(
  tenantId: string,
): Promise<{ id: string; nome: string }[]> {
  const rows = await db
    .select({ id: schema.stakeholders.id, nome: schema.stakeholders.nome, papeis: schema.stakeholders.papeis, ativo: schema.stakeholders.ativo })
    .from(schema.stakeholders)
    .where(eq(schema.stakeholders.tenantId, tenantId))
    .orderBy(asc(schema.stakeholders.nome));
  return rows
    .filter((r) => r.ativo && (r.papeis ?? []).includes("Sócio/Quotista"))
    .map((r) => ({ id: r.id, nome: r.nome }));
}
```

---

## 7. "Inativar" × "Excluir"


### 7.1 Inativar — `setStakeholderAtivo` (`despesas.ts:136`)

Exclusão **lógica**. Um `UPDATE` de uma coluna: `ativo = false`. Nada mais é
tocado — nenhum vínculo é desfeito, nenhuma despesa é alterada, nenhuma linha
é apagada. É reversível pela mesma action com `ativo = true`, e o log de
auditoria distingue os dois casos
(`stakeholder.deactivate` × `stakeholder.reactivate`, linha 148).

Permissão exigida: `fornecedores:editar`. Sem ela, **lança** `Error`.

O que muda depois de inativar:

| Consulta | Filtra por `ativo`? | Efeito |
|---|---|---|
| `getStakeholders` (`queries.ts:192`) | **não** | continua aparecendo em toda a tela e em todos os seletores de fornecedor |
| `getSocios` (`queries.ts:215`) | **sim** | some do seletor de "pago por sócio" |

### 7.2 Excluir — `deleteStakeholder` (`despesas.ts:159`)

Exclusão **física**: `db.delete(schema.stakeholders)`. A linha some do banco.

Antes de apagar, a action faz **uma** checagem (linhas 164–173): busca a
primeira despesa com `fornecedor_id = id` no mesmo tenant. Se achar, lança

> *"Este cadastro possui despesas vinculadas — inative-o (exclusão lógica) para
> preservar o histórico."*

e não apaga nada. Se não achar, apaga.

Seis tabelas apontam para `stakeholder`. A checagem cobre **uma**:

| Tabela | Coluna | `onDelete` | Linha | Verificado no código? |
|---|---|---|---|---|
| `despesa` | `fornecedor_id` | `set null` | `schema.ts:574` | **sim** |
| `despesa_terceiro` | `pagador_terceiro_id` | `set null` | `schema.ts:632` | não |
| `recebimento_terceiro` | `recebedor_terceiro_id` | `set null` | `schema.ts:738` | não |
| `acerto` | `favorecido_id` | `set null` | `schema.ts:815` | não |
| `compensacao` | `terceiro_id` | `set null` | `schema.ts:938` | não |
| `documento` | `stakeholder_id` | **`cascade`** | `schema.ts:1047` | não |

Duas consequências que saem direto dessas colunas:

- Nas cinco FKs `set null`, a exclusão **não falha**. O banco zera o vínculo e
  o registro dependente fica sem o nome do terceiro. Isso vale inclusive para
  `despesa.fornecedor_id`: a FK é `set null`, então o que impede a despesa de
  ficar órfã é a checagem em código (linhas 164–173), não o banco.
- `documento.stakeholder_id` é **`cascade`**: excluir o cadastro apaga também
  a linha do documento anexado — o mesmo arquivo que `addStakeholder` gravou
  "para auditoria" (`despesas.ts:67`). O objeto no R2 não é removido junto;
  fica sem referência no banco.

Permissão exigida: `fornecedores:excluir`. Sem ela, **lança** `Error`.

### 7.3 Os dois na interface

Os botões estão em `fornecedores-table.tsx`. "Excluir" só é renderizado com
`canExcluir`, e "Inativar"/"Reativar" com `canEditar` — as duas flags vêm da
página (`page.tsx:49–50`).

### `src/lib/actions/despesas.ts` · linhas 135–185

As duas actions lado a lado.

```ts
/** Inativa/reativa (exclusão lógica) um cadastro, preservando vínculos. */
export async function setStakeholderAtivo(id: string, ativo: boolean) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "editar")) {
    throw new Error("Sem permissão.");
  }
  await db
    .update(schema.stakeholders)
    .set({ ativo })
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: ativo ? "stakeholder.reactivate" : "stakeholder.deactivate",
    entity: "stakeholder",
    entityId: id,
  });
  revalidatePath("/fornecedores");
}

/**
 * Exclusão física de um cadastro — só quando não há despesas vinculadas. Caso
 * haja histórico, oriente a inativar (exclusão lógica) em vez de excluir.
 */
export async function deleteStakeholder(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "excluir")) {
    throw new Error("Sem permissão.");
  }
  const [vinc] = await db
    .select({ id: schema.despesas.id })
    .from(schema.despesas)
    .where(and(eq(schema.despesas.fornecedorId, id), eq(schema.despesas.tenantId, ctx.tenant.id)))
    .limit(1);
  if (vinc) {
    throw new Error(
      "Este cadastro possui despesas vinculadas — inative-o (exclusão lógica) para preservar o histórico.",
    );
  }
  await db
    .delete(schema.stakeholders)
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "stakeholder.delete",
    entity: "stakeholder",
    entityId: id,
  });
  revalidatePath("/fornecedores");
}
```

---

## 8. Validação do documento (CNPJ/CPF)


### 8.1 Não há validação de formato

O campo `doc` entra cru nas duas actions:

| Action | Linha | O que faz com `doc` |
|---|---|---|
| `addStakeholder` | `despesas.ts:47` | `g("doc")` — `trim()`, e `null` se vazio. Nada mais. |
| `updateStakeholder` | `despesas.ts:117` | `(formData.get("doc") as string) \|\| null` — **nem `trim()`**. |

Não há checagem de dígito verificador, de comprimento, de máscara, nem
distinção entre CPF e CNPJ. O campo `tipo` (PJ/PF) é independente de `doc`:
nada impede um cadastro `tipo: "PJ"` com CPF no `doc`, ou vice-versa. O
`<Input>` do formulário também não tem `pattern` nem `required`.

### 8.2 O validador existe no repositório — mas não é usado aqui

`src/lib/calc/emitente-fiscal.ts` tem `cnpjValido` (linha 55), com os dois
dígitos verificadores, suporte a CNPJ alfanumérico e recusa de sequência
repetida. Ele é usado em `actions/empresa.ts:81` — para o CNPJ **do próprio
tenant** — e em `documento-fiscal`. **Nenhuma das actions de stakeholder o
importa.**

Não existe nenhum validador de CPF no repositório.

### 8.3 Não há unicidade

A tabela `stakeholder` é declarada com a forma simples do `pgTable` (só o
objeto de colunas, sem o segundo argumento de índices), e nenhuma migração
`.sql` cria índice ou constraint `UNIQUE` sobre `stakeholder`. Também não há
checagem em código: nenhuma das actions consulta se já existe cadastro com o
mesmo `doc` antes de inserir.

Dois cadastros com o mesmo CNPJ, no mesmo tenant, são aceitos sem aviso.

### 8.4 A única checagem relacionada a documento está na leitura por IA

`ai/fornecedor-doc.ts` trata CNPJ/CPF como campo **essencial** e emite alerta
quando o documento vem ilegível ou mascarado — mas isso é sobre o que a IA
leu do arquivo, não sobre o que vai ser gravado. O usuário pode ignorar o
alerta e salvar assim mesmo.

### `src/lib/actions/despesas.ts` · linhas 36–50

Onde `doc` entra em `addStakeholder`.

```ts
export async function addStakeholder(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) return;
  const papeis = formData.getAll("papeis").map(String).filter(Boolean);
  const g = (k: string) => ((formData.get(k) as string) || "").trim() || null;
  const [row] = await db
    .insert(schema.stakeholders)
    .values({
      tenantId: ctx.tenant.id,
      nome: (formData.get("nome") as string) || "Sem nome",
      tipo: (formData.get("tipo") as "PJ" | "PF") || "PJ",
      doc: g("doc"),
      papeis,
      email: g("email"),
      tel: g("tel"),
```

### `src/lib/actions/despesas.ts` · linhas 112–123

Onde `doc` entra em `updateStakeholder` — sem `trim()`.

```ts
  await db
    .update(schema.stakeholders)
    .set({
      nome: (formData.get("nome") as string) || "Sem nome",
      tipo: (formData.get("tipo") as "PJ" | "PF") || "PJ",
      doc: (formData.get("doc") as string) || null,
      papeis,
      email: (formData.get("email") as string) || null,
      tel: (formData.get("tel") as string) || null,
      obs: (formData.get("obs") as string) || null,
    })
    .where(and(eq(schema.stakeholders.id, id), eq(schema.stakeholders.tenantId, ctx.tenant.id)));
```

### `src/lib/calc/emitente-fiscal.ts` · linhas 31–73

`normalizarCnpj`, `cnpjValido` e `formatarCnpj` — existem, e não são chamados por nenhuma action de stakeholder.

```ts
/** Só o que interessa: A–Z e 0–9, em maiúsculas. */
export function normalizarCnpj(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const limpo = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return limpo || null;
}

function valorAscii(ch: string): number {
  return ch.charCodeAt(0) - 48;
}

function dvCnpj(base: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + valorAscii(base[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * CNPJ válido (numérico ou alfanumérico), conferindo os dois dígitos.
 *
 * Vazio devolve `false` — quem quer permitir campo em branco checa isso antes.
 * Sequência de caractere repetido é recusada: `00000000000000` passa no módulo
 * 11 e não é CNPJ de ninguém.
 */
export function cnpjValido(cnpj: string | null | undefined): boolean {
  const v = normalizarCnpj(cnpj);
  if (!v || v.length !== 14) return false;
  if (/^(.)\1{13}$/.test(v)) return false;
  // Os dois últimos caracteres são os DV e continuam sendo dígitos.
  if (!/^[A-Z0-9]{12}\d{2}$/.test(v)) return false;

  const base = v.slice(0, 12);
  const dv1 = dvCnpj(base, PESOS_DV1);
  const dv2 = dvCnpj(base + String(dv1), PESOS_DV2);
  return v.slice(12) === `${dv1}${dv2}`;
}

/** `12.345.678/0001-95` — máscara só para exibição. */
export function formatarCnpj(cnpj: string | null | undefined): string {
  const v = normalizarCnpj(cnpj);
  if (!v || v.length !== 14) return cnpj ?? "";
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}
```
