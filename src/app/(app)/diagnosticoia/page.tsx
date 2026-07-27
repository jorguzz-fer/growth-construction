import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AiDiagnosticPanel } from "@/components/app/ai-diagnostic-panel";

export const dynamic = "force-dynamic";

export default async function DiagnosticoIaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "diagnosticoia", "ver")) return null;

  return (
    <>
      <PageHeader title="Diagnóstico de IA" />
      <AiDiagnosticPanel />
    </>
  );
}
