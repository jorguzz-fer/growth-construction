import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { PontoManager } from "@/components/app/ponto-manager";

export const dynamic = "force-dynamic";

export default async function PontoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "ponto", "ver")) return <AccessDenied />;

  const obras = ctx.projects
    .filter((p) => p.kind === "proj")
    .map((p) => ({
      id: p.id,
      nome: p.name,
      endereco: p.endereco ?? null,
      latitude: p.latitude != null ? String(p.latitude) : null,
      longitude: p.longitude != null ? String(p.longitude) : null,
      raio: p.pontoRaioMetros ?? 100,
    }));

  const rows = await db
    .select({
      e: schema.timeEntries,
      projectName: schema.projects.name,
    })
    .from(schema.timeEntries)
    .innerJoin(schema.projects, eq(schema.timeEntries.projectId, schema.projects.id))
    .where(eq(schema.timeEntries.tenantId, ctx.tenant.id))
    .orderBy(desc(schema.timeEntries.serverAt))
    .limit(300);

  const entries = rows.map((r) => ({
    id: r.e.id,
    projectId: r.e.projectId,
    projectName: r.projectName,
    funcionario: r.e.funcionario,
    tipo: r.e.tipo,
    data: r.e.data,
    hora: r.e.hora,
    distanciaMetros: r.e.distanciaMetros,
    dentroRaio: r.e.dentroRaio,
    temDespesa: r.e.despesaId != null,
  }));

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Controle de Ponto da Obra"
        subtitle="Registro georreferenciado de entrada/saída com validação de raio; apuração por período gera conta a pagar."
      />
      {obras.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink3)]">
          Cadastre ao menos uma obra (projeto) para usar o controle de ponto.
        </p>
      ) : (
        <PontoManager
          obras={obras}
          entries={entries}
          canConfig={can(ctx.perms, "ponto", "editar")}
        />
      )}
    </>
  );
}
