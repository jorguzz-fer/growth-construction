import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { effectivePermissions, type AccessLevel } from "./permissions";

export type Tenant = typeof schema.tenants.$inferSelect;
export type Project = typeof schema.projects.$inferSelect;
export type Version = typeof schema.versions.$inferSelect;

export type Role = "owner" | "admin" | "membro" | "contador";

export interface ActiveContext {
  tenant: Tenant;
  projects: Project[];
  project: Project;
  versions: Version[];
  version: Version;
  /** usuário "logado" (enquanto não há Auth.js ativo, o owner do tenant). */
  userId: string | null;
  role: Role;
  /** permissões efetivas por seção (role + overrides do membership). */
  perms: Record<string, AccessLevel>;
}

/** RBAC: contador é somente-leitura; os demais podem editar. */
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
  const ck = await cookies();

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .orderBy(asc(schema.tenants.createdAt))
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

  const wantedVersion = ck.get(ACTIVE_VERSION_COOKIE)?.value;
  const version =
    versions.find((v) => v.id === wantedVersion) ??
    versions.find((v) => v.isDefault) ??
    versions[0];

  // Usuário atual: enquanto o login (Auth.js) não está ativo, assume o owner.
  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.tenantId, tenant.id))
    .orderBy(asc(schema.memberships.createdAt));

  const role = (membership?.role as Role) ?? "owner";
  return {
    tenant,
    projects,
    project,
    versions,
    version,
    userId: membership?.userId ?? null,
    role,
    perms: effectivePermissions(role, membership?.permissions ?? null),
  };
}
