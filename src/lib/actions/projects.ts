"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import {
  getActiveContext,
  ACTIVE_PROJECT_COOKIE,
  ACTIVE_VERSION_COOKIE,
} from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { DEFAULT_INCC } from "@/lib/calc/constants";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Versões padrão criadas junto com um projeto novo (ver seed.ts). */
const DEFAULT_VERSIONS = [
  { key: "budget", kind: "budget" as const, label: "Budget / Orçamento", color: "#6366f1", isDefault: false },
  { key: "forecast", kind: "forecast" as const, label: "Previsto / Forecast", color: "#10b981", isDefault: true },
  { key: "atual", kind: "atual" as const, label: "Atual — caixa real", color: "#f59e0b", isDefault: false },
];

type ProjectKind = "proj" | "office";
type ProjectStatus = "Em andamento" | "Planejamento";

/** Normaliza a duração (meses): inteiro positivo ou null. */
function normDuration(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const normStatus = (s: unknown): ProjectStatus =>
  s === "Em andamento" ? "Em andamento" : "Planejamento";

/** Normaliza um id de cliente vindo do formulário (vazio = próprio). */
const normClienteId = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};
const normDate = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/**
 * Cria um projeto (empreendimento) ou uma unidade/escritório (centro de custo)
 * com nome e duração e já provisiona as três versões padrão
 * (budget/forecast/atual) e a tabela INCC, de modo que todas as telas
 * vinculadas ao contexto funcionem imediatamente. O item criado passa a ser o
 * contexto ativo. `kind = "office"` cria matriz/filiais corporativas (sem
 * duração).
 */
export async function createProject(
  name: string,
  durationMonths: number | null,
  opts?: {
    kind?: ProjectKind;
    status?: ProjectStatus;
    startDate?: string | null;
    endDate?: string | null;
    clienteId?: string | null;
  },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "projeto", "criar")) {
    throw new Error("Sem permissão para criar projetos.");
  }
  const clean = (name || "").trim();
  if (!clean) throw new Error("Informe o nome do projeto.");

  const tenantId = ctx.tenant.id;
  const kind: ProjectKind = opts?.kind === "office" ? "office" : "proj";
  // Escritórios/unidades são centros de custo — não têm cronograma de obra.
  const duration = kind === "office" ? null : normDuration(durationMonths);
  const status = normStatus(opts?.status);

  const projectId = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(schema.projects)
      .values({
        tenantId,
        name: clean,
        kind,
        status,
        durationMonths: duration,
        startDate: kind === "office" ? null : normDate(opts?.startDate),
        endDate: kind === "office" ? null : normDate(opts?.endDate),
        clienteId: kind === "office" ? null : normClienteId(opts?.clienteId),
      })
      .returning();

    await tx
      .insert(schema.versions)
      .values(DEFAULT_VERSIONS.map((v) => ({ ...v, projectId: project.id, tenantId })));

    await tx.insert(schema.inccRates).values(
      DEFAULT_INCC.map((r, i) => ({
        projectId: project.id,
        tenantId,
        mes: r.m,
        monthly: r.mo.toString(),
        accumulated: r.ac.toString(),
        ordem: i,
      })),
    );

    return project.id;
  });

  // Torna o novo projeto o ativo (e reseta a versão para a default).
  const ck = await cookies();
  ck.set(ACTIVE_PROJECT_COOKIE, projectId, { path: "/", maxAge: ONE_YEAR });
  ck.delete(ACTIVE_VERSION_COOKIE);

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "project.create",
    entity: "project",
    entityId: projectId,
    meta: { name: clean, kind, status, durationMonths: duration },
  });
  revalidatePath("/", "layout");
}

/** Renomeia / ajusta a duração e o status de um projeto (ou escritório). */
export async function updateProject(
  projectId: string,
  patch: {
    name?: string;
    durationMonths?: number | null;
    status?: ProjectStatus;
    startDate?: string | null;
    endDate?: string | null;
    clienteId?: string | null;
  },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "projeto", "editar")) return;
  if (!ctx.projects.some((p) => p.id === projectId)) return;

  const set: {
    name?: string;
    durationMonths?: number | null;
    status?: ProjectStatus;
    startDate?: string | null;
    endDate?: string | null;
    clienteId?: string | null;
  } = {};
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim();
  if (patch.durationMonths !== undefined) set.durationMonths = normDuration(patch.durationMonths);
  if (patch.status !== undefined) set.status = normStatus(patch.status);
  if (patch.startDate !== undefined) set.startDate = normDate(patch.startDate);
  if (patch.endDate !== undefined) set.endDate = normDate(patch.endDate);
  if (patch.clienteId !== undefined) set.clienteId = normClienteId(patch.clienteId);
  if (Object.keys(set).length === 0) return;

  await db.update(schema.projects).set(set).where(eq(schema.projects.id, projectId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "project.update",
    entity: "project",
    entityId: projectId,
    meta: set,
  });
  revalidatePath("/", "layout");
}

/**
 * Exclui um projeto e, em cascata, todas as suas versões e dados de movimento.
 * Não é permitido excluir o último projeto do tenant (o contexto exige ao menos
 * um). Se o projeto ativo for excluído, a seleção volta para o primeiro.
 */
export async function deleteProject(projectId: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "projeto", "excluir")) return;
  const target = ctx.projects.find((p) => p.id === projectId);
  if (!target) return;
  if (ctx.projects.length <= 1) {
    throw new Error("É preciso manter ao menos um projeto ou unidade no tenant.");
  }

  await db.delete(schema.projects).where(eq(schema.projects.id, projectId));

  // Se o projeto excluído era o ativo, limpa os cookies (fallback p/ projects[0]).
  if (ctx.project.id === projectId) {
    const ck = await cookies();
    ck.delete(ACTIVE_PROJECT_COOKIE);
    ck.delete(ACTIVE_VERSION_COOKIE);
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "project.delete",
    entity: "project",
    entityId: projectId,
    meta: { name: target.name },
  });
  revalidatePath("/", "layout");
}
