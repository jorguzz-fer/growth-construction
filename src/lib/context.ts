import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { auth } from "./auth";
import { effectivePermissions, type PermMatrix } from "./permissions";
import { opcoesDoTenant } from "./membro-padrao";
import { ordenarProjetos } from "./projeto-selecao";

export type Tenant = typeof schema.tenants.$inferSelect;
export type Project = typeof schema.projects.$inferSelect;
export type Version = typeof schema.versions.$inferSelect;

export type Role = "owner" | "admin" | "membro" | "contador" | "engenheiro";

/**
 * A sessão foi aberta antes da última troca/redefinição de senha (AI 1.3)?
 * Sem troca registrada, nenhuma sessão é revogada — é o estado de todos no
 * deploy. Sessão sem instante de login (emitida antes deste código) cai assim
 * que houver uma troca.
 */
export function sessaoRevogada(
  passwordChangedAt: Date | null | undefined,
  authAt: number | null | undefined,
): boolean {
  if (!passwordChangedAt) return false;
  if (!authAt) return true;
  return authAt < passwordChangedAt.getTime();
}

/** RBAC legado (mantido por compat): contador é somente-leitura. */
export function canEdit(role: Role): boolean {
  return role !== "contador";
}

/**
 * Contexto só de empresa (Prompt A, 10): quem é o usuário, em que tenant, com
 * que papel e permissões, e quais projetos existem. NÃO escolhe projeto.
 */
export interface TenantContext {
  tenant: Tenant;
  /** Projetos do tenant em ordem estável (obras por número, filiais no fim). */
  projects: Project[];
  userId: string;
  userEmail: string | null;
  role: Role;
  perms: PermMatrix;
}

interface Sessao {
  tenant: Tenant;
  userId: string;
  userEmail: string | null;
  role: Role;
  perms: PermMatrix;
}

/** Usuário da sessão → vínculo → tenant → papel e permissões. */
async function resolverSessao(): Promise<Sessao | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) return null;
  if (sessaoRevogada(user.passwordChangedAt, (session as { authAt?: number } | null)?.authAt)) {
    return null;
  }

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

  const role = membership.role as Role;
  return {
    tenant,
    userId: user.id,
    userEmail: user.email,
    role,
    perms: effectivePermissions(role, membership.permissions ?? null, opcoesDoTenant(tenant.id)),
  };
}

async function projetosDoTenant(tenantId: string): Promise<Project[]> {
  return db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.tenantId, tenantId))
    .orderBy(asc(schema.projects.createdAt));
}

/**
 * Contexto da empresa, sem projeto implícito (Prompt A, 10): não existe
 * mais projeto ativo global. Não exige que o tenant tenha projeto.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const s = await resolverSessao();
  if (!s) return null;
  return { ...s, projects: ordenarProjetos(await projetosDoTenant(s.tenant.id)) };
}

/**
 * O projeto `projectId`, SE pertencer ao tenant `tenantId` (Prompt A, 11 e
 * 38). O tenant é obrigatório de propósito: esquecê-lo vira erro de
 * compilação, não vazamento. Nunca devolve outro projeto no lugar.
 */
export async function getProjectContext(
  tenantId: string,
  projectId: string,
): Promise<Project | null> {
  if (!tenantId || !projectId) return null;
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.tenantId, tenantId)))
    .limit(1);
  return p ?? null;
}

export type VersaoRef = { id: string } | { kind: Version["kind"] };

/**
 * A versão pedida, validando a cadeia tenant → projeto → versão (Prompt A,
 * 13): uma versão do projeto A nunca é aceita com o projeto B. Por `kind`,
 * a mais antiga daquele tipo (mesma regra de `getAtualVersion`). Sem a
 * versão, null — não cai em outra versão nem em outro tipo.
 */
export async function getProjectVersion(
  tenantId: string,
  projectId: string,
  ref: VersaoRef,
): Promise<Version | null> {
  if (!tenantId || !projectId) return null;
  const filtroRef =
    "id" in ref ? eq(schema.versions.id, ref.id) : eq(schema.versions.kind, ref.kind);
  const [v] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.tenantId, tenantId),
        eq(schema.versions.projectId, projectId),
        filtroRef,
      ),
    )
    .orderBy(asc(schema.versions.createdAt))
    .limit(1);
  return v ?? null;
}

/**
 * Versão de trabalho de um projeto: a "Atual"; sem ela, a marcada como padrão;
 * sem nenhuma, a mais antiga. É a mesma regra que o antigo "projeto ativo"
 * aplicava à obra do cookie — as telas migradas gravam onde gravavam.
 * `versions` em ordem de criação.
 */
export function versaoDeTrabalho<V extends { kind: string; isDefault: boolean }>(
  versions: readonly V[],
): V | null {
  return (
    versions.find((v) => v.kind === "atual") ??
    versions.find((v) => v.isDefault) ??
    versions[0] ??
    null
  );
}

/**
 * Versões de um projeto do tenant (ordem de criação) e a versão de trabalho.
 * Null se o projeto não for do tenant. Tenant obrigatório (seção 11).
 */
export async function getProjectVersions(
  tenantId: string,
  projectId: string,
): Promise<{ project: Project; versions: Version[]; trabalho: Version | null } | null> {
  const project = await getProjectContext(tenantId, projectId);
  if (!project) return null;
  const versions = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.tenantId, tenantId), eq(schema.versions.projectId, project.id)))
    .orderBy(asc(schema.versions.createdAt));
  return { project, versions, trabalho: versaoDeTrabalho(versions) };
}

/**
 * A versão `versionId` do tenant, com a obra dela e as versões irmãs (Prompt
 * A, 13). Para ações que recebem só a versão: a obra sai da própria versão,
 * nunca do cookie. Null se a versão não for do tenant.
 */
export async function getVersionContext(
  tenantId: string,
  versionId: unknown,
): Promise<{ project: Project; versions: Version[]; version: Version } | null> {
  if (!tenantId || typeof versionId !== "string" || !versionId) return null;
  const [v] = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.tenantId, tenantId)))
    .limit(1);
  if (!v) return null;
  const r = await getProjectVersions(tenantId, v.projectId);
  if (!r) return null;
  const version = r.versions.find((x) => x.id === v.id);
  return version ? { project: r.project, versions: r.versions, version } : null;
}

/**
 * Versão de trabalho da obra que a TELA informou (Prompt A) — para gravações
 * que antes caíam em `ctx.version`. Aceita o valor cru do formulário/input;
 * null se vazio, se a obra não for do tenant ou se ela não tiver versões.
 */
export async function getWorkingVersion(
  tenantId: string,
  projectId: unknown,
): Promise<Version | null> {
  if (typeof projectId !== "string" || !projectId) return null;
  return (await getProjectVersions(tenantId, projectId))?.trabalho ?? null;
}
