import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { abaInicial } from "@/lib/medicao-abas";
import { MedicaoDeObra, type ParamsDaMedicao } from "@/components/app/medicao-obra";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/**
 * Rota de lançamento da Medição de Obra (Prompt V, 0.2): abre a tela única
 * nas abas "Nova medição" (padrão) ou "Medições lançadas" (`?aba=lancadas`).
 * A rota continua existindo (permissão, links e revalidatePath apontam para
 * ela); o menu tem um item só.
 */
export default async function MedicaoLancamentoPage({ searchParams }: { searchParams: Promise<ParamsDaMedicao> }) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  if (!can(ctx.perms, "medicaolanc", "ver")) return <AccessDenied />;
  const sp = await searchParams;
  // 0.3 — a aba inicial nunca é uma aba sem permissão.
  const aba = abaInicial("/medicaolanc", ctx.perms, sp.aba);
  if (!aba) return <AccessDenied />;
  return <MedicaoDeObra ctx={ctx} sp={sp} aba={aba} />;
}
