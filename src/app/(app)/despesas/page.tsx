import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import {
  getChartAccounts,
  getDespesas,
  getStakeholders,
  getBankAccounts,
  getDocuments,
} from "@/lib/queries";
import { addDespesa, uploadDespesaDoc } from "@/lib/actions/despesas";
import { hasLevel } from "@/lib/permissions";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type Tab = "lancamentos" | "apagar" | "repositorio";
const TABS: { key: Tab; label: string }[] = [
  { key: "lancamentos", label: "Lançamentos" },
  { key: "apagar", label: "A Pagar" },
  { key: "repositorio", label: "Repositório" },
];

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "lancamentos";
  const canEdit = hasLevel(ctx.perms, "despesas", "edit");

  const [despesas, fornecedores, contas, bancos] = await Promise.all([
    getDespesas(ctx.version.id),
    getStakeholders(ctx.tenant.id),
    getChartAccounts(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
  ]);
  const fornById = new Map(fornecedores.map((f) => [f.id, f.nome]));
  const total = despesas.reduce((a, d) => a + Number(d.valor), 0);
  const contasOrdenadas = [...contas].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Lançamentos de Despesas"
        subtitle={`${despesas.length} lançamentos · total ${brl0(total)}`}
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
          {canEdit && (
            <Card className="mb-6">
              <CardContent className="p-5">
                <form action={addDespesa} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <Label>Fornecedor</Label>
                    <Select name="fornecedorId" defaultValue="">
                      <option value="">Selecione...</option>
                      {fornecedores.map((f) => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Conta CEF / Plano de Contas</Label>
                    <Select name="contaCef" defaultValue="">
                      <option value="">Selecione...</option>
                      {contasOrdenadas.map((c) => (
                        <option key={c.id} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Categoria DRE</Label>
                    <Select name="categoriaDre" defaultValue="Custo Variável">
                      {CATEGORIAS_DRE.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Banco</Label>
                    <Select name="bancoId" defaultValue="">
                      <option value="">—</option>
                      {bancos.map((b) => (
                        <option key={b.id} value={b.id}>{b.banco} · {b.tipo}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Competência</Label>
                    <Input name="competencia" placeholder="01/2026" />
                  </div>
                  <div>
                    <Label>Vencimento (MM/DD/YYYY)</Label>
                    <Input name="vencimento" placeholder="01/27/2026" />
                  </div>
                  <div>
                    <Label>Valor</Label>
                    <Input name="valor" type="number" step="0.01" placeholder="0" />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select name="status" defaultValue="A pagar">
                      <option>A pagar</option>
                      <option>Pago</option>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" className="w-full">Lançar despesa</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <DespesasTable rows={despesas} fornById={fornById} />
        </>
      )}

      {tab === "apagar" && (
        <DespesasTable
          rows={despesas
            .filter((d) => d.status !== "Pago")
            .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))}
          fornById={fornById}
          venc
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

function DespesasTable({
  rows,
  fornById,
  venc,
}: {
  rows: Awaited<ReturnType<typeof getDespesas>>;
  fornById: Map<string, string>;
  venc?: boolean;
}) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>{venc ? "Vencimento" : "Competência"}</TH>
          <TH>Fornecedor</TH>
          <TH>Conta CEF</TH>
          <TH>Cat. DRE</TH>
          <TH className="text-right">Valor</TH>
          <TH>Status</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map((d) => (
          <TR key={d.id}>
            <TD className="font-[family-name:var(--font-mono)]">
              {(venc ? d.vencimento : d.competencia) ?? "—"}
            </TD>
            <TD>{d.fornecedorId ? fornById.get(d.fornecedorId) ?? "—" : "—"}</TD>
            <TD><Badge tone="warning">{d.contaCef ?? "—"}</Badge></TD>
            <TD className="text-[var(--color-ink2)]">{d.categoriaDre ?? "—"}</TD>
            <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(Number(d.valor))}</TD>
            <TD><Badge tone={d.status === "Pago" ? "success" : "neutral"}>{d.status ?? "—"}</Badge></TD>
          </TR>
        ))}
        {rows.length === 0 && (
          <TR>
            <TD colSpan={6} className="py-6 text-center text-[var(--color-ink3)]">
              Nada por aqui nesta versão.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
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
            <form action={uploadDespesaDoc} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                <Label>Arquivo (NF/contrato, até 10 MB)</Label>
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
            <TH>Despesa vinculada</TH>
            <TH className="text-right">Tamanho</TH>
            <TH></TH>
          </tr>
        </THead>
        <tbody>
          {withUrls.map((d) => (
            <TR key={d.id}>
              <TD className="font-medium text-[var(--color-ink)]">{d.filename}</TD>
              <TD>
                {d.despesaId && despById.get(d.despesaId)
                  ? `${despById.get(d.despesaId)!.competencia ?? ""} · ${brl0(Number(despById.get(d.despesaId)!.valor))}`
                  : "—"}
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
              <TD colSpan={4} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum documento.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
