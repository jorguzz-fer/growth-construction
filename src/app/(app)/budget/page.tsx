import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";
import { LancamentoScreen } from "@/components/app/lancamento-screen";

export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "budget", "ver")) return <AccessDenied />;
  const sp = await searchParams;
  return <LancamentoScreen ctx={ctx} kind="budget" proj={sp.proj} />;
}
