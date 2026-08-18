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
