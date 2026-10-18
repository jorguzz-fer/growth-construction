import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getDespesaSequence } from "@/lib/actions/numeracao";
import { ocupacaoDaFaixa } from "@/lib/db/numbering";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { NumeracaoForm } from "@/components/app/numeracao-form";
import { CrisDaTela } from "@/components/app/cris-contexto";

export const dynamic = "force-dynamic";

export default async function NumeracaoPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "numeracao", "ver")) return <AccessDenied />;

  const seq = await getDespesaSequence(ctx.tenant.id);
  const { maiorEmitido } = await ocupacaoDaFaixa(ctx.tenant.id, seq, seq.nextNumber);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Numeração de Despesas"
        subtitle="Sequência automática dos lançamentos — prefixo, dígitos e próximo número."
      />
      <CrisDaTela
        titulo="Numeração de Despesas"
        dados={{ prefixo: seq.prefix, usaPrefixo: seq.usePrefix, digitos: seq.digits, proximoNumero: seq.nextNumber, maiorEmitido }}
        sugestoes={["Sugira uma numeração para começar o ano", "O que acontece se eu recuar o próximo número?", "Quantos dígitos eu preciso?"]}
      />
      <NumeracaoForm
        initial={seq}
        canEdit={can(ctx.perms, "numeracao", "editar")}
        maiorEmitido={maiorEmitido}
      />
    </>
  );
}
