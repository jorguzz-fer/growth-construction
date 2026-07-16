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
