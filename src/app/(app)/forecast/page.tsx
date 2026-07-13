import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";
import { LancamentoScreen } from "@/components/app/lancamento-screen";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "forecast", "ver")) return <AccessDenied />;
  return <LancamentoScreen ctx={ctx} kind="forecast" />;
}
