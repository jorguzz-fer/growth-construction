# TELA-clientes — código na íntegra

Coleta do código das três telas de **Clientes (Compradores)** — `/clientes`,
`/clientes/novo`, `/clientes/[id]` — em `main` (commit `45f4ce3`).
Sem resumo, sem análise.

**Árvore de dependências própria:**

```
clientes/page.tsx
└── components/app/page-header.tsx          (já entregue — pulado)

clientes/novo/page.tsx
├── components/app/page-header.tsx          (já entregue — pulado)
└── components/app/cliente-fields.tsx       ← único componente novo

clientes/[id]/page.tsx
├── components/app/page-header.tsx          (já entregue — pulado)
└── components/app/cliente-fields.tsx       (o mesmo)

queries chamadas:  getClientes             (em TELA-contasreceber.md)
                   getUnitCodesByTenant    (em TELA-unidades.md)
server actions:    addCliente · updateCliente · deleteCliente · uploadClienteDoc
                   (todas em actions/clientes.ts)
```

Três fatos apurados, para o recorte ficar explícito:

- **Não existe `getClienteById` nem equivalente em `queries.ts`.** A página
  `/clientes/[id]` monta a consulta na própria página, com `db.select()`
  direto sobre `schema.clientes` — ver seção 5.
- **Nenhuma função de `queries.ts` restou para esta coleta.** As duas que as
  páginas chamam já foram entregues: `getClientes` em `TELA-contasreceber.md`
  e `getUnitCodesByTenant` em `TELA-unidades.md`.
- **`cliente-fields.tsx` é o único componente próprio novo.** Os demais da
  árvore são `page-header.tsx`, pulado conforme o pedido. `access-denied.tsx`
  e `project-picker.tsx` não são importados por nenhuma destas três páginas.

Ficam de fora os primitivos de `components/ui/` (`badge`, `button`, `card`,
`date-field`, `input`, `table`) e `@/lib/context`, `@/lib/db`,
`@/lib/permissions`, `@/lib/storage/r2`.

---

## 1. `/clientes` — listagem

### `src/app/(app)/clientes/page.tsx`

```tsx
import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getClientes } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const clientes = await getClientes(ctx.tenant.id);
  const canCriar = can(ctx.perms, "clientes", "criar");

  return (
    <>
      <PageHeader
        title="Clientes (Compradores)"
        subtitle={`${clientes.length} compradores cadastrados`}
        actions={
          canCriar ? (
            <Link href="/clientes/novo" className={buttonVariants({ size: "sm" })}>
              + Novo cliente
            </Link>
          ) : undefined
        }
      />

      <Table>
        <THead>
          <tr>
            <TH>Unidade</TH>
            <TH>Nome</TH>
            <TH>CPF/CNPJ</TH>
            <TH>Cidade/Estado</TH>
            <TH>Status contrato</TH>
            <TH className="text-right">Interesse</TH>
            <TH className="text-right">Ação</TH>
          </tr>
        </THead>
        <tbody>
          {clientes.length === 0 ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhum comprador cadastrado.
              </TD>
            </TR>
          ) : (
            clientes.map((c) => (
              <TR key={c.id}>
                <TD className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
                  {c.unitCode ?? "—"}
                </TD>
                <TD className="font-medium text-[var(--color-ink)]">{c.nomeCompleto}</TD>
                <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {c.cpfCnpj ?? "—"}
                </TD>
                <TD>{c.cidadeEstado ?? "—"}</TD>
                <TD>
                  {c.statusContrato ? <Badge tone="neutral">{c.statusContrato}</Badge> : "—"}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {c.interesse != null ? `${c.interesse}/5` : "—"}
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/clientes/${c.id}`}
                    className="text-sm text-[var(--color-accent2)] hover:underline"
                  >
                    Editar
                  </Link>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}
```

---

## 2. `/clientes/novo` — cadastro

### `src/app/(app)/clientes/novo/page.tsx`

```tsx
import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getUnitCodesByTenant } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { addCliente } from "@/lib/actions/clientes";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClienteFields } from "@/components/app/cliente-fields";

export const dynamic = "force-dynamic";

export default async function NovoClientePage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "clientes", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para cadastrar clientes.
      </p>
    );
  }
  const unitCodes = await getUnitCodesByTenant(ctx.tenant.id);

  return (
    <>
      <PageHeader eyebrow={ctx.project.name} title="Novo cliente comprador" />
      <Card>
        <CardContent className="p-5">
          <form action={addCliente} className="space-y-6">
            <ClienteFields unitCodes={unitCodes} />
            <div className="flex items-center gap-2">
              <Button type="submit">Salvar cliente</Button>
              <Link href="/clientes" className={buttonVariants({ variant: "ghost" })}>
                Cancelar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
```

---

## 3. `/clientes/[id]` — edição

### `src/app/(app)/clientes/[id]/page.tsx`

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { getUnitCodesByTenant } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { updateCliente, deleteCliente, uploadClienteDoc } from "@/lib/actions/clientes";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ClienteFields } from "@/components/app/cliente-fields";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const { id } = await params;

  const [cliente] = await db
    .select()
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!cliente) notFound();

  const canEditar = can(ctx.perms, "clientes", "editar");
  const canExcluir = can(ctx.perms, "clientes", "excluir");
  // Todas as unidades do tenant (não só do projeto do contexto). A unidade já
  // vinculada a este cliente sempre aparece na lista, mesmo que vendida.
  const unitCodesAll = await getUnitCodesByTenant(ctx.tenant.id);
  const unitCodes = [
    ...new Set([...(cliente.unitCode ? [cliente.unitCode] : []), ...unitCodesAll]),
  ].sort();

  // Documentos de venda/contrato vinculados a este cliente (mais recentes primeiro).
  const r2 = isR2Configured();
  const docsRaw = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.clienteId, cliente.id), eq(schema.documents.tenantId, ctx.tenant.id)))
    .orderBy(desc(schema.documents.uploadedAt));
  const docs = r2
    ? await Promise.all(docsRaw.map(async (d) => ({ ...d, url: await readUrl(d.storageKey) })))
    : docsRaw.map((d) => ({ ...d, url: null as string | null }));

  return (
    <>
      <PageHeader
        eyebrow={ctx.project.name}
        title={`Cliente: ${cliente.nomeCompleto}`}
        actions={
          canExcluir ? (
            <form action={deleteCliente}>
              <input type="hidden" name="id" value={cliente.id} />
              <Button type="submit" variant="ghost" size="sm">
                Excluir
              </Button>
            </form>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="p-5">
          <form action={updateCliente} className="space-y-6">
            <input type="hidden" name="id" value={cliente.id} />
            <ClienteFields cliente={cliente} unitCodes={unitCodes} />
            {canEditar && (
              <div className="flex items-center gap-2">
                <Button type="submit">Salvar alterações</Button>
                <Link href="/clientes" className={buttonVariants({ variant: "ghost" })}>
                  Voltar
                </Link>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Documentos de venda / contrato */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
            Documentos de venda &amp; contrato
          </h2>
          {!r2 ? (
            <p className="text-[13px] text-[var(--color-ink3)]">
              Configure as variáveis R2_* para habilitar o upload de documentos.
            </p>
          ) : (
            canEditar && (
              <form action={uploadClienteDoc} className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <input type="hidden" name="clienteId" value={cliente.id} />
                <div>
                  <Label>Tipo</Label>
                  <Select name="tipo" defaultValue="">
                    <option value="">—</option>
                    {["Contrato assinado", "Proposta", "Documentos do comprador", "Comprovante", "Termo aditivo", "Distrato", "Outros"].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Select name="unitCode" defaultValue={cliente.unitCode ?? ""}>
                    <option value="">—</option>
                    {unitCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Arquivo (até 15 MB)</Label>
                  <Input type="file" name="file" required />
                </div>
                <div className="flex items-end">
                  <Button type="submit">Enviar documento</Button>
                </div>
              </form>
            )
          )}

          {docs.length > 0 && (
            <Table>
              <THead>
                <tr>
                  <TH>Arquivo</TH>
                  <TH>Tipo</TH>
                  <TH>Unidade</TH>
                  <TH className="text-right">Versão</TH>
                  <TH>Enviado por</TH>
                  <TH>Enviado em</TH>
                  <TH></TH>
                </tr>
              </THead>
              <tbody>
                {docs.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-medium text-[var(--color-ink)]">{d.filename}</TD>
                    <TD className="text-[var(--color-ink2)]">{d.tipo ?? "—"}</TD>
                    <TD className="font-[family-name:var(--font-mono)]">{d.unitCode ?? "—"}</TD>
                    <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">v{d.versao}</TD>
                    <TD className="text-[var(--color-ink3)]">{d.uploadedBy ?? "—"}</TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString("pt-BR") : "—"}
                    </TD>
                    <TD className="text-right">
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noopener" className="text-sm text-[var(--color-accent2)] hover:underline">
                          abrir
                        </a>
                      ) : (
                        <span className="text-[var(--color-ink4)]">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
          {docs.length === 0 && r2 && (
            <p className="text-[13px] text-[var(--color-ink4)]">Nenhum documento anexado.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
```

---

## 4. Componente próprio ainda não coletado

### `src/components/app/cliente-fields.tsx`

Usado por `/clientes/novo` (sem `cliente`, campos vazios) e por `/clientes/[id]` (com `cliente`, preenchendo os `defaultValue`).

```tsx
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import type { ClienteRow } from "@/lib/queries";

type FieldType = "text" | "number" | "unit" | "textarea" | "date" | "select";
interface Field {
  name: keyof ClienteRow;
  label: string;
  type?: FieldType;
  required?: boolean;
  colSpan?: string;
  options?: string[];
}

const SIM_NAO = ["Sim", "Não"];
const ESTADO_CIVIL = [
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "União estável",
];
interface Group {
  title: string;
  fields: Field[];
}

const GROUPS: Group[] = [
  {
    title: "Vínculo & contrato",
    fields: [
      { name: "unitCode", label: "Unidade comprada", type: "unit" },
      { name: "statusContrato", label: "Status do contrato" },
    ],
  },
  {
    title: "Dados cadastrais",
    fields: [
      { name: "nomeCompleto", label: "Nome completo", required: true, colSpan: "sm:col-span-2" },
      { name: "cpfCnpj", label: "CPF / CNPJ" },
      { name: "nascimento", label: "Nascimento", type: "date" },
      { name: "nacionalidade", label: "Nacionalidade" },
      { name: "estadoCivil", label: "Estado civil", type: "select", options: ESTADO_CIVIL },
      { name: "endereco", label: "Endereço", colSpan: "sm:col-span-2" },
      { name: "cidadeEstado", label: "Cidade / Estado" },
      { name: "cep", label: "CEP" },
      { name: "emailPrincipal", label: "E-mail principal" },
      { name: "emailSecundario", label: "E-mail secundário" },
      { name: "celular", label: "Celular / WhatsApp" },
      { name: "telefone", label: "Telefone" },
    ],
  },
  {
    title: "Dados financeiros",
    fields: [
      { name: "bancoFinanc", label: "Banco financiador" },
      { name: "rendaBruta", label: "Renda bruta (R$)", type: "number" },
      { name: "rendaLiquida", label: "Renda líquida (R$)", type: "number" },
      { name: "comprometimento", label: "Comprometimento (%)" },
      { name: "possuiFgts", label: "Possui FGTS?", type: "select", options: SIM_NAO },
      { name: "saldoFgts", label: "Saldo FGTS (R$)", type: "number" },
      { name: "scoreCredito", label: "Score de crédito", type: "number" },
      { name: "restricoes", label: "Restrições?", type: "select", options: SIM_NAO },
    ],
  },
  {
    title: "Inteligência de mercado",
    fields: [
      { name: "morarOuInvestir", label: "Morar ou investir?", type: "select", options: ["Morar", "Investir"] },
      { name: "ramoAtividade", label: "Ramo de atividade" },
      { name: "cargoFuncao", label: "Cargo / Função" },
      { name: "areaAtuacao", label: "Área de atuação" },
      { name: "empresa", label: "Empresa" },
      { name: "regimeTrabalho", label: "Regime de trabalho", type: "select", options: ["CLT", "PJ", "Autônomo", "Servidor público", "Empresário", "Aposentado", "Outro"] },
      { name: "localTrabalho", label: "Local de trabalho" },
      { name: "tempoEmpresa", label: "Tempo de empresa (anos)" },
      { name: "possuiImovel", label: "Já possui imóvel?", type: "select", options: SIM_NAO },
      { name: "motivacaoCompra", label: "Motivação de compra" },
      { name: "comoConheceu", label: "Como conheceu" },
      { name: "indicadoPor", label: "Indicado por" },
      { name: "interesse", label: "Interesse (1–5)", type: "number" },
      { name: "obsEstrategicas", label: "Obs. estratégicas", type: "textarea", colSpan: "sm:col-span-4" },
    ],
  },
];

export function ClienteFields({
  cliente,
  unitCodes,
}: {
  cliente?: ClienteRow;
  unitCodes: string[];
}) {
  const val = (f: keyof ClienteRow) => {
    const v = cliente?.[f];
    return v == null ? "" : String(v);
  };
  return (
    <div className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h3 className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            {g.title}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {g.fields.map((f) => (
              <div key={f.name} className={f.colSpan}>
                <Label>{f.label}</Label>
                {f.type === "unit" ? (
                  <Select name={f.name} defaultValue={val(f.name)}>
                    <option value="">—</option>
                    {unitCodes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                ) : f.type === "select" ? (
                  <Select name={f.name} defaultValue={val(f.name)}>
                    <option value="">—</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : f.type === "date" ? (
                  <DateField name={f.name} defaultValue={val(f.name)} />
                ) : f.type === "textarea" ? (
                  <textarea
                    name={f.name}
                    defaultValue={val(f.name)}
                    rows={2}
                    className="w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent2)]"
                  />
                ) : (
                  <Input
                    name={f.name}
                    type={f.type === "number" ? "number" : "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    required={f.required}
                    defaultValue={val(f.name)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 5. Funções de `queries.ts` — nenhuma restou

As três páginas chamam apenas duas funções de `queries.ts`, e ambas já foram
coletadas:

| Função | Chamada por | Onde já está |
|---|---|---|
| `getClientes` | `/clientes` | `docs/TELA-contasreceber.md` |
| `getUnitCodesByTenant` | `/clientes/novo`, `/clientes/[id]` | `docs/TELA-unidades.md` |

**Não existe `getClienteById` nem equivalente.** A busca de um cliente pelo id
é feita inline em `/clientes/[id]`, sem passar por `queries.ts` — a página
importa `db` e `schema` de `@/lib/db` e monta o `select` ela mesma:

### `src/app/(app)/clientes/[id]/page.tsx` · linhas 28–33

Busca do cliente — `clientes/[id]/page.tsx`, linhas 28–33.

```tsx
  const [cliente] = await db
    .select()
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!cliente) notFound();
```

A mesma página faz uma segunda consulta inline, dos documentos vinculados:

### `src/app/(app)/clientes/[id]/page.tsx` · linhas 46–50

Busca dos documentos do cliente — linhas 46–50.

```tsx
  const docsRaw = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.clienteId, cliente.id), eq(schema.documents.tenantId, ctx.tenant.id)))
    .orderBy(desc(schema.documents.uploadedAt));
```

---

## 6. `src/lib/actions/clientes.ts`

Quatro actions: `addCliente`, `updateCliente`, `deleteCliente` e
`uploadClienteDoc`. O arquivo vai inteiro.

### `src/lib/actions/clientes.ts`

```ts
"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isR2Configured, putObject } from "@/lib/storage/r2";

const s = (fd: FormData, k: string) => {
  const v = (fd.get(k) as string) ?? "";
  return v.trim() ? v.trim() : null;
};
/** Máximo representável em numeric(15,2) — evita "numeric field overflow". */
const NUMERIC_15_2_MAX = 9999999999999.99;
/**
 * Interpreta um valor monetário do formulário como número, tolerando os dois
 * formatos que os campos podem enviar:
 *  - BR ("1.000.000,00"): pontos são milhares, vírgula é o decimal;
 *  - padrão de <input type="number"> ("1000000.00" / "1000000"): o ponto é o
 *    decimal — NÃO pode ser removido (senão o valor é multiplicado por 100 a
 *    cada save, chegando a estourar a coluna).
 * O resultado é limitado ao teto de numeric(15,2) para nunca quebrar o INSERT.
 */
const num = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  let t = v.replace(/\s/g, "").replace(/r\$/gi, "");
  // Se há vírgula, é formato BR: pontos = milhares, vírgula = decimal.
  // Sem vírgula, o ponto já é o separador decimal (ou não há decimal).
  t = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(-NUMERIC_15_2_MAX, Math.min(NUMERIC_15_2_MAX, n));
  return String(clamped);
};
const int = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

function readCliente(fd: FormData) {
  return {
    unitCode: s(fd, "unitCode"),
    statusContrato: s(fd, "statusContrato"),
    nomeCompleto: s(fd, "nomeCompleto") ?? "Sem nome",
    cpfCnpj: s(fd, "cpfCnpj"),
    nascimento: s(fd, "nascimento"),
    nacionalidade: s(fd, "nacionalidade"),
    estadoCivil: s(fd, "estadoCivil"),
    endereco: s(fd, "endereco"),
    cidadeEstado: s(fd, "cidadeEstado"),
    cep: s(fd, "cep"),
    emailPrincipal: s(fd, "emailPrincipal"),
    emailSecundario: s(fd, "emailSecundario"),
    celular: s(fd, "celular"),
    telefone: s(fd, "telefone"),
    bancoFinanc: s(fd, "bancoFinanc"),
    rendaBruta: num(fd, "rendaBruta"),
    rendaLiquida: num(fd, "rendaLiquida"),
    comprometimento: s(fd, "comprometimento"),
    possuiFgts: s(fd, "possuiFgts"),
    saldoFgts: num(fd, "saldoFgts"),
    scoreCredito: int(fd, "scoreCredito"),
    restricoes: s(fd, "restricoes"),
    morarOuInvestir: s(fd, "morarOuInvestir"),
    ramoAtividade: s(fd, "ramoAtividade"),
    cargoFuncao: s(fd, "cargoFuncao"),
    areaAtuacao: s(fd, "areaAtuacao"),
    empresa: s(fd, "empresa"),
    regimeTrabalho: s(fd, "regimeTrabalho"),
    localTrabalho: s(fd, "localTrabalho"),
    tempoEmpresa: s(fd, "tempoEmpresa"),
    possuiImovel: s(fd, "possuiImovel"),
    motivacaoCompra: s(fd, "motivacaoCompra"),
    comoConheceu: s(fd, "comoConheceu"),
    indicadoPor: s(fd, "indicadoPor"),
    interesse: int(fd, "interesse"),
    obsEstrategicas: s(fd, "obsEstrategicas"),
  };
}

/** Status de contrato que liberam a unidade (não bloqueiam novo vínculo). */
const STATUS_LIBERA = ["Distratado", "Distrato", "Cancelado", "Cancelada"];

/**
 * Impede vincular uma unidade já vinculada a OUTRO cliente com contrato ativo
 * (uma unidade vendida não pode ser vendida de novo). Retorna o nome do cliente
 * conflitante, ou null se disponível.
 */
async function unidadeEmConflito(
  tenantId: string,
  unitCode: string | null,
  exceptId?: string,
): Promise<string | null> {
  if (!unitCode) return null;
  const rows = await db
    .select({
      id: schema.clientes.id,
      nome: schema.clientes.nomeCompleto,
      status: schema.clientes.statusContrato,
    })
    .from(schema.clientes)
    .where(and(eq(schema.clientes.tenantId, tenantId), eq(schema.clientes.unitCode, unitCode)));
  const conflito = rows.find(
    (r) => r.id !== exceptId && !STATUS_LIBERA.includes((r.status ?? "").trim()),
  );
  return conflito?.nome ?? null;
}

export async function addCliente(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "clientes", "criar")) {
    throw new Error("Sem permissão para cadastrar clientes.");
  }
  const dados = readCliente(formData);
  const conflito = await unidadeEmConflito(ctx.tenant.id, dados.unitCode);
  if (conflito) {
    throw new Error(
      `A unidade ${dados.unitCode} já está vinculada ao cliente "${conflito}". Distrate o contrato atual antes de revincular.`,
    );
  }
  const [row] = await db
    .insert(schema.clientes)
    .values({ tenantId: ctx.tenant.id, ...dados })
    .returning();
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.create",
    entity: "cliente",
    entityId: row.id,
    meta: { nome: row.nomeCompleto, unitCode: row.unitCode },
  });
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function updateCliente(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "clientes", "editar")) {
    throw new Error("Sem permissão para editar clientes.");
  }
  const id = formData.get("id") as string;
  if (!id) return;
  const [antes] = await db
    .select()
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)))
    .limit(1);
  const novo = readCliente(formData);
  const conflito = await unidadeEmConflito(ctx.tenant.id, novo.unitCode, id);
  if (conflito) {
    throw new Error(
      `A unidade ${novo.unitCode} já está vinculada ao cliente "${conflito}". Distrate o contrato atual antes de revincular.`,
    );
  }
  await db
    .update(schema.clientes)
    .set(novo)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)));
  // Auditoria campo a campo: valor anterior × novo.
  const changes: Record<string, { de: unknown; para: unknown }> = {};
  if (antes) {
    for (const k of Object.keys(novo)) {
      const de = (antes as Record<string, unknown>)[k];
      const para = (novo as Record<string, unknown>)[k];
      if (String(de ?? "") !== String(para ?? "")) changes[k] = { de: de ?? null, para: para ?? null };
    }
  }
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.update",
    entity: "cliente",
    entityId: id,
    meta: { changes },
  });
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function deleteCliente(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "clientes", "excluir")) return;
  const id = formData.get("id") as string;
  if (!id) return;
  await db
    .delete(schema.clientes)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.delete",
    entity: "cliente",
    entityId: id,
  });
  revalidatePath("/clientes");
  redirect("/clientes");
}

/**
 * Anexa um documento de venda/contrato a um cliente (e, opcionalmente, à
 * unidade/projeto). Ao substituir um documento do mesmo tipo, a versão anterior
 * é preservada (histórico) e a nova recebe versao = maior + 1.
 */
export async function uploadClienteDoc(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "clientes", "editar")) {
    throw new Error("Sem permissão para anexar documentos.");
  }
  if (!isR2Configured()) {
    throw new Error("Storage (R2) não configurado — defina as variáveis R2_*.");
  }
  const clienteId = (formData.get("clienteId") as string) || "";
  if (!clienteId) throw new Error("Cliente inválido.");
  const [cli] = await db
    .select({ id: schema.clientes.id, unitCode: schema.clientes.unitCode })
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, clienteId), eq(schema.clientes.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!cli) throw new Error("Cliente não encontrado.");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Arquivo deve ter até 15 MB.");
  const tipo = ((formData.get("tipo") as string) || "").trim() || null;

  // Versão: maior versão existente do mesmo cliente + tipo, + 1 (histórico).
  const anteriores = await db
    .select({ versao: schema.documents.versao })
    .from(schema.documents)
    .where(and(eq(schema.documents.clienteId, clienteId), eq(schema.documents.tenantId, ctx.tenant.id)))
    .orderBy(desc(schema.documents.versao))
    .limit(1);
  const versao = (anteriores[0]?.versao ?? 0) + 1;

  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const key = `tenants/${ctx.tenant.id}/vendas/${Date.now()}_${safe}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");

  await db.insert(schema.documents).values({
    tenantId: ctx.tenant.id,
    clienteId,
    unitCode: (formData.get("unitCode") as string) || cli.unitCode || null,
    projectId: (formData.get("projectId") as string) || null,
    storageKey: key,
    filename: file.name,
    contentType: file.type || null,
    size: file.size,
    tipo,
    versao,
    uploadedBy: ctx.userEmail || ctx.userId || null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.doc.upload",
    entity: "document",
    entityId: clienteId,
    meta: { filename: file.name, tipo, versao },
  });
  revalidatePath(`/clientes/${clienteId}`);
}
```

---

## 7. Tabela `cliente` no schema

**A tabela não usa nenhum `pgEnum`.** Todas as 39 colunas são `text`,
`integer`, `uuid` ou `timestamp`; nenhuma é tipo enumerado. Campos que
poderiam ser enum — `statusContrato`, `estadoCivil`, `tipoRenda` — são `text`
livre, e a lista de opções vive em `cliente-fields.tsx`, não no banco.

### `src/lib/db/schema.ts` · linhas 1148–1199

```ts
/**
 * Cliente comprador de uma unidade — cadastro comercial com dados cadastrais,
 * financeiros e de inteligência de mercado. Vinculado ao tenant e à unidade
 * comprada (por código). Ver pedido de "sessão de clientes (compradores)".
 */
export const clientes = pgTable("cliente", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** código da unidade comprada (ex.: "BLA 401"). */
  unitCode: text("unit_code"),
  statusContrato: text("status_contrato"),
  // ── Dados cadastrais ──
  nomeCompleto: text("nome_completo").notNull(),
  cpfCnpj: text("cpf_cnpj"),
  nascimento: text("nascimento"),
  nacionalidade: text("nacionalidade"),
  estadoCivil: text("estado_civil"),
  endereco: text("endereco"),
  cidadeEstado: text("cidade_estado"),
  cep: text("cep"),
  emailPrincipal: text("email_principal"),
  emailSecundario: text("email_secundario"),
  celular: text("celular"),
  telefone: text("telefone"),
  // ── Dados financeiros ──
  bancoFinanc: text("banco_financ"),
  rendaBruta: numeric("renda_bruta", { precision: 15, scale: 2 }),
  rendaLiquida: numeric("renda_liquida", { precision: 15, scale: 2 }),
  comprometimento: text("comprometimento"),
  possuiFgts: text("possui_fgts"),
  saldoFgts: numeric("saldo_fgts", { precision: 15, scale: 2 }),
  scoreCredito: integer("score_credito"),
  restricoes: text("restricoes"),
  // ── Inteligência de mercado ──
  morarOuInvestir: text("morar_ou_investir"),
  ramoAtividade: text("ramo_atividade"),
  cargoFuncao: text("cargo_funcao"),
  areaAtuacao: text("area_atuacao"),
  empresa: text("empresa"),
  regimeTrabalho: text("regime_trabalho"),
  localTrabalho: text("local_trabalho"),
  tempoEmpresa: text("tempo_empresa"),
  possuiImovel: text("possui_imovel"),
  motivacaoCompra: text("motivacao_compra"),
  comoConheceu: text("como_conheceu"),
  indicadoPor: text("indicado_por"),
  interesse: integer("interesse"),
  obsEstrategicas: text("obs_estrategicas"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

---

## 8. O que alimenta a coluna INTERESSE

**É uma coluna armazenada, não um cálculo nem uma junção.**

| Etapa | Arquivo | Linha | Trecho |
|---|---|---|---|
| Definição | `src/lib/db/schema.ts` | 1196 | `interesse: integer("interesse"),` |
| Entrada no formulário | `src/components/app/cliente-fields.tsx` | 81 | `{ name: "interesse", label: "Interesse (1–5)", type: "number" }` |
| Gravação | `src/lib/actions/clientes.ts` | 82 | `interesse: int(fd, "interesse"),` — dentro de `readCliente`, usada por `addCliente` (linha 120) e `updateCliente` (linha 155) |
| Leitura | `src/app/(app)/clientes/page.tsx` | 66 | `{c.interesse != null ? \`${c.interesse}/5\` : "—"}` |

O caminho completo é: o usuário digita um número no formulário → `readCliente`
converte com `int()` → grava na coluna `interesse` → `getClientes` traz a linha
inteira com `select()` → a listagem renderiza `N/5`.

Não há tabela de origem separada, nem consulta que derive o valor de outra
coisa, nem validação de faixa: o `/5` do rótulo é só texto na tela. A coluna é
`integer` nulável, sem `check` no banco e sem `min`/`max` no input — o campo é
declarado apenas como `type: "number"`.

---

## 9. Onde `cpf_cnpj` é lido e gravado

São **cinco** ocorrências no repositório inteiro, incluindo definição e
migração.

### Escrita

| Arquivo | Linha | Trecho |
|---|---|---|
| `src/lib/actions/clientes.ts` | 51 | `cpfCnpj: s(fd, "cpfCnpj"),` |

Único ponto de gravação. Está dentro de `readCliente`, o construtor de objeto
compartilhado, chamado por `addCliente` (linha 120) e `updateCliente`
(linha 155) — as duas actions gravam a coluna por esse mesmo caminho.

### Leitura

| Arquivo | Linha | Trecho |
|---|---|---|
| `src/app/(app)/clientes/page.tsx` | 59 | `{c.cpfCnpj ?? "—"}` — coluna CPF/CNPJ da listagem |
| `src/components/app/cliente-fields.tsx` | 40 | `{ name: "cpfCnpj", label: "CPF / CNPJ" }` — leitura indireta |

A leitura em `cliente-fields.tsx` é indireta: o campo é declarado na lista
`GROUPS` e o valor sai do acessor genérico `val(f.name)` (linha 94), que lê
`cliente?.[f]`. Não há menção nominal a `cpfCnpj` no ponto da renderização.

### Definição

| Arquivo | Linha | Trecho |
|---|---|---|
| `src/lib/db/schema.ts` | 1163 | `cpfCnpj: text("cpf_cnpj"),` |
| `src/lib/db/migrations/0008_fine_starbolt.sql` | 7 | `"cpf_cnpj" text,` — criação da coluna |

### O que não existe

Nenhuma consulta filtra, busca ou agrupa por `cpf_cnpj`: não há `where`, `eq`,
`like` ou `ilike` sobre a coluna em lugar algum. Não há índice nem constraint
`UNIQUE` sobre ela — a coluna é `text` nulável, sem validação de formato, sem
máscara no input e sem checagem de duplicidade. O campo é declarado em
`cliente-fields.tsx` sem `type`, ou seja, um `Input` de texto comum.
