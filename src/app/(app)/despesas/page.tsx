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
import { Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { DespesaForm } from "@/components/app/despesa-form";
import { DespesasTable, type DespesaDTO } from "@/components/app/despesas-table";
import { DespesaSearch } from "@/components/app/despesa-search";
import { ordenarLancamentos } from "@/lib/despesas-ordering";
import { ParcelasList } from "@/components/app/parcelas-list";
import { getParcelasByVersion } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Tab = "lancamentos" | "apagar" | "parcelas" | "repositorio";
const TABS: { key: Tab; label: string }[] = [
  { key: "lancamentos", label: "Lançamentos" },
  { key: "apagar", label: "A Pagar" },
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
  const canEditNumero = ctx.role === "owner" || ctx.role === "admin";
  const aiConfigured = isAiConfigured();
  const r2Configured = isR2Configured();

  // Sem "projeto ativo": o projeto é escolhido no seletor (?proj=); "all" mostra
  // a consulta consolidada (todos os projetos/filiais) com coluna Origem.
  const isAll = sp.proj === "all";
  const project = ctx.projects.find((p) => p.id === sp.proj) ?? ctx.projects[0];
  const version = await getAtualVersion(ctx.tenant.id, project.id);
  const versionId = version?.id ?? ctx.version.id;

  const [despesasRaw, fornecedores, contas, bancos, socios] = await Promise.all([
    isAll ? getDespesasByTenant(ctx.tenant.id) : getDespesas(versionId),
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
    canEditNumero,
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

      <div className="mb-5 flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/despesas?tab=${t.key}`}
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
          <div className="mb-3 flex justify-end">
            <DespesaSearch rows={despesas.map(toDTO)} fornecedores={fornecedores} />
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
  const docs = await getDocuments(tenantId);
  const withUrls = r2
    ? await Promise.all(
        docs.map(async (d) => ({ ...d, url: await readUrl(d.storageKey) })),
      )
    : docs.map((d) => ({ ...d, url: null as string | null }));
  const despById = new Map(despesas.map((d) => [d.id, d]));

  return (
    <>
      {canEdit && r2 && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <form action={uploadDespesaDoc} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <Label>Despesa (opcional)</Label>
                <Select name="despesaId" defaultValue="">
                  <option value="">— sem vínculo —</option>
                  {despesas.map((d) => (
                    <option key={d.id} value={d.id}>
                      {(d.competencia ?? "") + " · " + (d.fornecedorId ? fornById.get(d.fornecedorId) ?? "" : "") + " · " + brl0(Number(d.valor))}
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
              <div>
                <Label>Arquivo (até 10 MB)</Label>
                <input type="file" name="file" className="text-xs" required />
              </div>
              <div className="flex items-end">
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

      <Table>
        <THead>
          <tr>
            <TH>Arquivo</TH>
            <TH>Tipo</TH>
            <TH>Despesa vinculada</TH>
            <TH>Enviado por</TH>
            <TH>Enviado em</TH>
            <TH className="text-right">Tamanho</TH>
            <TH></TH>
          </tr>
        </THead>
        <tbody>
          {withUrls.map((d) => (
            <TR key={d.id}>
              <TD className="font-medium text-[var(--color-ink)]">{d.filename}</TD>
              <TD className="text-[var(--color-ink2)]">{d.tipo ?? "—"}</TD>
              <TD>
                {d.despesaId && despById.get(d.despesaId)
                  ? `${despById.get(d.despesaId)!.competencia ?? ""} · ${brl0(Number(despById.get(d.despesaId)!.valor))}`
                  : "—"}
              </TD>
              <TD className="text-[var(--color-ink3)]">{d.uploadedBy ?? "—"}</TD>
              <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString("pt-BR") : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {d.size ? `${(d.size / 1024).toFixed(0)} KB` : "—"}
              </TD>
              <TD className="text-right">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener" className="text-sm text-[var(--color-accent2)] hover:underline">
                    Abrir
                  </a>
                ) : null}
              </TD>
            </TR>
          ))}
          {withUrls.length === 0 && (
            <TR>
              <TD colSpan={7} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum documento.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
