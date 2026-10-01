import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { abaInicial } from "@/lib/medicao-abas";
import { MedicaoDeObra, type ParamsDaMedicao } from "@/components/app/medicao-obra";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/**
 * Rota do Relatório CEF (Prompt V, 0.2): abre a tela única de Medição de
 * Obra na aba "Relatório CEF". Quem não tem `medicao.ver` (o engenheiro, 17c)
 * recebe "Acesso negado" — aqui e na guarda central do layout — e nunca vê
 * o relatório, nem por `?aba=`, nem por URL direta; o item do menu dele já
 * aponta para /medicaolanc (`hrefAlt` em nav-menu.ts).
 */
export default async function MedicaoPage({ searchParams }: { searchParams: Promise<ParamsDaMedicao> }) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  if (!can(ctx.perms, "medicao", "ver")) return <AccessDenied />;
  const sp = await searchParams;
  const aba = abaInicial("/medicao", ctx.perms, sp.aba);
  if (!aba) return <AccessDenied />;
  return <MedicaoDeObra ctx={ctx} sp={sp} aba={aba} />;
}
