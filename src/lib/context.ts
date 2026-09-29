import { cookies } from "next/headers";
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

export const ACTIVE_PROJECT_COOKIE = "gtc_project";
/**
 * @deprecated Sem leitor desde que a versão de trabalho passou a ser sempre a
 * "Atual": só `setActiveVersion` (sem chamadas) ainda grava. Um cookie de
 * versão de outro projeto, portanto, não altera nenhuma tela (Prompt A, 14).
 * Sai na PR final do Prompt A, junto com o cookie de projeto.
 */
export const ACTIVE_VERSION_COOKIE = "gtc_version";

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
 * Contexto da empresa, sem projeto implícito. Diferente de
 * `getActiveContext`, não exige que o tenant tenha projeto.
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
 * sem nenhuma, a mais antiga. É a MESMA regra que `getActiveContext` sempre
 * aplicou ao projeto do cookie — as telas migradas gravam onde gravavam.
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
 * @deprecated Prompt A: projeto e versão implícitos (cookie + primeiro
 * projeto). Use `getTenantContext` e resolva a obra explicitamente com
 * `lerSelecaoDeProjeto` + `getProjectContext`/`getProjectVersion`. Continua
 * funcionando, idêntico, enquanto houver tela não migrada; sai na PR final.
 *
 * Resolve o contexto ativo (tenant → projeto → versão) a partir do cookie,
 * com fallback para o primeiro projeto (ordem de criação) e a versão Atual.
 * Retorna null sem sessão válida ou se o tenant não tem projeto.
 */
export async function getActiveContext(): Promise<ActiveContext | null> {
  const s = await resolverSessao();
  if (!s) return null;

  const ck = await cookies();
  // Ordem de criação, como sempre foi: é dela que sai o `projects[0]` das
  // telas ainda não migradas. Reordenar aqui mudaria a obra que elas abrem.
  const projects = await projetosDoTenant(s.tenant.id);
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
  const version = versaoDeTrabalho(versions) as Version;

  return {
    tenant: s.tenant,
    projects,
    project,
    versions,
    version,
    userId: s.userId,
    userEmail: s.userEmail,
    role: s.role,
    perms: s.perms,
  };
}
