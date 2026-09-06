# CÓDIGO — BLOCO 4 · Módulo Despesas

Código na íntegra das cinco telas do módulo Despesas, em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

| Tela | Rota | Página |
|---|---|---|
| Lançamentos de Despesas | `/despesas` | `src/app/(app)/despesas/page.tsx` |
| Contas a Pagar | `/contaspagar` | `src/app/(app)/contaspagar/page.tsx` |
| Restituições — pago por terceiro | `/restituicoes` | `src/app/(app)/restituicoes/page.tsx` |
| Acerto Contábil | `/acerto` | `src/app/(app)/acerto/page.tsx` |
| Lançamento de Medição | `/medicaolanc` | `src/app/(app)/medicaolanc/page.tsx` |

São 5 páginas, 16 componentes de `components/app/`,
15 funções de `src/lib/queries.ts` e 8 arquivos de Server Actions.

**Recorte.** Ficam de fora os primitivos de `components/ui/` (`card`,
`button`, `input`, `money-input`, `date-field`, `badge`, `table`), já
coletados em `TELA-planocontas.md` e `TELA-budget.md`; e `@/lib/context`,
`@/lib/permissions`, `@/lib/utils`, `@/lib/calc/*`, `@/lib/storage/r2`,
além de `react`, `next/*`, `xlsx` e `drizzle-orm`.

## Índice por tela

### `/despesas` — Lançamentos de Despesas

| | |
|---|---|
| Componentes | `despesa-form.tsx`, `despesa-search.tsx`, `despesas-table.tsx`, `page-header.tsx`, `parcelas-editor.tsx`, `parcelas-list.tsx`, `project-picker.tsx`, `repositorio-table.tsx` |
| Queries | `getAtualVersion`, `getBankAccounts`, `getChartAccounts`, `getDespesaNoTenant`, `getDespesas`, `getDespesasByTenant`, `getDocsFiscaisPorDespesa`, `getDocuments`, `getDocumentsByDespesa`, `getParcelasByVersion`, `getRepositorio`, `getSocios`, `getStakeholders` |
| Actions · `despesas.ts` | `addDespesa`, `addDespesaDocs`, `cancelarDespesa`, `deleteDespesa`, `deleteDespesaDoc`, `extractDespesaFromDoc`, `pagarDespesa`, `updateDespesa`, `uploadDespesaDoc` |
| Actions · `documento-fiscal.ts` | `buscarDocumentoDuplicado`, `getDocumentosFiscais`, `salvarDocumentoFiscal` |
| Actions · `pagamentos.ts` | `registrarPagamento` |

### `/contaspagar` — Contas a Pagar

| | |
|---|---|
| Componentes | `access-denied.tsx`, `contas-pagar-table.tsx`, `page-header.tsx`, `sortable-th.tsx` |
| Queries | `getContasPagar` |
| Actions · `restituicoes.ts` | `getObrigacoesTerceiroPendentes` |

### `/restituicoes` — Restituições — pago por terceiro

| | |
|---|---|
| Componentes | `access-denied.tsx`, `conta-corrente-terceiros.tsx`, `page-header.tsx`, `restituicao-lote.tsx`, `restituicoes-manager.tsx` |
| Queries | `getBankAccounts`, `getChartAccounts`, `getStakeholders` |
| Actions · `recebimento-terceiro.ts` | `getSaldosConsolidadosTerceiros` |
| Actions · `restituicao-lote.ts` | `compensarSaldos`, `confirmarRestituicaoLote`, `previewRestituicaoLote` |
| Actions · `restituicoes.ts` | `buscarDespesasPorPed`, `criarDespesaTerceiro`, `getContaCorrenteTerceiros`, `getDespesaTerceiros`, `registrarRestituicao` |

### `/acerto` — Acerto Contábil

| | |
|---|---|
| Componentes | `access-denied.tsx`, `acerto-manager.tsx`, `page-header.tsx` |
| Queries | `getBankAccounts`, `getChartAccounts`, `getStakeholders` |
| Actions · `acerto.ts` | `concluirAcerto`, `estornarAcerto`, `getAcertos`, `getDespesasAbativeis`, `ratearEntreObras` |

### `/medicaolanc` — Lançamento de Medição

| | |
|---|---|
| Componentes | `medicao-manager.tsx`, `page-header.tsx`, `project-picker.tsx` |
| Queries | `getAtualVersion`, `getChartAccounts`, `getMedicoes` |
| Actions · `medicao.ts` | `addMedicao`, `deleteMedicao`, `updateMedicao` |

Componentes que aparecem em mais de uma tela estão colados uma única vez, na
seção 2.

---

## 1. Páginas

### `src/app/(app)/despesas/page.tsx`

Tela **Lançamentos de Despesas** (`/despesas`).

```tsx
import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import {
  getChartAccounts,
  getDespesas,
  getDespesasByTenant,
  getDespesaNoTenant,
  getStakeholders,
  getSocios,
  getBankAccounts,
  getDocuments,
  getDocumentsByDespesa,
  getAtualVersion,
} from "@/lib/queries";
import { uploadDespesaDoc } from "@/lib/actions/despesas";
import { can } from "@/lib/permissions";
import { ProjectPicker } from "@/components/app/project-picker";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { isAiConfigured } from "@/lib/ai/despesa-extract";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DespesaForm } from "@/components/app/despesa-form";
import { DespesasTable, type DespesaDTO } from "@/components/app/despesas-table";
import { DespesaSearch } from "@/components/app/despesa-search";
import {
  RepositorioTable,
  type RepositorioItem,
} from "@/components/app/repositorio-table";
import { ordenarLancamentos } from "@/lib/despesas-ordering";
import { getDocumentosFiscais } from "@/lib/actions/documento-fiscal";
import { getDocsFiscaisPorDespesa, getRepositorio } from "@/lib/queries";
import { pendenteDeDocumento } from "@/lib/calc/documento-fiscal";
import { ParcelasList } from "@/components/app/parcelas-list";
import { getParcelasByVersion } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Tab = "lancamentos" | "apagar" | "semnf" | "parcelas" | "repositorio";
const TABS: { key: Tab; label: string }[] = [
  { key: "lancamentos", label: "Lançamentos" },
  { key: "apagar", label: "A Pagar" },
  // Item 1.2 — lançar sem nota é permitido; esta aba é a lista de cobrança.
  { key: "semnf", label: "Pendente de NF" },
  { key: "parcelas", label: "Parcelas" },
  { key: "repositorio", label: "Repositório" },
];

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    proj?: string;
    edit?: string;
    // Pré-preenchimento de nova despesa (ex.: vindo de uma linha do extrato).
    novo?: string;
    pf_valor?: string;
    pf_venc?: string;
    pf_comp?: string;
    pf_doc?: string;
  }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "lancamentos";
  const canEdit = can(ctx.perms, "despesas", "criar");
  const canEditar = can(ctx.perms, "despesas", "editar");
  const canExcluir = can(ctx.perms, "despesas", "excluir");
  const aiConfigured = isAiConfigured();
  const r2Configured = isR2Configured();

  // Sem "projeto ativo": o projeto é escolhido no seletor (?proj=); "all" mostra
  // a consulta consolidada (todos os projetos/filiais) com coluna Origem.
  const isAll = sp.proj === "all";
  const project = ctx.projects.find((p) => p.id === sp.proj) ?? ctx.projects[0];
  const version = await getAtualVersion(ctx.tenant.id, project.id);

  // §15 — quando o projeto escolhido NÃO tem versão "Atual" (ex.: a versão foi
  // apagada em Versões), o código anterior caía silenciosamente em
  // `ctx.version.id`, que é a versão Atual de OUTRO projeto (o do cookie).
  // Efeito visível para o usuário: a tela abria listando as despesas da obra
  // errada e um lançamento novo era gravado no projeto errado — e a despesa
  // procurada "não abria" nem era editável, porque simplesmente não estava
  // naquela lista. Agora o projeto sem Atual é sinalizado, não mascarado.
  const semVersaoAtual = !isAll && !version;
  const versionId = version?.id ?? ctx.version.id;

  const [despesasRaw, fornecedores, contas, bancos, socios] = await Promise.all([
    // Sem versão Atual não se lista nada: mostrar a versão de outro projeto
    // seria exibir dados de outra obra sob o nome desta.
    isAll
      ? getDespesasByTenant(ctx.tenant.id)
      : semVersaoAtual
        ? Promise.resolve([] as Awaited<ReturnType<typeof getDespesas>>)
        : getDespesas(versionId),
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getSocios(ctx.tenant.id),
  ]);
  const despesas: Array<
    Awaited<ReturnType<typeof getDespesas>>[number] & { origem?: string }
  > = despesasRaw;
  const fornById = new Map(fornecedores.map((f) => [f.id, f.nome]));
  const total = despesas.reduce((a, d) => a + Number(d.valor), 0);

  // Relação de lançamentos: ordenada pelo MOMENTO ORIGINAL DE CRIAÇÃO
  // (created_at DESC, id DESC) — a última despesa lançada é sempre a primeira
  // linha, a penúltima a segunda, e assim por diante. Serve de conferência
  // imediata para quem está lançando.
  //
  // Importante: NÃO se ordena por competência/vencimento/pagamento/conciliação,
  // e editar uma despesa antiga não a traz para o topo (created_at não muda).
  // A ordenação é feita aqui, na exibição, e não em getDespesas() — essa query
  // também alimenta Fluxo de Caixa, Contabilidade, conciliação e exportação,
  // que não devem ter seu comportamento alterado.
  const lancamentos = ordenarLancamentos(despesas);
  // A primeira linha (mais recente) recebe o destaque "Último lançamento".
  const latestId: string | null = lancamentos[0]?.id ?? null;

  // Anexos por despesa: marca na lista (clipe) quais despesas têm documento e
  // permite abri-lo direto. Usa o documento mais recente de cada despesa.
  const despesaIdSet = new Set(despesas.map((d) => d.id));
  const allDocs = await getDocuments(ctx.tenant.id); // ordenado por mais recente
  const docByDespesa = new Map<string, { count: number; storageKey: string }>();
  for (const doc of allDocs) {
    if (!doc.despesaId || !despesaIdSet.has(doc.despesaId)) continue;
    const cur = docByDespesa.get(doc.despesaId);
    if (cur) cur.count += 1;
    else docByDespesa.set(doc.despesaId, { count: 1, storageKey: doc.storageKey });
  }
  const anexoUrlByDespesa = new Map<string, string>();
  if (r2Configured) {
    await Promise.all(
      [...docByDespesa].map(async ([id, v]) =>
        anexoUrlByDespesa.set(id, await readUrl(v.storageKey)),
      ),
    );
  }
  // Documentos fiscais das despesas em tela (item 1.2), para o selo "sem NF".
  const docsFiscaisPorDespesa = await getDocsFiscaisPorDespesa(
    ctx.tenant.id,
    [...despesaIdSet],
  );
  const contasOrdenadas = [...contas].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
  const toDTO = (d: (typeof despesas)[number]): DespesaDTO => ({
    id: d.id,
    projectId: (d as { projectId?: string }).projectId ?? project.id,
    numDoc: d.numDoc,
    fornecedorId: d.fornecedorId,
    bancoId: d.bancoId,
    contaCef: d.contaCef,
    categoriaDre: d.categoriaDre,
    competencia: d.competencia,
    vencimento: d.vencimento,
    valor: String(d.valor),
    status: d.status,
    formaPagamento: d.formaPagamento,
    obs: d.obs,
    cancelado: d.cancelado,
    origem: d.origem ?? null,
    anexoUrl: anexoUrlByDespesa.get(d.id) ?? null,
    anexoCount: docByDespesa.get(d.id)?.count ?? 0,
    // Item 1.2 — pendência de nota fiscal. Lançar sem documento é permitido
    // (a nota chega depois); o selo só torna a pendência visível.
    semNf: pendenteDeDocumento(docsFiscaisPorDespesa.get(d.id) ?? []),
  });
  // A tabela só precisa de fornecedores (exibição) e bancos (pagamento).
  const tableRefProps = {
    fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.nome })),
    bancos: bancos.map((b) => ({ id: b.id, banco: b.banco, tipo: b.tipo })),
  };
  // Props comuns ao formulário completo (cadastro e edição).
  const despesaFormProps = {
    projetos: ctx.projects.map((p) => ({ id: p.id, nome: p.name })),
    projetoId: project.id,
    fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.nome, doc: f.doc })),
    contas: contasOrdenadas.map((c) => ({ code: c.code, name: c.name })),
    bancos: bancos.map((b) => ({ id: b.id, banco: b.banco, tipo: b.tipo })),
    categorias: CATEGORIAS_DRE,
    socios,
    aiConfigured,
    r2Configured,
    canExcluir,
  };
  // Deep link ?edit= — carrega a despesa para abrir a tela completa de edição,
  // já com os documentos/anexos vinculados (com URL para baixar/visualizar).
  //
  // Fallback por TENANT: a lista acima é escopada à versão "atual" do projeto,
  // mas Contas a Pagar mostra despesas de qualquer versão. Sem este fallback, o
  // "Editar" de uma despesa gravada em outra versão abria um formulário em
  // branco e o registro ficava impossível de editar/cancelar pela interface
  // (caso do registro relatado como visível em Contas a Pagar e ausente em
  // Despesas). Agora o registro é sempre alcançável — sem esconder nada.
  const editRow = sp.edit
    ? (despesas.find((d) => d.id === sp.edit) ??
      (await getDespesaNoTenant(ctx.tenant.id, sp.edit)))
    : undefined;
  const editDocs =
    editRow && canEditar
      ? await getDocumentsByDespesa(ctx.tenant.id, editRow.id)
      : [];
  const editDocsComUrl = r2Configured
    ? await Promise.all(
        editDocs.map(async (doc) => ({
          id: doc.id,
          filename: doc.filename,
          tipo: doc.tipo,
          size: doc.size,
          uploadedAt: doc.uploadedAt ? doc.uploadedAt.toISOString() : null,
          url: await readUrl(doc.storageKey),
        })),
      )
    : editDocs.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        tipo: doc.tipo,
        size: doc.size,
        uploadedAt: doc.uploadedAt ? doc.uploadedAt.toISOString() : null,
        url: null as string | null,
      }));
  const editData =
    editRow && canEditar
      ? {
          id: editRow.id,
          // Projeto REAL da despesa: quando ela vem do fallback por tenant, pode
          // pertencer a outro projeto que não o selecionado na tela.
          projectId:
            (editRow as { projectId?: string }).projectId ?? project.id,
          projectNome: project.name,
          fornecedorId: editRow.fornecedorId,
          contaCef: editRow.contaCef,
          categoriaDre: editRow.categoriaDre,
          bancoId: editRow.bancoId,
          numDoc: editRow.numDoc,
          competencia: editRow.competencia,
          vencimento: editRow.vencimento,
          valor: String(editRow.valor),
          status: editRow.status,
          formaPagamento: editRow.formaPagamento,
          obs: editRow.obs,
          documentos: editDocsComUrl,
          r2Configured,
          // Documento fiscal já registrado (item 1.2) — a nota costuma chegar
          // depois do lançamento e é completada aqui.
          documentoFiscal: (await getDocumentosFiscais(editRow.id))[0] ?? null,
        }
      : null;

  return (
    <>
      <PageHeader
        eyebrow={isAll ? "Todos os projetos / filiais" : `${project.name} · Atual`}
        title="Lançamentos de Despesas"
        subtitle={`${despesas.length} lançamentos · total ${brl0(total)}`}
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={isAll ? "all" : project.id}
            allOption
          />
        }
      />

      {/* §15 — projeto sem versão "Atual": em vez de cair na versão de outro
          projeto (o que fazia a tela listar a obra errada e impedia abrir/editar
          a despesa procurada), o estado é explicitado. Nenhum dado é alterado. */}
      {semVersaoAtual && (
        <Card className="mb-5 border-[var(--color-warning)]/40">
          <CardContent className="p-4 text-[13px] text-[var(--color-ink2)]">
            <strong className="text-[var(--color-ink)]">
              {project.name} não possui versão “Atual”.
            </strong>{" "}
            Os lançamentos do dia a dia ficam na versão Atual do projeto. Sem ela
            não há o que listar aqui, e novos lançamentos não podem ser gravados
            com segurança. Crie a versão Atual deste projeto em{" "}
            <Link href="/versao" className="text-[var(--color-accent2)] hover:underline">
              Versões
            </Link>{" "}
            — nenhum dado existente foi alterado.
          </CardContent>
        </Card>
      )}

      <div className="mb-5 flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            // O projeto selecionado (?proj=) PRECISA sobreviver à troca de aba.
            // Antes o link era `/despesas?tab=...` puro: clicar em qualquer aba
            // devolvia a tela ao primeiro projeto do tenant, dando a impressão
            // de que a obra escolhida "não abria".
            href={`/despesas?tab=${t.key}&proj=${isAll ? "all" : project.id}`}
            className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
              t.key === tab
                ? "bg-white text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "lancamentos" && (
        <>
          {editData ? (
            <DespesaForm key={`edit-${editData.id}`} {...despesaFormProps} edit={editData} />
          ) : (
            canEdit && (
              <DespesaForm
                key={sp.novo ? "novo-prefill" : "novo"}
                {...despesaFormProps}
                prefill={
                  sp.novo
                    ? {
                        valor: sp.pf_valor ?? null,
                        vencimento: sp.pf_venc ?? null,
                        competencia: sp.pf_comp ?? null,
                        numDoc: sp.pf_doc ?? null,
                      }
                    : null
                }
              />
            )
          )}
          <div className="mb-3">
            <DespesaSearch rows={lancamentos.map(toDTO)} fornecedores={fornecedores} />
          </div>
          <DespesasTable
            rows={lancamentos.map(toDTO)}
            showOrigem={isAll}
            latestId={latestId}
            canEditar={canEditar}
            canExcluir={canExcluir}
            {...tableRefProps}
          />
        </>
      )}

      {tab === "apagar" && (
        <DespesasTable
          rows={despesas
            .filter((d) => d.status !== "Pago" && !d.cancelado)
            .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))
            .map(toDTO)}
          venc
          showOrigem={isAll}
          canEditar={canEditar}
          canExcluir={canExcluir}
          {...tableRefProps}
        />
      )}

      {/* Item 1.2 — despesas ainda sem documento fiscal informado. Lançar sem
          nota é legítimo (ela chega depois); esta aba é o que falta cobrar. */}
      {tab === "semnf" && (
        <>
          {(() => {
            const pendentes = lancamentos
              .map(toDTO)
              .filter((d) => d.semNf && !d.cancelado);
            return pendentes.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-[var(--color-ink3)]">
                  Nenhuma despesa pendente de documento fiscal.
                </CardContent>
              </Card>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-[var(--color-ink3)]">
                  {pendentes.length} lançamento(s) sem documento fiscal informado.
                  Abra o lançamento para completar a nota — nada aqui está
                  bloqueado.
                </p>
                <DespesasTable
                  rows={pendentes}
                  showOrigem={isAll}
                  canEditar={canEditar}
                  canExcluir={canExcluir}
                  {...tableRefProps}
                />
              </>
            );
          })()}
        </>
      )}

      {tab === "parcelas" && (
        <ParcelasList
          rows={(await getParcelasByVersion(versionId)).map((p) => ({
            id: p.id,
            numeroParcela: p.numeroParcela,
            despesaNumDoc: p.despesaNumDoc,
            vencimento: p.vencimento,
            valorOriginal: Number(p.valorOriginal),
            valorPago: Number(p.valorPago),
            status: p.status,
            formaPagamento: p.formaPagamento,
            numeroCheque: p.numeroCheque,
            dataBomPara: p.dataBomPara,
          }))}
          bancos={bancos.map((b) => ({ id: b.id, banco: b.banco, tipo: b.tipo }))}
          canEditar={canEditar}
        />
      )}

      {tab === "repositorio" && (
        <Repositorio
          canEdit={canEdit}
          despesas={despesas}
          fornById={fornById}
          tenantId={ctx.tenant.id}
        />
      )}
    </>
  );
}

async function Repositorio({
  canEdit,
  despesas,
  fornById,
  tenantId,
}: {
  canEdit: boolean;
  despesas: Awaited<ReturnType<typeof getDespesas>>;
  fornById: Map<string, string>;
  tenantId: string;
}) {
  const r2 = isR2Configured();
  // Listagem com o CONTEXTO do lançamento (Módulo 3): PED, obra, fornecedor,
  // nº da nota, competência e valor — em vez de só "08/2026 · R$ 28".
  const docs = await getRepositorio(tenantId);
  const withUrls: RepositorioItem[] = r2
    ? await Promise.all(docs.map(async (d) => ({ ...d, url: await readUrl(d.storageKey) })))
    : docs.map((d) => ({ ...d, url: null as string | null }));

  return (
    <>
      {canEdit && r2 && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <form action={uploadDespesaDoc} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <Label>Despesa (opcional)</Label>
                <Select name="despesaId" defaultValue="">
                  <option value="">— sem vínculo —</option>
                  {despesas.map((d) => (
                    <option key={d.id} value={d.id}>
                      {(d.numDoc ? d.numDoc + " · " : "") +
                        (d.competencia ?? "") +
                        " · " +
                        (d.fornecedorId ? fornById.get(d.fornecedorId) ?? "" : "") +
                        " · " +
                        brl0(Number(d.valor))}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Tipo do documento</Label>
                <Select name="tipo" defaultValue="">
                  <option value="">—</option>
                  {["Boleto", "Nota Fiscal", "Recibo", "Contrato", "Comprovante de pagamento", "Outros"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </div>
              {/* Item 3.2 — o nº da nota entra aqui também: permite achar o
                  arquivo pelo número, sem depender do nome dele. Vinculando a
                  uma despesa que já tem NF gravada, ele é herdado na listagem. */}
              <div>
                <Label>Nº do documento fiscal</Label>
                <Input name="numeroDocumentoFiscal" placeholder="opcional" />
              </div>
              <div>
                <Label>Arquivo (até 10 MB)</Label>
                <input type="file" name="file" className="text-xs" required />
              </div>
              <div className="flex items-end sm:col-span-5">
                <Button type="submit">Enviar documento</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {!r2 && (
        <p className="mb-4 text-sm text-[var(--color-ink3)]">
          Configure as variáveis R2_* para habilitar o repositório de documentos.
        </p>
      )}

      <RepositorioTable rows={withUrls} />
    </>
  );
}
```

### `src/app/(app)/contaspagar/page.tsx`

Tela **Contas a Pagar** (`/contaspagar`).

```tsx
import { getActiveContext } from "@/lib/context";
import { getContasPagar, type ContaPagarRow } from "@/lib/queries";
import { getObrigacoesTerceiroPendentes } from "@/lib/actions/restituicoes";
import { rotuloStatusObrigacao } from "@/lib/calc/restituicao";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ContasPagarTable } from "@/components/app/contas-pagar-table";

export const dynamic = "force-dynamic";

export default async function ContasPagarPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "contaspagar", "ver")) return <AccessDenied />;

  const podeVerObrigacoes = can(ctx.perms, "restituicoes", "ver");
  const [despesas, obrigacoes] = await Promise.all([
    getContasPagar(ctx.tenant.id),
    podeVerObrigacoes
      ? getObrigacoesTerceiroPendentes(ctx.tenant.id)
      : Promise.resolve([]),
  ]);

  // §11 — a obrigação com quem desembolsou aparece aqui como uma linha própria,
  // separada da despesa original. A despesa continua listada e continua sendo
  // reconhecida 1× na DRE, pela competência dela; esta linha é a dívida COM o
  // terceiro, com o saldo que ainda falta restituir.
  //
  // `origem: "obrigacao"` mantém as duas coisas distinguíveis para o total (uma
  // obrigação não é despesa nova — ver o rodapé de totais da tabela).
  const linhasObrigacao: ContaPagarRow[] = obrigacoes.map((o) => ({
    id: o.id,
    numDoc: o.numDoc,
    fornecedorNome: o.terceiro,
    descricao: o.descricao,
    categoriaDre: null,
    contaCef: null,
    valor: o.valorSaldo,
    vencimento: o.dataPrevista,
    competencia: o.competencia,
    dataPagamento: null,
    formaPagamento: "Restituição",
    status: rotuloStatusObrigacao(o.status),
    projectId: o.projectId,
    projectName: o.projectName,
    clienteId: null,
    clienteNome: null,
    origem: "obrigacao",
    obrigacaoId: o.obrigacaoId,
  }));

  const rows: ContaPagarRow[] = [...despesas, ...linhasObrigacao];

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Contas a Pagar"
        subtitle="Obrigações de todas as obras — filtre por período, fornecedor, cliente, projeto, categoria e status. Clique no cabeçalho para ordenar."
      />
      <ContasPagarTable rows={rows} canEditar={can(ctx.perms, "despesas", "editar")} />
    </>
  );
}
```

### `src/app/(app)/restituicoes/page.tsx`

Tela **Restituições — pago por terceiro** (`/restituicoes`).

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getBankAccounts, getChartAccounts, getStakeholders } from "@/lib/queries";
import { getContaCorrenteTerceiros, getDespesaTerceiros } from "@/lib/actions/restituicoes";
import { ContaCorrenteTerceiros } from "@/components/app/conta-corrente-terceiros";
import { RestituicaoLote } from "@/components/app/restituicao-lote";
import { getSaldosConsolidadosTerceiros } from "@/lib/actions/recebimento-terceiro";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { ymd } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { RestituicoesManager } from "@/components/app/restituicoes-manager";

export const dynamic = "force-dynamic";

/** Dias em aberto entre a data-base e hoje. */
function diasEmAberto(base: string | null): number {
  const b = ymd(base);
  if (b == null) return 0;
  const now = new Date();
  const hoje = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  // diferença aproximada em dias via datas UTC
  const toDate = (n: number) =>
    Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100);
  return Math.max(0, Math.round((toDate(hoje) - toDate(b)) / 86_400_000));
}

export default async function RestituicoesPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "restituicoes", "ver")) return <AccessDenied />;

  const [stakeholders, contas, bancos, lista, contasCorrentes] = await Promise.all([
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getDespesaTerceiros(ctx.tenant.id, ctx.version.id),
    // Conta corrente por terceiro (§13) — escopo TENANT: a dívida com um sócio
    // é da empresa e não muda porque o usuário trocou o projeto ativo.
    getContaCorrenteTerceiros(ctx.tenant.id),
  ]);
  // Saldos dos DOIS lados por terceiro — base do encontro de contas (RG-05).
  const saldosConsolidados = await getSaldosConsolidadosTerceiros(ctx.tenant.id);
  const rows = lista.map((r) => ({
    ...r,
    diasEmAberto: diasEmAberto(r.dataPrevistaRestituicao ?? r.dataPagamentoOriginal),
  }));

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Restituições — pago por terceiro"
        subtitle="Restituição de valores pagos para fornecedores anteriormente. A despesa é reconhecida 1× na DRE; a saída de caixa ocorre só na restituição."
      />

      {/* Conta corrente por terceiro: saldo devido e o extrato dos movimentos
          que o formam. NÃO é saldo bancário disponível — é obrigação. */}
      <ContaCorrenteTerceiros contas={contasCorrentes} />

      {/* Item 4.1 — o cliente não restitui item a item: fecha o combo e paga um
          valor único, distribuído entre os PEDs em aberto por FIFO. */}
      <RestituicaoLote
        terceiros={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        saldos={saldosConsolidados}
        canEditar={can(ctx.perms, "restituicoes", "editar")}
      />

      <RestituicoesManager
        rows={rows}
        stakeholders={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        contas={[...contas]
          .filter((c) => c.kind === "cef")
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map((c) => ({ code: c.code, name: c.name }))}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        bancos={bancos.map((b) => ({ id: b.id, banco: b.banco, tipo: b.tipo }))}
        categorias={CATEGORIAS_DRE}
        canCriar={can(ctx.perms, "restituicoes", "criar")}
        canEditar={can(ctx.perms, "restituicoes", "editar")}
      />
    </>
  );
}
```

### `src/app/(app)/acerto/page.tsx`

Tela **Acerto Contábil** (`/acerto`).

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getAcertos, getDespesasAbativeis } from "@/lib/actions/acerto";
import { getBankAccounts, getStakeholders, getChartAccounts } from "@/lib/queries";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { categoriasDeDespesa } from "@/lib/calc/natureza-dre";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { AcertoManager } from "@/components/app/acerto-manager";

export const dynamic = "force-dynamic";

/**
 * ACERTO CONTÁBIL — Módulo 5.
 *
 * Resolve os dois casos que não tinham solução: um pagamento único quitando
 * várias despesas de várias obras, e a diferença entre o somatório das despesas
 * e o valor efetivamente transferido (juros de atraso ou desconto negociado).
 */
export default async function AcertoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  // Acerto é operação de nível financeiro (RNF de permissões).
  if (!can(ctx.perms, "despesas", "editar") || !can(ctx.perms, "caixa", "ver")) {
    return <AccessDenied />;
  }

  const [despesas, acertos, bancos, stakeholders, contas] = await Promise.all([
    getDespesasAbativeis(),
    getAcertos(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Acerto Contábil"
        subtitle="Um pagamento único quitando várias despesas, inclusive de obras diferentes. A saída de caixa é uma só; a diferença vai para despesa/receita financeira, nunca para o custo da obra."
      />
      <AcertoManager
        despesas={despesas}
        acertos={acertos}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        favorecidos={stakeholders.map((s) => ({ id: s.id, nome: s.nome }))}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        categorias={categoriasDeDespesa(CATEGORIAS_DRE)}
        contas={[...contas]
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map((c) => ({ code: c.code, name: c.name }))}
        canEstornar={can(ctx.perms, "despesas", "excluir")}
      />
    </>
  );
}
```

### `src/app/(app)/medicaolanc/page.tsx`

Tela **Lançamento de Medição** (`/medicaolanc`).

```tsx
import { getActiveContext } from "@/lib/context";
import { getAtualVersion, getChartAccounts, getMedicoes } from "@/lib/queries";
import { addMedicao } from "@/lib/actions/medicao";
import { can } from "@/lib/permissions";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";
import { MedicaoTable } from "@/components/app/medicao-manager";
import { ProjectPicker } from "@/components/app/project-picker";

export const dynamic = "force-dynamic";

export default async function MedicaoLancamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const sp = await searchParams;

  // Projetos de obra (kind "proj") — só eles têm medição/CEF.
  const projetos = ctx.projects.filter((p) => p.kind === "proj");
  const selectedProject =
    projetos.find((p) => p.id === sp.proj) ??
    (ctx.project.kind === "proj" ? ctx.project : projetos[0]) ??
    ctx.project;

  // Versão Atual do projeto medido (a medição alimenta o realizado da DRE).
  const atual =
    selectedProject.id === ctx.project.id && ctx.version.kind === "atual"
      ? ctx.version
      : (await getAtualVersion(ctx.tenant.id, selectedProject.id)) ?? ctx.version;

  const [rows, chart] = await Promise.all([
    getMedicoes(atual.id),
    getChartAccounts(ctx.tenant.id),
  ]);

  // Grupos CEF distintos (para o seletor de grupo de obra).
  const grupos = [
    ...new Map(
      chart
        .filter((c) => c.kind === "cef")
        .map((c) => [c.groupCode, { code: c.groupCode, name: c.groupName }]),
    ).values(),
  ].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const canCriar = can(ctx.perms, "medicaolanc", "criar");
  const canEditar = can(ctx.perms, "medicaolanc", "editar");
  const canExcluir = can(ctx.perms, "medicaolanc", "excluir");
  const total = rows.reduce((a, r) => a + Number(r.valor), 0);
  const locked = atual.locked;

  return (
    <>
      <PageHeader
        eyebrow={`${selectedProject.name} · ${atual.label}`}
        title="Lançamento de Medição"
        subtitle={`${rows.length} lançamentos · total ${brl0(total)} — alimenta o Custo Variável da DRE`}
        actions={
          projetos.length > 1 ? (
            <ProjectPicker
              projects={projetos.map((p) => ({ id: p.id, label: p.name }))}
              selected={selectedProject.id}
            />
          ) : undefined
        }
      />

      {locked && (
        <p className="mb-4 rounded-[8px] bg-[#fef3c7] px-3 py-2 text-[13px] text-[#92400e]">
          Versão congelada — lançamentos bloqueados.
        </p>
      )}

      {canCriar && !locked && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <form action={addMedicao} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <input type="hidden" name="projectId" value={selectedProject.id} />
              <div>
                <Label>Competência</Label>
                <MonthField name="competencia" required />
              </div>
              <div className="sm:col-span-2">
                <Label>Grupo de obra (CEF)</Label>
                <Select name="grupo" defaultValue="">
                  <option value="">Selecione...</option>
                  {grupos.map((g) => (
                    <option key={g.code} value={`${g.code}|${g.name}`}>
                      {g.code} — {g.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Valor medido</Label>
                <Input name="valor" type="number" step="0.01" placeholder="0" />
              </div>
              <div className="sm:col-span-4">
                <Label>Observação</Label>
                <Input name="obs" placeholder="" />
              </div>
              <div className="flex items-end sm:col-span-2">
                <Button type="submit" className="w-full">
                  Lançar medição
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <MedicaoTable
        rows={rows.map((r) => ({
          id: r.id,
          competencia: r.competencia,
          grupoCode: r.grupoCode,
          grupoName: r.grupoName,
          valor: Number(r.valor),
          obs: r.obs ?? "",
        }))}
        canEditar={canEditar && !locked}
        canExcluir={canExcluir && !locked}
      />
    </>
  );
}
```

---

## 2. Componentes de `components/app/`

| Componente | Usado por |
|---|---|
| `access-denied.tsx` | `/acerto`, `/contaspagar`, `/restituicoes` |
| `acerto-manager.tsx` | `/acerto` |
| `conta-corrente-terceiros.tsx` | `/restituicoes` |
| `contas-pagar-table.tsx` | `/contaspagar` |
| `despesa-form.tsx` | `/despesas` |
| `despesa-search.tsx` | `/despesas` |
| `despesas-table.tsx` | `/despesas` |
| `medicao-manager.tsx` | `/medicaolanc` |
| `page-header.tsx` | `/acerto`, `/contaspagar`, `/despesas`, `/medicaolanc`, `/restituicoes` |
| `parcelas-editor.tsx` | `/despesas` |
| `parcelas-list.tsx` | `/despesas` |
| `project-picker.tsx` | `/despesas`, `/medicaolanc` |
| `repositorio-table.tsx` | `/despesas` |
| `restituicao-lote.tsx` | `/restituicoes` |
| `restituicoes-manager.tsx` | `/restituicoes` |
| `sortable-th.tsx` | `/contaspagar` |

### `src/components/app/access-denied.tsx`

Usado por: `/acerto`, `/contaspagar`, `/restituicoes`.

```tsx
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";

export function AccessDenied() {
  return (
    <>
      <PageHeader title="Acesso negado" />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink4)]">
            Sem permissão
          </span>
          <p className="text-sm text-[var(--color-ink3)]">
            Você não tem permissão de <strong>Ver</strong> esta tela. Fale com um
            administrador em Gestão de Acessos.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
```

### `src/components/app/acerto-manager.tsx`

Usado por: `/acerto`.

```tsx
"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  concluirAcerto,
  estornarAcerto,
  ratearEntreObras,
  type AcertoResumo,
  type DespesaAbativel,
} from "@/lib/actions/acerto";
import { calcularDiferenca, calcularRateio, validarRateio } from "@/lib/calc/acerto";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField, MonthField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

interface Opt {
  id: string;
  nome: string;
}

/** Chave de idempotência por tentativa (§16 / CA-34). */
function novaChave(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

type Aba = "vincular" | "rateio" | "historico";

export function AcertoManager({
  despesas,
  acertos,
  bancos,
  favorecidos,
  projetos,
  categorias,
  contas,
  canEstornar,
}: {
  despesas: DespesaAbativel[];
  acertos: AcertoResumo[];
  bancos: Opt[];
  favorecidos: Opt[];
  projetos: Opt[];
  categorias: string[];
  contas: { code: string; name: string }[];
  canEstornar: boolean;
}) {
  const [aba, setAba] = useState<Aba>("vincular");
  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
        {(
          [
            ["vincular", "Vincular despesas"],
            ["rateio", "Rateio entre obras"],
            ["historico", "Acertos do período"],
          ] as [Aba, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
              aba === k
                ? "bg-white text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "vincular" && (
        <VincularDespesas
          despesas={despesas}
          bancos={bancos}
          favorecidos={favorecidos}
          categorias={categorias}
        />
      )}
      {aba === "rateio" && (
        <RateioObras
          projetos={projetos}
          bancos={bancos}
          favorecidos={favorecidos}
          categorias={categorias}
          contas={contas}
        />
      )}
      {aba === "historico" && <Historico acertos={acertos} canEstornar={canEstornar} />}
    </div>
  );
}

/** Item 5.1 — cabeçalho da saída + grade de vinculação + painel de fechamento. */
function VincularDespesas({
  despesas,
  bancos,
  favorecidos,
  categorias,
}: {
  despesas: DespesaAbativel[];
  bancos: Opt[];
  favorecidos: Opt[];
  categorias: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const chave = useRef(novaChave());

  const [cab, setCab] = useState({
    dataPagamento: "",
    bankAccountId: "",
    valorTransferido: "",
    formaPagamento: "",
    favorecidoId: "",
    obs: "",
    categoriaDiferenca: "Despesas Financeiras",
  });
  const [filtro, setFiltro] = useState({ fornecedor: "", obra: "", busca: "" });
  /** despesaId → valor a abater (editável, permite abatimento parcial). */
  const [sel, setSel] = useState<Record<string, number>>({});

  const opts = useMemo(() => {
    const forn = new Map<string, string>();
    const obras = new Map<string, string>();
    for (const d of despesas) {
      if (d.fornecedorId && d.fornecedorNome) forn.set(d.fornecedorId, d.fornecedorNome);
      obras.set(d.projectId, d.projectName);
    }
    return {
      fornecedores: [...forn].map(([id, nome]) => ({ id, nome })),
      obras: [...obras].map(([id, nome]) => ({ id, nome })),
    };
  }, [despesas]);

  const visiveis = useMemo(
    () =>
      despesas.filter((d) => {
        if (filtro.fornecedor && d.fornecedorId !== filtro.fornecedor) return false;
        if (filtro.obra && d.projectId !== filtro.obra) return false;
        if (filtro.busca.trim()) {
          const q = filtro.busca.trim().toLowerCase();
          const alvo = `${d.numDoc ?? ""} ${d.fornecedorNome ?? ""} ${d.projectName} ${d.competencia ?? ""}`.toLowerCase();
          if (!alvo.includes(q)) return false;
        }
        return true;
      }),
    [despesas, filtro],
  );

  const itens = Object.entries(sel)
    .filter(([, v]) => v > 0)
    .map(([despesaId, valor]) => ({ despesaId, valor }));
  const totalVinculado = Math.round(itens.reduce((a, i) => a + i.valor, 0) * 100) / 100;
  const transferido = Number(cab.valorTransferido) || 0;
  const diferenca = calcularDiferenca(transferido, totalVinculado);

  const alternar = (d: DespesaAbativel) =>
    setSel((s) => {
      const n = { ...s };
      if (n[d.id] != null) delete n[d.id];
      else n[d.id] = d.saldo;
      return n;
    });

  const confirmar = () => {
    if (pending) return;
    setErro(null);
    setMsg(null);
    start(async () => {
      const res = await concluirAcerto({
        dataPagamento: cab.dataPagamento,
        bankAccountId: cab.bankAccountId || null,
        valorTransferido: transferido,
        formaPagamento: cab.formaPagamento || null,
        favorecidoId: cab.favorecidoId || null,
        obs: cab.obs || null,
        itens,
        categoriaDiferenca: cab.categoriaDiferenca,
        idempotencyKey: chave.current,
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao concluir o acerto.");
        return;
      }
      chave.current = novaChave();
      setMsg(`Acerto ${res.numDoc ?? ""} concluído. ${itens.length} despesa(s) quitada(s).`);
      setSel({});
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label>Data do pagamento</Label>
            <DateField
              value={cab.dataPagamento}
              onChange={(v) => setCab({ ...cab, dataPagamento: v })}
            />
          </div>
          <div>
            <Label>Banco / conta</Label>
            <Select
              value={cab.bankAccountId}
              onChange={(e) => setCab({ ...cab, bankAccountId: e.target.value })}
            >
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Valor transferido</Label>
            <Input
              type="number"
              step="0.01"
              value={cab.valorTransferido}
              onChange={(e) => setCab({ ...cab, valorTransferido: e.target.value })}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label>Forma</Label>
            <Select
              value={cab.formaPagamento}
              onChange={(e) => setCab({ ...cab, formaPagamento: e.target.value })}
            >
              <option value="">—</option>
              {["PIX", "Transferência bancária", "Boleto", "Cheque", "Dinheiro"].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Favorecido</Label>
            <Select
              value={cab.favorecidoId}
              onChange={(e) => setCab({ ...cab, favorecidoId: e.target.value })}
            >
              <option value="">—</option>
              {favorecidos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Input value={cab.obs} onChange={(e) => setCab({ ...cab, obs: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
          <div>
            <Label>Buscar</Label>
            <Input
              value={filtro.busca}
              onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })}
              placeholder="PED, fornecedor, obra"
            />
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Select
              value={filtro.fornecedor}
              onChange={(e) => setFiltro({ ...filtro, fornecedor: e.target.value })}
            >
              <option value="">Todos</option>
              {opts.fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Obra</Label>
            <Select
              value={filtro.obra}
              onChange={(e) => setFiltro({ ...filtro, obra: e.target.value })}
            >
              <option value="">Todas</option>
              {opts.obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table wrapperClassName="max-h-[45vh] scroll-x-always" className="min-w-[1000px]">
            <THead className="sticky top-0 z-10">
              <tr>
                <TH className="w-8"></TH>
                <TH>PED</TH>
                <TH>Obra</TH>
                <TH>Fornecedor</TH>
                <TH>Competência</TH>
                <TH>Vencimento</TH>
                <TH className="text-right">Em aberto</TH>
                <TH className="text-right">A abater</TH>
              </tr>
            </THead>
            <tbody>
              {visiveis.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={sel[d.id] != null}
                      onChange={() => alternar(d)}
                      aria-label={`Vincular ${d.numDoc ?? d.id}`}
                    />
                  </TD>
                  <TD className="whitespace-nowrap font-[family-name:var(--font-mono)]">
                    {d.numDoc ?? "—"}
                  </TD>
                  <TD className="whitespace-nowrap">{d.projectName}</TD>
                  <TD className="max-w-[180px] truncate">{d.fornecedorNome ?? "—"}</TD>
                  <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {d.competencia ?? "—"}
                  </TD>
                  <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {d.vencimento ? dateBR(d.vencimento) : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brl0(d.saldo)}
                  </TD>
                  <TD className="text-right">
                    {/* Abatimento PARCIAL é permitido: o pagamento pode cobrir
                        só parte de um PED. */}
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 w-28 text-right"
                      value={sel[d.id] ?? ""}
                      disabled={sel[d.id] == null}
                      onChange={(e) =>
                        setSel((s) => ({ ...s, [d.id]: Number(e.target.value) || 0 }))
                      }
                    />
                  </TD>
                </TR>
              ))}
              {visiveis.length === 0 && (
                <TR>
                  <TD colSpan={8} className="py-8 text-center text-[var(--color-ink4)]">
                    Nenhuma despesa em aberto com os filtros aplicados.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* Painel de fechamento — sempre visível (item 5.1). */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-2 font-[family-name:var(--font-mono)] text-[13px] sm:max-w-md">
            <Linha label="Valor transferido" valor={transferido} />
            <Linha label="Total vinculado" valor={totalVinculado} />
            <div className="border-t border-[var(--color-accent2)]/15 pt-2">
              <Linha
                label="Diferença"
                valor={diferenca.tipo === "DESCONTO" ? -diferenca.valor : diferenca.valor}
                destaque
              />
            </div>
          </div>
          {diferenca.tipo !== "NENHUMA" && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[220px]">
                <Label>
                  Classificar como{" "}
                  {diferenca.tipo === "JUROS" ? "juros e multas" : "desconto obtido"}
                </Label>
                <Select
                  value={cab.categoriaDiferenca}
                  onChange={(e) => setCab({ ...cab, categoriaDiferenca: e.target.value })}
                >
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="max-w-lg text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
                A diferença é lançada como{" "}
                {diferenca.tipo === "JUROS" ? "despesa" : "receita"} financeira do
                período, na competência do pagamento. <strong>Não é rateada no
                custo de nenhuma obra</strong> — juros de mora são perda
                operacional, não custo de obtenção de recursos (RG-07).
              </p>
            </div>
          )}
          {erro && <p className="mt-3 text-sm text-[var(--color-danger)]">{erro}</p>}
          {msg && <p className="mt-3 text-sm text-[var(--color-success)]">{msg}</p>}
          <div className="mt-4">
            <Button
              onClick={confirmar}
              disabled={pending || itens.length === 0 || transferido <= 0 || !cab.dataPagamento}
            >
              {pending ? "Concluindo…" : `Concluir acerto (${itens.length} despesa(s))`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Linha({
  label,
  valor,
  destaque,
}: {
  label: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[var(--color-ink3)]">{label}</span>
      <span
        className={
          destaque
            ? valor === 0
              ? "font-semibold text-[var(--color-ink3)]"
              : valor > 0
                ? "font-semibold text-[var(--color-danger)]"
                : "font-semibold text-[var(--color-success)]"
            : "text-[var(--color-ink)]"
        }
      >
        {brl0(valor)}
      </span>
    </div>
  );
}

/** Item 5.3 — um PIX, várias obras, um comprovante. */
function RateioObras({
  projetos,
  bancos,
  favorecidos,
  categorias,
  contas,
}: {
  projetos: Opt[];
  bancos: Opt[];
  favorecidos: Opt[];
  categorias: string[];
  contas: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const chave = useRef(novaChave());

  const [f, setF] = useState({
    prestadorId: "",
    valorTotal: "",
    dataPagamento: "",
    bankAccountId: "",
    competencia: "",
    categoriaDre: categorias[0] ?? "Custo Variável",
    contaCef: "",
    baseRateio: "",
    descricao: "",
  });
  const [linhas, setLinhas] = useState<{ projectId: string; percentual: string }[]>([
    { projectId: projetos[0]?.id ?? "", percentual: "" },
  ]);

  const valorTotal = Number(f.valorTotal) || 0;
  const rateio = calcularRateio(
    valorTotal,
    linhas
      .filter((l) => l.projectId)
      .map((l) => ({ projectId: l.projectId, percentual: Number(l.percentual) || 0 })),
  );
  const erroRateio = valorTotal > 0 ? validarRateio(valorTotal, rateio) : null;

  const confirmar = () => {
    if (pending) return;
    setErro(null);
    setMsg(null);
    start(async () => {
      const res = await ratearEntreObras({
        prestadorId: f.prestadorId || null,
        valorTotal,
        dataPagamento: f.dataPagamento,
        bankAccountId: f.bankAccountId || null,
        competencia: f.competencia || null,
        categoriaDre: f.categoriaDre,
        contaCef: f.contaCef || null,
        baseRateio: f.baseRateio || null,
        descricao: f.descricao || null,
        linhas: linhas
          .filter((l) => l.projectId)
          .map((l) => ({ projectId: l.projectId, percentual: Number(l.percentual) || 0 })),
        idempotencyKey: chave.current,
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao ratear.");
        return;
      }
      chave.current = novaChave();
      setMsg(
        `Rateio ${res.numDoc ?? ""} concluído: ${rateio.length} PED(s) gerados, uma única saída de caixa.`,
      );
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
          Rateio de mão de obra entre obras
        </h2>
        <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          Um pagamento único a um prestador que trabalhou em várias obras. Gera{" "}
          <strong>um PED por obra</strong> (custo correto por centro de custo) e{" "}
          <strong>uma única saída de caixa</strong>. A memória de cálculo fica
          gravada — é o documento que sustenta o custo por obra perante a
          contabilidade.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label>Prestador</Label>
            <Select
              value={f.prestadorId}
              onChange={(e) => setF({ ...f, prestadorId: e.target.value })}
            >
              <option value="">—</option>
              {favorecidos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Valor total pago</Label>
            <Input
              type="number"
              step="0.01"
              value={f.valorTotal}
              onChange={(e) => setF({ ...f, valorTotal: e.target.value })}
            />
          </div>
          <div>
            <Label>Data do pagamento</Label>
            <DateField value={f.dataPagamento} onChange={(v) => setF({ ...f, dataPagamento: v })} />
          </div>
          <div>
            <Label>Competência</Label>
            <MonthField value={f.competencia} onChange={(v) => setF({ ...f, competencia: v })} />
          </div>
          <div>
            <Label>Banco / conta</Label>
            <Select
              value={f.bankAccountId}
              onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}
            >
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Categoria DRE</Label>
            <Select
              value={f.categoriaDre}
              onChange={(e) => setF({ ...f, categoriaDre: e.target.value })}
            >
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Conta CEF</Label>
            <Select value={f.contaCef} onChange={(e) => setF({ ...f, contaCef: e.target.value })}>
              <option value="">—</option>
              {contas.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Base do rateio</Label>
            <Input
              value={f.baseRateio}
              onChange={(e) => setF({ ...f, baseRateio: e.target.value })}
              placeholder="ex.: dias trabalhados"
            />
          </div>
          <div className="sm:col-span-4">
            <Label>Descrição</Label>
            <Input
              value={f.descricao}
              onChange={(e) => setF({ ...f, descricao: e.target.value })}
              placeholder="ex.: mão de obra semana 12"
            />
          </div>
        </div>

        <h3 className="mb-2 mt-5 text-[13px] font-semibold text-[var(--color-ink)]">
          Distribuição entre obras
        </h3>
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <Label>Obra</Label>
                <Select
                  value={l.projectId}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, j) => (j === i ? { ...x, projectId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">—</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-28">
                <Label>%</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={l.percentual}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, j) => (j === i ? { ...x, percentual: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <div className="w-32 pb-2 text-right font-[family-name:var(--font-mono)] text-[13px]">
                {brl0(rateio[i]?.valor ?? 0)}
              </div>
              {linhas.length > 1 && (
                <button
                  onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                  className="pb-2 text-[12px] text-[var(--color-danger)] hover:underline"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setLinhas((ls) => [...ls, { projectId: "", percentual: "" }])}
          className="mt-2 text-[12px] text-[var(--color-accent2)] hover:underline"
        >
          + Adicionar obra
        </button>

        {/* CA-27 — rateio que não fecha é bloqueado com mensagem clara. */}
        {erroRateio && (
          <p className="mt-3 rounded-[8px] bg-[var(--color-danger)]/10 p-2.5 text-[12.5px] text-[var(--color-danger)]">
            {erroRateio}
          </p>
        )}
        {erro && <p className="mt-3 text-sm text-[var(--color-danger)]">{erro}</p>}
        {msg && <p className="mt-3 text-sm text-[var(--color-success)]">{msg}</p>}

        <div className="mt-4">
          <Button
            onClick={confirmar}
            disabled={pending || !!erroRateio || valorTotal <= 0 || !f.dataPagamento}
          >
            {pending ? "Rateando…" : `Gerar ${rateio.length} PED(s) e a saída única`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Item 5.5 — relatório "Acertos do período", o pacote para a contabilidade. */
function Historico({
  acertos,
  canEstornar,
}: {
  acertos: AcertoResumo[];
  canEstornar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const estornar = (a: AcertoResumo) => {
    const motivo = window.prompt(`Motivo do estorno do acerto ${a.numDoc ?? ""}:`);
    if (motivo === null) return;
    setErro(null);
    start(async () => {
      try {
        await estornarAcerto(a.id, motivo);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao estornar.");
      }
    });
  };

  return (
    <Card>
      <CardContent className="p-0">
        {erro && <p className="p-3 text-sm text-[var(--color-danger)]">{erro}</p>}
        <Table wrapperClassName="max-h-[70vh] scroll-x-always" className="min-w-[1100px]">
          <THead className="sticky top-0 z-10">
            <tr>
              <TH>Documento</TH>
              <TH>Data</TH>
              <TH>Favorecido</TH>
              <TH className="text-right">Transferido</TH>
              <TH className="text-right">Vinculado</TH>
              <TH className="text-right">Diferença</TH>
              <TH>Obras</TH>
              <TH>Status</TH>
              {canEstornar && <TH className="text-right">Ação</TH>}
            </tr>
          </THead>
          <tbody>
            {acertos.map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap font-[family-name:var(--font-mono)]">
                  {a.numDoc ?? "—"}
                </TD>
                <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {a.dataPagamento ? dateBR(a.dataPagamento) : "—"}
                </TD>
                <TD className="max-w-[180px] truncate">{a.favorecido ?? "—"}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {brl0(a.valorTransferido)}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {brl0(a.totalVinculado)}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {a.diferencaTipo === "NENHUMA" ? (
                    "—"
                  ) : (
                    <span
                      className={
                        a.diferencaTipo === "JUROS"
                          ? "text-[var(--color-danger)]"
                          : "text-[var(--color-success)]"
                      }
                      title={
                        a.diferencaTipo === "JUROS"
                          ? "Juros e multas — despesa financeira do período"
                          : "Desconto obtido — receita financeira do período"
                      }
                    >
                      {brl0(a.diferencaValor)}
                    </span>
                  )}
                </TD>
                <TD className="max-w-[220px] truncate text-[var(--color-ink3)]">
                  {a.obras.join(", ") || "—"}
                </TD>
                <TD>
                  {a.estornado ? (
                    <Badge tone="neutral">Estornado</Badge>
                  ) : (
                    <Badge tone="success">Concluído</Badge>
                  )}
                </TD>
                {canEstornar && (
                  <TD className="text-right">
                    {!a.estornado && (
                      <button
                        onClick={() => estornar(a)}
                        disabled={pending}
                        className="text-sm text-[var(--color-danger)] hover:underline"
                      >
                        Estornar
                      </button>
                    )}
                  </TD>
                )}
              </TR>
            ))}
            {acertos.length === 0 && (
              <TR>
                <TD colSpan={canEstornar ? 9 : 8} className="py-8 text-center text-[var(--color-ink4)]">
                  Nenhum acerto registrado.
                </TD>
              </TR>
            )}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

### `src/components/app/conta-corrente-terceiros.tsx`

Usado por: `/restituicoes`.

```tsx
"use client";

import { useState } from "react";
import type { ContaCorrenteTerceiro } from "@/lib/actions/restituicoes";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Conta corrente de terceiros/sócios (§13).
 *
 * Responde "quanto ainda devo ao sócio X" e mostra COMO se chegou nesse número:
 *
 *     Saldo devido = total desembolsado por ele − total já restituído
 *
 * Cada linha do extrato é um fato: um desembolso (ele pagou um fornecedor pela
 * empresa, aumentando a dívida) ou uma restituição (a empresa devolveu, e a
 * dívida caiu). O saldo acumulado é recalculado a cada movimento, em ordem de
 * data, para que o número final seja conferível linha a linha.
 *
 * Este saldo NÃO é caixa disponível da empresa — é obrigação com terceiros.
 */
export function ContaCorrenteTerceiros({
  contas,
}: {
  contas: ContaCorrenteTerceiro[];
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  if (contas.length === 0) return null;

  const totalDevido = contas.reduce((a, c) => a + c.saldoDevido, 0);

  return (
    <Card className="mb-5">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Conta corrente de terceiros
          </h2>
          <span className="text-[12px] text-[var(--color-ink3)]">
            Saldo devido total{" "}
            <strong className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">
              {brl0(totalDevido)}
            </strong>
          </span>
          <span className="text-[11.5px] text-[var(--color-ink4)]">
            obrigação com terceiros — não é saldo bancário disponível
          </span>
        </div>

        <div className="tbl-scroll overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-accent2)]/12 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                <th className="px-2 py-2">Terceiro / sócio</th>
                <th className="px-2 py-2 text-right">Movimentos</th>
                <th className="px-2 py-2 text-right">Total desembolsado</th>
                <th className="px-2 py-2 text-right">Total restituído</th>
                <th className="px-2 py-2 text-right">Saldo devido</th>
                <th className="px-2 py-2 text-right">Extrato</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => {
                const chave = c.pagadorId ?? c.pagador;
                const aberto = aberta === chave;
                return (
                  <>
                    <tr key={chave} className="border-b border-[var(--color-accent2)]/8">
                      <td className="px-2 py-2 font-medium text-[var(--color-ink)]">
                        {c.pagador}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {c.movimentos.length}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)]">
                        {brl0(c.totalDesembolsado)}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                        {brl0(c.totalRestituido)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-[family-name:var(--font-mono)] font-semibold ${
                          c.saldoDevido > 0
                            ? "text-[var(--color-warning)]"
                            : c.saldoDevido < 0
                              ? "text-[var(--color-danger)]"
                              : "text-[var(--color-ink3)]"
                        }`}
                        title={
                          c.saldoDevido < 0
                            ? "Restituído a mais do que o desembolsado — conferir."
                            : undefined
                        }
                      >
                        {brl0(c.saldoDevido)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => setAberta(aberto ? null : chave)}
                          className="text-[12px] text-[var(--color-accent2)] hover:underline"
                        >
                          {aberto ? "Fechar" : "Ver"}
                        </button>
                      </td>
                    </tr>
                    {aberto && (
                      <tr key={`${chave}-ext`} className="border-b border-[var(--color-accent2)]/8">
                        <td colSpan={6} className="bg-[var(--color-surface2)]/60 px-2 py-3">
                          <table className="w-full border-collapse text-[12.5px]">
                            <thead>
                              <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink4)]">
                                <th className="px-2 py-1">Data</th>
                                <th className="px-2 py-1">Movimento</th>
                                <th className="px-2 py-1">Documento</th>
                                <th className="px-2 py-1 text-right">Valor</th>
                                <th className="px-2 py-1 text-right">Saldo devido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.movimentos.map((m) => (
                                <tr key={`${m.tipo}-${m.id}`}>
                                  <td className="px-2 py-1 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {m.data ? dateBR(m.data) : "—"}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Badge
                                      tone={m.tipo === "desembolso" ? "warning" : "success"}
                                    >
                                      {m.tipo === "desembolso" ? "Desembolso" : "Restituição"}
                                    </Badge>{" "}
                                    <span className="text-[var(--color-ink3)]">
                                      {m.descricao}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {m.numDoc ?? "—"}
                                  </td>
                                  <td
                                    className={`px-2 py-1 text-right font-[family-name:var(--font-mono)] ${
                                      m.tipo === "desembolso"
                                        ? "text-[var(--color-ink)]"
                                        : "text-[var(--color-success)]"
                                    }`}
                                  >
                                    {m.tipo === "desembolso" ? "+" : "−"}
                                    {brl0(m.valor)}
                                  </td>
                                  <td className="px-2 py-1 text-right font-[family-name:var(--font-mono)] font-medium">
                                    {brl0(m.saldoAcumulado)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

### `src/components/app/contas-pagar-table.tsx`

Usado por: `/contaspagar`.

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ContaPagarRow } from "@/lib/queries";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortTH, useOrdenacaoTabela } from "@/components/app/sortable-th";
import type { ColunaOrdenavel } from "@/lib/tabela-ordenacao";

/** "MM/DD/YYYY" → "YYYY-MM-DD" para comparação de intervalo. */
function toISO(d: string | null): string {
  if (!d) return "";
  const p = d.split("/");
  if (p.length !== 3) return "";
  return `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}`;
}

const statusTone = (s: string | null) =>
  s === "Pago"
    ? "success"
    : s === "Vencida"
      ? "danger"
      : s === "Cancelada"
        ? "neutral"
        : s === "A pagar" || s === "Em aberto" || s === "Parcialmente paga"
          ? "warning"
          : "neutral";

/** Status exibido: "Vencida" é derivado automaticamente pela data de vencimento. */
function displayStatus(
  status: string | null,
  vencimento: string | null,
  hojeISO: string,
): string {
  if (status === "Pago" || status === "Cancelada" || status === "Parcialmente paga")
    return status;
  const iso =
    vencimento && vencimento.split("/").length === 3
      ? `${vencimento.split("/")[2]}-${vencimento.split("/")[0].padStart(2, "0")}-${vencimento.split("/")[1].padStart(2, "0")}`
      : "";
  if (iso && iso < hojeISO) return "Vencida";
  return status || "Em aberto";
}

export function ContasPagarTable({
  rows,
  canEditar = false,
}: {
  rows: ContaPagarRow[];
  canEditar?: boolean;
}) {
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const [fornecedor, setFornecedor] = useState("");
  const [cliente, setCliente] = useState("");
  const [projeto, setProjeto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [status, setStatus] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const opts = useMemo(() => {
    const uniq = (xs: (string | null | undefined)[]) =>
      [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) =>
        a.localeCompare(b),
      );
    // Projetos são identificados pelo ID REAL, nunca pelo nome: duas obras ou
    // filiais homônimas colapsariam num único filtro e vazariam dados entre si.
    const porId = new Map<string, string>();
    for (const r of rows) if (!porId.has(r.projectId)) porId.set(r.projectId, r.projectName);
    return {
      fornecedores: uniq(rows.map((r) => r.fornecedorNome)),
      clientes: uniq(rows.map((r) => r.clienteNome ?? "Empreendimento próprio")),
      projetos: [...porId]
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
      categorias: uniq(rows.map((r) => r.categoriaDre)),
      status: uniq(rows.map((r) => r.status)),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (fornecedor && r.fornecedorNome !== fornecedor) return false;
      const cli = r.clienteNome ?? "Empreendimento próprio";
      if (cliente && cli !== cliente) return false;
      // Filtro por ID real do projeto (não pelo nome) — isola obras/filiais.
      if (projeto && r.projectId !== projeto) return false;
      if (categoria && r.categoriaDre !== categoria) return false;
      if (status && r.status !== status) return false;
      const iso = toISO(r.vencimento);
      if (de && (!iso || iso < de)) return false;
      if (ate && (!iso || iso > ate)) return false;
      return true;
    });
    // Ordenação por vencimento usando datas reais (ISO), não strings BR:
    //  1) vencidas (mais antiga → recente), 2) a vencer (mais próxima → distante),
    //  3) pagas (por data de pagamento). Sem data vão para o fim do grupo.
    const bucket = (r: ContaPagarRow): number => {
      if (r.status === "Pago") return 2;
      const iso = toISO(r.vencimento);
      if (iso && iso < hojeISO) return 0; // vencida
      return 1; // a vencer (ou sem vencimento)
    };
    const keyDate = (r: ContaPagarRow): string => {
      const base = r.status === "Pago" ? toISO(r.dataPagamento) : toISO(r.vencimento);
      return base || "9999-12-31";
    };
    return out.sort((a, b) => {
      const ba = bucket(a);
      const bb = bucket(b);
      if (ba !== bb) return ba - bb;
      return keyDate(a).localeCompare(keyDate(b));
    });
  }, [rows, fornecedor, cliente, projeto, categoria, status, de, ate, hojeISO]);

  // §5 — ordenação estilo planilha. Aplicada SOBRE o conjunto já filtrado, na
  // íntegra (não só sobre a parte visível). Sem clique de cabeçalho, vale a
  // ordenação padrão acima (vencidas → a vencer → pagas).
  const colunas = useMemo<ColunaOrdenavel<ContaPagarRow>[]>(
    () => [
      { key: "fornecedor", tipo: "texto", get: (r) => r.fornecedorNome },
      { key: "descricao", tipo: "texto", get: (r) => r.descricao },
      { key: "categoria", tipo: "texto", get: (r) => r.categoriaDre },
      { key: "projeto", tipo: "texto", get: (r) => r.projectName },
      { key: "cliente", tipo: "texto", get: (r) => r.clienteNome ?? "Próprio" },
      { key: "valor", tipo: "valor", get: (r) => r.valor },
      { key: "vencimento", tipo: "data", get: (r) => r.vencimento },
      { key: "pagamento", tipo: "data", get: (r) => r.dataPagamento },
      { key: "forma", tipo: "texto", get: (r) => r.formaPagamento },
      // Ordena pelo status EXIBIDO (inclui "Vencida", que é derivado da data).
      { key: "status", tipo: "texto", get: (r) => displayStatus(r.status, r.vencimento, hojeISO) },
    ],
    [hojeISO],
  );
  const { rows: visiveis, estado, onSort } = useOrdenacaoTabela(
    filtered,
    colunas,
    (r) => r.id,
  );

  // Totais — uma obrigação de restituição NÃO é despesa nova: a despesa dela já
  // está listada (como "Pago", porque quem pagou o fornecedor foi o terceiro).
  // Por isso "Total" soma só as despesas, enquanto "Pendente" e "A restituir"
  // mostram o que de fato ainda vai sair do caixa da empresa. Somar as duas
  // coisas em "Total" contaria o mesmo fato duas vezes.
  const despesasFiltradas = filtered.filter((r) => r.origem !== "obrigacao");
  const obrigacoesFiltradas = filtered.filter((r) => r.origem === "obrigacao");
  const total = despesasFiltradas.reduce((a, r) => a + r.valor, 0);
  const totalPend = despesasFiltradas
    .filter((r) => r.status !== "Pago")
    .reduce((a, r) => a + r.valor, 0);
  const totalRestituir = obrigacoesFiltradas.reduce((a, r) => a + r.valor, 0);

  const limpar = () => {
    setFornecedor(""); setCliente(""); setProjeto("");
    setCategoria(""); setStatus(""); setDe(""); setAte("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-7">
          <div>
            <Label>De (vencimento)</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <FilterSelect label="Fornecedor" value={fornecedor} onChange={setFornecedor} options={opts.fornecedores} />
          <FilterSelect label="Cliente" value={cliente} onChange={setCliente} options={opts.clientes} />
          <div>
            <Label>Projeto</Label>
            <Select value={projeto} onChange={(e) => setProjeto(e.target.value)}>
              <option value="">Todos os projetos</option>
              {opts.projetos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
          </div>
          <FilterSelect label="Categoria" value={categoria} onChange={setCategoria} options={opts.categorias} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={opts.status} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <Badge tone="neutral">{filtered.length} contas</Badge>
        <span className="text-[var(--color-ink3)]">
          Total <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">{brl0(total)}</strong>
        </span>
        <span className="text-[var(--color-ink3)]">
          Pendente <strong className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">{brl0(totalPend)}</strong>
        </span>
        {obrigacoesFiltradas.length > 0 && (
          <span
            className="text-[var(--color-ink3)]"
            title="Saldo devido a terceiros que pagaram fornecedores pela empresa. Não é despesa nova — a despesa já está listada acima."
          >
            A restituir{" "}
            <strong className="font-[family-name:var(--font-mono)] text-[var(--color-accent2)]">
              {brl0(totalRestituir)}
            </strong>
          </span>
        )}
        <button onClick={limpar} className="ml-auto text-[12px] text-[var(--color-accent2)] hover:underline">
          Limpar filtros
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Altura limitada: a rolagem (horizontal e vertical) acontece dentro
              da tabela, então a barra horizontal fica visível de imediato — sem
              precisar descer até o fim da página. Cabeçalho fixo ao rolar. */}
          <Table
            wrapperClassName="max-h-[70vh] scroll-x-always"
            className="min-w-[1200px]"
          >
            <THead className="sticky top-0 z-10">
                <tr>
                  <SortTH coluna="fornecedor" estado={estado} onSort={onSort}>Fornecedor</SortTH>
                  <SortTH coluna="descricao" estado={estado} onSort={onSort}>Descrição</SortTH>
                  <SortTH coluna="categoria" estado={estado} onSort={onSort}>Categoria</SortTH>
                  <SortTH coluna="projeto" estado={estado} onSort={onSort}>Projeto (Obra)</SortTH>
                  <SortTH coluna="cliente" estado={estado} onSort={onSort}>Cliente</SortTH>
                  <SortTH coluna="valor" estado={estado} onSort={onSort} className="text-right">Valor</SortTH>
                  <SortTH coluna="vencimento" estado={estado} onSort={onSort}>Vencimento</SortTH>
                  <SortTH coluna="pagamento" estado={estado} onSort={onSort}>Pagamento</SortTH>
                  <SortTH coluna="forma" estado={estado} onSort={onSort}>Forma</SortTH>
                  <SortTH coluna="status" estado={estado} onSort={onSort}>Status</SortTH>
                  {canEditar && <TH className="text-right">Ações</TH>}
                </tr>
              </THead>
              <tbody>
                {visiveis.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap font-medium text-[var(--color-ink)]">
                      {r.fornecedorNome ?? "—"}
                    </TD>
                    <TD className="max-w-[240px] truncate">{r.descricao ?? "—"}</TD>
                    <TD>{r.categoriaDre ?? "—"}</TD>
                    <TD className="whitespace-nowrap">{r.projectName}</TD>
                    <TD className="whitespace-nowrap text-[var(--color-ink3)]">
                      {r.clienteNome ?? "Próprio"}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(r.valor)}</TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                      {r.vencimento ? dateBR(r.vencimento) : "—"}
                    </TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {r.dataPagamento ? dateBR(r.dataPagamento) : "—"}
                    </TD>
                    <TD>{r.formaPagamento ?? "—"}</TD>
                    <TD>
                      {r.origem === "obrigacao" ? (
                        // Status da obrigação já vem no vocabulário da tela de
                        // Restituições; não passa por "Vencida" (a data aqui é
                        // uma previsão de restituição, não um vencimento).
                        <Badge tone="info">{r.status ?? "—"}</Badge>
                      ) : (
                        (() => {
                          const st = displayStatus(r.status, r.vencimento, hojeISO);
                          return <Badge tone={statusTone(st)}>{st}</Badge>;
                        })()
                      )}
                    </TD>
                    {canEditar && (
                      <TD className="text-right">
                        {r.origem === "obrigacao" ? (
                          <Link
                            href="/restituicoes"
                            className="text-sm text-[var(--color-accent2)] hover:underline"
                          >
                            Restituir
                          </Link>
                        ) : (
                          <Link
                            href={`/despesas?proj=${r.projectId}&tab=lancamentos&edit=${r.id}`}
                            className="text-sm text-[var(--color-accent2)] hover:underline"
                          >
                            Editar
                          </Link>
                        )}
                      </TD>
                    )}
                  </TR>
                ))}
                {visiveis.length === 0 && (
                  <TR>
                    <TD colSpan={canEditar ? 11 : 10} className="py-8 text-center text-[var(--color-ink4)]">
                      Nenhuma conta a pagar com os filtros aplicados.
                    </TD>
                  </TR>
                )}
              </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    </div>
  );
}
```

### `src/components/app/despesa-form.tsx`

Usado por: `/despesas`.

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
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
import { CampoIA, ResumoLeituraIA } from "@/components/ui/campo-ia";
import { UploadDocumentos } from "@/components/ui/upload-documentos";
import { AI_MAX_DOCS, legivelPelaIa, type Alerta } from "@/lib/ai/campos";
import {
  ROTULO_CAMPO,
  ROTULO_NATUREZA,
  type CampoDespesa,
  type PreenchimentoDespesa,
} from "@/lib/ai/despesa-doc";
import {
  TIPOS_DOCUMENTO,
  exigeNumero,
  validarDocumentoFiscal,
} from "@/lib/calc/documento-fiscal";
import {
  buscarDocumentoDuplicado,
  salvarDocumentoFiscal,
  type DuplicidadeDocumento,
} from "@/lib/actions/documento-fiscal";
import { dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField, MonthField } from "@/components/ui/date-field";
import {
  gerarParcelas,
  conflitoRecorrenteParcelado,
  FORMAS_PAGAMENTO,
  CONDICOES_PAGAMENTO,
} from "@/lib/calc";
import {
  ParcelasEditor,
  parcelaVazia,
  type ParcelaEditavel,
} from "@/components/app/parcelas-editor";

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
  /** Documento fiscal já registrado para esta despesa (item 1.2). */
  documentoFiscal?: {
    tipo: string;
    numero: string | null;
    serie: string | null;
    chaveAcesso: string | null;
    dataEmissao: string | null;
  } | null;
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
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Falha da leitura por IA — mostrada no próprio bloco de upload. */
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);

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
  // Bloco Documento Fiscal (item 1.2). Tudo opcional no lançamento: a nota
  // costuma chegar depois, e travar isso impediria o uso real do sistema.
  const [docFiscal, setDocFiscal] = useState({
    tipo: edit?.documentoFiscal?.tipo ?? "SEM_DOC",
    numero: edit?.documentoFiscal?.numero ?? "",
    serie: edit?.documentoFiscal?.serie ?? "",
    chaveAcesso: edit?.documentoFiscal?.chaveAcesso ?? "",
    dataEmissao: edit?.documentoFiscal?.dataEmissao ?? "",
  });
  const [dupAviso, setDupAviso] = useState<DuplicidadeDocumento | null>(null);
  const [dupConfirmada, setDupConfirmada] = useState(false);
  // Vários anexos podem ser enviados no mesmo lançamento — e a leitura por IA
  // usa TODOS os legíveis de uma vez: a mesma compra costuma chegar em partes
  // (a nota E o comprovante do Pix), e é o cruzamento delas que diz "já paga,
  // por PIX, em 20/07".
  const [files, setFiles] = useState<File[]>([]);
  const legiveis = useMemo(() => files.filter((f) => legivelPelaIa(f.type)), [files]);

  // ── Alertas da leitura por IA ─────────────────────────────────────────
  // Campo marcado = a IA não achou o dado, ou achou sem certeza. A marca some
  // quando o usuário mexe no campo: quem editou já conferiu.
  const [alertas, setAlertas] = useState<Partial<Record<CampoDespesa, Alerta>>>({});
  const [leitura, setLeitura] = useState<{
    titulo: string;
    resumo: string;
    preenchidos: string[];
    observacoes: string[];
  } | null>(null);

  const limparAlerta = (campo: CampoDespesa) =>
    setAlertas((prev) => {
      if (!prev[campo]) return prev;
      const next = { ...prev };
      delete next[campo];
      return next;
    });

  /** Envolve um setter para limpar o alerta do campo assim que ele é editado. */
  function editando<T>(campo: CampoDespesa, setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      limparAlerta(campo);
    };
  }

  const limparLeitura = () => {
    setAlertas({});
    setLeitura(null);
    setErroLeitura(null);
  };

  // Anexos na EDIÇÃO: enviar novos e remover individualmente, em qualquer
  // estágio (inclusive com a despesa já paga e/ou conciliada).
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
  // Parcelas com todos os campos (item 2.1): forma, cheque, banco e status por
  // linha. O painel auxiliar é quem edita — aqui só guardamos o resultado.
  const [parcelas, setParcelas] = useState<ParcelaEditavel[]>([]);
  const [painelParcelas, setPainelParcelas] = useState(false);
  const [bo, setBo] = useState({ linha: "", barras: "", banco: "" });
  const [ch, setCh] = useState({
    numero: "", banco: "", ag: "", conta: "", emitente: "", emissao: "", compensacao: "", status: "",
  });

  /**
   * Abre o painel de parcelas já com a série da condição escolhida.
   *
   * Antes esta função escrevia direto numa grade de três colunas embutida no
   * formulário. Agora ela apenas SEMEIA o painel: quem edita vencimento, valor,
   * forma, cheque, banco e status é a tela auxiliar.
   */
  const abrirPainelParcelas = () => {
    // Simétrico do bloqueio no checkbox: não dá para parcelar uma despesa
    // marcada como recorrente (item 2.7).
    if (conflitoRecorrenteParcelado(recorrente, true)) {
      setError(
        "Esta despesa está marcada como recorrente. Desmarque para configurar parcelas — recorrente repete o custo em vários meses, parcelado divide o pagamento de uma compra só.",
      );
      return;
    }
    setError(null);
    const total = Number(valor) || 0;
    const base = vencimento || competencia || "";
    // Já existem parcelas configuradas? Reabre para edição, sem regerar —
    // regerar apagaria os números de cheque já digitados.
    if (parcelas.length === 0 && condicao && total > 0 && base) {
      const ger = gerarParcelas({
        valorTotal: total,
        condicao,
        dataBase: base,
        qtd: condicao === "personalizado" ? Number(qtdPers) || 1 : undefined,
      });
      setParcelas(
        ger.map((p) => ({
          ...parcelaVazia(formaPagamento, bancoId, ch.emitente),
          vencimento: p.vencimento,
          valor: String(p.valor),
          dataBomPara: formaPagamento === "Cheque" ? p.vencimento : "",
        })),
      );
    }
    setPainelParcelas(true);
  };

  const somaParcelas = parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0);
  const totalOk = Math.abs(somaParcelas - (Number(valor) || 0)) < 0.01;

  /** Aplica no formulário o que voltou da leitura, com os alertas por campo. */
  function aplicarLeitura(res: PreenchimentoDespesa, qtdArquivos: number) {
    const v = res.valores;
    if (v.projetoId) setProjeto(v.projetoId);
    if (v.fornecedorId) setFornecedorId(v.fornecedorId);
    if (v.contaCef) setContaCef(v.contaCef);
    if (v.categoriaDre) setCategoriaDre(v.categoriaDre);
    if (v.competencia) setCompetencia(v.competencia);
    if (v.vencimento) setVencimento(v.vencimento);
    if (v.valor) setValor(v.valor);
    if (v.status) setStatus(v.status);
    if (v.obs) setObs(v.obs);
    if (v.formaPagamento) setFormaPagamento(v.formaPagamento);
    if (v.docFiscal) setDocFiscal(v.docFiscal);
    // A data do comprovante serve de sugestão para "despesa paga por sócio" —
    // o caso mais comum de comprovante avulso vindo da obra. Só é usada se a
    // opção for marcada; ficar preenchida no estado não muda nada até lá.
    if (v.dataPagamento) setSocioData(v.dataPagamento);

    setAlertas(res.alertas);
    setLeitura({
      titulo:
        ROTULO_NATUREZA[res.natureza] +
        (qtdArquivos > 1 ? ` · ${qtdArquivos} arquivos` : ""),
      resumo: res.resumo,
      preenchidos: res.preenchidos,
      observacoes: res.observacoes,
    });
    setNotice(null);
    // Subir duas vezes o mesmo documento é o erro mais fácil de cometer neste
    // fluxo (a nota chega por e-mail E por foto do WhatsApp). Como o número da
    // nota acabou de ser lido, a conferência de duplicidade roda sozinha, com
    // os valores recém-lidos — o estado ainda não foi atualizado neste tick.
    setDupAviso(null);
    setDupConfirmada(false);
    if (v.docFiscal) {
      void conferirDuplicidade(v.docFiscal, v.fornecedorId ?? fornecedorId);
    }
  }

  /**
   * Lê os documentos escolhidos. Roda sozinha logo após o upload (é o que o
   * usuário espera: subiu, preencheu) e pode ser repetida pelo botão quando a
   * pessoa troca ou acrescenta um arquivo.
   */
  function ler(lista: File[] = legiveis) {
    if (lista.length === 0) {
      setErroLeitura("Suba um PDF ou uma imagem para preencher o formulário.");
      return;
    }
    setErroLeitura(null);
    setNotice(null);
    const enviados = lista.slice(0, AI_MAX_DOCS);
    const fd = new FormData();
    for (const f of enviados) fd.append("file", f);
    startReading(async () => {
      // A falha da leitura aparece DENTRO do bloco de upload, ao lado dos
      // arquivos. A action RETORNA o erro em vez de lançar: em produção o
      // Next.js esconde a mensagem de erro lançado por Server Action e o
      // usuário via só um texto genérico em inglês.
      try {
        const res = await extractDespesaFromDoc(fd);
        if (res.ok) aplicarLeitura(res.data, enviados.length);
        else setErroLeitura(res.error);
      } catch {
        // Só resta o caso que a action não alcança (rede, sessão expirada).
        setErroLeitura("Falha ao ler o documento — verifique a conexão e tente novamente.");
      }
    });
  }

  /**
   * Procura um lançamento anterior com o mesmo documento fiscal do mesmo
   * fornecedor (CA-04). Só AVISA — quem decide prosseguir é o usuário.
   */
  async function conferirDuplicidade(
    doc: { tipo: string; numero: string; serie: string } = docFiscal,
    fornId: string = fornecedorId,
  ) {
    if (!exigeNumero(doc.tipo) || !doc.numero.trim()) {
      setDupAviso(null);
      return;
    }
    try {
      const dup = await buscarDocumentoDuplicado(
        fornId || null,
        { tipo: doc.tipo, numero: doc.numero, serie: doc.serie },
        edit?.id,
      );
      setDupAviso(dup);
      if (!dup) setDupConfirmada(false);
    } catch {
      // Falha na consulta não pode travar o lançamento — o alerta é auxiliar.
      setDupAviso(null);
    }
  }

  function salvar() {
    setError(null);
    // Documento fiscal: só recusa o que está claramente errado (chave fora do
    // formato). Ausência de número NUNCA bloqueia — a nota chega depois.
    const erroDoc = validarDocumentoFiscal(docFiscal);
    if (erroDoc) {
      setError(erroDoc);
      return;
    }
    if (dupAviso && !dupConfirmada) {
      setError(
        "Este documento já existe para o mesmo fornecedor. Confirme que é um lançamento diferente para prosseguir.",
      );
      return;
    }
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
          // O documento fiscal vive em tabela própria (RG-06) e é gravado à
          // parte — inclusive quando a nota só chegou agora.
          const resDoc = await salvarDocumentoFiscal({
            despesaId: edit.id,
            tipo: docFiscal.tipo,
            numero: docFiscal.numero,
            serie: docFiscal.serie,
            chaveAcesso: docFiscal.chaveAcesso,
            dataEmissao: docFiscal.dataEmissao,
          });
          if (!resDoc.ok) {
            setError(resDoc.error ?? "Falha ao salvar o documento fiscal.");
            return;
          }
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
    // A grade completa vai para o servidor: cada parcela leva sua forma, seu
    // cheque, seu banco e seu status (item 2.1/2.5).
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
    // Documento fiscal — campo PRÓPRIO, separado do PED (RG-06).
    fd.set("docTipo", docFiscal.tipo);
    fd.set("docNumero", docFiscal.numero);
    fd.set("docSerie", docFiscal.serie);
    fd.set("docChaveAcesso", docFiscal.chaveAcesso);
    fd.set("docDataEmissao", docFiscal.dataEmissao);
    // Vários anexos já no lançamento inicial (boleto + NF + comprovante...).
    for (const f of files) fd.append("file", f);
    startSaving(async () => {
      try {
        await addDespesa(fd);
        // limpa o formulário
        setFornecedorId("");
        setContaCef("");
        setCategoriaDre("");
        setBancoId("");
        setNumDoc("");
        setCompetencia("");
        setVencimento("");
        setValor("");
        setStatus("A pagar");
        setObs("");
        setDocFiscal({ tipo: "SEM_DOC", numero: "", serie: "", chaveAcesso: "", dataEmissao: "" });
        setDupAviso(null);
        setDupConfirmada(false);
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
        limparLeitura();
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
                de vida: antes/depois do pagamento e antes/depois da conciliação.
                Sem restrição de tipo: além de PDF e imagem, a despesa pode
                receber planilha, XML da nota, e-mail, contrato etc. */}
            <div className="mt-3 border-t border-[var(--color-accent2)]/12 pt-3">
              <UploadDocumentos
                className="border-0 bg-transparent p-0"
                titulo="Anexar mais documentos"
                descricao="Quantos forem necessários, em qualquer formato (até 10 MB cada). Os anexos já existentes são preservados."
                arquivos={novosAnexos}
                onArquivos={(lista) => {
                  setNovosAnexos(lista);
                  setAnexMsg(null);
                  setAnexErro(null);
                }}
                desabilitado={anexBusy}
                limiteTotalBytes={LIMITE_ENVIO}
                acao={{
                  label:
                    novosAnexos.length > 0
                      ? `Anexar ${novosAnexos.length} arquivo(s)`
                      : "Anexar ao lançamento",
                  labelOcupado: "Enviando…",
                  ocupado: anexBusy,
                  desabilitada: novosAnexos.length === 0,
                  motivo:
                    novosAnexos.length === 0
                      ? "Suba ao menos um arquivo para anexar."
                      : undefined,
                  onClick: enviarAnexos,
                }}
                avisos={[
                  ...(anexMsg ? ([{ tom: "ok" as const, texto: anexMsg }] as const) : []),
                  ...(anexErro ? ([{ tom: "erro" as const, texto: anexErro }] as const) : []),
                ]}
              />
            </div>
          </div>
        )}
        {/* Documento + leitura por IA — só no cadastro de uma nova despesa. */}
        {!isEdit && (
          <UploadDocumentos
            titulo="Documentos da despesa"
            descricao={
              aiConfigured
                ? "Suba a nota, o cupom, o boleto ou o comprovante — PDF ou imagem. Pode subir mais de um arquivo da mesma compra (a nota e o comprovante, por exemplo) que a IA lê tudo junto e preenche o formulário abaixo."
                : "Suba a nota, o cupom, o boleto ou o comprovante — em qualquer formato. Os arquivos ficam anexados à despesa quando você lançar."
            }
            arquivos={files}
            onArquivos={(lista, adicionados) => {
              setFiles(lista);
              setNotice(null);
              setError(null);
              limparLeitura();
              // Subiu → já preenche. O botão "Preencher formulário" continua
              // ali para refazer a leitura (trocou o arquivo, corrigiu a foto)
              // e para quando a pessoa preferir disparar na mão.
              const paraLer = adicionados.filter((f) => legivelPelaIa(f.type));
              if (aiConfigured && paraLer.length > 0) {
                ler(lista.filter((f) => legivelPelaIa(f.type)));
              }
            }}
            desabilitado={busy}
            marcarLegibilidade={aiConfigured}
            limiteTotalBytes={LIMITE_ENVIO}
            acao={{
              label: "Preencher formulário",
              labelOcupado: "Lendo documentos…",
              labelRepetir: "Preencher novamente",
              repetiu: !!leitura,
              ocupado: reading,
              desabilitada: !aiConfigured || legiveis.length === 0,
              // O motivo só se repete ao lado do botão quando é algo que a
              // pessoa resolve ali (subir um arquivo). Falta de chave já está
              // explicada no aviso abaixo — repetir só polui.
              motivoVisivel: aiConfigured,
              motivo: !aiConfigured
                ? "Preenchimento automático indisponível neste servidor."
                : legiveis.length === 0
                  ? "Suba um PDF ou uma imagem para preencher o formulário."
                  : "Ler os documentos e preencher os campos abaixo",
              onClick: () => ler(),
            }}
            avisos={[
              ...(erroLeitura
                ? ([{ tom: "erro" as const, texto: erroLeitura }] as const)
                : []),
              ...(aiConfigured
                ? ([
                    {
                      tom: "info" as const,
                      texto:
                        "O que a IA não achar — ou achar com dúvida — fica marcado com alerta no campo. Nada é gravado antes de você conferir e lançar.",
                    },
                  ] as const)
                : ([
                    {
                      tom: "atencao" as const,
                      texto: (
                        <>
                          <strong>Preenchimento automático indisponível.</strong> A
                          chave de IA não está configurada neste servidor
                          (ANTHROPIC_API_KEY), então os campos precisam ser
                          preenchidos à mão. O upload e o vínculo dos arquivos com a
                          despesa continuam funcionando normalmente.{" "}
                          <a
                            href="/diagnosticoia"
                            className="font-medium text-[var(--color-accent2)] underline"
                          >
                            Abrir Diagnóstico de IA
                          </a>
                        </>
                      ),
                    },
                  ] as const)),
              ...(aiConfigured && legiveis.length > AI_MAX_DOCS
                ? ([
                    {
                      tom: "info" as const,
                      texto: `A leitura usa os ${AI_MAX_DOCS} primeiros PDFs/imagens da lista; o restante é apenas anexado.`,
                    },
                  ] as const)
                : []),
              ...(r2Configured
                ? []
                : ([
                    {
                      tom: "atencao" as const,
                      texto:
                        "Armazenamento de arquivos não configurado (variáveis R2_*) — os documentos não ficarão guardados no lançamento.",
                    },
                  ] as const)),
            ]}
          />
        )}

        {/* Placar da leitura: o que foi preenchido e o que ficou pendente. */}
        {leitura && (
          <ResumoLeituraIA
            titulo={leitura.titulo}
            resumo={leitura.resumo}
            preenchidos={leitura.preenchidos}
            alertas={alertas as Record<string, Alerta>}
            rotulos={ROTULO_CAMPO}
            observacoes={leitura.observacoes}
            onFechar={limparLeitura}
          />
        )}

        {/* Campos da despesa */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CampoIA label="Projeto" alerta={alertas.projeto} className="sm:col-span-2">
            <Select
              value={projeto}
              onChange={(e) => {
                setProjeto(e.target.value);
                limparAlerta("projeto");
              }}
              disabled={isEdit}
            >
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </CampoIA>
          <CampoIA label="Fornecedor" alerta={alertas.fornecedor} className="sm:col-span-2">
            <Select
              value={fornecedorId}
              onChange={(e) => {
                setFornecedorId(e.target.value);
                limparAlerta("fornecedor");
              }}
            >
              <option value="">Selecione...</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </CampoIA>
          {/* ── Documento Fiscal (item 1.2 / RG-06) ─────────────────────────
              O PED acima é numeração INTERNA da empresa; aqui entra o número da
              nota, que é do emitente. Tudo é opcional: a nota costuma chegar
              depois do lançamento e pode ser completada a qualquer tempo. */}
          <div className="sm:col-span-4 rounded-[10px] border border-[var(--color-accent2)]/15 bg-[var(--color-surface2)]/40 p-3">
            <p className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Documento fiscal · opcional — a nota pode ser lançada depois
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <CampoIA label="Tipo" alerta={alertas.docFiscalTipo}>
                <Select
                  value={docFiscal.tipo}
                  onChange={(e) => {
                    setDocFiscal((d) => ({ ...d, tipo: e.target.value }));
                    limparAlerta("docFiscalTipo");
                    setDupAviso(null);
                    setDupConfirmada(false);
                  }}
                >
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </CampoIA>
              <CampoIA label="Nº do documento" alerta={alertas.docFiscalNumero}>
                <Input
                  value={docFiscal.numero}
                  disabled={!exigeNumero(docFiscal.tipo)}
                  onChange={(e) => {
                    setDocFiscal((d) => ({ ...d, numero: e.target.value }));
                    limparAlerta("docFiscalNumero");
                    setDupAviso(null);
                    setDupConfirmada(false);
                  }}
                  onBlur={() => conferirDuplicidade()}
                  placeholder={exigeNumero(docFiscal.tipo) ? "ex.: 12345" : "—"}
                />
              </CampoIA>
              <CampoIA label="Série" alerta={alertas.docFiscalSerie}>
                <Input
                  value={docFiscal.serie}
                  disabled={!exigeNumero(docFiscal.tipo)}
                  onChange={(e) => {
                    setDocFiscal((d) => ({ ...d, serie: e.target.value }));
                    limparAlerta("docFiscalSerie");
                  }}
                  onBlur={() => conferirDuplicidade()}
                  placeholder="1"
                />
              </CampoIA>
              <CampoIA label="Emissão" alerta={alertas.docFiscalEmissao}>
                <DateField
                  value={docFiscal.dataEmissao}
                  onChange={editando("docFiscalEmissao", (v: string) =>
                    setDocFiscal((d) => ({ ...d, dataEmissao: v })),
                  )}
                  disabled={!exigeNumero(docFiscal.tipo)}
                />
              </CampoIA>
              <CampoIA label="Chave de acesso (44 dígitos)" alerta={alertas.docFiscalChave}>
                <Input
                  value={docFiscal.chaveAcesso}
                  disabled={!exigeNumero(docFiscal.tipo)}
                  onChange={(e) => {
                    setDocFiscal((d) => ({ ...d, chaveAcesso: e.target.value }));
                    limparAlerta("docFiscalChave");
                  }}
                  placeholder="opcional"
                />
              </CampoIA>
            </div>
            {/* Duplicidade é AVISO, nunca bloqueio: numeração de NF é sequencial
                por emitente e série, então repetição pode ser legítima (D2). */}
            {dupAviso && (
              <div className="mt-2 rounded-[8px] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-2.5 text-[12.5px]">
                <p className="text-[var(--color-ink)]">
                  Já existe um lançamento com este documento para o mesmo
                  fornecedor:{" "}
                  <a
                    href={`/despesas?proj=${dupAviso.projectId}&tab=lancamentos&edit=${dupAviso.despesaId}`}
                    target="_blank"
                    rel="noopener"
                    className="font-[family-name:var(--font-mono)] text-[var(--color-accent2)] hover:underline"
                  >
                    {dupAviso.numDoc ?? "ver lançamento"}
                  </a>{" "}
                  · {dupAviso.projectName}
                  {dupAviso.competencia ? ` · ${dupAviso.competencia}` : ""}
                </p>
                <label className="mt-1.5 flex items-center gap-2 text-[var(--color-ink2)]">
                  <input
                    type="checkbox"
                    checked={dupConfirmada}
                    onChange={(e) => setDupConfirmada(e.target.checked)}
                  />
                  Confirmo que este é um lançamento diferente e quero prosseguir.
                </label>
              </div>
            )}
          </div>

          <CampoIA label="Conta CEF / Plano de Contas" alerta={alertas.contaCef}>
            <Select
              value={contaCef}
              onChange={(e) => {
                setContaCef(e.target.value);
                limparAlerta("contaCef");
              }}
            >
              <option value="">Selecione...</option>
              {contas.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </CampoIA>
          {/* Só categorias de natureza devedora: uma despesa não pode ser
              classificada em conta de receita (item 1.3 / RG-01). */}
          <CampoIA label="Categoria DRE" alerta={alertas.categoriaDre}>
            <Select
              value={categoriaDre}
              onChange={(e) => {
                setCategoriaDre(e.target.value);
                limparAlerta("categoriaDre");
              }}
            >
              <option value="">Selecione...</option>
              {categoriasDespesa.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </CampoIA>
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
          <CampoIA label="Competência" alerta={alertas.competencia}>
            <MonthField
              value={competencia}
              onChange={editando("competencia", setCompetencia)}
            />
          </CampoIA>
          <CampoIA label="Vencimento" alerta={alertas.vencimento}>
            <DateField value={vencimento} onChange={editando("vencimento", setVencimento)} />
          </CampoIA>
          <CampoIA label="Valor" alerta={alertas.valor}>
            <MoneyInput value={valor} onChange={editando("valor", setValor)} />
          </CampoIA>
          <CampoIA label="Status" alerta={alertas.status}>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                limparAlerta("status");
              }}
            >
              <option>A pagar</option>
              <option>Pago</option>
            </Select>
          </CampoIA>
          {/* Descrição/observação da compra — campo PRÓPRIO, separado do nº do
              pedido. Serve para explicar o objeto da compra. */}
          <CampoIA
            label="Descrição / observação da compra"
            alerta={alertas.obs}
            className="col-span-2 sm:col-span-4"
          >
            <Input
              value={obs}
              onChange={(e) => {
                setObs(e.target.value);
                limparAlerta("obs");
              }}
              placeholder="Objeto da compra (ex.: 20 sacos de cimento CP-II para a laje do 2º pav.)"
            />
          </CampoIA>
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
                onChange={(e) => {
                  // Item 2.7 — recorrente e parcelado são coisas diferentes e
                  // não se combinam: recorrente replica o MESMO custo em várias
                  // competências; parcelado fraciona o pagamento de um custo
                  // único. Marcar os dois replicaria a despesa na DRE por
                  // competência de parcela, que é erro de competência (RG-01).
                  if (e.target.checked && conflitoRecorrenteParcelado(true, parcelas.length > 0)) {
                    setError(
                      "Recorrente e parcelado são coisas diferentes. Recorrente repete o mesmo custo em vários meses (aluguel, salário); parcelado fraciona o pagamento de uma compra única. Limpe as parcelas para marcar recorrente.",
                    );
                    return;
                  }
                  setError(null);
                  setRecorrente(e.target.checked);
                }}
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
              <CampoIA label="Forma de pagamento" alerta={alertas.formaPagamento}>
                <Select
                  value={formaPagamento}
                  onChange={(e) => {
                    setFormaPagamento(e.target.value);
                    limparAlerta("formaPagamento");
                  }}
                >
                  <option value="">—</option>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </CampoIA>
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
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={abrirPainelParcelas}>
                  {parcelas.length > 0
                    ? `Editar ${parcelas.length} parcela(s)`
                    : "Configurar parcelas"}
                </Button>
              </div>
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

            {/* Tela auxiliar de parcelas (item 2.1) — cada linha com sua forma,
                seu cheque, seu banco e seu status. */}
            <ParcelasEditor
              aberto={painelParcelas}
              parcelas={parcelas}
              valorTotal={valor}
              bancos={bancos}
              formaPadrao={formaPagamento}
              bancoPadrao={bancoId}
              emitentePadrao={ch.emitente}
              dataBase={vencimento || competencia || ""}
              onFechar={() => setPainelParcelas(false)}
              onConfirmar={(linhas, total) => {
                setParcelas(linhas);
                // Modo bottom-up: sem total no cabeçalho, o total do pedido
                // passa a ser a soma das parcelas (item 2.3).
                if (!(Number(valor) > 0) && total > 0) setValor(String(total));
                setPainelParcelas(false);
              }}
            />

            {/* Resumo das parcelas — o detalhe vive no painel auxiliar. */}
            {parcelas.length > 0 && (
              <div className="rounded-[8px] border border-[var(--color-accent2)]/15 bg-[var(--color-surface2)]/50 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-3 text-[13px]">
                  <strong className="text-[var(--color-ink)]">
                    {parcelas.length} parcela(s)
                  </strong>
                  <span
                    className={`font-[family-name:var(--font-mono)] ${
                      totalOk ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
                    }`}
                  >
                    soma {somaParcelas.toFixed(2)}
                    {(Number(valor) || 0) > 0 && ` / total ${(Number(valor) || 0).toFixed(2)}`}
                    {totalOk ? " ✓" : " — não fecha"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPainelParcelas(true)}
                    className="text-[12.5px] text-[var(--color-accent2)] hover:underline"
                  >
                    Editar parcelas
                  </button>
                  <button
                    type="button"
                    onClick={() => setParcelas([])}
                    className="text-[12.5px] text-[var(--color-ink3)] hover:underline"
                  >
                    Limpar
                  </button>
                </div>
                <div className="tbl-scroll overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink4)]">
                        <th className="py-1 pr-3">#</th>
                        <th className="py-1 pr-3">Vencimento</th>
                        <th className="py-1 pr-3 text-right">Valor</th>
                        <th className="py-1 pr-3">Forma</th>
                        <th className="py-1 pr-3">Cheque</th>
                        <th className="py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parcelas.map((p, i) => (
                        <tr key={i} className="border-t border-[var(--color-accent2)]/8">
                          <td className="py-1 pr-3 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                            {i + 1}
                          </td>
                          <td className="py-1 pr-3 font-[family-name:var(--font-mono)]">
                            {p.vencimento ? dateBR(p.vencimento) : "—"}
                          </td>
                          <td className="py-1 pr-3 text-right font-[family-name:var(--font-mono)]">
                            {(Number(p.valor) || 0).toFixed(2)}
                          </td>
                          <td className="py-1 pr-3">{p.forma || "—"}</td>
                          <td className="py-1 pr-3 font-[family-name:var(--font-mono)]">
                            {p.numeroCheque || "—"}
                          </td>
                          <td className="py-1 text-[var(--color-ink3)]">{p.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
```

### `src/components/app/despesa-search.tsx`

Usado por: `/despesas`.

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DespesaDTO } from "@/components/app/despesas-table";
import { brl0, dateBR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { registroCasa } from "@/lib/busca";

/**
 * Busca de despesas (lupa): filtra por palavra-chave (observação), código
 * (nº do documento), valor ou fornecedor, e abre uma tela auxiliar com as
 * opções que batem. Clicar em um resultado abre a edição da despesa.
 */
export function DespesaSearch({
  rows,
  fornecedores,
}: {
  rows: DespesaDTO[];
  fornecedores: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fornById = useMemo(
    () => new Map(fornecedores.map((f) => [f.id, f.nome])),
    [fornecedores],
  );

  const resultados = useMemo(() => {
    if (!q.trim()) return [];
    // Busca por similaridade em vários campos ao mesmo tempo; vários termos são
    // combinados (todos precisam casar), em qualquer ordem. Roda a cada tecla.
    return rows
      .filter((d) =>
        registroCasa(
          q,
          [
            d.numDoc,
            d.fornecedorId ? fornById.get(d.fornecedorId) : null,
            d.obs,
            d.categoriaDre,
            d.contaCef,
            d.competencia,
            d.status,
          ],
          [Number(d.valor)],
        ),
      )
      .slice(0, 60);
  }, [q, rows, fornById]);

  const abrir = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const fechar = () => {
    setOpen(false);
    setQ("");
  };
  const editar = (d: DespesaDTO) => {
    fechar();
    router.push(
      `/despesas?tab=lancamentos&proj=${d.projectId}&edit=${d.id}`,
    );
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      {/* Campo de busca VISÍVEL (não um botão discreto): ao focar/digitar abre a
          tela auxiliar com os resultados, de onde se edita ou exclui a despesa. */}
      <div className="relative w-full">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink3)]"
        >
          🔍
        </span>
        <input
          readOnly
          onFocus={abrir}
          onClick={abrir}
          placeholder="Buscar despesa por palavra-chave, nº do pedido, valor ou fornecedor…"
          className="w-full cursor-pointer rounded-[8px] border border-[var(--color-accent2)]/25 bg-white py-2 pl-9 pr-3 text-[13px] text-[var(--color-ink2)] placeholder:text-[var(--color-ink4)] hover:bg-[var(--color-surface2)] focus:border-[var(--color-accent2)] focus:outline-none"
        />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
          onClick={fechar}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[12px] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-accent2)]/12 px-4 py-3">
              <span aria-hidden className="text-[var(--color-ink3)]">🔍</span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && fechar()}
                placeholder="Palavra-chave, código (nº doc), valor ou fornecedor…"
                className="w-full bg-transparent text-[14px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink4)]"
              />
              <button
                onClick={fechar}
                className="text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              {q.trim().length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[var(--color-ink3)]">
                  Digite para buscar entre {rows.length} despesas.
                </p>
              ) : resultados.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[var(--color-ink3)]">
                  Nenhuma despesa encontrada para “{q}”.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-accent2)]/8">
                  {resultados.map((d) => {
                    const forn = d.fornecedorId ? fornById.get(d.fornecedorId) ?? "—" : "—";
                    return (
                      <li key={d.id}>
                        <button
                          onClick={() => editar(d)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-surface2)]"
                        >
                          <span className="w-16 shrink-0 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
                            {d.numDoc ?? "—"}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink)]">
                            {forn}
                            {d.obs ? (
                              <span className="text-[var(--color-ink3)]"> · {d.obs}</span>
                            ) : null}
                          </span>
                          {d.categoriaDre && (
                            <Badge tone="neutral">{d.categoriaDre}</Badge>
                          )}
                          <span className="w-24 shrink-0 text-right font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--color-ink2)]">
                            {brl0(Number(d.valor))}
                          </span>
                          <span className="w-20 shrink-0 text-right font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink4)]">
                            {dateBR(d.competencia)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {resultados.length > 0 && (
              <div className="border-t border-[var(--color-accent2)]/12 px-4 py-2 text-[11px] text-[var(--color-ink3)]">
                {resultados.length} resultado(s) · clique para abrir a despesa, onde é
                possível editar, cancelar ou excluir
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

### `src/components/app/despesas-table.tsx`

Usado por: `/despesas`.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  deleteDespesa,
  cancelarDespesa,
  pagarDespesa,
} from "@/lib/actions/despesas";
import { brl0, dateBR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";

export interface DespesaDTO {
  id: string;
  /** projeto ao qual a despesa pertence (necessário para abrir a edição). */
  projectId: string;
  numDoc: string | null;
  fornecedorId: string | null;
  bancoId: string | null;
  contaCef: string | null;
  categoriaDre: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: string;
  status: string | null;
  formaPagamento?: string | null;
  obs?: string | null;
  cancelado?: boolean;
  /** rótulo de origem (obra/filial) — usado na consulta consolidada. */
  origem?: string | null;
  /** URL do anexo mais recente (clipe na linha); null se não houver/sem storage. */
  anexoUrl?: string | null;
  /** quantidade de documentos anexados à despesa. */
  anexoCount?: number;
  /** Sem documento fiscal registrado (item 1.2) — pendência, não impedimento. */
  semNf?: boolean;
}

/** Status exibido: "Vencida" derivado da data; "Cancelada" tem prioridade. */
function displayStatus(d: DespesaDTO): string {
  if (d.cancelado) return "Cancelada";
  if (d.status === "Pago" || d.status === "Parcialmente paga") return d.status;
  const v = d.vencimento;
  if (v && v.split("/").length === 3) {
    const iso = `${v.split("/")[2]}-${v.split("/")[0].padStart(2, "0")}-${v.split("/")[1].padStart(2, "0")}`;
    const h = new Date();
    const hj = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
    if (iso < hj) return "Vencida";
  }
  return d.status || "Em aberto";
}
const statusTone = (s: string) =>
  s === "Pago"
    ? "success"
    : s === "Vencida"
      ? "danger"
      : s === "Cancelada"
        ? "neutral"
        : "warning";

interface Ref {
  fornecedores: { id: string; nome: string }[];
  bancos: { id: string; banco: string; tipo: string }[];
}

export function DespesasTable({
  rows,
  fornecedores,
  bancos,
  venc,
  showOrigem = false,
  latestId = null,
  canEditar,
  canExcluir,
}: {
  rows: DespesaDTO[];
  venc?: boolean;
  showOrigem?: boolean;
  /** id da última despesa lançada — recebe o destaque "Último lançamento". */
  latestId?: string | null;
  canEditar: boolean;
  canExcluir: boolean;
} & Ref) {
  const fornById = new Map(fornecedores.map((f) => [f.id, f.nome]));
  const showActions = canEditar || canExcluir;
  const cols = (showActions ? 8 : 7) + (showOrigem ? 1 : 0);

  // A ordem chega pronta de quem monta a lista (a tela de lançamentos ordena
  // por created_at DESC, id DESC). Aqui não se reordena — apenas se destaca a
  // linha do último lançamento.
  const ordered = rows;

  return (
    <Table>
      <THead>
        <tr>
          <TH>{venc ? "Vencimento" : "Competência"}</TH>
          {showOrigem && <TH>Origem</TH>}
          <TH>Nº Doc</TH>
          <TH>Fornecedor</TH>
          <TH>Conta CEF</TH>
          <TH>Cat. DRE</TH>
          <TH className="text-right">Valor</TH>
          <TH>Status</TH>
          {showActions && <TH className="text-right">Ações</TH>}
        </tr>
      </THead>
      <tbody>
        {ordered.map((d) => (
          <Row
            key={d.id}
            d={d}
            fornById={fornById}
            bancos={bancos}
            venc={venc}
            showOrigem={showOrigem}
            highlight={!!latestId && d.id === latestId}
            canEditar={canEditar}
            canExcluir={canExcluir}
          />
        ))}
        {rows.length === 0 && (
          <TR>
            <TD colSpan={cols} className="py-6 text-center text-[var(--color-ink3)]">
              Nada por aqui nesta versão.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}

function Row({
  d,
  fornById,
  bancos,
  venc,
  showOrigem = false,
  highlight = false,
  canEditar,
  canExcluir,
}: {
  d: DespesaDTO;
  fornById: Map<string, string>;
  bancos: Ref["bancos"];
  showOrigem?: boolean;
  venc?: boolean;
  /** Última despesa lançada — linha destacada no topo (conferência). */
  highlight?: boolean;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [paying, setPaying] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Abre a tela completa de edição (mesmo formulário do cadastro, já preenchido)
  // via deep link ?edit=. Preserva o projeto da despesa para carregar a versão
  // correta (importante na consulta consolidada).
  const abrirEdicao = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", "lancamentos");
    params.set("proj", d.projectId);
    params.set("edit", d.id);
    router.push(`/despesas?${params.toString()}`);
    // Mudança só de query (mesma página) não rola a tela: a tela completa de
    // edição abre no topo, então trazemos a visão para lá — igual ao fluxo
    // vindo de Contas a Pagar (navegação entre páginas já sobe ao topo).
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Formulário de pagamento (marcar como paga).
  const hojeInterno = (() => {
    const h = new Date();
    return `${String(h.getMonth() + 1).padStart(2, "0")}/${String(h.getDate()).padStart(2, "0")}/${h.getFullYear()}`;
  })();
  const [pg, setPg] = useState({
    data: hojeInterno,
    valor: d.valor,
    bancoId: d.bancoId ?? "",
    forma: d.formaPagamento ?? "",
    juros: "",
    multa: "",
    desconto: "",
    obs: "",
  });

  const cancelar = () => {
    const motivo = window.prompt("Motivo do cancelamento desta despesa:");
    if (motivo === null) return;
    setError(null);
    start(async () => {
      try {
        await cancelarDespesa(d.id, motivo);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao cancelar.");
      }
    });
  };

  const confirmarPagamento = () => {
    setError(null);
    start(async () => {
      try {
        await pagarDespesa({
          despesaId: d.id,
          dataPagamento: pg.data,
          valorPago: Number(pg.valor) || 0,
          bankAccountId: pg.bancoId || null,
          formaPagamento: pg.forma || null,
          juros: Number(pg.juros) || 0,
          multa: Number(pg.multa) || 0,
          desconto: Number(pg.desconto) || 0,
          obs: pg.obs || undefined,
        });
        setPaying(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao registrar pagamento.");
      }
    });
  };

  const showActions = canEditar || canExcluir;
  const stDisplay = displayStatus(d);
  const isPago = d.status === "Pago";

  const remove = () => {
    if (
      !window.confirm(
        `Excluir a despesa ${d.numDoc ?? ""} (${brl0(Number(d.valor))})? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        await deleteDespesa(d.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao excluir.");
      }
    });
  };

  if (paying) {
    return (
      <TR>
        <TD colSpan={(showActions ? 8 : 7) + (showOrigem ? 1 : 0)}>
          <div className="rounded-[8px] border border-[var(--color-accent2)]/15 bg-[var(--color-surface2)] p-3">
            <div className="mb-2 text-[12px] font-semibold text-[var(--color-ink)]">
              Registrar pagamento — {d.numDoc ?? "despesa"} ({brl0(Number(d.valor))})
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><Label>Data do pagamento</Label><DateField value={pg.data} onChange={(v) => setPg((s) => ({ ...s, data: v }))} className="h-8 text-xs" /></div>
              <div><Label>Valor pago</Label><MoneyInput value={pg.valor} onChange={(v) => setPg((s) => ({ ...s, valor: v }))} className="h-8 text-xs" /></div>
              <div>
                <Label>Conta bancária</Label>
                <Select value={pg.bancoId} onChange={(e) => setPg((s) => ({ ...s, bancoId: e.target.value }))} className="h-8 text-xs">
                  <option value="">—</option>
                  {bancos.map((b) => <option key={b.id} value={b.id}>{b.banco} · {b.tipo}</option>)}
                </Select>
              </div>
              <div><Label>Forma</Label><Input value={pg.forma} onChange={(e) => setPg((s) => ({ ...s, forma: e.target.value }))} className="h-8 text-xs" /></div>
              <div><Label>Juros</Label><MoneyInput value={pg.juros} onChange={(v) => setPg((s) => ({ ...s, juros: v }))} className="h-8 text-xs" /></div>
              <div><Label>Multa</Label><MoneyInput value={pg.multa} onChange={(v) => setPg((s) => ({ ...s, multa: v }))} className="h-8 text-xs" /></div>
              <div><Label>Desconto</Label><MoneyInput value={pg.desconto} onChange={(v) => setPg((s) => ({ ...s, desconto: v }))} className="h-8 text-xs" /></div>
              <div><Label>Observação</Label><Input value={pg.obs} onChange={(e) => setPg((s) => ({ ...s, obs: e.target.value }))} className="h-8 text-xs" /></div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              {error && <span className="text-[11px] text-[var(--color-danger)]">{error}</span>}
              <Button size="sm" disabled={pending} onClick={confirmarPagamento}>Confirmar pagamento</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPaying(false)}>Cancelar</Button>
            </div>
          </div>
        </TD>
      </TR>
    );
  }

  return (
    <TR
      className={[
        d.cancelado ? "opacity-60" : "",
        highlight
          ? "bg-[var(--color-accent4)] shadow-[inset_3px_0_0_0_var(--color-accent2)]"
          : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined}
    >
      <TD className="font-[family-name:var(--font-mono)]">
        {highlight && (
          <span className="mb-0.5 block">
            <Badge tone="accent">Último lançamento</Badge>
          </span>
        )}
        {dateBR(venc ? d.vencimento : d.competencia)}
      </TD>
      {showOrigem && (
        <TD className="whitespace-nowrap text-[12px] text-[var(--color-ink2)]">
          {d.origem ?? "—"}
        </TD>
      )}
      <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
        <span className="inline-flex items-center gap-1.5">
          {d.numDoc ?? "—"}
          {d.anexoUrl && (
            <a
              href={d.anexoUrl}
              target="_blank"
              rel="noopener"
              title={`Abrir anexo${(d.anexoCount ?? 0) > 1 ? ` (${d.anexoCount} arquivos)` : ""}`}
              className="text-[13px] text-[var(--color-accent2)] hover:opacity-70"
              onClick={(e) => e.stopPropagation()}
            >
              📎{(d.anexoCount ?? 0) > 1 ? <span className="ml-0.5 text-[10px]">{d.anexoCount}</span> : null}
            </a>
          )}
          {/* Item 1.2 — a nota chega depois; o selo só torna a pendência
              visível, sem impedir nada. */}
          {d.semNf && (
            <span
              title="Pendente de documento fiscal — a nota ainda não foi informada"
              className="text-[11px] text-[var(--color-warning)]"
            >
              ⚠ Sem NF
            </span>
          )}
        </span>
      </TD>
      <TD>{d.fornecedorId ? fornById.get(d.fornecedorId) ?? "—" : "—"}</TD>
      <TD>
        <Badge tone="warning">{d.contaCef ?? "—"}</Badge>
      </TD>
      <TD className="text-[var(--color-ink2)]">{d.categoriaDre ?? "—"}</TD>
      <TD className="text-right font-[family-name:var(--font-mono)]">
        {brl0(Number(d.valor))}
      </TD>
      <TD>
        <Badge tone={statusTone(stDisplay)}>{stDisplay}</Badge>
      </TD>
      {showActions && (
        <TD className="text-right">
          {d.cancelado ? (
            <span className="text-[11px] text-[var(--color-ink4)]">cancelada</span>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {canEditar && !isPago && (
                <button
                  onClick={() => setPaying(true)}
                  disabled={pending}
                  className="text-sm text-[var(--color-success)] hover:underline disabled:opacity-50"
                >
                  Pagar
                </button>
              )}
              {canEditar && (
                <button
                  onClick={abrirEdicao}
                  disabled={pending}
                  className="text-sm text-[var(--color-accent2)] hover:underline disabled:opacity-50"
                >
                  Editar
                </button>
              )}
              {canExcluir && (
                <button
                  onClick={cancelar}
                  disabled={pending}
                  className="text-sm text-[var(--color-warning)] hover:underline disabled:opacity-50"
                  title="Cancelamento lógico (mantém histórico)"
                >
                  Cancelar
                </button>
              )}
              {canExcluir && (
                <button
                  onClick={remove}
                  disabled={pending}
                  className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
                  title="Exclusão física (irreversível)"
                >
                  Excluir
                </button>
              )}
            </div>
          )}
          {error && (
            <p className="mt-1 text-right text-[11px] text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </TD>
      )}
    </TR>
  );
}
```

### `src/components/app/medicao-manager.tsx`

Usado por: `/medicaolanc`.

```tsx
"use client";

import { useState, useTransition } from "react";
import { deleteMedicao, updateMedicao } from "@/lib/actions/medicao";
import { brl0 } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface MedicaoRowData {
  id: string;
  competencia: string;
  grupoCode: string;
  grupoName: string;
  valor: number;
  obs: string;
}

export function MedicaoTable({
  rows,
  canEditar,
  canExcluir,
}: {
  rows: MedicaoRowData[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const showActions = canEditar || canExcluir;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Competência</TH>
          <TH>Grupo de obra</TH>
          <TH className="text-right">Valor medido</TH>
          <TH>Observação</TH>
          {showActions && <TH className="text-right">Ações</TH>}
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <TR>
            <TD colSpan={showActions ? 5 : 4} className="py-8 text-center text-[var(--color-ink4)]">
              Nenhuma medição lançada nesta versão.
            </TD>
          </TR>
        ) : (
          rows.map((r) => (
            <Row key={r.id} row={r} canEditar={canEditar} canExcluir={canExcluir} />
          ))
        )}
      </tbody>
    </Table>
  );
}

function Row({
  row,
  canEditar,
  canExcluir,
}: {
  row: MedicaoRowData;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [competencia, setCompetencia] = useState(row.competencia);
  const [valor, setValor] = useState(String(row.valor));
  const [obs, setObs] = useState(row.obs);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty =
    competencia !== row.competencia ||
    Number(valor) !== row.valor ||
    obs !== row.obs;

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro.");
      }
    });
  };

  if (!canEditar && !canExcluir) {
    return (
      <TR>
        <TD className="font-[family-name:var(--font-mono)]">{row.competencia}</TD>
        <TD>
          <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
            {row.grupoCode}
          </span>{" "}
          {row.grupoName}
        </TD>
        <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(row.valor)}</TD>
        <TD>{row.obs || "—"}</TD>
      </TR>
    );
  }

  return (
    <TR>
      <TD>
        <MonthField
          value={competencia}
          onChange={setCompetencia}
          disabled={!canEditar || pending}
          className="h-8 w-32 text-xs"
        />
      </TD>
      <TD>
        <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
          {row.grupoCode}
        </span>{" "}
        {row.grupoName}
      </TD>
      <TD className="text-right">
        <Input
          type="number"
          step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={!canEditar || pending}
          className="h-8 w-32 text-right font-[family-name:var(--font-mono)] text-xs"
        />
      </TD>
      <TD>
        <Input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          disabled={!canEditar || pending}
          className="h-8 text-xs"
        />
        {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
      </TD>
      <TD className="text-right">
        <div className="flex items-center justify-end gap-2">
          {canEditar && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !dirty}
              onClick={() => run(() => updateMedicao(row.id, { competencia, valor, obs }))}
            >
              Salvar
            </Button>
          )}
          {canExcluir && (
            <button
              disabled={pending}
              onClick={() => run(() => deleteMedicao(row.id))}
              className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
            >
              Excluir
            </button>
          )}
        </div>
      </TD>
    </TR>
  );
}
```

### `src/components/app/page-header.tsx`

Usado por: `/acerto`, `/contaspagar`, `/despesas`, `/medicaolanc`, `/restituicoes`.

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

### `src/components/app/parcelas-editor.tsx`

Usado por: `/despesas`.

```tsx
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
```

### `src/components/app/parcelas-list.tsx`

Usado por: `/despesas`.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarPagamento } from "@/lib/actions/pagamentos";
import { composePagamento, isAtrasado } from "@/lib/calc";
import { brl0, dateBR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface ParcelaDTO {
  id: string;
  numeroParcela: number;
  despesaNumDoc: string | null;
  vencimento: string | null;
  valorOriginal: number;
  valorPago: number;
  status: string;
  /** Forma da parcela — pode diferir da forma do cabeçalho da despesa. */
  formaPagamento?: string | null;
  /** Nº do cheque desta parcela (item 2.5). */
  numeroCheque?: string | null;
  /** Data acordada de apresentação do cheque pré-datado. */
  dataBomPara?: string | null;
}

const statusTone = (s: string) =>
  s === "Pago" ? "success" : s === "Cancelado" ? "danger" : s === "Vencido" ? "warning" : "neutral";

export function ParcelasList({
  rows,
  bancos,
  canEditar,
}: {
  rows: ParcelaDTO[];
  bancos: { id: string; banco: string; tipo: string }[];
  canEditar: boolean;
}) {
  const [sel, setSel] = useState<ParcelaDTO | null>(null);
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Documento</TH>
            <TH>Parcela</TH>
            <TH>Vencimento</TH>
            <TH>Forma</TH>
            <TH>Cheque</TH>
            <TH className="text-right">Valor</TH>
            <TH className="text-right">Pago</TH>
            <TH>Status</TH>
            {canEditar && <TH className="text-right">Ação</TH>}
          </tr>
        </THead>
        <tbody>
          {rows.map((p) => (
            <TR key={p.id}>
              <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {p.despesaNumDoc ?? "—"}
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">#{p.numeroParcela}</TD>
              <TD className="font-[family-name:var(--font-mono)]">{dateBR(p.vencimento)}</TD>
              <TD className="whitespace-nowrap text-[var(--color-ink2)]">{p.formaPagamento ?? "—"}</TD>
              {/* Item 2.5 — o cheque é da PARCELA, não da compra. O "bom para"
                  fica no title porque é o que define quando o dinheiro sai. */}
              <TD
                className="whitespace-nowrap font-[family-name:var(--font-mono)]"
                title={p.dataBomPara ? `Bom para ${dateBR(p.dataBomPara)}` : undefined}
              >
                {p.numeroCheque ?? "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(p.valorOriginal)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                {p.valorPago > 0 ? brl0(p.valorPago) : "—"}
              </TD>
              <TD>
                <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              </TD>
              {canEditar && (
                <TD className="text-right">
                  {p.status !== "Pago" && p.status !== "Cancelado" ? (
                    <button
                      onClick={() => setSel(p)}
                      className="text-sm text-[var(--color-accent2)] hover:underline"
                    >
                      Registrar pagamento
                    </button>
                  ) : null}
                </TD>
              )}
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={canEditar ? 9 : 8} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhuma parcela nesta versão.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>

      {sel && (
        <PagamentoModal
          parcela={sel}
          bancos={bancos}
          onClose={() => setSel(null)}
        />
      )}
    </>
  );
}

function PagamentoModal({
  parcela,
  bancos,
  onClose,
}: {
  parcela: ParcelaDTO;
  bancos: { id: string; banco: string; tipo: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const restante = Math.max(0, parcela.valorOriginal - parcela.valorPago);
  const [f, setF] = useState({
    dataPagamento: "",
    valorOriginal: String(restante),
    desconto: "",
    multa: "",
    juros: "",
    outros: "",
    bankAccountId: "",
    obs: "",
  });

  const nums = {
    valorOriginal: Number(f.valorOriginal) || 0,
    desconto: Number(f.desconto) || 0,
    multa: Number(f.multa) || 0,
    juros: Number(f.juros) || 0,
    outrosAcrescimos: Number(f.outros) || 0,
  };
  const { valorTotalPago } = composePagamento(nums);
  const atrasado =
    parcela.vencimento && f.dataPagamento
      ? isAtrasado(parcela.vencimento, f.dataPagamento)
      : false;

  const confirmar = () => {
    setError(null);
    start(async () => {
      try {
        await registrarPagamento({
          parcelaId: parcela.id,
          valorOriginal: nums.valorOriginal,
          desconto: nums.desconto,
          multa: nums.multa,
          juros: nums.juros,
          outrosAcrescimos: nums.outrosAcrescimos,
          dataPagamento: f.dataPagamento,
          bankAccountId: f.bankAccountId || null,
          obs: f.obs,
        });
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao registrar pagamento.");
      }
    });
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <Card className="w-full max-w-lg" >
        <CardContent className="p-6" onClick={(e) => e.stopPropagation()}>
          <h2 className="mb-1 text-lg font-semibold text-[var(--color-ink)]">
            Registrar pagamento
          </h2>
          <p className="mb-4 text-[12px] text-[var(--color-ink3)]">
            {parcela.despesaNumDoc} · parcela #{parcela.numeroParcela} · vencimento{" "}
            {dateBR(parcela.vencimento)} · valor {brl0(parcela.valorOriginal)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data do pagamento</Label>
              <DateField value={f.dataPagamento} onChange={(v) => setF({ ...f, dataPagamento: v })} />
            </div>
            <div>
              <Label>Valor original</Label>
              <Input type="number" step="0.01" value={f.valorOriginal} onChange={(e) => setF({ ...f, valorOriginal: e.target.value })} />
            </div>
            <div>
              <Label>Desconto</Label>
              <Input type="number" step="0.01" value={f.desconto} onChange={(e) => setF({ ...f, desconto: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Multa</Label>
              <Input type="number" step="0.01" value={f.multa} onChange={(e) => setF({ ...f, multa: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Juros</Label>
              <Input type="number" step="0.01" value={f.juros} onChange={(e) => setF({ ...f, juros: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Outros acréscimos</Label>
              <Input type="number" step="0.01" value={f.outros} onChange={(e) => setF({ ...f, outros: e.target.value })} placeholder="0" />
            </div>
            <div className="col-span-2">
              <Label>Conta bancária / caixa</Label>
              <Select value={f.bankAccountId} onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}>
                <option value="">—</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.banco} · {b.tipo}
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Observação</Label>
              <Input value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} />
            </div>
          </div>

          {atrasado && (
            <p className="mt-3 text-[12px] font-medium text-[var(--color-warning)]">
              ⚠ Pagamento em atraso — informe multa/juros se aplicável.
            </p>
          )}
          <div className="mt-3 flex items-center justify-between rounded-[10px] bg-[var(--color-surface2)] px-4 py-3">
            <span className="text-[12px] text-[var(--color-ink3)]">Valor total a pagar</span>
            <span className="font-[family-name:var(--font-mono)] text-lg font-semibold text-[var(--color-ink)]">
              {brl0(valorTotalPago)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-ink3)]">
            Original − desconto + multa + juros + outros. Encargos vão para
            “Despesas Financeiras” na DRE; a saída real entra no Controle de Caixa.
          </p>

          {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button onClick={confirmar} disabled={pending || valorTotalPago <= 0}>
              {pending ? "Registrando…" : "Confirmar pagamento"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### `src/components/app/project-picker.tsx`

Usado por: `/despesas`, `/medicaolanc`.

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";

export interface ProjectOpt {
  id: string;
  label: string;
}

/**
 * Seletor de projeto para telas sem "projeto ativo" (Budget/Forecast). Grava
 * a escolha em `proj` na URL, preservando os demais parâmetros.
 */
export function ProjectPicker({
  projects,
  selected,
  allOption = false,
}: {
  projects: ProjectOpt[];
  selected: string;
  /** inclui a opção "Todos os projetos" (valor "all"). */
  allOption?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
        Projeto
      </span>
      <Select
        value={selected}
        disabled={pending}
        onChange={(e) => {
          const params = new URLSearchParams(sp.toString());
          params.set("proj", e.target.value);
          start(() => router.push(`${pathname}?${params.toString()}`));
        }}
        className="h-9 min-w-[220px]"
      >
        {allOption && <option value="all">Todos os projetos / filiais</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
```

### `src/components/app/repositorio-table.tsx`

Usado por: `/despesas`.

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RepositorioRow } from "@/lib/queries";
import { registroCasa } from "@/lib/busca";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface RepositorioItem extends RepositorioRow {
  /** URL assinada para abrir o arquivo; null sem storage configurado. */
  url: string | null;
}

/**
 * Repositório de documentos — Módulo 3.
 *
 * A listagem antiga mostrava "08/2026 · R$ 28" na coluna de despesa vinculada,
 * o que não permite conferir nada. Agora cada arquivo carrega o contexto
 * inteiro: PED, obra, fornecedor, nº da nota, competência e valor, com link
 * para o lançamento.
 *
 * A busca cobre simultaneamente nome do arquivo, nº do documento fiscal, PED e
 * fornecedor (item 3.3), reaproveitando o mesmo motor de busca inteligente das
 * telas de Despesas e Contas a Receber.
 */
export function RepositorioTable({ rows }: { rows: RepositorioItem[] }) {
  const [busca, setBusca] = useState("");
  const [obra, setObra] = useState("");
  const [tipo, setTipo] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [vinculo, setVinculo] = useState("");

  const opts = useMemo(() => {
    const uniq = (xs: (string | null | undefined)[]) =>
      [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    const porId = new Map<string, string>();
    for (const r of rows) {
      if (r.projectId && !porId.has(r.projectId)) porId.set(r.projectId, r.projectName ?? "");
    }
    return {
      obras: [...porId].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      tipos: uniq(rows.map((r) => r.tipo)),
      competencias: uniq(rows.map((r) => r.competencia)).sort().reverse(),
    };
  }, [rows]);

  const filtrados = useMemo(() => {
    return rows.filter((r) => {
      if (obra && r.projectId !== obra) return false;
      if (tipo && r.tipo !== tipo) return false;
      if (competencia && r.competencia !== competencia) return false;
      if (vinculo === "vinculado" && !r.despesaId) return false;
      if (vinculo === "sem" && r.despesaId) return false;
      if (busca.trim()) {
        // Busca simultânea em arquivo, nº da nota, PED e fornecedor (item 3.3).
        const casa = registroCasa(busca, [
          r.filename,
          r.numeroDocumentoFiscal,
          r.numDoc,
          r.fornecedorNome,
          r.projectName,
          r.tipo,
        ]);
        if (!casa) return false;
      }
      return true;
    });
  }, [rows, busca, obra, tipo, competencia, vinculo]);

  const limpar = () => {
    setBusca("");
    setObra("");
    setTipo("");
    setCompetencia("");
    setVinculo("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-1">
            <Label>Buscar</Label>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="arquivo, NF, PED ou fornecedor"
            />
          </div>
          <div>
            <Label>Obra</Label>
            <Select value={obra} onChange={(e) => setObra(e.target.value)}>
              <option value="">Todas</option>
              {opts.obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {opts.tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Competência</Label>
            <Select value={competencia} onChange={(e) => setCompetencia(e.target.value)}>
              <option value="">Todas</option>
              {opts.competencias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Vínculo</Label>
            <Select value={vinculo} onChange={(e) => setVinculo(e.target.value)}>
              <option value="">Todos</option>
              <option value="vinculado">Vinculado a despesa</option>
              <option value="sem">Sem vínculo</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <Badge tone="neutral">{filtrados.length} arquivo(s)</Badge>
        <span className="text-[var(--color-ink3)]">
          {rows.filter((r) => !r.despesaId).length} sem vínculo
        </span>
        <button
          onClick={limpar}
          className="ml-auto text-[12px] text-[var(--color-accent2)] hover:underline"
        >
          Limpar filtros
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table wrapperClassName="max-h-[70vh] scroll-x-always" className="min-w-[1250px]">
            <THead className="sticky top-0 z-10">
              <tr>
                <TH>Arquivo</TH>
                <TH>Tipo</TH>
                <TH>Nº doc. fiscal</TH>
                <TH>PED</TH>
                <TH>Projeto / Obra</TH>
                <TH>Fornecedor</TH>
                <TH>Competência</TH>
                <TH className="text-right">Valor</TH>
                <TH>Enviado por</TH>
                <TH>Upload</TH>
                <TH></TH>
              </tr>
            </THead>
            <tbody>
              {filtrados.map((r) => (
                <TR key={r.id}>
                  <TD className="max-w-[260px] truncate font-medium text-[var(--color-ink)]">
                    {r.filename}
                  </TD>
                  <TD className="whitespace-nowrap text-[var(--color-ink2)]">{r.tipo ?? "—"}</TD>
                  <TD className="whitespace-nowrap font-[family-name:var(--font-mono)]">
                    {r.numeroDocumentoFiscal ?? "—"}
                  </TD>
                  <TD className="whitespace-nowrap font-[family-name:var(--font-mono)]">
                    {r.despesaId && r.numDoc ? (
                      <Link
                        href={`/despesas?proj=${r.projectId}&tab=lancamentos&edit=${r.despesaId}`}
                        className="text-[var(--color-accent2)] hover:underline"
                      >
                        {r.numDoc}
                      </Link>
                    ) : (
                      <span className="text-[var(--color-ink4)]">sem vínculo</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">{r.projectName ?? "—"}</TD>
                  <TD className="max-w-[180px] truncate text-[var(--color-ink3)]">
                    {r.fornecedorNome ?? "—"}
                  </TD>
                  <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {r.competencia ?? "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {r.valor == null ? "—" : brl0(r.valor)}
                  </TD>
                  <TD className="max-w-[160px] truncate text-[var(--color-ink3)]">
                    {r.uploadedBy ?? "—"}
                  </TD>
                  <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString("pt-BR") : "—"}
                  </TD>
                  <TD className="text-right">
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener"
                        className="text-sm text-[var(--color-accent2)] hover:underline"
                      >
                        Abrir
                      </a>
                    ) : null}
                  </TD>
                </TR>
              ))}
              {filtrados.length === 0 && (
                <TR>
                  <TD colSpan={11} className="py-8 text-center text-[var(--color-ink4)]">
                    Nenhum documento com os filtros aplicados.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

### `src/components/app/restituicao-lote.tsx`

Usado por: `/restituicoes`.

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  compensarSaldos,
  confirmarRestituicaoLote,
  previewRestituicaoLote,
} from "@/lib/actions/restituicao-lote";
import type { SaldoConsolidadoTerceiro } from "@/lib/actions/recebimento-terceiro";
import { podeCompensar, valorCompensavel } from "@/lib/calc/recebimento-terceiro";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";

interface Opt {
  id: string;
  nome: string;
}

function novaChave(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

type Preview = Awaited<ReturnType<typeof previewRestituicaoLote>>;

/**
 * Restituição em LOTE por terceiro — item 4.1.
 *
 * O cliente fecha o combo e paga um valor único; a tela distribui esse valor
 * entre os PEDs em aberto daquele terceiro, do mais antigo para o mais novo
 * (FIFO por competência), deixando o último parcialmente abatido.
 *
 * O preview é obrigatório: nada é gravado antes de o usuário ver exatamente
 * quais PEDs serão abatidos e em que valor.
 */
export function RestituicaoLote({
  terceiros,
  bancos,
  saldos,
  canEditar,
}: {
  terceiros: Opt[];
  bancos: Opt[];
  saldos: SaldoConsolidadoTerceiro[];
  canEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const chave = useRef(novaChave());

  const [f, setF] = useState({
    terceiroId: "",
    valor: "",
    dataRestituicao: "",
    bankAccountId: "",
    comprovante: "",
    obs: "",
  });
  const [preview, setPreview] = useState<Preview | null>(null);

  const carregarPreview = () => {
    if (!f.terceiroId || !(Number(f.valor) > 0)) {
      setErro("Escolha o terceiro e informe o valor da restituição.");
      return;
    }
    setErro(null);
    setMsg(null);
    start(async () => {
      const p = await previewRestituicaoLote(f.terceiroId, Number(f.valor));
      setPreview(p);
      if (p.linhas.length === 0) {
        setErro("Este terceiro não tem saldo em aberto para abater.");
      }
    });
  };

  const confirmar = () => {
    if (pending || !preview) return;
    setErro(null);
    start(async () => {
      const res = await confirmarRestituicaoLote({
        terceiroId: f.terceiroId,
        valor: Number(f.valor),
        dataRestituicao: f.dataRestituicao,
        bankAccountId: f.bankAccountId || null,
        comprovante: f.comprovante || null,
        obs: f.obs || null,
        idempotencyKey: chave.current,
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao registrar a restituição.");
        return;
      }
      chave.current = novaChave();
      setMsg(
        `Restituição ${res.numDoc ?? ""} registrada — ${res.abatidos} PED(s) abatido(s). Uma única saída de caixa.`,
      );
      setPreview(null);
      setF({ ...f, valor: "", comprovante: "", obs: "" });
      router.refresh();
    });
  };

  const compensar = (s: SaldoConsolidadoTerceiro) => {
    if (!s.terceiroId) return;
    const v = valorCompensavel(s);
    if (
      !window.confirm(
        `Compensar ${brl0(v)} entre o que a empresa deve a ${s.terceiro} (${brl0(
          s.saldoARestituir,
        )}) e o que ele deve à empresa (${brl0(s.saldoARepassar)})?\n\n` +
          "A compensação não movimenta caixa nem altera a DRE.",
      )
    )
      return;
    setErro(null);
    start(async () => {
      const res = await compensarSaldos({
        terceiroId: s.terceiroId!,
        data: new Date().toISOString().slice(0, 10),
        obs: "Encontro de contas",
        idempotencyKey: novaChave(),
      });
      if (!res.ok) {
        setErro(res.error ?? "Falha ao compensar.");
        return;
      }
      setMsg(`Compensação ${res.numDoc ?? ""} registrada: ${brl0(res.valor ?? 0)}.`);
      router.refresh();
    });
  };

  const compensaveis = saldos.filter(podeCompensar);

  if (!canEditar) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
            Restituição em lote
          </h2>
          <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
            Pague um valor único e o sistema distribui entre os PEDs em aberto do
            terceiro, do mais antigo para o mais novo. O último PED da fila pode
            ficar parcialmente abatido. A restituição ganha documento próprio — é
            ele que vai para a contabilidade como comprovação da saída de caixa.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Label>Terceiro</Label>
              <Select
                value={f.terceiroId}
                onChange={(e) => {
                  setF({ ...f, terceiroId: e.target.value });
                  setPreview(null);
                }}
              >
                <option value="">Selecione...</option>
                {terceiros.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Valor da restituição</Label>
              <Input
                type="number"
                step="0.01"
                value={f.valor}
                onChange={(e) => {
                  setF({ ...f, valor: e.target.value });
                  setPreview(null);
                }}
              />
            </div>
            <div>
              <Label>Data do pagamento</Label>
              <DateField
                value={f.dataRestituicao}
                onChange={(v) => setF({ ...f, dataRestituicao: v })}
              />
            </div>
            <div>
              <Label>Banco / conta</Label>
              <Select
                value={f.bankAccountId}
                onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}
              >
                <option value="">—</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Comprovante / obs.</Label>
              <Input
                value={f.comprovante}
                onChange={(e) => setF({ ...f, comprovante: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" onClick={carregarPreview} disabled={pending}>
              {pending && !preview ? "Calculando…" : "Ver o que será abatido"}
            </Button>
            {preview && preview.linhas.length > 0 && (
              <Button onClick={confirmar} disabled={pending || !f.dataRestituicao}>
                {pending ? "Registrando…" : "Confirmar restituição"}
              </Button>
            )}
          </div>
          {erro && <p className="mt-3 text-sm text-[var(--color-danger)]">{erro}</p>}
          {msg && <p className="mt-3 text-sm text-[var(--color-success)]">{msg}</p>}
        </CardContent>
      </Card>

      {/* Extrato + aging + preview do abatimento. */}
      {preview && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
              <span className="text-[var(--color-ink3)]">
                Saldo em aberto{" "}
                <strong className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">
                  {brl0(preview.saldo)}
                </strong>
              </span>
              {preview.aging && (
                <>
                  <Badge tone="neutral">0–30: {brl0(preview.aging.ate30)}</Badge>
                  <Badge tone="neutral">31–60: {brl0(preview.aging.de31a60)}</Badge>
                  <Badge tone="warning">61–90: {brl0(preview.aging.de61a90)}</Badge>
                  <Badge tone="danger">90+: {brl0(preview.aging.acima90)}</Badge>
                </>
              )}
            </div>
            <p className="mb-2 text-[12.5px] text-[var(--color-ink2)]">
              Confira antes de confirmar — estes são os PEDs que serão abatidos e
              em que valor:
            </p>
            <div className="tbl-scroll overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-accent2)]/12 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    <th className="px-2 py-2">PED</th>
                    <th className="px-2 py-2">Obra</th>
                    <th className="px-2 py-2">Competência</th>
                    <th className="px-2 py-2 text-right">A abater</th>
                    <th className="px-2 py-2 text-right">Sobra no PED</th>
                    <th className="px-2 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.linhas.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--color-accent2)]/8">
                      <td className="px-2 py-2 font-[family-name:var(--font-mono)]">
                        {l.numDoc ?? "—"}
                      </td>
                      <td className="px-2 py-2">{l.projectName ?? "—"}</td>
                      <td className="px-2 py-2 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {l.competencia ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)]">
                        {brl0(l.valorAbatido)}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {l.saldoRestante > 0 ? brl0(l.saldoRestante) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone={l.quitado ? "success" : "warning"}>
                          {l.quitado ? "Quitado" : "Parcial"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12.5px] text-[var(--color-ink3)]">
              Total a abater{" "}
              <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
                {brl0(preview.totalAbatido)}
              </strong>
              {preview.sobra > 0 && (
                <span className="text-[var(--color-danger)]">
                  {" "}
                  · sobra sem destino {brl0(preview.sobra)} — reduza o valor
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* RG-05 — encontro de contas, quando existem os DOIS saldos. */}
      {compensaveis.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
              Encontro de contas
            </h3>
            <p className="mb-3 text-[11.5px] text-[var(--color-ink3)]">
              Estes terceiros têm saldo nos dois lados. A compensação não
              movimenta caixa nem altera a DRE — os saldos brutos continuam
              visíveis acima.
            </p>
            <div className="space-y-2">
              {compensaveis.map((s) => (
                <div
                  key={s.terceiroId ?? s.terceiro}
                  className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[var(--color-accent2)]/15 p-2.5 text-[13px]"
                >
                  <strong className="text-[var(--color-ink)]">{s.terceiro}</strong>
                  <span className="text-[var(--color-ink3)]">
                    a restituir{" "}
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">
                      {brl0(s.saldoARestituir)}
                    </span>
                  </span>
                  <span className="text-[var(--color-ink3)]">
                    a repassar{" "}
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                      {brl0(s.saldoARepassar)}
                    </span>
                  </span>
                  <span className="text-[var(--color-ink3)]">
                    compensável{" "}
                    <strong className="font-[family-name:var(--font-mono)] text-[var(--color-accent2)]">
                      {brl0(valorCompensavel(s))}
                    </strong>
                  </span>
                  <button
                    onClick={() => compensar(s)}
                    disabled={pending}
                    className="ml-auto text-[12px] text-[var(--color-accent2)] hover:underline"
                  >
                    Compensar saldos
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### `src/components/app/restituicoes-manager.tsx`

Usado por: `/restituicoes`.

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  buscarDespesasPorPed,
  criarDespesaTerceiro,
  registrarRestituicao,
  type DespesaPorPed,
  type DespesaTerceiroView,
} from "@/lib/actions/restituicoes";
import { rotuloStatusObrigacao } from "@/lib/calc/restituicao";
import { categoriasDeDespesa } from "@/lib/calc/natureza-dre";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MonthField, DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

interface Opt {
  id: string;
  nome: string;
}
interface ContaOpt {
  code: string;
  name: string;
}

const statusTone = (s: string) =>
  s === "Restituído"
    ? "success"
    : s === "Cancelado"
      ? "danger"
      : s === "Parcialmente restituído"
        ? "info"
        : "warning";

/**
 * Chave de idempotência de uma tentativa (§16): identifica o FATO que o usuário
 * está registrando. Enquanto a chave não for renovada, reenviar o formulário
 * (duplo clique, Enter repetido, refresh que reposta) devolve o registro já
 * criado em vez de criar um segundo.
 */
function novaChave(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function RestituicoesManager({
  rows,
  stakeholders,
  contas,
  projetos,
  bancos,
  categorias,
  canCriar,
  canEditar,
}: {
  rows: (DespesaTerceiroView & { diasEmAberto: number })[];
  stakeholders: Opt[];
  contas: ContaOpt[];
  projetos: Opt[];
  bancos: { id: string; banco: string; tipo: string }[];
  categorias: readonly string[];
  canCriar: boolean;
  canEditar: boolean;
}) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sel, setSel] = useState<DespesaTerceiroView | null>(null);
  const [filtro, setFiltro] = useState("");
  /** Lançamento já existente escolhido pelo PED (§9). null = despesa nova. */
  const [ped, setPed] = useState<DespesaPorPed | null>(null);
  // Uma chave por tentativa. Só é renovada depois de um registro bem-sucedido —
  // assim o reenvio do MESMO preenchimento nunca vira dois registros.
  const chave = useRef(novaChave());
  const categoriasDespesa = useMemo(() => categoriasDeDespesa(categorias), [categorias]);

  const submit = (fd: FormData) => {
    if (saving) return; // trava de duplo clique antes mesmo de chamar o servidor
    setError(null);
    setAviso(null);
    fd.set("idempotencyKey", chave.current);
    if (ped) fd.set("despesaId", ped.id);
    start(async () => {
      const res = await criarDespesaTerceiro(fd);
      if (!res.ok) {
        setError(res.error ?? "Falha ao registrar.");
        return;
      }
      chave.current = novaChave();
      if (res.jaExistia) {
        setAviso(
          "Este lançamento já tinha uma obrigação de restituição — ela está na lista abaixo. Nada foi duplicado.",
        );
      }
      setPed(null);
      router.refresh();
    });
  };

  const filtrados = filtro ? rows.filter((r) => r.status === filtro) : rows;

  return (
    <div className="space-y-6">
      {canCriar && (
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
              Nova despesa paga por terceiro
            </h2>
            <p className="mb-3 text-[11.5px] text-[var(--color-ink3)]">
              Se a despesa já foi lançada, localize-a pelo número PED — a
              obrigação é amarrada ao lançamento existente e nada dele é
              sobrescrito. Sem PED, a despesa é criada junto com a obrigação.
            </p>

            <BuscaPed selecionado={ped} onSelecionar={setPed} />

            <form action={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label>Quem desembolsou (terceiro)</Label>
                <Select name="pagadorTerceiroId" defaultValue="">
                  <option value="">—</option>
                  {stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Beneficiário original</Label>
                <Select
                  name="fornecedorId"
                  // Vindo de um PED, o beneficiário é o do lançamento original e
                  // não pode ser trocado por aqui: quem desembolsou (o terceiro)
                  // é um relacionamento diferente, no campo ao lado.
                  key={ped?.id ?? "novo"}
                  defaultValue={ped?.fornecedorId ?? ""}
                  disabled={!!ped}
                >
                  <option value="">—</option>
                  {stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Empresa responsável</Label>
                <Select name="empresaResponsavelId" defaultValue="">
                  <option value="">—</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Categoria DRE</Label>
                {/* Item 4.6 — mesmo bug do formulário de despesa: a lista
                    completa oferecia "Receita" para um lançamento de despesa.
                    Só naturezas devedoras, e sem default silencioso. */}
                <Select
                  name="categoriaDre"
                  key={`cat-${ped?.id ?? "novo"}`}
                  defaultValue={ped?.categoriaDre ?? ""}
                  disabled={!!ped}
                >
                  <option value="">Selecione...</option>
                  {categoriasDespesa.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Conta CEF (opcional)</Label>
                <Select
                  name="contaCef"
                  key={`cef-${ped?.id ?? "novo"}`}
                  defaultValue={ped?.contaCef ?? ""}
                  disabled={!!ped}
                >
                  <option value="">—</option>
                  {contas.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Valor</Label>
                {/* Vindo de um PED, o valor é o do lançamento original e não é
                    editável aqui — alterá-lo mudaria a despesa já registrada. */}
                <Input
                  name="valor"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  key={`val-${ped?.id ?? "novo"}`}
                  defaultValue={ped ? String(ped.valor) : ""}
                  readOnly={!!ped}
                  required={!ped}
                />
              </div>
              <div>
                <Label>Competência</Label>
                {/* A competência é a do lançamento original e NÃO muda com a
                    data da restituição — são fatos distintos (§8). */}
                <MonthField
                  name="competencia"
                  key={`comp-${ped?.id ?? "novo"}`}
                  defaultValue={ped?.competencia ?? ""}
                  disabled={!!ped}
                />
              </div>
              <div>
                <Label>Data do pagamento (terceiro)</Label>
                <DateField name="dataPagamentoOriginal" />
              </div>
              <div>
                <Label>Restituição prevista para</Label>
                <DateField name="dataPrevistaRestituicao" />
              </div>
              <div className="sm:col-span-3">
                <Label>Observações</Label>
                <Input name="obs" />
              </div>
              <div className="col-span-2 flex items-end sm:col-span-4">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? "Registrando…"
                    : ped
                      ? "Registrar obrigação para este PED"
                      : "Registrar despesa por terceiro"}
                </Button>
              </div>
            </form>
            <p className="mt-2 text-[11.5px] text-[var(--color-ink3)]">
              A despesa entra na DRE 1× (competência/categoria); NÃO há saída de
              caixa agora. A saída ocorre só quando você registrar a restituição
              — e a data dela não altera a competência da despesa.
            </p>
            {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
            {aviso && <p className="mt-2 text-sm text-[var(--color-warning)]">{aviso}</p>}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Label className="mb-0">Filtrar status:</Label>
        {/* O `value` é o status GRAVADO; o texto é o rótulo da tela. */}
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 w-auto">
          <option value="">Todos</option>
          <option value="Aguardando restituição">Pendente</option>
          <option value="Parcialmente restituído">Parcialmente restituído</option>
          <option value="Restituído">Restituído</option>
          <option value="Cancelado">Cancelado</option>
        </Select>
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Documento</TH>
            <TH>Terceiro</TH>
            <TH className="text-right">Valor</TH>
            <TH className="text-right">Restituído</TH>
            <TH className="text-right">Saldo</TH>
            <TH>Prevista</TH>
            <TH className="text-right">Dias</TH>
            <TH>Status</TH>
            {canEditar && <TH className="text-right">Ação</TH>}
          </tr>
        </THead>
        <tbody>
          {filtrados.map((r) => (
            <TR key={r.id}>
              <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{r.numDoc ?? "—"}</TD>
              <TD>{r.pagador ?? "—"}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(r.valorTotal)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">{brl0(r.valorRestituido)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-warning)]">{brl0(r.saldoPendente)}</TD>
              <TD className="font-[family-name:var(--font-mono)]">{dateBR(r.dataPrevistaRestituicao)}</TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.saldoPendente > 0 ? r.diasEmAberto : "—"}
              </TD>
              {/* Rótulo "Pendente" para o status gravado "Aguardando
                  restituição": só o texto na tela muda; nenhum registro é
                  reclassificado no banco (§12). */}
              <TD><Badge tone={statusTone(r.status)}>{rotuloStatusObrigacao(r.status)}</Badge></TD>
              {canEditar && (
                <TD className="text-right">
                  {r.saldoPendente > 0 && r.status !== "Cancelado" ? (
                    <button onClick={() => setSel(r)} className="text-sm text-[var(--color-accent2)] hover:underline">
                      Registrar restituição
                    </button>
                  ) : null}
                </TD>
              )}
            </TR>
          ))}
          {filtrados.length === 0 && (
            <TR>
              <TD colSpan={canEditar ? 9 : 8} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhuma despesa paga por terceiro.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>

      {sel && <RestituicaoModal dt={sel} bancos={bancos} onClose={() => setSel(null)} />}
    </div>
  );
}

/**
 * Localiza um lançamento já existente pelo número PED (§9).
 *
 * O que o usuário digita é o PED, mas o que amarra a obrigação é o **ID interno**
 * do lançamento — o número é só o rótulo humano. PED inexistente não seleciona
 * nada; lançamento cancelado, com valor zero ou que já tem obrigação ativa é
 * mostrado com o motivo e não pode ser escolhido para duplicar.
 */
function BuscaPed({
  selecionado,
  onSelecionar,
}: {
  selecionado: DespesaPorPed | null;
  onSelecionar: (d: DespesaPorPed | null) => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<DespesaPorPed[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);

  useEffect(() => {
    const q = termo.trim();
    if (selecionado || q.length < 2) {
      setResultados([]);
      setBuscou(false);
      return;
    }
    let vivo = true;
    setBuscando(true);
    // Debounce: evita disparar uma consulta por tecla digitada.
    const t = setTimeout(async () => {
      const r = await buscarDespesasPorPed(q);
      if (!vivo) return;
      setResultados(r);
      setBuscou(true);
      setBuscando(false);
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
      setBuscando(false);
    };
  }, [termo, selecionado]);

  if (selecionado) {
    return (
      <div className="mb-3 rounded-[8px] border border-[var(--color-accent2)]/30 bg-[var(--color-surface2)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[13px]">
            <p className="font-medium text-[var(--color-ink)]">
              <span className="font-[family-name:var(--font-mono)]">
                {selecionado.numDoc ?? "sem número"}
              </span>{" "}
              · {brl0(selecionado.valor)}
            </p>
            <p className="text-[12px] text-[var(--color-ink3)]">
              {selecionado.projectName}
              {selecionado.fornecedorNome ? ` · ${selecionado.fornecedorNome}` : ""}
              {selecionado.competencia ? ` · competência ${selecionado.competencia}` : ""}
            </p>
            <p className="mt-1 text-[11.5px] text-[var(--color-ink4)]">
              Valor, competência, vencimento, categoria e número PED deste
              lançamento não serão alterados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelecionar(null);
              setTermo("");
            }}
            className="shrink-0 text-[12px] text-[var(--color-accent2)] hover:underline"
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <Label>Vincular a um lançamento existente (nº PED) — opcional</Label>
      <Input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Digite o número do PED (ex.: 000070 ou PED-000070)"
      />
      {buscando && (
        <p className="mt-1 text-[11.5px] text-[var(--color-ink4)]">Procurando…</p>
      )}
      {buscou && resultados.length === 0 && (
        <p className="mt-1 text-[11.5px] text-[var(--color-danger)]">
          Nenhum lançamento com esse número. Confira o PED ou deixe em branco
          para criar uma despesa nova.
        </p>
      )}
      {resultados.length > 0 && (
        <ul className="mt-1 max-h-56 overflow-auto rounded-[8px] border border-[var(--color-accent2)]/15">
          {resultados.map((d) => {
            const impedimento = d.cancelado
              ? "lançamento cancelado"
              : d.valor <= 0
                ? "valor zero"
                : d.obrigacaoId
                  ? "já possui obrigação de restituição"
                  : null;
            return (
              <li key={d.id} className="border-b border-[var(--color-accent2)]/8 last:border-0">
                <button
                  type="button"
                  disabled={!!impedimento}
                  onClick={() => onSelecionar(d)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] ${
                    impedimento
                      ? "cursor-not-allowed opacity-55"
                      : "hover:bg-[var(--color-surface2)]"
                  }`}
                >
                  <span>
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
                      {d.numDoc ?? "sem número"}
                    </span>{" "}
                    <span className="text-[var(--color-ink3)]">
                      · {d.projectName}
                      {d.fornecedorNome ? ` · ${d.fornecedorNome}` : ""}
                    </span>
                    {impedimento && (
                      <span className="block text-[11px] text-[var(--color-warning)]">
                        {impedimento}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-[family-name:var(--font-mono)]">
                    {brl0(d.valor)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RestituicaoModal({
  dt,
  bancos,
  onClose,
}: {
  dt: DespesaTerceiroView;
  bancos: { id: string; banco: string; tipo: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    valor: String(dt.saldoPendente),
    dataRestituicao: "",
    bankAccountId: "",
    comprovante: "",
    obs: "",
  });

  // Uma chave por abertura do modal: confirmar duas vezes (duplo clique, Enter
  // repetido) registra UMA restituição — a segunda chamada devolve a primeira.
  const chave = useRef(novaChave());

  const confirmar = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await registrarRestituicao({
        despesaTerceiroId: dt.id,
        valor: Number(f.valor) || 0,
        dataRestituicao: f.dataRestituicao,
        bankAccountId: f.bankAccountId || null,
        comprovante: f.comprovante,
        obs: f.obs,
        idempotencyKey: chave.current,
      });
      if (!res.ok) {
        setError(res.error ?? "Falha ao registrar restituição.");
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6" onClick={(e) => e.stopPropagation()}>
          <h2 className="mb-1 text-lg font-semibold text-[var(--color-ink)]">Registrar restituição</h2>
          <p className="mb-4 text-[12px] text-[var(--color-ink3)]">
            {dt.pagador} · saldo pendente {brl0(dt.saldoPendente)}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor a restituir</Label>
              <Input type="number" step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
            </div>
            <div>
              <Label>Data</Label>
              <DateField value={f.dataRestituicao} onChange={(v) => setF({ ...f, dataRestituicao: v })} />
            </div>
            <div className="col-span-2">
              <Label>Conta bancária</Label>
              <Select value={f.bankAccountId} onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}>
                <option value="">—</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>{b.banco} · {b.tipo}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Comprovante / observação</Label>
              <Input value={f.comprovante} onChange={(e) => setF({ ...f, comprovante: e.target.value })} />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-[var(--color-ink3)]">
            Gera a saída de caixa na data informada e liquida a obrigação. Não
            cria nova despesa na DRE.
          </p>
          {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button onClick={confirmar} disabled={pending || (Number(f.valor) || 0) <= 0}>
              {pending ? "Registrando…" : "Confirmar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### `src/components/app/sortable-th.tsx`

Usado por: `/contaspagar`.

```tsx
"use client";

import { useMemo, useState } from "react";
import { TH } from "@/components/ui/table";
import {
  ordenarTabela,
  proximoEstado,
  setaOrdenacao,
  type ColunaOrdenavel,
  type EstadoOrdenacao,
} from "@/lib/tabela-ordenacao";

/**
 * Cabeçalho de coluna clicável (ordenação estilo planilha) — §5.
 *
 * COMPARTILHADO APENAS entre **Contas a Pagar** e **Contas a Receber**. A tela
 * de Despesas/Lançamentos mantém a ordenação por momento de lançamento e não
 * usa este componente.
 */
export function SortTH({
  coluna,
  estado,
  onSort,
  className,
  children,
}: {
  coluna: string;
  estado: EstadoOrdenacao | null;
  onSort: (coluna: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const seta = setaOrdenacao(estado, coluna);
  const ativo = seta !== "";
  return (
    <TH className={className}>
      <button
        type="button"
        onClick={() => onSort(coluna)}
        // aria-sort no <th> seria o ideal, mas o indicador textual já é lido:
        // o title explica o próximo clique para quem usa mouse.
        title={
          !ativo
            ? "Ordenar (crescente)"
            : seta === "▲"
              ? "Ordenar (decrescente)"
              : "Remover ordenação"
        }
        className={`group inline-flex w-full items-center gap-1 uppercase tracking-wide transition-colors ${
          className?.includes("text-right") ? "justify-end" : "justify-start"
        } ${ativo ? "text-[var(--color-accent2)]" : "hover:text-[var(--color-ink)]"}`}
      >
        <span>{children}</span>
        <span
          aria-hidden
          className={`text-[9px] leading-none ${
            ativo ? "opacity-100" : "opacity-0 group-hover:opacity-40"
          }`}
        >
          {seta || "▲"}
        </span>
      </button>
    </TH>
  );
}

/**
 * Estado + aplicação da ordenação para uma tabela.
 *
 * `rowsPadrao` já vem filtrada e na ordem padrão da tela; enquanto não houver
 * clique de cabeçalho, ela é devolvida intacta. Trocar filtros NÃO limpa a
 * ordenação escolhida — ela é reaplicada ao novo conjunto filtrado inteiro
 * (inclusive fora da página visível), conforme §5.
 */
export function useOrdenacaoTabela<T>(
  rowsPadrao: readonly T[],
  colunas: readonly ColunaOrdenavel<T>[],
  id: (row: T) => string,
) {
  const [estado, setEstado] = useState<EstadoOrdenacao | null>(null);
  const onSort = (coluna: string) => setEstado((e) => proximoEstado(e, coluna));
  const rows = useMemo(
    () => ordenarTabela(rowsPadrao, colunas, estado, id),
    // `id` é uma função pura do chamador (identidade irrelevante para o
    // resultado); as demais dependências são as que de fato mudam a ordem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowsPadrao, colunas, estado],
  );
  return { rows, estado, onSort };
}
```

---

## 3. Funções de `src/lib/queries.ts`

| Função | Linhas | Chamada por |
|---|---|---|
| `getAtualVersion` | 924–942 | `/despesas`, `/medicaolanc` |
| `getBankAccounts` | 219–227 | `/acerto`, `/despesas`, `/restituicoes` |
| `getChartAccounts` | 229–236 | `/acerto`, `/despesas`, `/medicaolanc`, `/restituicoes` |
| `getContasPagar` | 348–392 | `/contaspagar` |
| `getDespesaNoTenant` | 246–277 | `/despesas` |
| `getDespesas` | 238–244 | `/despesas` |
| `getDespesasByTenant` | 287–318 | `/despesas` |
| `getDocsFiscaisPorDespesa` | 2213–2244 | `/despesas` |
| `getDocuments` | 1034–1040 | `/despesas` |
| `getDocumentsByDespesa` | 1042–1057 | `/despesas` |
| `getMedicoes` | 1092–1098 | `/medicaolanc` |
| `getParcelasByVersion` | 999–1019 | `/despesas` |
| `getRepositorio` | 2265–2319 | `/despesas` |
| `getSocios` | 202–217 | `/despesas` |
| `getStakeholders` | 192–200 | `/acerto`, `/despesas`, `/restituicoes` |

### `src/lib/queries.ts` · linhas 924–942

`getAtualVersion` — chamada por: `/despesas`, `/medicaolanc`.

```ts
/**
 * Versão "Atual" (detalhada) de um projeto, no escopo do tenant. Como não há
 * mais "versão ativa", os lançamentos de despesas/receitas sempre gravam aqui.
 */
export async function getAtualVersion(tenantId: string, projectId: string) {
  const [v] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.tenantId, tenantId),
        eq(schema.versions.projectId, projectId),
        eq(schema.versions.kind, "atual"),
      ),
    )
    .orderBy(asc(schema.versions.createdAt))
    .limit(1);
  return v ?? null;
}
```

### `src/lib/queries.ts` · linhas 219–227

`getBankAccounts` — chamada por: `/acerto`, `/despesas`, `/restituicoes`.

```ts
export async function getBankAccounts(
  tenantId: string,
): Promise<BankAccountRow[]> {
  return db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, tenantId))
    .orderBy(asc(schema.bankAccounts.banco));
}
```

### `src/lib/queries.ts` · linhas 229–236

`getChartAccounts` — chamada por: `/acerto`, `/despesas`, `/medicaolanc`, `/restituicoes`.

```ts
export async function getChartAccounts(
  tenantId: string,
): Promise<ChartAccountRow[]> {
  return db
    .select()
    .from(schema.chartAccounts)
    .where(eq(schema.chartAccounts.tenantId, tenantId));
}
```

### `src/lib/queries.ts` · linhas 348–392

`getContasPagar` — chamada por: `/contaspagar`.

```ts
/**
 * Contas a pagar do tenant: todas as despesas lançadas, com fornecedor,
 * projeto (obra) e cliente da obra. Base do módulo Contas a Pagar e do
 * painel esquerdo do Fechamento de Caixa.
 */
export async function getContasPagar(tenantId: string): Promise<ContaPagarRow[]> {
  const rows = await db
    .select({
      d: schema.despesas,
      fornecedorNome: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      clienteId: schema.projects.clienteId,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .leftJoin(schema.clientes, eq(schema.projects.clienteId, schema.clientes.id))
    .where(
      and(
        eq(schema.despesas.tenantId, tenantId),
        eq(schema.despesas.cancelado, false),
      ),
    );
  return rows.map((r) => ({
    id: r.d.id,
    numDoc: r.d.numDoc,
    fornecedorNome: r.fornecedorNome,
    descricao: r.d.obs ?? r.d.numDoc,
    categoriaDre: r.d.categoriaDre,
    contaCef: r.d.contaCef,
    valor: Number(r.d.valor),
    vencimento: r.d.vencimento,
    competencia: r.d.competencia,
    dataPagamento: r.d.dataCaixa,
    formaPagamento: r.d.formaPagamento,
    status: r.d.status,
    projectId: r.projectId,
    projectName: r.projectName,
    clienteId: r.clienteId,
    clienteNome: r.clienteNome,
  }));
}
```

### `src/lib/queries.ts` · linhas 246–277

`getDespesaNoTenant` — chamada por: `/despesas`.

```ts
/**
 * Uma despesa pelo id, no escopo do TENANT (independente da versão), junto do
 * projeto a que pertence.
 *
 * Por que existe: a lista de Despesas/Lançamentos é escopada à versão "atual"
 * do projeto, enquanto Contas a Pagar é escopada ao tenant (sem filtro de kind).
 * Uma despesa gravada numa versão que não é a atual aparecia em Contas a Pagar
 * mas sumia da tela de Despesas — e o deep link "?edit=" caía silenciosamente
 * num formulário em branco, deixando o registro sem como ser editado ou
 * cancelado. Esta consulta é o fallback do deep link: o registro passa a ser
 * SEMPRE alcançável. Nada é escondido de nenhuma tela.
 */
export async function getDespesaNoTenant(
  tenantId: string,
  despesaId: string,
): Promise<(DespesaRow & { projectId: string; versionKind: string }) | undefined> {
  const [row] = await db
    .select({
      d: schema.despesas,
      projectId: schema.versions.projectId,
      versionKind: schema.versions.kind,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .where(
      and(eq(schema.despesas.id, despesaId), eq(schema.despesas.tenantId, tenantId)),
    )
    .limit(1);
  return row
    ? { ...row.d, projectId: row.projectId, versionKind: row.versionKind }
    : undefined;
}
```

### `src/lib/queries.ts` · linhas 238–244

`getDespesas` — chamada por: `/despesas`.

```ts
export async function getDespesas(versionId: string): Promise<DespesaRow[]> {
  return db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesas.competencia));
}
```

### `src/lib/queries.ts` · linhas 287–318

`getDespesasByTenant` — chamada por: `/despesas`.

```ts
/**
 * Todas as despesas do tenant (todos os projetos/filiais), na versão Atual de
 * cada projeto, com o rótulo de origem — base da consulta consolidada.
 */
export async function getDespesasByTenant(
  tenantId: string,
): Promise<DespesaComOrigem[]> {
  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      projectKind: schema.projects.kind,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.despesas.tenantId, tenantId),
        eq(schema.versions.kind, "atual"),
      ),
    )
    .orderBy(asc(schema.despesas.competencia));
  return rows.map((r) => ({
    ...r.d,
    projectId: r.projectId,
    projectName: r.projectName,
    projectKind: r.projectKind,
    origem: r.projectKind === "office" ? `Filial/Matriz · ${r.projectName}` : r.projectName,
  }));
}
```

### `src/lib/queries.ts` · linhas 2213–2244

`getDocsFiscaisPorDespesa` — chamada por: `/despesas`.

```ts
/**
 * Documentos fiscais das despesas informadas, agrupados por despesa (item 1.2).
 *
 * Uma consulta só para toda a listagem — buscar por linha faria N+1 numa tela
 * que exibe centenas de lançamentos. Devolve mapa vazio para lista vazia.
 */
export async function getDocsFiscaisPorDespesa(
  tenantId: string,
  despesaIds: string[],
): Promise<Map<string, { tipo: string; numero: string | null }[]>> {
  const out = new Map<string, { tipo: string; numero: string | null }[]>();
  if (despesaIds.length === 0) return out;
  const rows = await db
    .select({
      despesaId: schema.documentosFiscais.despesaId,
      tipo: schema.documentosFiscais.tipo,
      numero: schema.documentosFiscais.numero,
    })
    .from(schema.documentosFiscais)
    .where(
      and(
        eq(schema.documentosFiscais.tenantId, tenantId),
        inArray(schema.documentosFiscais.despesaId, despesaIds),
      ),
    );
  for (const r of rows) {
    const lista = out.get(r.despesaId);
    if (lista) lista.push({ tipo: r.tipo, numero: r.numero });
    else out.set(r.despesaId, [{ tipo: r.tipo, numero: r.numero }]);
  }
  return out;
}
```

### `src/lib/queries.ts` · linhas 1034–1040

`getDocuments` — chamada por: `/despesas`.

```ts
export async function getDocuments(tenantId: string): Promise<DocumentRow[]> {
  return db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.tenantId, tenantId))
    .orderBy(desc(schema.documents.uploadedAt));
}
```

### `src/lib/queries.ts` · linhas 1042–1057

`getDocumentsByDespesa` — chamada por: `/despesas`.

```ts
/** Documentos anexados a uma despesa específica (mais recentes primeiro). */
export async function getDocumentsByDespesa(
  tenantId: string,
  despesaId: string,
): Promise<DocumentRow[]> {
  return db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.tenantId, tenantId),
        eq(schema.documents.despesaId, despesaId),
      ),
    )
    .orderBy(desc(schema.documents.uploadedAt));
}
```

### `src/lib/queries.ts` · linhas 1092–1098

`getMedicoes` — chamada por: `/medicaolanc`.

```ts
export async function getMedicoes(versionId: string): Promise<MedicaoRow[]> {
  return db
    .select()
    .from(schema.medicoes)
    .where(eq(schema.medicoes.versionId, versionId))
    .orderBy(asc(schema.medicoes.competencia), asc(schema.medicoes.grupoCode));
}
```

### `src/lib/queries.ts` · linhas 999–1019

`getParcelasByVersion` — chamada por: `/despesas`.

```ts
/** Parcelas de contas a pagar de uma versão (join com despesa). Fase 2. */
export async function getParcelasByVersion(
  versionId: string,
): Promise<(ParcelaRow & { despesaNumDoc: string | null; contaCef: string | null; categoriaDre: string | null })[]> {
  const rows = await db
    .select({
      p: schema.despesaParcelas,
      numDoc: schema.despesas.numDoc,
      contaCef: schema.despesas.contaCef,
      categoriaDre: schema.despesas.categoriaDre,
    })
    .from(schema.despesaParcelas)
    .innerJoin(schema.despesas, eq(schema.despesaParcelas.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId));
  return rows.map((r) => ({
    ...r.p,
    despesaNumDoc: r.numDoc,
    contaCef: r.contaCef,
    categoriaDre: r.categoriaDre,
  }));
}
```

### `src/lib/queries.ts` · linhas 2265–2319

`getRepositorio` — chamada por: `/despesas`.

```ts
/**
 * Repositório de documentos com o CONTEXTO do lançamento — Módulo 3.
 *
 * A listagem antiga mostrava só "08/2026 · R$ 28" na coluna de despesa
 * vinculada, o que não permite conferir nada. Aqui cada arquivo vem com PED,
 * obra, fornecedor, nº da nota, competência e valor, numa consulta só (a tela
 * exibe centenas de linhas; buscar por linha faria N+1).
 *
 * Arquivos sem vínculo com despesa continuam aparecendo, com os campos de
 * contexto nulos — some-los esconderia documento que alguém subiu.
 */
export async function getRepositorio(tenantId: string): Promise<RepositorioRow[]> {
  const rows = await db
    .select({
      doc: schema.documents,
      numDoc: schema.despesas.numDoc,
      competencia: schema.despesas.competencia,
      valor: schema.despesas.valor,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      fornecedorNome: schema.stakeholders.nome,
      numeroFiscal: schema.documentosFiscais.numero,
    })
    .from(schema.documents)
    .leftJoin(schema.despesas, eq(schema.documents.despesaId, schema.despesas.id))
    .leftJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .leftJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .leftJoin(
      schema.documentosFiscais,
      eq(schema.documentosFiscais.despesaId, schema.despesas.id),
    )
    .where(eq(schema.documents.tenantId, tenantId))
    .orderBy(desc(schema.documents.uploadedAt));

  return rows.map((r) => ({
    id: r.doc.id,
    filename: r.doc.filename,
    tipo: r.doc.tipo,
    storageKey: r.doc.storageKey,
    size: r.doc.size,
    uploadedBy: r.doc.uploadedBy,
    uploadedAt: r.doc.uploadedAt ? r.doc.uploadedAt.toISOString() : null,
    // O número digitado no upload tem precedência; sem ele, herda o documento
    // fiscal da despesa vinculada (item 3.2).
    numeroDocumentoFiscal: r.doc.numeroDocumentoFiscal ?? r.numeroFiscal ?? null,
    despesaId: r.doc.despesaId,
    numDoc: r.numDoc,
    projectId: r.projectId,
    projectName: r.projectName,
    fornecedorNome: r.fornecedorNome,
    competencia: r.competencia,
    valor: r.valor == null ? null : Number(r.valor),
  }));
}
```

### `src/lib/queries.ts` · linhas 202–217

`getSocios` — chamada por: `/despesas`.

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

### `src/lib/queries.ts` · linhas 192–200

`getStakeholders` — chamada por: `/acerto`, `/despesas`, `/restituicoes`.

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

## 4. Server Actions

Os oito arquivos vão inteiros. A coluna “disparadas por esta tela” lista
apenas as funções que as cinco telas do bloco importam; cada arquivo pode
conter outras, usadas por telas de fora do bloco.

| Arquivo | Disparadas pelas telas do bloco |
|---|---|
| `src/lib/actions/acerto.ts` | `concluirAcerto`, `estornarAcerto`, `getAcertos`, `getDespesasAbativeis`, `ratearEntreObras` |
| `src/lib/actions/despesas.ts` | `addDespesa`, `addDespesaDocs`, `cancelarDespesa`, `deleteDespesa`, `deleteDespesaDoc`, `extractDespesaFromDoc`, `pagarDespesa`, `updateDespesa`, `uploadDespesaDoc` |
| `src/lib/actions/documento-fiscal.ts` | `buscarDocumentoDuplicado`, `getDocumentosFiscais`, `salvarDocumentoFiscal` |
| `src/lib/actions/medicao.ts` | `addMedicao`, `deleteMedicao`, `updateMedicao` |
| `src/lib/actions/pagamentos.ts` | `registrarPagamento` |
| `src/lib/actions/recebimento-terceiro.ts` | `getSaldosConsolidadosTerceiros` |
| `src/lib/actions/restituicao-lote.ts` | `compensarSaldos`, `confirmarRestituicaoLote`, `previewRestituicaoLote` |
| `src/lib/actions/restituicoes.ts` | `buscarDespesasPorPed`, `criarDespesaTerceiro`, `getContaCorrenteTerceiros`, `getDespesaTerceiros`, `getObrigacoesTerceiroPendentes`, `registrarRestituicao` |

### `src/lib/actions/acerto.ts`

Importado por: `/acerto`.

```ts
"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import {
  abaterFifo,
  abaterManual,
  acertoFecha,
  calcularDiferenca,
  calcularRateio,
  validarRateio,
  type LinhaRateio,
} from "@/lib/calc/acerto";
import { CONTAS_CONTROLADORIA } from "@/lib/calc/constants";
import type { CategoriaDRE } from "@/lib/calc/constants";
import { getAtualVersion } from "@/lib/queries";

/**
 * ACERTO CONTÁBIL — Módulo 5.
 *
 * Resolve os dois casos que o sistema não suportava:
 *   (a) um pagamento único quitando várias despesas, de várias obras;
 *   (b) a diferença entre o somatório das despesas e o valor transferido.
 *
 * Invariantes (RG-07 e RG-08):
 *   - a saída de caixa é UMA, no valor efetivamente transferido;
 *   - soma dos abatimentos + diferença financeira == valor transferido;
 *   - a diferença vai para despesa/receita FINANCEIRA do período, jamais
 *     rateada no custo das obras.
 */

export interface DespesaAbativel {
  id: string;
  numDoc: string | null;
  projectId: string;
  projectName: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: number;
  /** quanto ainda falta pagar (valor − já abatido por outros acertos). */
  saldo: number;
  status: string | null;
}

/**
 * Despesas em aberto que podem ser vinculadas a um acerto.
 *
 * Traz de TODAS as obras do tenant de propósito (item 5.1): o pagamento único
 * que motiva este módulo cruza obras. Já descontado o que outros acertos
 * abateram, para o mesmo PED não ser pago duas vezes.
 */
export async function getDespesasAbativeis(
  favorecidoId?: string | null,
): Promise<DespesaAbativel[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return [];

  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(
      and(
        eq(schema.despesas.tenantId, ctx.tenant.id),
        eq(schema.despesas.cancelado, false),
        ne(schema.despesas.status, "Pago"),
      ),
    );

  const ids = rows.map((r) => r.d.id);
  const abatidos = new Map<string, number>();
  if (ids.length > 0) {
    const itens = await db
      .select({
        despesaId: schema.acertoItens.despesaId,
        valor: schema.acertoItens.valorAbatido,
        estornado: schema.acertos.estornado,
      })
      .from(schema.acertoItens)
      .innerJoin(schema.acertos, eq(schema.acertoItens.acertoId, schema.acertos.id))
      .where(inArray(schema.acertoItens.despesaId, ids));
    for (const i of itens) {
      // Acerto estornado não conta: as despesas dele foram reabertas.
      if (i.estornado) continue;
      abatidos.set(i.despesaId, (abatidos.get(i.despesaId) ?? 0) + Number(i.valor));
    }
  }

  return rows
    .filter((r) => !favorecidoId || r.d.fornecedorId === favorecidoId)
    .map((r) => {
      const saldo =
        Math.round((Number(r.d.valor) - (abatidos.get(r.d.id) ?? 0)) * 100) / 100;
      return {
        id: r.d.id,
        numDoc: r.d.numDoc,
        projectId: r.projectId,
        projectName: r.projectName,
        fornecedorId: r.d.fornecedorId,
        fornecedorNome: r.fornecedorNome,
        competencia: r.d.competencia,
        vencimento: r.d.vencimento,
        valor: Number(r.d.valor),
        saldo,
        status: r.d.status,
      };
    })
    .filter((r) => r.saldo > 0.004);
}

export interface AcertoInput {
  dataPagamento: string;
  bankAccountId?: string | null;
  valorTransferido: number;
  formaPagamento?: string | null;
  favorecidoId?: string | null;
  obs?: string | null;
  /** despesas a abater: `{id, valor}` com valor editável (abatimento parcial). */
  itens: { despesaId: string; valor: number }[];
  /** categoria da diferença; sem ela, usa o default financeiro (RG-07). */
  categoriaDiferenca?: string | null;
  idempotencyKey?: string | null;
}

export interface AcertoResult {
  ok: boolean;
  error?: string;
  acertoId?: string;
  numDoc?: string;
  jaExistia?: boolean;
}

/**
 * Conclui um acerto contábil (itens 5.1, 5.2 e 5.4).
 *
 * Tudo numa transação: ou o acerto inteiro existe, ou nada dele existe. Um
 * acerto meio aplicado deixaria despesas quitadas sem a saída de caixa
 * correspondente.
 */
export async function concluirAcerto(input: AcertoInput): Promise<AcertoResult> {
  const ctx = await getActiveContext();
  // Item 6 dos RNF: acerto é operação de nível financeiro.
  if (!ctx || !can(ctx.perms, "despesas", "editar") || !can(ctx.perms, "caixa", "criar")) {
    return { ok: false, error: "Sem permissão para concluir acertos contábeis." };
  }
  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
      .from(schema.acertos)
      .where(
        and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
      )
      .limit(1);
    if (existente)
      return {
        ok: true,
        acertoId: existente.id,
        numDoc: existente.numDoc ?? undefined,
        jaExistia: true,
      };
  }

  const valorTransferido = Math.abs(input.valorTransferido);
  if (!(valorTransferido > 0)) {
    return { ok: false, error: "Informe o valor transferido." };
  }
  if (input.itens.length === 0) {
    return { ok: false, error: "Vincule ao menos uma despesa ao acerto." };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const ids = input.itens.map((i) => i.despesaId);
      const despesas = await tx
        .select()
        .from(schema.despesas)
        .where(
          and(eq(schema.despesas.tenantId, ctx.tenant.id), inArray(schema.despesas.id, ids)),
        );
      if (despesas.length !== ids.length) {
        throw new Error("Alguma despesa vinculada não foi encontrada.");
      }
      const porId = new Map(despesas.map((d) => [d.id, d]));

      // O valor abatido nunca excede o valor da despesa.
      const abatimentos = abaterManual(
        input.itens.map((i) => ({ id: i.despesaId, valor: i.valor })),
        despesas.map((d) => ({
          id: d.id,
          competencia: d.competencia,
          numDoc: d.numDoc,
          saldo: Number(d.valor),
        })),
      );
      const totalVinculado = abatimentos.totalAbatido;
      const diferenca = calcularDiferenca(valorTransferido, totalVinculado);
      if (!acertoFecha(valorTransferido, totalVinculado, diferenca)) {
        throw new Error(
          "O acerto não fecha: a soma dos abatimentos mais a diferença precisa ser igual ao valor transferido.",
        );
      }

      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [acerto] = await tx
        .insert(schema.acertos)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          dataPagamento: input.dataPagamento || null,
          bankAccountId: input.bankAccountId || null,
          valorTransferido: String(valorTransferido),
          formaPagamento: input.formaPagamento || null,
          favorecidoId: input.favorecidoId || null,
          diferencaValor: String(diferenca.valor),
          diferencaTipo: diferenca.tipo,
          obs: input.obs || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      // Cada despesa vinculada vira "Pago", guardando o status anterior para
      // que o estorno saiba ao que voltar (item 5.4).
      for (const a of abatimentos.abatimentos) {
        const d = porId.get(a.id)!;
        await tx.insert(schema.acertoItens).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          despesaId: a.id,
          valorAbatido: String(a.valorAbatido),
          statusAnterior: d.status,
        });
        if (a.quitado) {
          await tx
            .update(schema.despesas)
            .set({ status: "Pago", dataCaixa: input.dataPagamento || null })
            .where(eq(schema.despesas.id, a.id));
        } else {
          await tx
            .update(schema.despesas)
            .set({ status: "Parcialmente paga" })
            .where(eq(schema.despesas.id, a.id));
        }
      }

      // RG-07 — a diferença é despesa/receita FINANCEIRA do período, na
      // competência da DATA DO PAGAMENTO, e não é rateada no custo de obra
      // nenhuma. Vira uma despesa própria, com PED próprio, para aparecer na
      // DRE na linha certa.
      let diferencaDespesaId: string | null = null;
      if (diferenca.tipo !== "NENHUMA") {
        const projetoDaDiferenca = porId.get(abatimentos.abatimentos[0].id)!;
        const [versaoDif] = await tx
          .select({ id: schema.versions.id })
          .from(schema.versions)
          .where(eq(schema.versions.id, projetoDaDiferenca.versionId))
          .limit(1);
        const compet = (input.dataPagamento || "").split("/");
        const competencia =
          compet.length === 3 ? `${compet[0]}/${compet[2]}` : projetoDaDiferenca.competencia;
        const numDif = await reserveDespesaNumber(ctx.tenant.id);
        const [despDif] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versaoDif.id,
            tenantId: ctx.tenant.id,
            numDoc: numDif,
            fornecedorId: input.favorecidoId || null,
            contaCef:
              diferenca.tipo === "JUROS"
                ? CONTAS_CONTROLADORIA.jurosMora
                : CONTAS_CONTROLADORIA.descontosObtidos,
            // Sempre "Despesas Financeiras": mesmo o desconto obtido entra como
            // valor NEGATIVO nesta categoria, para não abrir uma categoria de
            // receita num lançamento de despesa (RG-01).
            categoriaDre: (input.categoriaDiferenca as CategoriaDRE) ?? "Despesas Financeiras",
            competencia,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor:
              diferenca.tipo === "JUROS"
                ? String(diferenca.valor)
                : String(-diferenca.valor),
            status: "Pago",
            obs:
              diferenca.tipo === "JUROS"
                ? `Juros e multas — acerto ${numDoc}`
                : `Desconto obtido — acerto ${numDoc}`,
          })
          .returning();
        diferencaDespesaId = despDif.id;
      }

      // RG-08 — UMA saída de caixa, no valor efetivamente transferido.
      const [cash] = await tx
        .insert(schema.cashEntries)
        .values({
          versionId: porId.get(abatimentos.abatimentos[0].id)!.versionId,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataPagamento || null,
          descricao: `Acerto ${numDoc}`,
          valor: String(-valorTransferido),
          cat: "acerto",
          rec: true,
        })
        .returning();

      await tx
        .update(schema.acertos)
        .set({ diferencaDespesaId, cashEntryId: cash.id })
        .where(eq(schema.acertos.id, acerto.id));

      return { acertoId: acerto.id, numDoc, diferenca, totalVinculado };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "acerto.create",
      entity: "acerto",
      entityId: out.acertoId,
      meta: {
        numDoc: out.numDoc,
        valorTransferido,
        totalVinculado: out.totalVinculado,
        diferenca: out.diferenca,
        despesas: input.itens.length,
      },
    });
    revalidatePath("/acerto");
    revalidatePath("/contaspagar");
    revalidatePath("/caixa");
    revalidatePath("/fluxocaixa");
    revalidatePath("/dre");
    return { ok: true, acertoId: out.acertoId, numDoc: out.numDoc };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao concluir o acerto.";
    if (idem && /duplicate key|acerto_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
        .from(schema.acertos)
        .where(
          and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
        )
        .limit(1);
      if (existente)
        return {
          ok: true,
          acertoId: existente.id,
          numDoc: existente.numDoc ?? undefined,
          jaExistia: true,
        };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Estorna um acerto (item 5.4).
 *
 * Reabre TODAS as despesas vinculadas ao status que tinham antes, reverte a
 * saída de caixa e cancela a despesa de diferença financeira. O acerto não é
 * apagado — fica marcado como estornado, preservando a trilha (RG-09).
 */
export async function estornarAcerto(acertoId: string, motivo: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) {
    throw new Error("Sem permissão para estornar acertos.");
  }
  const [acerto] = await db
    .select()
    .from(schema.acertos)
    .where(and(eq(schema.acertos.id, acertoId), eq(schema.acertos.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!acerto) throw new Error("Acerto não encontrado.");
  if (acerto.estornado) throw new Error("Este acerto já foi estornado.");

  await db.transaction(async (tx) => {
    const itens = await tx
      .select()
      .from(schema.acertoItens)
      .where(eq(schema.acertoItens.acertoId, acertoId));

    // Cada despesa volta ao status ANTERIOR ao acerto — não a um status
    // arbitrário. Por isso `statusAnterior` é gravado na conclusão.
    for (const i of itens) {
      await tx
        .update(schema.despesas)
        .set({ status: i.statusAnterior ?? "A pagar", dataCaixa: null })
        .where(eq(schema.despesas.id, i.despesaId));
    }

    // A diferença financeira é cancelada logicamente, não apagada (RG-09).
    if (acerto.diferencaDespesaId) {
      await tx
        .update(schema.despesas)
        .set({
          cancelado: true,
          canceladoPor: ctx.userEmail || ctx.userId || null,
          motivoCancelamento: `Estorno do acerto ${acerto.numDoc ?? ""}: ${motivo}`.trim(),
        })
        .where(eq(schema.despesas.id, acerto.diferencaDespesaId));
    }

    // Estorno da saída de caixa: entrada compensatória, preservando o
    // lançamento original.
    if (acerto.cashEntryId) {
      const [orig] = await tx
        .select()
        .from(schema.cashEntries)
        .where(eq(schema.cashEntries.id, acerto.cashEntryId))
        .limit(1);
      if (orig) {
        await tx.insert(schema.cashEntries).values({
          versionId: orig.versionId,
          tenantId: ctx.tenant.id,
          bankAccountId: orig.bankAccountId,
          data: orig.data,
          descricao: `Estorno do acerto ${acerto.numDoc ?? ""}`.trim(),
          valor: String(Math.abs(Number(orig.valor))),
          cat: "ajuste",
          rec: true,
        });
      }
    }

    await tx
      .update(schema.acertos)
      .set({
        estornado: true,
        estornadoEm: new Date().toISOString().slice(0, 10),
        estornadoPor: ctx.userEmail || ctx.userId || null,
        obs: `${acerto.obs ?? ""}\nEstornado: ${motivo}`.trim(),
      })
      .where(eq(schema.acertos.id, acertoId));
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "acerto.estorno",
    entity: "acerto",
    entityId: acertoId,
    meta: { numDoc: acerto.numDoc, motivo },
  });
  revalidatePath("/acerto");
  revalidatePath("/contaspagar");
  revalidatePath("/caixa");
  revalidatePath("/dre");
}

export interface RateioInput {
  prestadorId: string | null;
  valorTotal: number;
  dataPagamento: string;
  bankAccountId?: string | null;
  competencia?: string | null;
  categoriaDre?: string | null;
  contaCef?: string | null;
  baseRateio?: string | null;
  descricao?: string | null;
  linhas: LinhaRateio[];
  idempotencyKey?: string | null;
}

/**
 * Rateio de mão de obra entre obras — item 5.3.
 *
 * "Um PIX, várias obras, um comprovante": gera **um PED por obra** (custo
 * correto por centro de custo) e **uma única saída de caixa**. A memória de
 * cálculo fica gravada e é o documento que sustenta o custo por obra perante a
 * contabilidade e eventual fiscalização.
 */
export async function ratearEntreObras(
  input: RateioInput,
): Promise<AcertoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar") || !can(ctx.perms, "caixa", "criar")) {
    return { ok: false, error: "Sem permissão para ratear pagamentos entre obras." };
  }
  const valorTotal = Math.abs(input.valorTotal);
  const rateio = calcularRateio(valorTotal, input.linhas);
  // CA-27 — rateio que não fecha é BLOQUEADO: ele determina o custo por centro
  // de custo, e um erro aqui contamina o resultado de cada obra.
  const erro = validarRateio(valorTotal, rateio);
  if (erro) return { ok: false, error: erro };

  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
      .from(schema.acertos)
      .where(
        and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
      )
      .limit(1);
    if (existente)
      return {
        ok: true,
        acertoId: existente.id,
        numDoc: existente.numDoc ?? undefined,
        jaExistia: true,
      };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [acerto] = await tx
        .insert(schema.acertos)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          dataPagamento: input.dataPagamento || null,
          bankAccountId: input.bankAccountId || null,
          valorTransferido: String(valorTotal),
          favorecidoId: input.prestadorId || null,
          diferencaValor: "0",
          diferencaTipo: "NENHUMA",
          obs: input.descricao || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      let versaoPrimeira: string | null = null;
      for (const linha of rateio) {
        const versao = await getAtualVersion(ctx.tenant.id, linha.projectId);
        if (!versao) {
          throw new Error(
            "Uma das obras do rateio não tem versão Atual — crie-a antes de ratear.",
          );
        }
        versaoPrimeira ??= versao.id;
        const numObra = await reserveDespesaNumber(ctx.tenant.id);
        const [desp] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versao.id,
            tenantId: ctx.tenant.id,
            numDoc: numObra,
            fornecedorId: input.prestadorId || null,
            contaCef: input.contaCef || null,
            categoriaDre: (input.categoriaDre as CategoriaDRE) ?? "Custo Variável",
            competencia: input.competencia || null,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor: String(linha.valor),
            status: "Pago",
            obs: `${input.descricao ?? "Rateio de mão de obra"} — acerto ${numDoc}`,
            // A saída de caixa é do ACERTO, uma só. Marcar aqui evitaria que a
            // despesa gerasse uma segunda saída no fluxo.
            pagoPorTerceiro: false,
          })
          .returning();

        await tx.insert(schema.rateiosObra).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          projectId: linha.projectId,
          despesaId: desp.id,
          valor: String(linha.valor),
          percentual: String(linha.percentual),
          baseRateio: input.baseRateio || null,
          memoriaCalculo: {
            valorTotalPago: valorTotal,
            criterio: input.baseRateio ?? "percentual informado",
            percentual: linha.percentual,
            valorDaObra: linha.valor,
            acerto: numDoc,
            calculadoEm: input.dataPagamento,
          },
        });

        await tx.insert(schema.acertoItens).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          despesaId: desp.id,
          valorAbatido: String(linha.valor),
          statusAnterior: "A pagar",
        });
      }

      // RG-08 — uma saída de caixa só, no valor total pago.
      const [cash] = await tx
        .insert(schema.cashEntries)
        .values({
          versionId: versaoPrimeira!,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataPagamento || null,
          descricao: `Rateio entre obras — acerto ${numDoc}`,
          valor: String(-valorTotal),
          cat: "acerto",
          rec: true,
        })
        .returning();
      await tx
        .update(schema.acertos)
        .set({ cashEntryId: cash.id })
        .where(eq(schema.acertos.id, acerto.id));

      return { acertoId: acerto.id, numDoc };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "acerto.rateio",
      entity: "acerto",
      entityId: out.acertoId,
      meta: { numDoc: out.numDoc, valorTotal, obras: rateio.length, rateio },
    });
    revalidatePath("/acerto");
    revalidatePath("/despesas");
    revalidatePath("/caixa");
    revalidatePath("/dre");
    return { ok: true, acertoId: out.acertoId, numDoc: out.numDoc };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao ratear o pagamento.",
    };
  }
}

export interface AcertoResumo {
  id: string;
  numDoc: string | null;
  dataPagamento: string | null;
  favorecido: string | null;
  valorTransferido: number;
  totalVinculado: number;
  diferencaValor: number;
  diferencaTipo: string;
  qtdDespesas: number;
  obras: string[];
  estornado: boolean;
}

/**
 * Relatório "Acertos do período" (item 5.5) — o pacote entregue à contabilidade.
 */
export async function getAcertos(tenantId: string): Promise<AcertoResumo[]> {
  const acertos = await db
    .select({
      a: schema.acertos,
      favorecido: schema.stakeholders.nome,
    })
    .from(schema.acertos)
    .leftJoin(schema.stakeholders, eq(schema.acertos.favorecidoId, schema.stakeholders.id))
    .where(eq(schema.acertos.tenantId, tenantId));
  if (acertos.length === 0) return [];

  const itens = await db
    .select({
      acertoId: schema.acertoItens.acertoId,
      valor: schema.acertoItens.valorAbatido,
      projectName: schema.projects.name,
    })
    .from(schema.acertoItens)
    .innerJoin(schema.despesas, eq(schema.acertoItens.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(eq(schema.acertoItens.tenantId, tenantId));

  const porAcerto = new Map<string, { total: number; qtd: number; obras: Set<string> }>();
  for (const i of itens) {
    let e = porAcerto.get(i.acertoId);
    if (!e) {
      e = { total: 0, qtd: 0, obras: new Set() };
      porAcerto.set(i.acertoId, e);
    }
    e.total += Number(i.valor);
    e.qtd += 1;
    e.obras.add(i.projectName);
  }

  return acertos
    .map(({ a, favorecido }) => {
      const agg = porAcerto.get(a.id);
      return {
        id: a.id,
        numDoc: a.numDoc,
        dataPagamento: a.dataPagamento,
        favorecido,
        valorTransferido: Number(a.valorTransferido),
        totalVinculado: Math.round((agg?.total ?? 0) * 100) / 100,
        diferencaValor: Number(a.diferencaValor),
        diferencaTipo: a.diferencaTipo,
        qtdDespesas: agg?.qtd ?? 0,
        obras: [...(agg?.obras ?? [])].sort(),
        estornado: a.estornado,
      };
    })
    .sort((x, y) => (y.dataPagamento ?? "").localeCompare(x.dataPagamento ?? ""));
}

/** Preview do abatimento FIFO, para a tela mostrar antes de confirmar. */
export async function previewAbatimentoFifo(
  valor: number,
  favorecidoId?: string | null,
) {
  const despesas = await getDespesasAbativeis(favorecidoId);
  return {
    despesas,
    resultado: abaterFifo(
      valor,
      despesas.map((d) => ({
        id: d.id,
        competencia: d.competencia,
        numDoc: d.numDoc,
        saldo: d.saldo,
      })),
    ),
  };
}
```

### `src/lib/actions/despesas.ts`

Importado por: `/despesas`.

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { logAudit } from "@/lib/audit";
import { diffAudit } from "@/lib/audit-diff";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { FORMAS_PAGAMENTO, gerarParcelas } from "@/lib/calc";
import { categoriasDeDespesa, validarCategoriaDespesa } from "@/lib/calc/natureza-dre";
import {
  TIPOS_DOCUMENTO,
  normalizarChaveAcesso,
  validarDocumentoFiscal,
} from "@/lib/calc/documento-fiscal";
import { CATEGORIAS_DRE, type CategoriaDRE } from "@/lib/calc/constants";
import { getChartAccounts, getStakeholders, getAtualVersion } from "@/lib/queries";
import {
  AI_ACCEPTED_MIME,
  AI_MAX_DOCS,
  extractDespesaFromDocument,
  isAiConfigured,
} from "@/lib/ai/despesa-extract";
import {
  montarPreenchimentoDespesa,
  type PreenchimentoDespesa,
} from "@/lib/ai/despesa-doc";
import {
  extractFornecedorFromDocument,
  type ExtractedFornecedor,
} from "@/lib/ai/fornecedor-extract";

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

export async function addBankAccount(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) return;
  await db.insert(schema.bankAccounts).values({
    tenantId: ctx.tenant.id,
    banco: (formData.get("banco") as string) || "Banco",
    ag: (formData.get("ag") as string) || null,
    op: (formData.get("op") as string) || null,
    cc: (formData.get("cc") as string) || null,
    tipo:
      (formData.get("tipo") as "Imobiliária" | "Construtora") || "Construtora",
  });
  revalidatePath("/fornecedores");
}

/**
 * Parcelas enviadas pelo formulário (preview editável), já normalizadas.
 *
 * Base do modo bottom-up do item 1.4: quando o usuário monta parcelas de
 * valores livres e deixa o total vazio, o total do PED é a soma delas. Lê de
 * forma tolerante — JSON inválido devolve lista vazia e o fluxo cai na trava de
 * valor obrigatório, em vez de gravar lançamento sem valor.
 */
interface ParcelaRecebida {
  vencimento: string | null;
  valor: number;
  forma: string | null;
  bancoContaId: string | null;
  numeroCheque: string | null;
  emitenteCheque: string | null;
  dataEmissaoCheque: string | null;
  dataBomPara: string | null;
  status: string;
}

function lerParcelasManuais(formData: FormData): ParcelaRecebida[] {
  const raw = formData.get("parcelasJson");
  if (typeof raw !== "string" || !raw.trim()) return [];
  const txt = (v: unknown) =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  try {
    const arr = JSON.parse(raw) as Record<string, unknown>[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p) => ({
        vencimento: txt(p.vencimento),
        valor: Number(p.valor) || 0,
        forma: txt(p.forma),
        bancoContaId: txt(p.bancoContaId),
        numeroCheque: txt(p.numeroCheque),
        emitenteCheque: txt(p.emitenteCheque),
        dataEmissaoCheque: txt(p.dataEmissaoCheque),
        dataBomPara: txt(p.dataBomPara),
        // Status desconhecido cai em "Pendente": é o lado seguro — marcar uma
        // parcela como paga por engano esconderia uma conta em aberto.
        status: txt(p.status) ?? "Pendente",
      }))
      .filter((p) => p.valor > 0);
  } catch {
    return [];
  }
}

export async function addDespesa(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar")) return;
  // Sem "projeto ativo": a despesa é associada ao projeto escolhido no
  // formulário e gravada na versão Atual daquele projeto.
  const projectId = (formData.get("projectId") as string) || ctx.project.id;
  const version = await getAtualVersion(ctx.tenant.id, projectId);
  if (!version) throw new Error("Projeto sem versão Atual.");
  if (version.locked) throw new Error("Versão congelada — lançamentos bloqueados.");

  // Item 1.3 / RG-01 — uma despesa não pode ser classificada em conta de
  // natureza credora. Validar só no formulário não protege nada: esta Server
  // Action é chamável diretamente.
  const erroCategoria = validarCategoriaDespesa(formData.get("categoriaDre") as string);
  if (erroCategoria) throw new Error(erroCategoria);

  // Trava contra lançamentos de valor ZERO. Antes, um valor vazio virava "0" e,
  // com a opção "recorrente" ligada, era replicado em até 60 cópias — cada uma
  // consumindo um número de pedido (PED) sequencial e poluindo os relatórios com
  // lançamentos fantasma. Um lançamento sem valor não tem justificativa de
  // negócio e passa a ser recusado na origem.
  //
  // Exceção do item 1.4 (modo bottom-up): com parcelas de valores livres o
  // total do PED é a SOMA delas, e o campo de valor chega vazio de propósito.
  const parcelasManuais = lerParcelasManuais(formData);
  const somaParcelas = parcelasManuais.reduce((a, p) => a + p.valor, 0);
  const valorInformado = Number((formData.get("valor") as string) || "0");
  const valorNum =
    somaParcelas > 0 && (!Number.isFinite(valorInformado) || valorInformado === 0)
      ? somaParcelas
      : valorInformado;
  if (!Number.isFinite(valorNum) || valorNum === 0) {
    throw new Error(
      "Informe um valor maior que zero — ou gere as parcelas, que o total é somado a partir delas.",
    );
  }

  // RG-06 — o PED é numeração interna: sempre reservado aqui, no servidor,
  // dentro da transação. Nunca vem do formulário, nem para owner/admin. O
  // número da nota tem campo próprio (bloco Documento Fiscal).
  const numDoc = await reserveDespesaNumber(ctx.tenant.id);
  const s = (k: string) => (formData.get(k) as string) || null;
  // Despesa paga por sócio (Seção 3): a despesa é reconhecida normalmente na DRE
  // e no projeto, mas NÃO gera saída de caixa da empresa. A obrigação com o
  // sócio é registrada em despesa_terceiro; o caixa só se move no reembolso
  // (restituição). Se não houver reembolso, a obrigação já nasce quitada.
  const pagoPorSocioId = s("pagoPorSocioId");
  const socioReembolsavel = !!formData.get("socioReembolsavel");
  const socioDataPagamento = s("socioDataPagamento");
  const core = {
    versionId: version.id,
    tenantId: ctx.tenant.id,
    fornecedorId: s("fornecedorId"),
    bancoId: s("bancoId"),
    contaCef: s("contaCef"),
    categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
    competencia: s("competencia"),
    vencimento: pagoPorSocioId ? socioDataPagamento : s("vencimento"),
    // Modo bottom-up: quando o total chega vazio e há parcelas, `valorNum` já é
    // a soma delas. O PED carrega SEMPRE o custo total da compra; o
    // fracionamento vive nas parcelas (item 2.3).
    valor: String(valorNum),
    // Descrição/observação da compra — campo PRÓPRIO, separado do nº do pedido
    // (numDoc). O objeto da compra não deve ser guardado no número do pedido.
    obs: s("obs"),
    status: pagoPorSocioId ? "Pago" : s("status") || "A pagar",
    // Não gera saída de caixa da empresa no momento do cadastro.
    pagoPorTerceiro: !!pagoPorSocioId,
    // Fase 2 — forma/condição de pagamento
    formaPagamento: s("formaPagamento"),
    formaPagamentoDesc: s("formaPagamentoDesc"),
    condicaoPagamento: s("condicaoPagamento"),
    qtdParcelas: formData.get("qtdParcelas") ? Number(formData.get("qtdParcelas")) : null,
    dataEmissao: s("dataEmissao"),
    boletoLinhaDigitavel: s("boletoLinhaDigitavel"),
    boletoCodigoBarras: s("boletoCodigoBarras"),
    boletoBanco: s("boletoBanco"),
    chequeNumero: s("chequeNumero"),
    chequeBanco: s("chequeBanco"),
    chequeAg: s("chequeAg"),
    chequeConta: s("chequeConta"),
    chequeEmitente: s("chequeEmitente"),
    chequeDataEmissao: s("chequeDataEmissao"),
    chequeDataCompensacao: s("chequeDataCompensacao"),
    chequeStatus: s("chequeStatus"),
  };
  const [row] = await db
    .insert(schema.despesas)
    .values({ ...core, numDoc })
    .returning();

  // Parcelas (Fase 2): usa o preview enviado pelo formulário (editável) ou
  // gera pela condição. Sem forma/condição → sem parcelas (comporta como antes).
  const valorTotal = Number(row.valor);
  const condicao = row.condicaoPagamento;
  let parcelas: ParcelaRecebida[] = [];
  // Despesa paga por sócio já está quitada pelo sócio — não gera parcelas/contas
  // a pagar da empresa.
  if (pagoPorSocioId) {
    parcelas = [];
  } else if (parcelasManuais.length > 0) {
    // Vindas do painel auxiliar: cada linha traz forma, cheque, banco e status
    // próprios (itens 2.1 e 2.5).
    parcelas = parcelasManuais;
  } else if (condicao) {
    parcelas = gerarParcelas({
      valorTotal,
      condicao,
      dataBase: row.vencimento || row.dataEmissao || row.competencia || "",
      qtd: row.qtdParcelas ?? undefined,
    }).map((p) => ({
      vencimento: p.vencimento,
      valor: p.valor,
      forma: null,
      bancoContaId: null,
      numeroCheque: null,
      emitenteCheque: null,
      dataEmissaoCheque: null,
      dataBomPara: null,
      status: "Pendente",
    }));
  }
  if (parcelas.length > 0) {
    await db.insert(schema.despesaParcelas).values(
      parcelas.map((p, i) => ({
        tenantId: ctx.tenant.id,
        despesaId: row.id,
        numeroParcela: i + 1,
        vencimento: p.vencimento,
        valorOriginal: String(p.valor),
        // A forma da parcela tem precedência sobre a do cabeçalho: numa mesma
        // compra pode haver cheque em umas e PIX em outras.
        formaPagamento: p.forma ?? row.formaPagamento,
        // Item 2.2 — o banco do cabeçalho é herdado quando a parcela não
        // informa outro.
        bankAccountId: p.bancoContaId ?? row.bancoId,
        numeroCheque: p.numeroCheque,
        emitenteCheque: p.emitenteCheque,
        dataEmissaoCheque: p.dataEmissaoCheque,
        dataBomPara: p.dataBomPara,
        status: p.status,
      })),
    );
  }

  // Documento fiscal (item 1.2 / RG-06): campo PRÓPRIO, separado do PED. A
  // linha só nasce quando há algo a registrar — despesa sem nota simplesmente
  // não tem documento fiscal, e isso é um estado válido: a nota chega depois.
  const docTipo = ((formData.get("docTipo") as string) || "SEM_DOC").trim();
  const docNumero = ((formData.get("docNumero") as string) || "").trim();
  const docSerie = ((formData.get("docSerie") as string) || "").trim();
  const docChave = (formData.get("docChaveAcesso") as string) || "";
  const docEmissao = ((formData.get("docDataEmissao") as string) || "").trim();
  if (docTipo !== "SEM_DOC" || docNumero) {
    const erroDoc = validarDocumentoFiscal({
      tipo: docTipo,
      numero: docNumero,
      chaveAcesso: docChave,
    });
    if (erroDoc) throw new Error(erroDoc);
    await db.insert(schema.documentosFiscais).values({
      tenantId: ctx.tenant.id,
      despesaId: row.id,
      tipo: docTipo,
      numero: docNumero || null,
      serie: docSerie || null,
      chaveAcesso: normalizarChaveAcesso(docChave),
      // Sem data de emissão informada, vale a competência — é o que a nota
      // costuma trazer e evita campo vazio na conferência.
      dataEmissao: docEmissao || row.competencia,
    });
  }

  // Documentos anexados (opcional): VÁRIOS arquivos podem ser enviados já no
  // lançamento inicial (boleto, nota fiscal, comprovante, foto...). Cada um vira
  // uma linha em `document` vinculada à mesma despesa — a existência de um anexo
  // nunca impede os demais.
  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 0 && isR2Configured()) {
    for (const file of files) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${ctx.tenant.id}/docs/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}_${safe}`;
      await putObject(
        key,
        new Uint8Array(await file.arrayBuffer()),
        file.type || "application/octet-stream",
      );
      await db.insert(schema.documents).values({
        tenantId: ctx.tenant.id,
        despesaId: row.id,
        storageKey: key,
        filename: file.name,
        contentType: file.type || null,
        size: file.size,
        uploadedBy: ctx.userEmail || ctx.userId || null,
      });
    }
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.create",
    entity: "despesa",
    entityId: row.id,
    meta: { valor: row.valor, contaCef: row.contaCef },
  });

  // Despesa paga por sócio: registra a obrigação empresa↔sócio (reusa a infra de
  // "pago por terceiro"). Reembolsável → obrigação PENDENTE (o caixa só se move
  // no reembolso, feito na tela de Restituições). Sem reembolso → obrigação já
  // QUITADA (saldo 0), sem movimento de caixa e sem duplicar despesa na DRE.
  if (pagoPorSocioId) {
    await db.insert(schema.despesaTerceiros).values({
      tenantId: ctx.tenant.id,
      despesaId: row.id,
      pagadorTerceiroId: pagoPorSocioId,
      empresaResponsavelId: projectId,
      valorTotal: row.valor,
      valorRestituido: socioReembolsavel ? "0" : row.valor,
      dataPagamentoOriginal: socioDataPagamento,
      status: socioReembolsavel ? "Aguardando restituição" : "Sem reembolso",
      obs: socioReembolsavel
        ? "Despesa paga por sócio — a reembolsar"
        : "Despesa paga por sócio — sem reembolso",
    });
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "despesa.pagaPorSocio",
      entity: "despesa",
      entityId: row.id,
      meta: {
        socioId: pagoPorSocioId,
        valor: row.valor,
        reembolsavel: socioReembolsavel,
        dataPagamento: socioDataPagamento,
      },
    });
  }

  // Despesa recorrente: replica o lançamento nos próximos meses (competência e
  // vencimento avançam 1 mês a cada repetição). Cada réplica recebe seu próprio
  // número automático; parcelas/anexo ficam só no lançamento original.
  if (formData.get("recorrente")) {
    const meses = Math.min(60, Math.max(2, Number(formData.get("recorrenciaMeses")) || 0));
    for (let i = 1; i < meses; i++) {
      const numDocRec = await reserveDespesaNumber(ctx.tenant.id);
      await db.insert(schema.despesas).values({
        ...core,
        numDoc: numDocRec,
        competencia: addMonthsCompetencia(core.competencia, i),
        vencimento: addMonthsDate(core.vencimento, i),
      });
    }
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "despesa.recorrente",
      entity: "despesa",
      entityId: row.id,
      meta: { meses, competencia: core.competencia },
    });
  }

  revalidatePath("/despesas");
}

/** Avança `add` meses numa competência "MM/YYYY". */
function addMonthsCompetencia(mm: string | null, add: number): string | null {
  if (!mm) return mm;
  const m = mm.trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return mm;
  const idx = Number(m[2]) * 12 + (Number(m[1]) - 1) + add;
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  return `${String(mo).padStart(2, "0")}/${y}`;
}

/** Avança `add` meses numa data interna "MM/DD/YYYY", limitando o dia ao mês. */
function addMonthsDate(d: string | null, add: number): string | null {
  if (!d) return d;
  const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return d;
  const day = Number(m[2]);
  const idx = Number(m[3]) * 12 + (Number(m[1]) - 1) + add;
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  const lastDay = new Date(y, mo, 0).getDate();
  const dd = Math.min(day, lastDay);
  return `${String(mo).padStart(2, "0")}/${String(dd).padStart(2, "0")}/${y}`;
}

/** Campos editáveis de uma despesa já lançada. */
export interface DespesaPatch {
  fornecedorId?: string | null;
  bancoId?: string | null;
  contaCef?: string | null;
  categoriaDre?: string | null;
  numDoc?: string | null;
  competencia?: string | null;
  vencimento?: string | null;
  valor?: string;
  status?: string | null;
  obs?: string | null;
  formaPagamento?: string | null;
}

/** Edita uma despesa já lançada (mesma versão/tenant do contexto ativo). */
export async function updateDespesa(id: string, patch: DespesaPatch) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) return;

  // Escopo por tenant: a despesa pode pertencer a qualquer projeto do tenant
  // (a lista opera por projeto selecionado, não pela versão do contexto).
  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(eq(schema.despesas.id, id), eq(schema.despesas.tenantId, ctx.tenant.id)),
    )
    .limit(1);
  if (!existing) return;
  if (existing.cancelado) throw new Error("Despesa cancelada não pode ser editada.");

  const set: Partial<typeof schema.despesas.$inferInsert> = {};
  if (patch.fornecedorId !== undefined) set.fornecedorId = patch.fornecedorId || null;
  if (patch.bancoId !== undefined) set.bancoId = patch.bancoId || null;
  if (patch.contaCef !== undefined) set.contaCef = patch.contaCef || null;
  if (patch.categoriaDre !== undefined) {
    // Item 1.3 / RG-01 — nem na edição uma despesa pode passar para conta de
    // natureza credora.
    const erro = validarCategoriaDespesa(patch.categoriaDre);
    if (erro) throw new Error(erro);
    set.categoriaDre = patch.categoriaDre as CategoriaDRE;
  }
  // RG-06 — o PED é imutável depois de criado. Renumerar um documento já
  // emitido quebraria a conferência com a contabilidade e com os anexos que o
  // referenciam. Um número enviado igual ao atual é ignorado em silêncio (o
  // formulário pode reenviá-lo); diferente, é recusado.
  if (patch.numDoc !== undefined && (patch.numDoc?.trim() || null) !== existing.numDoc) {
    throw new Error(
      "O nº do pedido (PED) é numeração interna e não pode ser alterado. Para corrigir o número da nota, use o campo de documento fiscal.",
    );
  }
  if (patch.competencia !== undefined) set.competencia = patch.competencia || null;
  if (patch.vencimento !== undefined) set.vencimento = patch.vencimento || null;
  if (patch.valor !== undefined) set.valor = patch.valor.trim() || "0";
  if (patch.status !== undefined) set.status = patch.status || null;
  if (patch.obs !== undefined) set.obs = patch.obs || null;
  if (patch.formaPagamento !== undefined) set.formaPagamento = patch.formaPagamento || null;
  if (Object.keys(set).length === 0) return;

  // Auditoria campo a campo (RG-09): valor anterior × novo. O helper normaliza
  // nulo/vazio e numeric-como-string, senão reeditar sem mudar nada registraria
  // "alterações" que não houve.
  const changes = diffAudit(
    existing as unknown as Record<string, unknown>,
    set as Record<string, unknown>,
  );

  await db.update(schema.despesas).set(set).where(eq(schema.despesas.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.update",
    entity: "despesa",
    entityId: id,
    meta: { changes },
  });
  revalidatePath("/despesas");
}

/** Exclui uma despesa já lançada (documentos vinculados caem em cascata). */
export async function deleteDespesa(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) return;

  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(eq(schema.despesas.id, id), eq(schema.despesas.tenantId, ctx.tenant.id)),
    )
    .limit(1);
  if (!existing) return;

  await db.delete(schema.despesas).where(eq(schema.despesas.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.delete",
    entity: "despesa",
    entityId: id,
    meta: { valor: existing.valor, numDoc: existing.numDoc },
  });
  revalidatePath("/despesas");
}

/**
 * Cancelamento lógico de uma despesa: preserva o histórico para auditoria, mas
 * a remove de saldos, relatórios, fluxo de caixa e contas a pagar. Preferível
 * à exclusão física.
 */
export async function cancelarDespesa(id: string, motivo: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) {
    throw new Error("Sem permissão para cancelar despesas.");
  }
  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(and(eq(schema.despesas.id, id), eq(schema.despesas.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!existing) throw new Error("Despesa não encontrada.");
  if (existing.cancelado) return;

  const hoje = new Date();
  const canceladoEm = `${String(hoje.getMonth() + 1).padStart(2, "0")}/${String(hoje.getDate()).padStart(2, "0")}/${hoje.getFullYear()}`;
  await db
    .update(schema.despesas)
    .set({
      cancelado: true,
      canceladoEm,
      canceladoPor: ctx.userEmail || ctx.userId || null,
      motivoCancelamento: motivo?.trim() || null,
      status: "Cancelada",
    })
    .where(eq(schema.despesas.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.cancel",
    entity: "despesa",
    entityId: id,
    meta: { motivo: motivo?.trim() || null, valor: existing.valor, numDoc: existing.numDoc },
  });
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
  revalidatePath("/caixa");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
}

export interface PagarDespesaInput {
  despesaId: string;
  dataPagamento: string; // "MM/DD/YYYY"
  valorPago: number;
  bankAccountId?: string | null;
  formaPagamento?: string | null;
  juros?: number;
  multa?: number;
  desconto?: number;
  obs?: string;
}

/**
 * Marca uma despesa (sem parcelamento) como paga: registra o pagamento com
 * encargos, lança a saída real no Caixa (na data efetiva), atualiza o status e
 * a conta bancária. Estrutura pronta para pagamento parcial.
 */
export async function pagarDespesa(input: PagarDespesaInput) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    throw new Error("Sem permissão para registrar pagamentos.");
  }
  const [d] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(eq(schema.despesas.id, input.despesaId), eq(schema.despesas.tenantId, ctx.tenant.id)),
    )
    .limit(1);
  if (!d) throw new Error("Despesa não encontrada.");
  if (d.cancelado) throw new Error("Despesa cancelada não pode ser paga.");

  const juros = input.juros || 0;
  const multa = input.multa || 0;
  const desconto = input.desconto || 0;
  const valorPago = input.valorPago > 0 ? input.valorPago : Number(d.valor) + juros + multa - desconto;

  await db.insert(schema.pagamentos).values({
    tenantId: ctx.tenant.id,
    despesaId: d.id,
    parcelaId: null,
    valorOriginal: String(d.valor),
    desconto: String(desconto),
    multa: String(multa),
    juros: String(juros),
    outrosAcrescimos: "0",
    valorTotalPago: String(valorPago),
    dataPagamento: input.dataPagamento || null,
    bankAccountId: input.bankAccountId || null,
    obs: input.obs || null,
    usuarioId: ctx.userId,
  });

  // Pagamento integral × parcial (estrutura pronta): status conforme o total.
  const pagoTotal = valorPago + desconto >= Number(d.valor) - 0.01;
  await db
    .update(schema.despesas)
    .set({
      status: pagoTotal ? "Pago" : "Parcialmente paga",
      dataCaixa: input.dataPagamento || d.dataCaixa,
      formaPagamento: input.formaPagamento || d.formaPagamento,
      bancoId: input.bankAccountId || d.bancoId,
    })
    .where(eq(schema.despesas.id, d.id));

  // Saída REAL no Controle de Caixa (valor efetivamente pago, na data real).
  await db.insert(schema.cashEntries).values({
    versionId: d.versionId,
    tenantId: ctx.tenant.id,
    bankAccountId: input.bankAccountId || null,
    data: input.dataPagamento || null,
    descricao: `Pagamento ${d.numDoc ?? "despesa"}`,
    valor: String(-Math.abs(valorPago)),
    cat: "despesa",
    rec: true,
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.pay",
    entity: "despesa",
    entityId: d.id,
    meta: { valorPago, juros, multa, desconto, dataPagamento: input.dataPagamento },
  });
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
  revalidatePath("/caixa");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
}

/**
 * Lê os documentos enviados (PDF/imagem) com IA e devolve os campos da despesa
 * já traduzidos para o formulário — com os ALERTAS de cada campo que a tela
 * precisa mostrar (o que faltou e o que merece conferência).
 *
 * Aceita VÁRIOS arquivos no mesmo `file`: a compra costuma chegar em partes
 * (a nota e o comprovante do Pix), e ler tudo junto é o que permite dizer
 * "esta despesa já está paga, por PIX, em 20/07".
 *
 * O casamento com os cadastros (fornecedor, conta, categoria, obra) acontece
 * aqui no servidor, onde as listas já estão carregadas — o cliente recebe
 * pronto o que aplicar e o que sinalizar.
 *
 * IMPORTANTE: em produção o Next.js redige (esconde) a mensagem de qualquer
 * erro LANÇADO por uma Server Action, substituindo por um texto genérico em
 * inglês ("An error occurred in the Server Components render…"). Por isso os
 * erros são RETORNADOS em `{ ok: false, error }` — é o único jeito de a
 * mensagem real ("a conta está sem créditos", "arquivo grande demais") chegar
 * ao usuário. Mesmo padrão de `extractExtratoPdf` e `addDespesaDocs`.
 */
export async function extractDespesaFromDoc(
  formData: FormData,
): Promise<
  { ok: true; data: PreenchimentoDespesa } | { ok: false; error: string }
> {
  const falha = (error: string) => ({ ok: false as const, error });
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar")) {
    return falha("Sem permissão para lançar despesas.");
  }
  if (!isAiConfigured()) {
    return falha("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return falha("Selecione um arquivo.");

  // Só PDF/imagem vão para a IA. Os demais anexos (XML, planilha, e-mail)
  // continuam podendo ser anexados à despesa — só não são lidos.
  const legiveis = files.filter((f) =>
    (AI_ACCEPTED_MIME as readonly string[]).includes(f.type || ""),
  );
  if (legiveis.length === 0) {
    return falha(
      "Nenhum arquivo legível pela IA — envie PDF ou imagem (PNG, JPG, WebP ou GIF).",
    );
  }
  const selecionados = legiveis.slice(0, AI_MAX_DOCS);
  for (const f of selecionados) {
    if (f.size > 10 * 1024 * 1024) {
      return falha(`"${f.name}" tem mais de 10 MB — envie um arquivo menor.`);
    }
  }

  try {
    const [fornecedores, contas] = await Promise.all([
      getStakeholders(ctx.tenant.id),
      getChartAccounts(ctx.tenant.id),
    ]);
    const categorias = categoriasDeDespesa(CATEGORIAS_DRE);
    const projetos = ctx.projects.map((p) => ({ id: p.id, nome: p.name }));

    const docs = await Promise.all(
      selecionados.map(async (f) => ({
        bytes: new Uint8Array(await f.arrayBuffer()),
        mime: f.type,
        filename: f.name,
      })),
    );

    const extraido = await extractDespesaFromDocument(docs, {
      fornecedores: fornecedores.map((f) => ({ nome: f.nome, doc: f.doc })),
      contas: contas.map((c) => ({ code: c.code, name: c.name })),
      projetos: projetos.map((p) => ({ nome: p.nome })),
      categorias,
      tiposDocumento: TIPOS_DOCUMENTO,
      empresa: { nome: ctx.tenant.name, cnpj: ctx.tenant.cnpj },
    });

    return {
      ok: true,
      data: montarPreenchimentoDespesa(extraido, {
        fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.nome, doc: f.doc })),
        contas: contas.map((c) => c.code),
        categorias,
        projetos,
        formasPagamento: FORMAS_PAGAMENTO,
        tiposDocumento: TIPOS_DOCUMENTO.map((t) => t.id),
      }),
    };
  } catch (e) {
    // O log fica no servidor (com stack); para a tela vai a mensagem já
    // traduzida por enrichAiError ("sem créditos", "chave inválida"...).
    console.error("[despesa] falha na leitura por IA:", e);
    return falha(e instanceof Error ? e.message : "Falha ao ler o documento.");
  }
}

/** Anexa um documento (NF/contrato) a uma despesa, no R2. */
export async function uploadDespesaDoc(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar")) {
    throw new Error("Sem permissão.");
  }
  if (!isR2Configured()) {
    throw new Error("Storage (R2) não configurado — defina as variáveis R2_*.");
  }
  const despesaId = (formData.get("despesaId") as string) || null;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo deve ter até 10 MB.");

  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const key = `tenants/${ctx.tenant.id}/docs/${Date.now()}_${safe}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");

  await db.insert(schema.documents).values({
    tenantId: ctx.tenant.id,
    despesaId,
    storageKey: key,
    filename: file.name,
    contentType: file.type || null,
    size: file.size,
    tipo: ((formData.get("tipo") as string) || "").trim() || null,
    // Item 3.2 — nº da nota no próprio arquivo, para localizá-lo pelo número
    // sem depender do nome. Vazio herda o documento fiscal da despesa na
    // listagem do repositório.
    numeroDocumentoFiscal:
      ((formData.get("numeroDocumentoFiscal") as string) || "").trim() || null,
    uploadedBy: ctx.userEmail || ctx.userId || null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.upload",
    entity: "document",
    meta: { filename: file.name, despesaId, tipo: (formData.get("tipo") as string) || null },
  });
  revalidatePath("/despesas");
}

/**
 * Anexa VÁRIOS arquivos a uma despesa existente — funciona em qualquer momento
 * do ciclo de vida: na edição, antes ou depois da conciliação e depois de a
 * despesa estar paga. Nunca substitui nem remove os anexos já existentes.
 * Retorna o erro (em vez de lançar) para a mensagem chegar à tela em produção.
 */
export async function addDespesaDocs(
  formData: FormData,
): Promise<{ ok: boolean; added?: number; error?: string }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    return { ok: false, error: "Sem permissão para anexar documentos." };
  }
  if (!isR2Configured()) {
    return { ok: false, error: "Storage (R2) não configurado — defina as variáveis R2_*." };
  }
  const despesaId = (formData.get("despesaId") as string) || "";
  if (!despesaId) return { ok: false, error: "Despesa não informada." };

  // A despesa precisa existir NO TENANT — não se checa status: anexar é
  // permitido inclusive depois de paga/conciliada.
  const [desp] = await db
    .select({ id: schema.despesas.id })
    .from(schema.despesas)
    .where(and(eq(schema.despesas.id, despesaId), eq(schema.despesas.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!desp) return { ok: false, error: "Despesa não encontrada." };

  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Selecione ao menos um arquivo." };
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) {
      return { ok: false, error: `"${f.name}" excede 10 MB.` };
    }
  }
  const tipo = ((formData.get("tipo") as string) || "").trim() || null;

  try {
    for (const file of files) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${ctx.tenant.id}/docs/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}_${safe}`;
      await putObject(
        key,
        new Uint8Array(await file.arrayBuffer()),
        file.type || "application/octet-stream",
      );
      await db.insert(schema.documents).values({
        tenantId: ctx.tenant.id,
        despesaId,
        storageKey: key,
        filename: file.name,
        contentType: file.type || null,
        size: file.size,
        tipo,
        uploadedBy: ctx.userEmail || ctx.userId || null,
      });
    }
  } catch (e) {
    console.error("[despesa] falha ao anexar documentos:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao enviar os arquivos.",
    };
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.upload",
    entity: "despesa",
    entityId: despesaId,
    meta: { arquivos: files.map((f) => f.name), qtd: files.length, tipo },
  });
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
  return { ok: true, added: files.length };
}

/**
 * Desvincula UM anexo da despesa, sem afetar os demais.
 *
 * ZERO PERDA DE DADOS: remove-se apenas a linha de `document` (o vínculo). O
 * objeto NÃO é apagado do storage (R2), de modo que o arquivo continua
 * recuperável pela storageKey registrada na auditoria. Mesmo critério já
 * adotado na exclusão de documentos de projeto.
 */
export async function deleteDespesaDoc(
  documentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    return { ok: false, error: "Sem permissão para remover anexos." };
  }
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!doc) return { ok: false, error: "Anexo não encontrado." };

  await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.unlink",
    entity: "despesa",
    entityId: doc.despesaId ?? "—",
    // storageKey fica registrada: o arquivo permanece no storage e pode ser
    // revinculado se a remoção tiver sido indevida.
    meta: { documentId: doc.id, filename: doc.filename, storageKey: doc.storageKey },
  });
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
  return { ok: true };
}
```

### `src/lib/actions/documento-fiscal.ts`

Importado por: `/despesas`.

```ts
"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { diffAudit } from "@/lib/audit-diff";
import {
  chaveDuplicidade,
  normalizarChaveAcesso,
  validarDocumentoFiscal,
  type DocumentoFiscalEntrada,
} from "@/lib/calc/documento-fiscal";

/**
 * Documento fiscal de uma despesa — item 1.2.
 *
 * O número da nota é do emitente e chega quando chega: nada aqui bloqueia o
 * lançamento. A duplicidade gera ALERTA com link para o PED anterior, nunca
 * recusa (decisão D2) — numeração de NF é sequencial por emitente e série, e
 * bloquear produziria falso positivo legítimo.
 */

export interface DocumentoFiscalRow {
  id: string;
  despesaId: string;
  tipo: string;
  numero: string | null;
  serie: string | null;
  chaveAcesso: string | null;
  dataEmissao: string | null;
}

/** Documentos fiscais de uma despesa. */
export async function getDocumentosFiscais(
  despesaId: string,
): Promise<DocumentoFiscalRow[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return [];
  const rows = await db
    .select()
    .from(schema.documentosFiscais)
    .where(
      and(
        eq(schema.documentosFiscais.tenantId, ctx.tenant.id),
        eq(schema.documentosFiscais.despesaId, despesaId),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    despesaId: r.despesaId,
    tipo: r.tipo,
    numero: r.numero,
    serie: r.serie,
    chaveAcesso: r.chaveAcesso,
    dataEmissao: r.dataEmissao,
  }));
}

export interface DuplicidadeDocumento {
  despesaId: string;
  numDoc: string | null;
  projectId: string;
  projectName: string;
  competencia: string | null;
  valor: number;
}

/**
 * Já existe este mesmo documento no tenant? (CA-04)
 *
 * Devolve o lançamento anterior para a tela mostrar o aviso com link. Não
 * decide nada: quem decide prosseguir é o usuário.
 */
export async function buscarDocumentoDuplicado(
  fornecedorId: string | null,
  doc: DocumentoFiscalEntrada,
  ignorarDespesaId?: string,
): Promise<DuplicidadeDocumento | null> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return null;
  const chave = chaveDuplicidade(fornecedorId, doc);
  if (!chave) return null;

  const rows = await db
    .select({
      df: schema.documentosFiscais,
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
    })
    .from(schema.documentosFiscais)
    .innerJoin(schema.despesas, eq(schema.documentosFiscais.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.documentosFiscais.tenantId, ctx.tenant.id),
        eq(schema.documentosFiscais.tipo, doc.tipo ?? "SEM_DOC"),
        eq(schema.documentosFiscais.numero, doc.numero?.trim() ?? ""),
        ignorarDespesaId
          ? ne(schema.documentosFiscais.despesaId, ignorarDespesaId)
          : undefined,
      ),
    )
    .limit(20);

  // A chave inclui o fornecedor, que está na despesa — por isso o filtro final
  // acontece aqui e não no SQL.
  for (const r of rows) {
    if (chaveDuplicidade(r.d.fornecedorId, r.df) === chave) {
      return {
        despesaId: r.d.id,
        numDoc: r.d.numDoc,
        projectId: r.projectId,
        projectName: r.projectName,
        competencia: r.d.competencia,
        valor: Number(r.d.valor),
      };
    }
  }
  return null;
}

export interface SalvarDocumentoResult {
  ok: boolean;
  error?: string;
  documentoId?: string;
}

/**
 * Cria ou atualiza o documento fiscal de uma despesa.
 *
 * Uma despesa tem no máximo um documento "principal" mantido por este fluxo —
 * salvar de novo atualiza o mesmo registro em vez de empilhar duplicatas. O
 * repositório continua aceitando quantos arquivos forem necessários.
 */
export async function salvarDocumentoFiscal(input: {
  despesaId: string;
  tipo: string;
  numero?: string | null;
  serie?: string | null;
  chaveAcesso?: string | null;
  dataEmissao?: string | null;
}): Promise<SalvarDocumentoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    return { ok: false, error: "Sem permissão para editar o documento fiscal." };
  }
  const erro = validarDocumentoFiscal(input);
  if (erro) return { ok: false, error: erro };

  const [desp] = await db
    .select({ id: schema.despesas.id })
    .from(schema.despesas)
    .where(
      and(
        eq(schema.despesas.id, input.despesaId),
        eq(schema.despesas.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!desp) return { ok: false, error: "Despesa não encontrada." };

  const valores = {
    tipo: input.tipo || "SEM_DOC",
    numero: input.numero?.trim() || null,
    serie: input.serie?.trim() || null,
    chaveAcesso: normalizarChaveAcesso(input.chaveAcesso),
    dataEmissao: input.dataEmissao?.trim() || null,
  };

  const [existente] = await db
    .select()
    .from(schema.documentosFiscais)
    .where(
      and(
        eq(schema.documentosFiscais.tenantId, ctx.tenant.id),
        eq(schema.documentosFiscais.despesaId, input.despesaId),
      ),
    )
    .limit(1);

  let documentoId: string;
  let changes: Record<string, { de: unknown; para: unknown }>;
  if (existente) {
    changes = diffAudit(existente as unknown as Record<string, unknown>, valores);
    if (Object.keys(changes).length === 0) {
      return { ok: true, documentoId: existente.id };
    }
    await db
      .update(schema.documentosFiscais)
      .set(valores)
      .where(eq(schema.documentosFiscais.id, existente.id));
    documentoId = existente.id;
  } else {
    const [novo] = await db
      .insert(schema.documentosFiscais)
      .values({ tenantId: ctx.tenant.id, despesaId: input.despesaId, ...valores })
      .returning();
    documentoId = novo.id;
    changes = diffAudit(null, valores);
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: existente ? "documentoFiscal.update" : "documentoFiscal.create",
    entity: "documento_fiscal",
    entityId: documentoId,
    meta: { despesaId: input.despesaId, changes },
  });
  revalidatePath("/despesas");
  return { ok: true, documentoId };
}
```

### `src/lib/actions/medicao.ts`

Importado por: `/medicaolanc`.

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { getAtualVersion } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * Lançamentos de medição de obra (engenheiro), por competência e grupo CEF.
 * A soma alimenta o Custo Variável da DRE.
 */

export async function addMedicao(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "criar")) {
    throw new Error("Sem permissão para lançar medições.");
  }
  // Projeto sendo medido: resolve a versão Atual dele. Sem projeto explícito,
  // usa a versão do contexto (compatibilidade).
  const projectId = ((formData.get("projectId") as string) || "").trim();
  let versionId = ctx.version.id;
  let locked = ctx.version.locked;
  if (projectId && projectId !== ctx.project.id) {
    const v = await getAtualVersion(ctx.tenant.id, projectId);
    if (!v) throw new Error("Projeto selecionado não possui versão Atual.");
    versionId = v.id;
    locked = v.locked;
  }
  if (locked) throw new Error("Versão congelada — lançamentos bloqueados.");
  const competencia = ((formData.get("competencia") as string) || "").trim();
  const grupo = ((formData.get("grupo") as string) || "").trim();
  const valor = (formData.get("valor") as string) || "0";
  if (!competencia) throw new Error("Informe a competência (MM/YYYY).");
  if (!grupo) throw new Error("Selecione o grupo de obra.");
  // "grupoCode|grupoName" vem do select para preservar o nome do grupo.
  const [grupoCode, ...rest] = grupo.split("|");
  const grupoName = rest.join("|") || grupoCode;

  await db.insert(schema.medicoes).values({
    versionId,
    tenantId: ctx.tenant.id,
    competencia,
    grupoCode: grupoCode.trim(),
    grupoName: grupoName.trim(),
    valor,
    obs: (formData.get("obs") as string) || null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.create",
    entity: "medicao",
    meta: { competencia, grupoCode: grupoCode.trim(), valor, projectId: projectId || ctx.project.id },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
}

export async function updateMedicao(
  id: string,
  patch: { competencia?: string; valor?: string; obs?: string },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "editar")) return;
  const set: { competencia?: string; valor?: string; obs?: string | null } = {};
  if (patch.competencia && patch.competencia.trim()) set.competencia = patch.competencia.trim();
  if (patch.valor !== undefined) set.valor = patch.valor || "0";
  if (patch.obs !== undefined) set.obs = patch.obs || null;
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.medicoes)
    .set(set)
    .where(
      and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, ctx.tenant.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.update",
    entity: "medicao",
    entityId: id,
    meta: set,
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
}

export async function deleteMedicao(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "excluir")) return;
  await db
    .delete(schema.medicoes)
    .where(
      and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, ctx.tenant.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.delete",
    entity: "medicao",
    entityId: id,
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
}
```

### `src/lib/actions/pagamentos.ts`

Importado por: `/despesas`.

```ts
"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { composePagamento } from "@/lib/calc";

export interface RegistrarPagamentoInput {
  parcelaId: string;
  valorOriginal: number;
  desconto?: number;
  multa?: number;
  juros?: number;
  outrosAcrescimos?: number;
  dataPagamento: string; // "MM/DD/YYYY"
  bankAccountId?: string | null;
  obs?: string;
}

/**
 * Registra o pagamento de uma parcela (Fase 3), com desconto/multa/juros.
 * - Cria o registro de pagamento com a composição completa.
 * - Atualiza a parcela (valor pago acumulado, encargos, status).
 * - Lança a saída REAL no Controle de Caixa (valor total pago, na data real).
 * Os encargos são reconhecidos separadamente na DRE (Despesas Financeiras).
 */
export async function registrarPagamento(input: RegistrarPagamentoInput) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    throw new Error("Sem permissão para registrar pagamentos.");
  }
  if (ctx.version.locked) throw new Error("Versão congelada.");

  // Carrega a parcela e a despesa (valida escopo tenant/versão).
  const [parc] = await db
    .select({ p: schema.despesaParcelas, versionId: schema.despesas.versionId })
    .from(schema.despesaParcelas)
    .innerJoin(schema.despesas, eq(schema.despesaParcelas.despesaId, schema.despesas.id))
    .where(
      and(
        eq(schema.despesaParcelas.id, input.parcelaId),
        eq(schema.despesaParcelas.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!parc || parc.versionId !== ctx.version.id) {
    throw new Error("Parcela não encontrada nesta versão.");
  }

  const { valorTotalPago } = composePagamento(input);
  const desconto = input.desconto || 0;
  const multa = input.multa || 0;
  const juros = input.juros || 0;
  const outros = input.outrosAcrescimos || 0;

  const [pag] = await db
    .insert(schema.pagamentos)
    .values({
      tenantId: ctx.tenant.id,
      parcelaId: parc.p.id,
      despesaId: parc.p.despesaId,
      valorOriginal: String(input.valorOriginal),
      desconto: String(desconto),
      multa: String(multa),
      juros: String(juros),
      outrosAcrescimos: String(outros),
      valorTotalPago: String(valorTotalPago),
      dataPagamento: input.dataPagamento || null,
      bankAccountId: input.bankAccountId || null,
      obs: input.obs || null,
      usuarioId: ctx.userId,
    })
    .returning();

  // Atualiza a parcela: acumula pago/encargos e recalcula o status.
  const novoPago = Number(parc.p.valorPago) + valorTotalPago;
  const original = Number(parc.p.valorOriginal);
  const status = novoPago + 0.01 >= original ? "Pago" : "Pago parcialmente";
  await db
    .update(schema.despesaParcelas)
    .set({
      valorPago: String(novoPago),
      multa: String(Number(parc.p.multa) + multa),
      juros: String(Number(parc.p.juros) + juros),
      desconto: String(Number(parc.p.desconto) + desconto),
      outrosAcrescimos: String(Number(parc.p.outrosAcrescimos) + outros),
      dataPagamento: input.dataPagamento || parc.p.dataPagamento,
      status,
    })
    .where(eq(schema.despesaParcelas.id, parc.p.id));

  // Saída REAL no Controle de Caixa (valor efetivamente pago, na data real).
  await db.insert(schema.cashEntries).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    bankAccountId: input.bankAccountId || null,
    data: input.dataPagamento || null,
    descricao: `Pagamento parcela #${parc.p.numeroParcela}`,
    valor: String(-Math.abs(valorTotalPago)),
    cat: "despesa",
    rec: true,
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "pagamento.create",
    entity: "pagamento",
    entityId: pag.id,
    meta: { parcelaId: parc.p.id, valorTotalPago, multa, juros, desconto, outros },
  });
  revalidatePath("/despesas");
  revalidatePath("/caixa");
  revalidatePath("/fluxocaixa");
  revalidatePath("/dre");
}

/** Encargos financeiros (multa+juros+outros−desconto) por mês de pagamento. */
export async function getEncargosByVersion(
  versionId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      data: schema.pagamentos.dataPagamento,
      multa: schema.pagamentos.multa,
      juros: schema.pagamentos.juros,
      outros: schema.pagamentos.outrosAcrescimos,
      desconto: schema.pagamentos.desconto,
    })
    .from(schema.pagamentos)
    .innerJoin(schema.despesas, eq(schema.pagamentos.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.pagamentos.dataPagamento));
  const out: Record<string, number> = {};
  for (const r of rows) {
    const enc = Number(r.multa) + Number(r.juros) + Number(r.outros) - Number(r.desconto);
    const p = (r.data ?? "").split("/");
    const mm = p.length === 3 ? `${p[0]}/${p[2]}` : null;
    if (mm) out[mm] = (out[mm] || 0) + enc;
  }
  return out;
}
```

### `src/lib/actions/recebimento-terceiro.ts`

Importado por: `/restituicoes`.

```ts
"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  repasseCabe,
  saldoARepassar,
  statusRepasse,
} from "@/lib/calc/recebimento-terceiro";

/**
 * Recebimento por terceiro e repasse — RG-02 e RG-04.
 *
 * Espelho de `restituicoes.ts`, do outro lado do balanço. A regra que governa
 * tudo aqui: **nenhuma função deste arquivo cria receita**. A receita foi
 * reconhecida na venda; o que se registra aqui é o trânsito do dinheiro entre
 * o terceiro e a empresa.
 *
 * Concretamente, nada aqui insere em `budget_line` de receita, nem em
 * `conta_receber` com valor novo, nem em `unit`. O único efeito no caixa é a
 * ENTRADA no momento do repasse — que é quando o dinheiro de fato chega.
 */

export interface RecebimentoTerceiroView {
  id: string;
  recebedorId: string | null;
  recebedor: string | null;
  projectId: string | null;
  projectName: string | null;
  clienteNome: string | null;
  unitCode: string | null;
  contaReceberId: string | null;
  valorTotal: number;
  valorRepassado: number;
  saldo: number;
  dataRecebimento: string | null;
  dataPrevistaRepasse: string | null;
  status: string;
  obs: string | null;
}

export async function getRecebimentosTerceiros(
  tenantId: string,
): Promise<RecebimentoTerceiroView[]> {
  const rows = await db
    .select({
      r: schema.recebimentosTerceiros,
      recebedor: schema.stakeholders.nome,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.recebimentosTerceiros)
    .leftJoin(
      schema.stakeholders,
      eq(schema.recebimentosTerceiros.recebedorTerceiroId, schema.stakeholders.id),
    )
    .leftJoin(schema.projects, eq(schema.recebimentosTerceiros.projectId, schema.projects.id))
    .leftJoin(schema.clientes, eq(schema.recebimentosTerceiros.clienteId, schema.clientes.id))
    .where(eq(schema.recebimentosTerceiros.tenantId, tenantId));

  return rows.map((x) => ({
    id: x.r.id,
    recebedorId: x.r.recebedorTerceiroId,
    recebedor: x.recebedor,
    projectId: x.r.projectId,
    projectName: x.projectName,
    clienteNome: x.clienteNome,
    unitCode: x.r.unitCode,
    contaReceberId: x.r.contaReceberId,
    valorTotal: Number(x.r.valorTotal),
    valorRepassado: Number(x.r.valorRepassado),
    saldo: saldoARepassar(Number(x.r.valorTotal), Number(x.r.valorRepassado)),
    dataRecebimento: x.r.dataRecebimento,
    dataPrevistaRepasse: x.r.dataPrevistaRepasse,
    status: x.r.status,
    obs: x.r.obs,
  }));
}

export interface RecebimentoResult {
  ok: boolean;
  error?: string;
  recebimentoId?: string;
  jaExistia?: boolean;
}

/**
 * Registra que um terceiro recebeu, em nome da empresa, um valor do cliente.
 *
 * O que acontece: o título de contas a receber é baixado (o cliente pagou) e
 * nasce um ATIVO com o terceiro. **Zero impacto na DRE** — a receita já foi
 * reconhecida na venda; reconhecê-la de novo aqui dobraria a receita.
 *
 * O que NÃO acontece: nenhuma entrada de caixa. O dinheiro ainda está com o
 * terceiro; ele só entra no repasse.
 */
export async function registrarRecebimentoTerceiro(
  formData: FormData,
): Promise<RecebimentoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "criar")) {
    return { ok: false, error: "Sem permissão para registrar recebimentos por terceiro." };
  }
  const s = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  const idem = s("idempotencyKey");
  const valor = Number(s("valor") ?? "0");
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, error: "Informe um valor maior que zero." };
  }

  if (idem) {
    const [existente] = await db
      .select({ id: schema.recebimentosTerceiros.id })
      .from(schema.recebimentosTerceiros)
      .where(
        and(
          eq(schema.recebimentosTerceiros.tenantId, ctx.tenant.id),
          eq(schema.recebimentosTerceiros.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente) return { ok: true, recebimentoId: existente.id, jaExistia: true };
  }

  const contaReceberId = s("contaReceberId");
  try {
    const id = await db.transaction(async (tx) => {
      const [rec] = await tx
        .insert(schema.recebimentosTerceiros)
        .values({
          tenantId: ctx.tenant.id,
          recebedorTerceiroId: s("recebedorTerceiroId"),
          projectId: s("projectId") ?? ctx.project.id,
          contaReceberId,
          clienteId: s("clienteId"),
          unitCode: s("unitCode"),
          valorTotal: String(valor),
          dataRecebimento: s("dataRecebimento"),
          dataPrevistaRepasse: s("dataPrevistaRepasse"),
          status: "Aguardando repasse",
          obs: s("obs"),
          idempotencyKey: idem,
        })
        .returning();

      // Baixa do título: o cliente PAGOU — quem ainda não repassou é o
      // terceiro. Isso não cria receita; a receita é da venda.
      if (contaReceberId) {
        const [cr] = await tx
          .select()
          .from(schema.contasReceber)
          .where(
            and(
              eq(schema.contasReceber.id, contaReceberId),
              eq(schema.contasReceber.tenantId, ctx.tenant.id),
            ),
          )
          .limit(1);
        if (cr) {
          const recebido = Number(cr.valorRecebido) + valor;
          await tx
            .update(schema.contasReceber)
            .set({
              valorRecebido: String(recebido),
              status:
                recebido + 0.01 >= Number(cr.valor)
                  ? "Recebido"
                  : "Parcialmente recebido",
              dataRecebimento: s("dataRecebimento") ?? cr.dataRecebimento,
            })
            .where(eq(schema.contasReceber.id, cr.id));
        }
      }
      return rec.id;
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "recebimentoTerceiro.create",
      entity: "recebimento_terceiro",
      entityId: id,
      meta: { valor, contaReceberId, impactoDre: 0 },
    });
    revalidatePath("/restituicoes");
    revalidatePath("/contasreceber");
    return { ok: true, recebimentoId: id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar o recebimento.";
    if (idem && /duplicate key|recebimento_terceiro_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.recebimentosTerceiros.id })
        .from(schema.recebimentosTerceiros)
        .where(
          and(
            eq(schema.recebimentosTerceiros.tenantId, ctx.tenant.id),
            eq(schema.recebimentosTerceiros.idempotencyKey, idem),
          ),
        )
        .limit(1);
      if (existente) return { ok: true, recebimentoId: existente.id, jaExistia: true };
    }
    return { ok: false, error: msg };
  }
}

export interface RepasseInput {
  recebimentoTerceiroId: string;
  valor: number;
  dataRepasse: string;
  bankAccountId?: string | null;
  comprovante?: string;
  obs?: string;
  idempotencyKey?: string | null;
  /** Item do extrato que trouxe o dinheiro (conciliação sem receita nova). */
  cashEntryId?: string | null;
}

export interface RepasseResult {
  ok: boolean;
  error?: string;
  repasseId?: string;
  jaExistia?: boolean;
}

/**
 * Registra o repasse do terceiro para a empresa — RG-04.
 *
 * Gera a ENTRADA de caixa na data efetiva e baixa o ativo com o terceiro.
 * **Não toca a DRE**: nenhuma linha de receita é criada aqui, nem "para fechar
 * o caixa". A receita da venda continua sendo uma só.
 */
export async function registrarRepasse(input: RepasseInput): Promise<RepasseResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    return { ok: false, error: "Sem permissão para registrar repasses." };
  }
  const idem = input.idempotencyKey?.trim() || null;

  if (idem) {
    const [existente] = await db
      .select({ id: schema.repasses.id })
      .from(schema.repasses)
      .where(
        and(
          eq(schema.repasses.tenantId, ctx.tenant.id),
          eq(schema.repasses.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente) return { ok: true, repasseId: existente.id, jaExistia: true };
  }

  try {
    const repId = await db.transaction(async (tx) => {
      // FOR UPDATE serializa dois repasses simultâneos sobre o mesmo
      // recebimento: o segundo enxerga o saldo já abatido pelo primeiro.
      const [rec] = await tx
        .select()
        .from(schema.recebimentosTerceiros)
        .where(
          and(
            eq(schema.recebimentosTerceiros.id, input.recebimentoTerceiroId),
            eq(schema.recebimentosTerceiros.tenantId, ctx.tenant.id),
          ),
        )
        .for("update")
        .limit(1);
      if (!rec) throw new Error("Recebimento não encontrado.");
      if (rec.status === "Cancelado") throw new Error("Recebimento cancelado.");

      const valor = Math.abs(input.valor);
      const saldo = saldoARepassar(Number(rec.valorTotal), Number(rec.valorRepassado));
      if (!repasseCabe(Number(rec.valorTotal), Number(rec.valorRepassado), valor)) {
        throw new Error(
          `Valor acima do saldo a repassar (${saldo.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}).`,
        );
      }

      // Um item do extrato não pode lastrear dois repasses.
      if (input.cashEntryId) {
        const [usado] = await tx
          .select({ id: schema.repasses.id })
          .from(schema.repasses)
          .where(eq(schema.repasses.cashEntryId, input.cashEntryId))
          .limit(1);
        if (usado)
          throw new Error("Este lançamento do extrato já foi vinculado a outro repasse.");
      }

      const [rep] = await tx
        .insert(schema.repasses)
        .values({
          tenantId: ctx.tenant.id,
          recebimentoTerceiroId: rec.id,
          valor: String(valor),
          dataRepasse: input.dataRepasse || null,
          bankAccountId: input.bankAccountId || null,
          comprovante: input.comprovante || null,
          obs: input.obs || null,
          cashEntryId: input.cashEntryId || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      const repassado = Number(rec.valorRepassado) + valor;
      await tx
        .update(schema.recebimentosTerceiros)
        .set({
          valorRepassado: String(repassado),
          status: statusRepasse(Number(rec.valorTotal), repassado),
        })
        .where(eq(schema.recebimentosTerceiros.id, rec.id));

      if (input.cashEntryId) {
        // A entrada já existe no extrato — só é conciliada. Inserir aqui
        // duplicaria a entrada de caixa.
        await tx
          .update(schema.cashEntries)
          .set({ rec: true, cat: "repasse" })
          .where(eq(schema.cashEntries.id, input.cashEntryId));
      } else {
        // Entrada de caixa POSITIVA: o dinheiro chega agora. `cat: "repasse"`
        // mantém a origem identificável e fora de qualquer soma de receita.
        await tx.insert(schema.cashEntries).values({
          versionId: ctx.version.id,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataRepasse || null,
          descricao: "Repasse de terceiro",
          valor: String(valor),
          cat: "repasse",
          rec: true,
        });
      }
      return rep.id;
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "repasse.create",
      entity: "repasse",
      entityId: repId,
      meta: {
        recebimentoTerceiroId: input.recebimentoTerceiroId,
        valor: Math.abs(input.valor),
        // Explícito no log: RG-04 — o repasse nunca reconhece receita.
        impactoDre: 0,
      },
    });
    revalidatePath("/restituicoes");
    revalidatePath("/caixa");
    revalidatePath("/fluxocaixa");
    return { ok: true, repasseId: repId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar o repasse.";
    if (idem && /duplicate key|repasse_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.repasses.id })
        .from(schema.repasses)
        .where(
          and(
            eq(schema.repasses.tenantId, ctx.tenant.id),
            eq(schema.repasses.idempotencyKey, idem),
          ),
        )
        .limit(1);
      if (existente) return { ok: true, repasseId: existente.id, jaExistia: true };
    }
    return { ok: false, error: msg };
  }
}

export interface SaldoConsolidadoTerceiro {
  terceiroId: string | null;
  terceiro: string;
  /** quanto a empresa DEVE a ele (RG-03). */
  saldoARestituir: number;
  /** quanto ELE deve à empresa (RG-04). */
  saldoARepassar: number;
}

/**
 * Os DOIS saldos de cada terceiro, lado a lado — base do encontro de contas
 * (RG-05).
 *
 * Os saldos são sempre devolvidos BRUTOS. A compensação, quando acontecer, é um
 * documento próprio; exibir só o líquido aqui esconderia a dimensão real de
 * cada obrigação (princípio da não compensação indevida).
 */
export async function getSaldosConsolidadosTerceiros(
  tenantId: string,
): Promise<SaldoConsolidadoTerceiro[]> {
  const [obrigacoes, recebimentos] = await Promise.all([
    db
      .select({
        id: schema.despesaTerceiros.pagadorTerceiroId,
        nome: schema.stakeholders.nome,
        total: sql<string>`sum(${schema.despesaTerceiros.valorTotal})`,
        pago: sql<string>`sum(${schema.despesaTerceiros.valorRestituido})`,
      })
      .from(schema.despesaTerceiros)
      .leftJoin(
        schema.stakeholders,
        eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
      )
      .where(
        and(
          eq(schema.despesaTerceiros.tenantId, tenantId),
          ne(schema.despesaTerceiros.status, "Cancelado"),
        ),
      )
      .groupBy(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.nome),
    db
      .select({
        id: schema.recebimentosTerceiros.recebedorTerceiroId,
        nome: schema.stakeholders.nome,
        total: sql<string>`sum(${schema.recebimentosTerceiros.valorTotal})`,
        pago: sql<string>`sum(${schema.recebimentosTerceiros.valorRepassado})`,
      })
      .from(schema.recebimentosTerceiros)
      .leftJoin(
        schema.stakeholders,
        eq(schema.recebimentosTerceiros.recebedorTerceiroId, schema.stakeholders.id),
      )
      .where(
        and(
          eq(schema.recebimentosTerceiros.tenantId, tenantId),
          ne(schema.recebimentosTerceiros.status, "Cancelado"),
        ),
      )
      .groupBy(
        schema.recebimentosTerceiros.recebedorTerceiroId,
        schema.stakeholders.nome,
      ),
  ]);

  const mapa = new Map<string, SaldoConsolidadoTerceiro>();
  const abrir = (id: string | null, nome: string | null) => {
    const k = id ?? "—";
    let c = mapa.get(k);
    if (!c) {
      c = {
        terceiroId: id,
        terceiro: nome ?? "Não identificado",
        saldoARestituir: 0,
        saldoARepassar: 0,
      };
      mapa.set(k, c);
    }
    return c;
  };
  for (const o of obrigacoes) {
    abrir(o.id, o.nome).saldoARestituir +=
      Number(o.total ?? 0) - Number(o.pago ?? 0);
  }
  for (const r of recebimentos) {
    abrir(r.id, r.nome).saldoARepassar += Number(r.total ?? 0) - Number(r.pago ?? 0);
  }
  for (const c of mapa.values()) {
    c.saldoARestituir = Math.round(c.saldoARestituir * 100) / 100;
    c.saldoARepassar = Math.round(c.saldoARepassar * 100) / 100;
  }
  return [...mapa.values()].sort(
    (a, b) =>
      b.saldoARestituir + b.saldoARepassar - (a.saldoARestituir + a.saldoARepassar),
  );
}
```

### `src/lib/actions/restituicao-lote.ts`

Importado por: `/restituicoes`.

```ts
"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { abaterFifo, abaterManual, calcularAging } from "@/lib/calc/acerto";
import { statusRestituicao } from "@/lib/calc";
import { valorCompensavel } from "@/lib/calc/recebimento-terceiro";

/**
 * Restituição em LOTE e encontro de contas — itens 4.1, 4.2 e 4.5.
 *
 * O cliente não restitui item a item: ele fecha o combo (paga a fatura inteira
 * do cartão pessoal, por exemplo) e é ressarcido em um único valor. A
 * restituição precisa então ser DISTRIBUÍDA entre os PEDs em aberto daquele
 * terceiro, quitando os mais antigos primeiro (FIFO) e deixando o último
 * parcialmente abatido.
 *
 * A restituição ganha PED próprio: é o documento que vai para a contabilidade
 * como comprovação da saída de caixa. Os PEDs de origem permanecem como custo
 * da obra pago por terceiro, sem saída de caixa própria.
 */

export interface ObrigacaoEmAberto {
  id: string;
  numDoc: string | null;
  competencia: string | null;
  projectName: string | null;
  valorTotal: number;
  valorRestituido: number;
  saldo: number;
  dataPagamentoOriginal: string | null;
  dataPrevistaRestituicao: string | null;
  diasEmAberto: number;
}

/** Dias entre uma data interna e hoje (nunca negativo). */
function diasDesde(base: string | null): number {
  const p = (base ?? "").split("/");
  if (p.length !== 3) return 0;
  const d = Date.UTC(Number(p[2]), Number(p[0]) - 1, Number(p[1]));
  if (!Number.isFinite(d)) return 0;
  const hoje = new Date();
  const h = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.max(0, Math.round((h - d) / 86_400_000));
}

/** Extrato consolidado de um terceiro, com aging (item 4.1). */
export async function getExtratoTerceiro(terceiroId: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "ver")) {
    return { obrigacoes: [], totalDevido: 0, totalRestituido: 0, saldo: 0, aging: null };
  }
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      competencia: schema.despesas.competencia,
      projectName: schema.projects.name,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
        eq(schema.despesaTerceiros.pagadorTerceiroId, terceiroId),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    );

  const obrigacoes: ObrigacaoEmAberto[] = rows.map((r) => ({
    id: r.dt.id,
    numDoc: r.numDoc,
    competencia: r.competencia,
    projectName: r.projectName,
    valorTotal: Number(r.dt.valorTotal),
    valorRestituido: Number(r.dt.valorRestituido),
    saldo: Math.round((Number(r.dt.valorTotal) - Number(r.dt.valorRestituido)) * 100) / 100,
    dataPagamentoOriginal: r.dt.dataPagamentoOriginal,
    dataPrevistaRestituicao: r.dt.dataPrevistaRestituicao,
    diasEmAberto: diasDesde(r.dt.dataPagamentoOriginal),
  }));

  const totalDevido = obrigacoes.reduce((a, o) => a + o.valorTotal, 0);
  const totalRestituido = obrigacoes.reduce((a, o) => a + o.valorRestituido, 0);
  return {
    obrigacoes: obrigacoes.filter((o) => o.saldo > 0.004),
    totalDevido: Math.round(totalDevido * 100) / 100,
    totalRestituido: Math.round(totalRestituido * 100) / 100,
    saldo: Math.round((totalDevido - totalRestituido) * 100) / 100,
    aging: calcularAging(obrigacoes),
  };
}

/**
 * PREVIEW do que será abatido — exigido antes de confirmar (item 4.1).
 *
 * Nada é gravado aqui. A tela lista exatamente quais PEDs serão abatidos e em
 * que valor, para o usuário conferir antes de assumir a operação.
 */
export async function previewRestituicaoLote(
  terceiroId: string,
  valor: number,
  manuais?: { id: string; valor: number }[],
) {
  const extrato = await getExtratoTerceiro(terceiroId);
  const itens = extrato.obrigacoes.map((o) => ({
    id: o.id,
    competencia: o.competencia,
    numDoc: o.numDoc,
    saldo: o.saldo,
  }));
  const resultado =
    manuais && manuais.length > 0 ? abaterManual(manuais, itens) : abaterFifo(valor, itens);
  const porId = new Map(extrato.obrigacoes.map((o) => [o.id, o]));
  return {
    ...extrato,
    linhas: resultado.abatimentos.map((a) => ({
      ...a,
      numDoc: porId.get(a.id)?.numDoc ?? null,
      competencia: porId.get(a.id)?.competencia ?? null,
      projectName: porId.get(a.id)?.projectName ?? null,
    })),
    totalAbatido: resultado.totalAbatido,
    sobra: resultado.sobra,
  };
}

export interface RestituicaoLoteInput {
  terceiroId: string;
  valor: number;
  dataRestituicao: string;
  bankAccountId?: string | null;
  comprovante?: string | null;
  obs?: string | null;
  /** seleção manual dos PEDs; vazio = FIFO por competência. */
  manuais?: { id: string; valor: number }[];
  idempotencyKey?: string | null;
}

export interface RestituicaoLoteResult {
  ok: boolean;
  error?: string;
  restituicaoId?: string;
  numDoc?: string;
  abatidos?: number;
  jaExistia?: boolean;
}

/**
 * Confirma a restituição em lote (itens 4.1 e 4.2).
 *
 * Uma transação: a saída de caixa, o documento próprio, os vínculos com os PEDs
 * de origem e a atualização de cada saldo acontecem juntos ou não acontecem.
 *
 * NÃO cria despesa nova (RG-03): as despesas já foram reconhecidas nas
 * competências delas. O que acontece aqui é a saída do dinheiro.
 */
export async function confirmarRestituicaoLote(
  input: RestituicaoLoteInput,
): Promise<RestituicaoLoteResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    return { ok: false, error: "Sem permissão para registrar restituições." };
  }
  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.restituicoes.id })
      .from(schema.restituicoes)
      .where(
        and(
          eq(schema.restituicoes.tenantId, ctx.tenant.id),
          eq(schema.restituicoes.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente) return { ok: true, restituicaoId: existente.id, jaExistia: true };
  }

  const valor = Math.abs(input.valor);
  if (!(valor > 0)) return { ok: false, error: "Informe um valor maior que zero." };

  try {
    const out = await db.transaction(async (tx) => {
      // Bloqueia as obrigações do terceiro: duas restituições simultâneas não
      // podem abater o mesmo saldo duas vezes.
      const obrigacoes = await tx
        .select()
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
            eq(schema.despesaTerceiros.pagadorTerceiroId, input.terceiroId),
            ne(schema.despesaTerceiros.status, "Cancelado"),
          ),
        )
        .for("update");

      const despesaIds = obrigacoes.map((o) => o.despesaId);
      const docs =
        despesaIds.length > 0
          ? await tx
              .select({ id: schema.despesas.id, numDoc: schema.despesas.numDoc, competencia: schema.despesas.competencia })
              .from(schema.despesas)
              .where(eq(schema.despesas.tenantId, ctx.tenant.id))
          : [];
      const docById = new Map(docs.map((d) => [d.id, d]));

      const itens = obrigacoes
        .map((o) => ({
          id: o.id,
          competencia: docById.get(o.despesaId)?.competencia ?? null,
          numDoc: docById.get(o.despesaId)?.numDoc ?? null,
          saldo:
            Math.round((Number(o.valorTotal) - Number(o.valorRestituido)) * 100) / 100,
        }))
        .filter((i) => i.saldo > 0.004);

      const resultado =
        input.manuais && input.manuais.length > 0
          ? abaterManual(input.manuais, itens)
          : abaterFifo(valor, itens);

      if (resultado.abatimentos.length === 0) {
        throw new Error("Não há saldo em aberto para abater com este terceiro.");
      }
      if (resultado.sobra > 0.004) {
        throw new Error(
          `O valor informado excede o saldo devido em ${resultado.sobra.toLocaleString(
            "pt-BR",
            { style: "currency", currency: "BRL" },
          )}. Ajuste o valor da restituição.`,
        );
      }

      // Documento próprio da restituição (item 4.2) — é o que vai à
      // contabilidade como comprovação da saída de caixa.
      const numDoc = await reserveDespesaNumber(ctx.tenant.id);

      // A restituição é ancorada na PRIMEIRA obrigação abatida (a tabela exige
      // um vínculo); os demais PEDs entram por `restituicao_item`.
      const [rest] = await tx
        .insert(schema.restituicoes)
        .values({
          tenantId: ctx.tenant.id,
          despesaTerceiroId: resultado.abatimentos[0].id,
          valor: String(resultado.totalAbatido),
          dataRestituicao: input.dataRestituicao || null,
          bankAccountId: input.bankAccountId || null,
          comprovante: input.comprovante || null,
          obs: `${input.obs ?? ""}${input.obs ? " · " : ""}Restituição em lote ${numDoc}`,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      for (const a of resultado.abatimentos) {
        await tx.insert(schema.restituicaoItens).values({
          tenantId: ctx.tenant.id,
          restituicaoId: rest.id,
          despesaTerceiroId: a.id,
          valorAbatido: String(a.valorAbatido),
        });
        const o = obrigacoes.find((x) => x.id === a.id)!;
        const restituido = Number(o.valorRestituido) + a.valorAbatido;
        await tx
          .update(schema.despesaTerceiros)
          .set({
            valorRestituido: String(restituido),
            status: statusRestituicao(Number(o.valorTotal), restituido),
          })
          .where(eq(schema.despesaTerceiros.id, a.id));
      }

      // RG-08 — UMA saída de caixa, no valor total restituído.
      await tx.insert(schema.cashEntries).values({
        versionId: ctx.version.id,
        tenantId: ctx.tenant.id,
        bankAccountId: input.bankAccountId || null,
        data: input.dataRestituicao || null,
        descricao: `Restituição a terceiro ${numDoc}`,
        valor: String(-resultado.totalAbatido),
        cat: "restituicao",
        rec: true,
      });

      return { restId: rest.id, numDoc, abatidos: resultado.abatimentos.length, total: resultado.totalAbatido };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "restituicao.lote",
      entity: "restituicao",
      entityId: out.restId,
      meta: {
        numDoc: out.numDoc,
        terceiroId: input.terceiroId,
        valor: out.total,
        pedsAbatidos: out.abatidos,
        criterio: input.manuais?.length ? "manual" : "FIFO",
      },
    });
    revalidatePath("/restituicoes");
    revalidatePath("/contaspagar");
    revalidatePath("/caixa");
    revalidatePath("/fluxocaixa");
    return {
      ok: true,
      restituicaoId: out.restId,
      numDoc: out.numDoc,
      abatidos: out.abatidos,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar a restituição.";
    if (idem && /duplicate key|restituicao_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.restituicoes.id })
        .from(schema.restituicoes)
        .where(
          and(
            eq(schema.restituicoes.tenantId, ctx.tenant.id),
            eq(schema.restituicoes.idempotencyKey, idem),
          ),
        )
        .limit(1);
      if (existente) return { ok: true, restituicaoId: existente.id, jaExistia: true };
    }
    return { ok: false, error: msg };
  }
}

export interface CompensacaoResult {
  ok: boolean;
  error?: string;
  compensacaoId?: string;
  numDoc?: string;
  valor?: number;
}

/**
 * Encontro de contas com um terceiro — RG-05 / item 4.5.
 *
 * Quando o mesmo terceiro tem, ao mesmo tempo, saldo a restituir (a empresa
 * deve a ele) e saldo a repassar (ele deve à empresa), os dois podem ser
 * compensados.
 *
 * A compensação **não transita pela DRE** e **não move o caixa**: é baixa
 * simultânea de um passivo e de um ativo. Os saldos BRUTOS do momento ficam
 * gravados no documento, para a conferência ver o que existia antes de compensar.
 */
export async function compensarSaldos(input: {
  terceiroId: string;
  data: string;
  obs?: string | null;
  idempotencyKey?: string | null;
}): Promise<CompensacaoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    return { ok: false, error: "Sem permissão para compensar saldos." };
  }
  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.compensacoes.id, numDoc: schema.compensacoes.numDoc })
      .from(schema.compensacoes)
      .where(
        and(
          eq(schema.compensacoes.tenantId, ctx.tenant.id),
          eq(schema.compensacoes.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente)
      return { ok: true, compensacaoId: existente.id, numDoc: existente.numDoc ?? undefined };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const obrigacoes = await tx
        .select()
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
            eq(schema.despesaTerceiros.pagadorTerceiroId, input.terceiroId),
            ne(schema.despesaTerceiros.status, "Cancelado"),
          ),
        )
        .for("update");
      const recebimentos = await tx
        .select()
        .from(schema.recebimentosTerceiros)
        .where(
          and(
            eq(schema.recebimentosTerceiros.tenantId, ctx.tenant.id),
            eq(schema.recebimentosTerceiros.recebedorTerceiroId, input.terceiroId),
            ne(schema.recebimentosTerceiros.status, "Cancelado"),
          ),
        )
        .for("update");

      const saldoARestituir =
        Math.round(
          obrigacoes.reduce(
            (a, o) => a + Number(o.valorTotal) - Number(o.valorRestituido),
            0,
          ) * 100,
        ) / 100;
      const saldoARepassar =
        Math.round(
          recebimentos.reduce(
            (a, r) => a + Number(r.valorTotal) - Number(r.valorRepassado),
            0,
          ) * 100,
        ) / 100;

      const valor = valorCompensavel({ saldoARestituir, saldoARepassar });
      if (valor <= 0) {
        throw new Error(
          "Não há o que compensar: é preciso haver saldo nos DOIS lados (a restituir e a repassar).",
        );
      }

      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [comp] = await tx
        .insert(schema.compensacoes)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          terceiroId: input.terceiroId,
          valor: String(valor),
          data: input.data || null,
          saldoRestituirAntes: String(saldoARestituir),
          saldoRepassarAntes: String(saldoARepassar),
          obs: input.obs || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      // Abate os dois lados pelo mesmo valor, do mais antigo para o mais novo.
      let restante = valor;
      for (const o of obrigacoes) {
        if (restante <= 0.004) break;
        const saldo = Number(o.valorTotal) - Number(o.valorRestituido);
        if (saldo <= 0.004) continue;
        const abate = Math.min(saldo, restante);
        restante = Math.round((restante - abate) * 100) / 100;
        const novo = Number(o.valorRestituido) + abate;
        await tx
          .update(schema.despesaTerceiros)
          .set({
            valorRestituido: String(novo),
            status: statusRestituicao(Number(o.valorTotal), novo),
            obs: `${o.obs ?? ""}${o.obs ? " · " : ""}Compensado em ${numDoc}`,
          })
          .where(eq(schema.despesaTerceiros.id, o.id));
      }
      restante = valor;
      for (const r of recebimentos) {
        if (restante <= 0.004) break;
        const saldo = Number(r.valorTotal) - Number(r.valorRepassado);
        if (saldo <= 0.004) continue;
        const abate = Math.min(saldo, restante);
        restante = Math.round((restante - abate) * 100) / 100;
        const novo = Number(r.valorRepassado) + abate;
        await tx
          .update(schema.recebimentosTerceiros)
          .set({
            valorRepassado: String(novo),
            status:
              novo + 0.01 >= Number(r.valorTotal)
                ? "Repassado"
                : "Parcialmente repassado",
            obs: `${r.obs ?? ""}${r.obs ? " · " : ""}Compensado em ${numDoc}`,
          })
          .where(eq(schema.recebimentosTerceiros.id, r.id));
      }

      // Nenhum lançamento de caixa: compensar não move dinheiro.
      return { id: comp.id, numDoc, valor, saldoARestituir, saldoARepassar };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "compensacao.create",
      entity: "compensacao",
      entityId: out.id,
      meta: {
        numDoc: out.numDoc,
        valor: out.valor,
        saldoRestituirAntes: out.saldoARestituir,
        saldoRepassarAntes: out.saldoARepassar,
        // Explícito no log: RG-05 — compensação não transita pela DRE.
        impactoDre: 0,
        impactoCaixa: 0,
      },
    });
    revalidatePath("/restituicoes");
    return { ok: true, compensacaoId: out.id, numDoc: out.numDoc, valor: out.valor };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao compensar os saldos.",
    };
  }
}
```

### `src/lib/actions/restituicoes.ts`

Importado por: `/contaspagar`, `/restituicoes`.

```ts
"use server";

import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { statusRestituicao } from "@/lib/calc";
import { restituicaoCabe } from "@/lib/calc/restituicao";
import { validarCategoriaDespesa } from "@/lib/calc/natureza-dre";
import type { CategoriaDRE } from "@/lib/calc/constants";

/**
 * Busca uma despesa já lançada pelo número PED (§9).
 *
 * A busca é por NÚMERO, mas o vínculo devolvido é o **ID interno** da despesa —
 * é ele que amarra a obrigação ao lançamento original. O PED é apenas o rótulo
 * que o usuário conhece; nunca é alterado por este fluxo.
 */
export interface DespesaPorPed {
  id: string;
  numDoc: string | null;
  valor: number;
  competencia: string | null;
  vencimento: string | null;
  categoriaDre: string | null;
  contaCef: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  projectId: string;
  projectName: string;
  status: string | null;
  cancelado: boolean;
  pagoPorTerceiro: boolean;
  /** Obrigação já existente para esta despesa (não se cria uma segunda). */
  obrigacaoId: string | null;
  obrigacaoStatus: string | null;
}

export async function buscarDespesasPorPed(termo: string): Promise<DespesaPorPed[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "ver")) return [];
  const q = termo.trim();
  if (q.length < 2) return [];

  const rows = await db
    .select({
      d: schema.despesas,
      fornecedorNome: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      dtId: schema.despesaTerceiros.id,
      dtStatus: schema.despesaTerceiros.status,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .leftJoin(
      schema.despesaTerceiros,
      and(
        eq(schema.despesaTerceiros.despesaId, schema.despesas.id),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    )
    .where(
      and(
        eq(schema.despesas.tenantId, ctx.tenant.id),
        or(
          ilike(schema.despesas.numDoc, `%${q}%`),
          // Permite colar só o número ("70") ou o PED completo ("PED-000070").
          ilike(schema.despesas.obs, `%${q}%`),
        ),
      ),
    )
    .orderBy(desc(schema.despesas.createdAt))
    .limit(20);

  return rows.map((r) => ({
    id: r.d.id,
    numDoc: r.d.numDoc,
    valor: Number(r.d.valor),
    competencia: r.d.competencia,
    vencimento: r.d.vencimento,
    categoriaDre: r.d.categoriaDre,
    contaCef: r.d.contaCef,
    fornecedorId: r.d.fornecedorId,
    fornecedorNome: r.fornecedorNome,
    projectId: r.projectId,
    projectName: r.projectName,
    status: r.d.status,
    cancelado: r.d.cancelado,
    pagoPorTerceiro: r.d.pagoPorTerceiro,
    obrigacaoId: r.dtId,
    obrigacaoStatus: r.dtStatus,
  }));
}

export interface CriarObrigacaoResult {
  ok: boolean;
  error?: string;
  /** Obrigação criada OU a que já existia para o mesmo fato. */
  obrigacaoId?: string;
  /** true quando a obrigação já existia — a tela deve abri-la, não duplicar. */
  jaExistia?: boolean;
}

/**
 * Cria a OBRIGAÇÃO com quem desembolsou o dinheiro (§6–§11).
 *
 * Os quatro fatos ficam separados:
 *   1. a despesa existe (competência própria, 1× na DRE);
 *   2. um terceiro pagou o fornecedor (não houve saída de caixa da empresa);
 *   3. nasce uma obrigação da empresa com esse terceiro;
 *   4. a restituição — quando ocorrer — é a saída de caixa, em data própria.
 *
 * Dois modos:
 *   - `despesaId` informado → vincula-se a uma despesa JÁ LANÇADA (localizada
 *     pelo PED). O lançamento original NÃO é sobrescrito: valor, competência,
 *     vencimento, categoria, fornecedor e número PED permanecem como estão. A
 *     única marcação é `pagoPorTerceiro = true`, que impede a despesa de contar
 *     como saída de caixa na competência (ela já foi paga por outra pessoa).
 *   - sem `despesaId` → cria a despesa e a obrigação juntas, como antes.
 *
 * Tudo dentro de UMA transação (§16): ou existem despesa + obrigação, ou não
 * existe nenhuma das duas. `idempotencyKey` bloqueia o mesmo fato reenviado.
 */
export async function criarDespesaTerceiro(
  formData: FormData,
): Promise<CriarObrigacaoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "criar")) {
    return { ok: false, error: "Sem permissão para registrar despesas pagas por terceiros." };
  }
  if (ctx.version.locked) return { ok: false, error: "Versão congelada." };

  const s = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  const despesaId = s("despesaId");
  const idem = s("idempotencyKey");
  const pagadorTerceiroId = s("pagadorTerceiroId");
  const dataPagamentoOriginal = s("dataPagamentoOriginal");
  const dataPrevistaRestituicao = s("dataPrevistaRestituicao");
  const obs = s("obs");

  // Reenvio do MESMO fato (duplo clique, refresh, resubmit): devolve a
  // obrigação já criada em vez de criar outra.
  if (idem) {
    const [existente] = await db
      .select({ id: schema.despesaTerceiros.id })
      .from(schema.despesaTerceiros)
      .where(
        and(
          eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
          eq(schema.despesaTerceiros.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente) return { ok: true, obrigacaoId: existente.id, jaExistia: true };
  }

  try {
    const resultado = await db.transaction(async (tx) => {
      let despesaAlvo: typeof schema.despesas.$inferSelect;
      let valorObrigacao: string;

      if (despesaId) {
        // ── Modo vínculo por PED ──────────────────────────────────────────
        const [d] = await tx
          .select()
          .from(schema.despesas)
          .where(
            and(
              eq(schema.despesas.id, despesaId),
              eq(schema.despesas.tenantId, ctx.tenant.id),
            ),
          )
          .limit(1);
        // PED inexistente ou de outro tenant: bloqueia, não cria nada.
        if (!d) throw new Error("PED não encontrado. Confira o número informado.");
        if (d.cancelado)
          throw new Error(
            `O lançamento ${d.numDoc ?? ""} está cancelado e não pode receber uma obrigação de restituição.`.trim(),
          );
        if (Number(d.valor) <= 0)
          throw new Error("O lançamento tem valor zero — incompatível com uma restituição.");

        // Uma obrigação ATIVA por despesa (§16). Se já existe, devolve a
        // existente para a tela abri-la, em vez de criar a segunda.
        const [jaTem] = await tx
          .select({ id: schema.despesaTerceiros.id })
          .from(schema.despesaTerceiros)
          .where(
            and(
              eq(schema.despesaTerceiros.despesaId, d.id),
              ne(schema.despesaTerceiros.status, "Cancelado"),
            ),
          )
          .limit(1);
        if (jaTem) return { obrigacaoId: jaTem.id, jaExistia: true, despesaId: d.id };

        // Só a marcação de "pago por terceiro" muda no lançamento original.
        // Valor, competência, vencimento, categoria, fornecedor e PED ficam
        // exatamente como o usuário lançou.
        if (!d.pagoPorTerceiro) {
          await tx
            .update(schema.despesas)
            .set({ pagoPorTerceiro: true })
            .where(eq(schema.despesas.id, d.id));
        }
        despesaAlvo = d;
        valorObrigacao = String(d.valor);
      } else {
        // ── Modo despesa nova ─────────────────────────────────────────────
        // Item 4.6 / RG-01 — a despesa criada aqui é despesa como qualquer
        // outra: não pode nascer classificada em conta de natureza credora.
        const erroCat = validarCategoriaDespesa(formData.get("categoriaDre") as string);
        if (erroCat) throw new Error(erroCat);
        const valor = (formData.get("valor") as string) || "0";
        if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) {
          throw new Error("Informe um valor maior que zero para a despesa paga por terceiro.");
        }
        const numDoc = await reserveDespesaNumber(ctx.tenant.id);
        const [nova] = await tx
          .insert(schema.despesas)
          .values({
            versionId: ctx.version.id,
            tenantId: ctx.tenant.id,
            numDoc,
            fornecedorId: s("fornecedorId"),
            contaCef: s("contaCef"),
            categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
            competencia: s("competencia"),
            vencimento: dataPagamentoOriginal,
            valor,
            status: "Pago",
            obs,
            pagoPorTerceiro: true,
          })
          .returning();
        despesaAlvo = nova;
        valorObrigacao = valor;
      }

      const [dt] = await tx
        .insert(schema.despesaTerceiros)
        .values({
          tenantId: ctx.tenant.id,
          despesaId: despesaAlvo.id,
          pagadorTerceiroId,
          empresaResponsavelId: s("empresaResponsavelId") || ctx.project.id,
          valorTotal: valorObrigacao,
          // A data da restituição NÃO altera a competência da despesa: são
          // fatos distintos e a DRE continua reconhecendo pela competência
          // original do lançamento.
          dataPagamentoOriginal: dataPagamentoOriginal ?? despesaAlvo.vencimento,
          dataPrevistaRestituicao,
          status: "Aguardando restituição",
          obs,
          idempotencyKey: idem,
        })
        .returning();

      return { obrigacaoId: dt.id, jaExistia: false, despesaId: despesaAlvo.id };
    });

    if (!resultado.jaExistia) {
      await logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "despesaTerceiro.create",
        entity: "despesa_terceiro",
        entityId: resultado.obrigacaoId,
        meta: { despesaId: resultado.despesaId, vinculadoPorPed: !!despesaId },
      });
    }
    revalidatePath("/restituicoes");
    revalidatePath("/contaspagar");
    revalidatePath("/dre");
    return {
      ok: true,
      obrigacaoId: resultado.obrigacaoId,
      jaExistia: resultado.jaExistia,
    };
  } catch (e) {
    // Colisão no índice de idempotência = o mesmo fato chegou duas vezes em
    // paralelo. Não é erro para o usuário: devolve a obrigação que venceu.
    const msg = e instanceof Error ? e.message : "Falha ao registrar a obrigação.";
    if (idem && /idempotency|duplicate key|despesa_terceiro_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.despesaTerceiros.id })
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
            eq(schema.despesaTerceiros.idempotencyKey, idem),
          ),
        )
        .limit(1);
      if (existente) return { ok: true, obrigacaoId: existente.id, jaExistia: true };
    }
    if (/despesa_terceiro_despesa_ativa_uq/i.test(msg)) {
      return { ok: false, error: "Este lançamento já possui uma obrigação de restituição ativa." };
    }
    return { ok: false, error: msg };
  }
}

export interface RestituicaoInput {
  despesaTerceiroId: string;
  valor: number;
  dataRestituicao: string;
  bankAccountId?: string | null;
  comprovante?: string;
  obs?: string;
  /** Trava de reenvio (§16). Gerada pelo formulário, uma por tentativa real. */
  idempotencyKey?: string | null;
  /**
   * Item do extrato que pagou esta restituição (§14). Quando informado, a
   * restituição É a conciliação daquele lançamento: não se cria saída de caixa
   * nova (o extrato já a contém) nem nova despesa.
   */
  cashEntryId?: string | null;
}

export interface RestituicaoResult {
  ok: boolean;
  error?: string;
  restituicaoId?: string;
  jaExistia?: boolean;
}

/**
 * Registra uma restituição, parcial ou integral (§10, §12).
 *
 * O que ela faz: gera a SAÍDA de caixa da empresa na data efetiva e abate o
 * saldo devido ao terceiro.
 *
 * O que ela deliberadamente NÃO faz:
 *   - não cria despesa nova (a despesa já foi reconhecida na competência dela);
 *   - não altera a competência, o valor, o vencimento nem o status da despesa
 *     original — a data da restituição é um fato separado;
 *   - não duplica a saída de caixa quando o pagamento vem de um item do extrato
 *     já lançado (`cashEntryId`): nesse caso só vincula.
 *
 * Tudo em UMA transação e com chave de idempotência: duplo clique, reenvio de
 * formulário ou refresh não geram duas restituições.
 */
export async function registrarRestituicao(
  input: RestituicaoInput,
): Promise<RestituicaoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    return { ok: false, error: "Sem permissão para registrar restituições." };
  }
  const idem = input.idempotencyKey?.trim() || null;

  if (idem) {
    const [existente] = await db
      .select({ id: schema.restituicoes.id })
      .from(schema.restituicoes)
      .where(
        and(
          eq(schema.restituicoes.tenantId, ctx.tenant.id),
          eq(schema.restituicoes.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente) return { ok: true, restituicaoId: existente.id, jaExistia: true };
  }

  try {
    const restId = await db.transaction(async (tx) => {
      // SELECT ... FOR UPDATE: duas restituições simultâneas sobre a mesma
      // obrigação são serializadas, então a segunda enxerga o saldo já abatido
      // pela primeira e é recusada se não couber.
      const [dt] = await tx
        .select()
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.id, input.despesaTerceiroId),
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
          ),
        )
        .for("update")
        .limit(1);
      if (!dt) throw new Error("Obrigação não encontrada.");
      if (dt.status === "Cancelado") throw new Error("Obrigação cancelada.");

      const valor = Math.abs(input.valor);
      if (!(valor > 0)) throw new Error("Informe um valor maior que zero.");
      const saldo = Number(dt.valorTotal) - Number(dt.valorRestituido);
      if (!restituicaoCabe(Number(dt.valorTotal), Number(dt.valorRestituido), valor)) {
        throw new Error(
          `Valor acima do saldo devido (${saldo.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}). Ajuste o valor da restituição.`,
        );
      }

      // §14 — item do extrato já usado por outra restituição não pode ser
      // reaproveitado: geraria uma segunda baixa para o mesmo dinheiro.
      if (input.cashEntryId) {
        const [usado] = await tx
          .select({ id: schema.restituicoes.id })
          .from(schema.restituicoes)
          .where(eq(schema.restituicoes.cashEntryId, input.cashEntryId))
          .limit(1);
        if (usado)
          throw new Error("Este lançamento do extrato já foi vinculado a outra restituição.");
      }

      const [rest] = await tx
        .insert(schema.restituicoes)
        .values({
          tenantId: ctx.tenant.id,
          despesaTerceiroId: dt.id,
          valor: String(valor),
          dataRestituicao: input.dataRestituicao || null,
          bankAccountId: input.bankAccountId || null,
          comprovante: input.comprovante || null,
          obs: input.obs || null,
          cashEntryId: input.cashEntryId || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      const restituido = Number(dt.valorRestituido) + valor;
      await tx
        .update(schema.despesaTerceiros)
        .set({
          valorRestituido: String(restituido),
          status: statusRestituicao(Number(dt.valorTotal), restituido),
        })
        .where(eq(schema.despesaTerceiros.id, dt.id));

      if (input.cashEntryId) {
        // A saída já existe no extrato — só é marcada como conciliada. Criar um
        // cash_entry aqui duplicaria a saída de caixa (§16).
        await tx
          .update(schema.cashEntries)
          .set({ rec: true, cat: "restituicao" })
          .where(eq(schema.cashEntries.id, input.cashEntryId));
      } else {
        await tx.insert(schema.cashEntries).values({
          versionId: ctx.version.id,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataRestituicao || null,
          descricao: "Restituição a terceiro",
          valor: String(-valor),
          cat: "restituicao",
          rec: true,
        });
      }
      return rest.id;
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "restituicao.create",
      entity: "restituicao",
      entityId: restId,
      meta: {
        despesaTerceiroId: input.despesaTerceiroId,
        valor: Math.abs(input.valor),
        cashEntryId: input.cashEntryId ?? null,
      },
    });
    revalidatePath("/restituicoes");
    revalidatePath("/contaspagar");
    revalidatePath("/caixa");
    revalidatePath("/fluxocaixa");
    return { ok: true, restituicaoId: restId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar restituição.";
    if (idem && /duplicate key|restituicao_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.restituicoes.id })
        .from(schema.restituicoes)
        .where(
          and(
            eq(schema.restituicoes.tenantId, ctx.tenant.id),
            eq(schema.restituicoes.idempotencyKey, idem),
          ),
        )
        .limit(1);
      if (existente) return { ok: true, restituicaoId: existente.id, jaExistia: true };
    }
    return { ok: false, error: msg };
  }
}

/** Cancela uma restituição: estorna o valor e a saída de caixa (compensação). */
export async function cancelarRestituicao(restituicaoId: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "excluir")) {
    throw new Error("Sem permissão para cancelar restituições.");
  }
  const [rest] = await db
    .select()
    .from(schema.restituicoes)
    .where(
      and(
        eq(schema.restituicoes.id, restituicaoId),
        eq(schema.restituicoes.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!rest) throw new Error("Restituição não encontrada.");

  const [dt] = await db
    .select()
    .from(schema.despesaTerceiros)
    .where(eq(schema.despesaTerceiros.id, rest.despesaTerceiroId))
    .limit(1);
  if (!dt) throw new Error("Obrigação não encontrada.");

  const valor = Number(rest.valor);
  // Estorno em UMA transação: o saldo da obrigação, a remoção da restituição e
  // a compensação de caixa não podem ficar meio aplicados.
  await db.transaction(async (tx) => {
    const restituido = Math.max(0, Number(dt.valorRestituido) - valor);
    await tx
      .update(schema.despesaTerceiros)
      .set({
        valorRestituido: String(restituido),
        status: statusRestituicao(Number(dt.valorTotal), restituido),
      })
      .where(eq(schema.despesaTerceiros.id, dt.id));
    await tx.delete(schema.restituicoes).where(eq(schema.restituicoes.id, rest.id));

    if (rest.cashEntryId) {
      // A saída veio do extrato: desfaz apenas a conciliação. Lançar um estorno
      // aqui inventaria uma entrada que nunca aconteceu no banco.
      await tx
        .update(schema.cashEntries)
        .set({ rec: false })
        .where(eq(schema.cashEntries.id, rest.cashEntryId));
    } else {
      // Saída criada por nós — compensa com uma entrada de estorno.
      await tx.insert(schema.cashEntries).values({
        versionId: ctx.version.id,
        tenantId: ctx.tenant.id,
        bankAccountId: rest.bankAccountId,
        data: rest.dataRestituicao,
        descricao: "Estorno de restituição",
        valor: String(valor),
        cat: "ajuste",
        rec: true,
      });
    }
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "restituicao.cancel",
    entity: "restituicao",
    entityId: rest.id,
    meta: { despesaTerceiroId: dt.id, valor },
  });
  revalidatePath("/restituicoes");
  revalidatePath("/caixa");
}

export interface DespesaTerceiroView {
  id: string;
  numDoc: string | null;
  pagador: string | null;
  valorTotal: number;
  valorRestituido: number;
  saldoPendente: number;
  dataPagamentoOriginal: string | null;
  dataPrevistaRestituicao: string | null;
  status: string;
}

/** Lista as obrigações (paga por terceiro) da versão ativa, com pagador. */
export async function getDespesaTerceiros(
  tenantId: string,
  versionId: string,
): Promise<DespesaTerceiroView[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      pagador: schema.stakeholders.nome,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, tenantId),
        eq(schema.despesas.versionId, versionId),
      ),
    )
    .orderBy(desc(schema.despesaTerceiros.createdAt));
  return rows.map((r) => {
    const total = Number(r.dt.valorTotal);
    const rest = Number(r.dt.valorRestituido);
    return {
      id: r.dt.id,
      numDoc: r.numDoc,
      pagador: r.pagador,
      valorTotal: total,
      valorRestituido: rest,
      saldoPendente: Math.max(0, total - rest),
      dataPagamentoOriginal: r.dt.dataPagamentoOriginal,
      dataPrevistaRestituicao: r.dt.dataPrevistaRestituicao,
      status: r.dt.status,
    };
  });
}

/**
 * Obrigações com terceiros em aberto, no formato das linhas de Contas a Pagar
 * (§11).
 *
 * Uma obrigação NÃO é uma despesa nova: a despesa já foi reconhecida na
 * competência dela e aparece em Contas a Pagar como "Pago" (quem pagou foi o
 * terceiro). O que continua em aberto é a dívida da empresa COM o terceiro —
 * é isso que estas linhas representam, com o saldo ainda devido.
 *
 * Query própria, deliberadamente separada de `getContasPagar`: aquela alimenta
 * também Dashboard, Fechamento e a conciliação do extrato, cujo comportamento
 * não deve mudar.
 */
export interface ObrigacaoContaPagarRow {
  id: string;
  obrigacaoId: string;
  numDoc: string | null;
  terceiro: string | null;
  descricao: string;
  valorSaldo: number;
  dataPrevista: string | null;
  competencia: string | null;
  status: string;
  projectId: string;
  projectName: string;
}

export async function getObrigacoesTerceiroPendentes(
  tenantId: string,
): Promise<ObrigacaoContaPagarRow[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      competencia: schema.despesas.competencia,
      terceiro: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, tenantId),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    );

  return rows
    .map((r) => ({
      id: `obr:${r.dt.id}`,
      obrigacaoId: r.dt.id,
      numDoc: r.numDoc,
      terceiro: r.terceiro,
      descricao: `Restituir a ${r.terceiro ?? "terceiro"} — ref. ${r.numDoc ?? "lançamento"}`,
      valorSaldo:
        Math.round((Number(r.dt.valorTotal) - Number(r.dt.valorRestituido)) * 100) / 100,
      dataPrevista: r.dt.dataPrevistaRestituicao,
      competencia: r.competencia,
      status: r.dt.status,
      projectId: r.projectId,
      projectName: r.projectName,
    }))
    .filter((r) => r.valorSaldo > 0.004);
}

export interface SaldoTerceiroView {
  pagadorId: string | null;
  pagador: string;
  obrigacoes: number;
  valorTotal: number;
  valorRestituido: number;
  saldoDevido: number;
}

/**
 * Conta corrente de um terceiro (§13): todos os movimentos que formam o saldo.
 *
 * `desembolso` = o terceiro pagou um fornecedor pela empresa (aumenta a dívida).
 * `restituicao` = a empresa devolveu dinheiro a ele (diminui a dívida).
 *
 * Saldo devido = total desembolsado − total restituído.
 */
export interface MovimentoTerceiro {
  id: string;
  tipo: "desembolso" | "restituicao";
  data: string | null;
  descricao: string;
  numDoc: string | null;
  valor: number;
  /** Saldo devido acumulado APÓS este movimento. */
  saldoAcumulado: number;
}

export interface ContaCorrenteTerceiro {
  pagadorId: string | null;
  pagador: string;
  totalDesembolsado: number;
  totalRestituido: number;
  saldoDevido: number;
  movimentos: MovimentoTerceiro[];
}

/** "MM/DD/YYYY" → número comparável; sem data vai para o fim da ordenação. */
function ordData(d: string | null): number {
  const p = (d ?? "").split("/");
  if (p.length !== 3) return Number.MAX_SAFE_INTEGER;
  const n = Number(p[2]) * 10000 + Number(p[0]) * 100 + Number(p[1]);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Conta corrente completa de cada terceiro/sócio do tenant (§13).
 *
 * Escopo TENANT, não versão: a dívida com um sócio é da empresa e não some
 * porque o usuário trocou o projeto ativo na tela. Obrigações canceladas ficam
 * de fora do saldo, mas nada é apagado — o cancelamento é lógico.
 */
export async function getContaCorrenteTerceiros(
  tenantId: string,
): Promise<ContaCorrenteTerceiro[]> {
  const obrigacoes = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      pagadorId: schema.stakeholders.id,
      pagador: schema.stakeholders.nome,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(eq(schema.despesaTerceiros.tenantId, tenantId));

  const ativas = obrigacoes.filter((o) => o.dt.status !== "Cancelado");
  const idsAtivas = ativas.map((o) => o.dt.id);
  const rests = idsAtivas.length
    ? await db
        .select()
        .from(schema.restituicoes)
        .where(
          and(
            eq(schema.restituicoes.tenantId, tenantId),
            sql`${schema.restituicoes.despesaTerceiroId} IN ${idsAtivas}`,
          ),
        )
    : [];
  const obrigacaoPorId = new Map(ativas.map((o) => [o.dt.id, o]));

  const contas = new Map<string, ContaCorrenteTerceiro>();
  const chaveDe = (id: string | null) => id ?? "—";
  const abrir = (id: string | null, nome: string | null): ContaCorrenteTerceiro => {
    const k = chaveDe(id);
    let c = contas.get(k);
    if (!c) {
      c = {
        pagadorId: id,
        pagador: nome ?? "Não identificado",
        totalDesembolsado: 0,
        totalRestituido: 0,
        saldoDevido: 0,
        movimentos: [],
      };
      contas.set(k, c);
    }
    return c;
  };

  for (const o of ativas) {
    const c = abrir(o.pagadorId ?? null, o.pagador);
    c.totalDesembolsado += Number(o.dt.valorTotal);
    c.movimentos.push({
      id: o.dt.id,
      tipo: "desembolso",
      data: o.dt.dataPagamentoOriginal,
      descricao: "Pagamento a fornecedor pela empresa",
      numDoc: o.numDoc,
      valor: Number(o.dt.valorTotal),
      saldoAcumulado: 0,
    });
  }
  for (const r of rests) {
    const o = obrigacaoPorId.get(r.despesaTerceiroId);
    if (!o) continue;
    const c = abrir(o.pagadorId ?? null, o.pagador);
    c.totalRestituido += Number(r.valor);
    c.movimentos.push({
      id: r.id,
      tipo: "restituicao",
      data: r.dataRestituicao,
      descricao: r.cashEntryId ? "Restituição (conciliada no extrato)" : "Restituição",
      numDoc: o.numDoc,
      valor: Number(r.valor),
      saldoAcumulado: 0,
    });
  }

  for (const c of contas.values()) {
    c.movimentos.sort((a, b) => ordData(a.data) - ordData(b.data) || a.id.localeCompare(b.id));
    let acc = 0;
    for (const m of c.movimentos) {
      acc += m.tipo === "desembolso" ? m.valor : -m.valor;
      m.saldoAcumulado = Math.round(acc * 100) / 100;
    }
    c.totalDesembolsado = Math.round(c.totalDesembolsado * 100) / 100;
    c.totalRestituido = Math.round(c.totalRestituido * 100) / 100;
    c.saldoDevido = Math.round((c.totalDesembolsado - c.totalRestituido) * 100) / 100;
  }
  return [...contas.values()].sort((a, b) => b.saldoDevido - a.saldoDevido);
}

/**
 * Extrato CONSOLIDADO por terceiro/sócio: quanto a empresa deve a cada um,
 * quanto já foi restituído e o saldo remanescente.
 *
 * Até aqui só existia a visão por obrigação individual (uma linha por despesa),
 * sem nenhum lugar que respondesse "quanto ainda devo ao sócio X". Este saldo
 * NÃO é saldo bancário disponível da empresa — é obrigação com terceiros.
 */
export async function getSaldosPorTerceiro(
  tenantId: string,
  versionId: string,
): Promise<SaldoTerceiroView[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      pagadorId: schema.stakeholders.id,
      pagador: schema.stakeholders.nome,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, tenantId),
        eq(schema.despesas.versionId, versionId),
      ),
    );

  const porPagador = new Map<string, SaldoTerceiroView>();
  for (const r of rows) {
    if (r.dt.status === "Cancelado") continue;
    const chave = r.pagadorId ?? "—";
    const atual =
      porPagador.get(chave) ??
      ({
        pagadorId: r.pagadorId ?? null,
        pagador: r.pagador ?? "Não identificado",
        obrigacoes: 0,
        valorTotal: 0,
        valorRestituido: 0,
        saldoDevido: 0,
      } satisfies SaldoTerceiroView);
    atual.obrigacoes += 1;
    atual.valorTotal += Number(r.dt.valorTotal);
    atual.valorRestituido += Number(r.dt.valorRestituido);
    atual.saldoDevido = Math.max(0, atual.valorTotal - atual.valorRestituido);
    porPagador.set(chave, atual);
  }
  return [...porPagador.values()].sort((a, b) => b.saldoDevido - a.saldoDevido);
}

/** Saldo pendente de restituições por mês previsto (para o fluxo de caixa). */
export async function getRestituicoesPendentesByVersion(
  versionId: string,
): Promise<{ despesaIds: string[]; saidasPrevistas: Record<string, number> }> {
  const rows = await db
    .select({ dt: schema.despesaTerceiros, despesaId: schema.despesas.id })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesaTerceiros.dataPrevistaRestituicao));
  const saidas: Record<string, number> = {};
  const despesaIds: string[] = [];
  for (const r of rows) {
    despesaIds.push(r.despesaId);
    if (r.dt.status === "Cancelado") continue;
    const saldo = Number(r.dt.valorTotal) - Number(r.dt.valorRestituido);
    const p = (r.dt.dataPrevistaRestituicao ?? "").split("/");
    const mm = p.length === 3 ? `${p[0]}/${p[2]}` : null;
    if (mm && saldo > 0) saidas[mm] = (saidas[mm] || 0) + saldo;
  }
  return { despesaIds, saidasPrevistas: saidas };
}
```

