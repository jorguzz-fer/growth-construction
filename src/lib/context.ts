import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { auth } from "./auth";
import { effectivePermissions, type PermMatrix } from "./permissions";

export type Tenant = typeof schema.tenants.$inferSelect;
export type Project = typeof schema.projects.$inferSelect;
export type Version = typeof schema.versions.$inferSelect;

export type Role = "owner" | "admin" | "membro" | "contador" | "engenheiro";

export interface ActiveContext {
  tenant: Tenant;
  projects: Project[];
  project: Project;
  versions: Version[];
  version: Version;
  /** usuário "logado" (enquanto não há Auth.js ativo, o owner do tenant). */
  userId: string | null;
  /** e-mail do usuário logado (usado no gate de super-admin da plataforma). */
  userEmail: string | null;
  role: Role;
  /** permissões efetivas por tela × ação (role + overrides do membership). */
  perms: PermMatrix;
}

/** RBAC legado (mantido por compat): contador é somente-leitura. */
export function canEdit(role: Role): boolean {
  return role !== "contador";
}

export const ACTIVE_PROJECT_COOKIE = "gtc_project";
export const ACTIVE_VERSION_COOKIE = "gtc_version";

/**
 * Resolve o contexto ativo (tenant → projeto → versão) a partir dos cookies,
 * com fallback para o primeiro projeto e a versão default. Enquanto não há
 * autenticação (Fase 6), usa o primeiro tenant do banco. Retorna null se o
 * banco ainda não foi semeado.
 */
export async function getActiveContext(): Promise<ActiveContext | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const ck = await cookies();

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) return null;

  // Vínculos do usuário (multi-tenant); por ora usa o primeiro tenant.
  const memberships = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id))
    .orderBy(asc(schema.memberships.createdAt));
  if (memberships.length === 0) return null;
  const membership = memberships[0];

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, membership.tenantId))
    .limit(1);
  if (!tenant) return null;

  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.tenantId, tenant.id))
    .orderBy(asc(schema.projects.createdAt));
  if (projects.length === 0) return null;

  const wantedProject = ck.get(ACTIVE_PROJECT_COOKIE)?.value;
  const project = projects.find((p) => p.id === wantedProject) ?? projects[0];

  const versions = await db
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.projectId, project.id))
    .orderBy(asc(schema.versions.createdAt));

  // A versão de trabalho é sempre a "Atual" (não é mais selecionável na
  // sidebar). Budget e Forecast existem apenas nas telas dedicadas de
  // lançamento e na comparação dos relatórios.
  const version =
    versions.find((v) => v.kind === "atual") ??
    versions.find((v) => v.isDefault) ??
    versions[0];

  const role = membership.role as Role;
  return {
    tenant,
    projects,
    project,
    versions,
    version,
    userId: user.id,
    userEmail: user.email,
    role,
    perms: effectivePermissions(role, membership.permissions ?? null),
  };
}
