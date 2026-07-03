import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getStakeholders } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/despesa-extract";
import { PAPEIS_STAKEHOLDER } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { FornecedorForm } from "@/components/app/fornecedor-form";

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

      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>Tipo</TH>
            <TH>Documento</TH>
            <TH>Papéis</TH>
          </tr>
        </THead>
        <tbody>
          {stakeholders.map((s) => (
            <TR key={s.id}>
              <TD className="font-medium text-[var(--color-ink)]">{s.nome}</TD>
              <TD>
                <Badge tone={s.tipo === "PJ" ? "info" : "neutral"}>{s.tipo}</Badge>
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">{s.doc || "—"}</TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {s.papeis.map((p) => (
                    <Badge key={p}>{p}</Badge>
                  ))}
                </div>
              </TD>
            </TR>
          ))}
          {stakeholders.length === 0 && (
            <TR>
              <TD colSpan={4} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum fornecedor cadastrado.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
