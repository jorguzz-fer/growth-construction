"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext, type Role } from "@/lib/context";
import {
  SCREENS,
  can,
  effectivePermissions,
  overridesDivergentes,
  validarMatriz,
  type PermMatrix,
} from "@/lib/permissions";
import { opcoesDoTenant } from "@/lib/membro-padrao";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/audit";

import { PAPEIS_CRIACAO, papelValido } from "@/lib/papeis";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Convida um membro para o tenant: garante o usuário (por e-mail) e cria o
 * vínculo com o papel. Sem envio de e-mail ainda — o registro fica pronto para
 * o fluxo de login do Auth.js. Apenas owner/admin podem convidar.
 */
async function invite(formData: FormData, fixedRole?: Role): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "usuarios", "criar")) return { ok: false, error: "Sem permissão." };

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const name = (formData.get("name") as string) || null;
  const password = ((formData.get("password") as string) || "").trim();
  const pedido = formData.get("role");
  // Criação nunca entrega owner direto (AI 3.1/3.5): promoção é pela linha.
  const role: Role =
    fixedRole ?? (papelValido(pedido) && PAPEIS_CRIACAO.includes(pedido) ? pedido : "membro");
  if (!email) return { ok: false, error: "Informe o e-mail." };

  // Senha inicial é opcional; informada, precisa de 8 caracteres. Antes, uma
  // senha curta criava o usuário SEM senha, sem erro (AI 1.4).
  if (password.length > 0 && password.length < 8) {
    return { ok: false, error: "A senha inicial precisa de no mínimo 8 caracteres." };
  }
  const passwordHash = password.length >= 8 ? hashPassword(password) : undefined;
  // Senha definida por outra pessoa é provisória (AI 1.1).
  const provisoria = passwordHash
    ? { mustChangePassword: true, passwordChangedAt: new Date() }
    : {};

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  const userId =
    existing?.id ??
    (
      await db
        .insert(schema.users)
        .values({ email, name, passwordHash, ...provisoria })
        .returning()
    )[0].id;

  // Usuário já existia e foi informada uma senha inicial → define a senha.
  if (existing && passwordHash) {
    await db
      .update(schema.users)
      .set({ passwordHash, ...provisoria })
      .where(eq(schema.users.id, userId));
  }

  await db
    .insert(schema.memberships)
    .values({ userId, tenantId: ctx.tenant.id, role })
    .onConflictDoUpdate({
      target: [schema.memberships.userId, schema.memberships.tenantId],
      set: { role },
    });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.invite",
    entity: "membership",
    entityId: userId,
    meta: { email, role },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function inviteMember(formData: FormData): Promise<ActionResult> {
  return invite(formData);
}

/** Lê o vínculo do membro alvo no tenant do contexto. */
async function lerVinculo(tenantId: string, userId: string) {
  const [m] = await db
    .select({ role: schema.memberships.role, permissions: schema.memberships.permissions })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, tenantId)))
    .limit(1);
  return m ?? null;
}

/** Chaves gravadas que não existem mais em `SCREENS` — preservadas (AJ 2.4). */
function chavesOrfas(perms: PermMatrix | null): PermMatrix {
  const ids = new Set(SCREENS.map((s) => s.id));
  const out: PermMatrix = {};
  for (const [k, v] of Object.entries(perms ?? {})) if (!ids.has(k)) out[k] = v;
  return out;
}

/** Diferença célula a célula entre duas matrizes efetivas, para o log. */
function mudancas(antes: PermMatrix, depois: PermMatrix) {
  const out: Record<string, { de: unknown; para: unknown }> = {};
  for (const s of SCREENS) {
    const a = antes[s.id];
    const d = depois[s.id];
    if (JSON.stringify(a) !== JSON.stringify(d)) out[s.id] = { de: a, para: d };
  }
  return out;
}

/**
 * Define os overrides de permissão granular (tela × ação) de um membro.
 *
 * Prompt AJ:
 *  - Parte 2 — grava SÓ as telas que divergem do padrão do papel; o resto
 *    volta a ser governado pelo papel. Chaves órfãs já gravadas ficam.
 *  - Parte 3 — ninguém edita a própria linha; owner/admin têm acesso total e
 *    não são configuráveis; Usuários/Acessos não se concedem por override.
 *  - Parte 4 — payload validado; devolve `{ ok, error }` em vez de falhar em
 *    silêncio.
 */
export async function setMemberPermissions(
  userId: string,
  permissions: PermMatrix,
): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "acessos", "editar")) {
    return { ok: false, error: "Sem permissão para editar acessos." };
  }
  if (userId === ctx.userId) {
    return { ok: false, error: "Ninguém edita as próprias permissões — peça a outro administrador." };
  }
  const erro = validarMatriz(permissions);
  if (erro) return { ok: false, error: erro };

  const alvo = await lerVinculo(ctx.tenant.id, userId);
  if (!alvo) return { ok: false, error: "Membro não encontrado nesta empresa." };
  const role = alvo.role as Role;
  if (role === "owner" || role === "admin") {
    return { ok: false, error: "Owner e admin têm acesso total — não há o que configurar." };
  }

  const opts = await opcoesDoTenant(ctx.tenant.id);
  const divergentes = overridesDivergentes(role, permissions, opts);
  const gravar: PermMatrix = { ...chavesOrfas(alvo.permissions), ...divergentes };
  const novo = Object.keys(gravar).length > 0 ? gravar : null;

  const antes = effectivePermissions(role, alvo.permissions, opts);
  const depois = effectivePermissions(role, novo, opts);
  const changes = mudancas(antes, depois);

  await db
    .update(schema.memberships)
    .set({ permissions: novo })
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
  if (Object.keys(changes).length > 0) {
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "membership.permissions",
      entity: "membership",
      entityId: userId,
      meta: { changes, telasPersonalizadas: Object.keys(divergentes).length },
    });
  }
  revalidatePath("/usuarios");
  revalidatePath("/acessos");
  return { ok: true };
}

/**
 * "Voltar ao padrão do papel" (AJ 2.3): descarta os overrides de UM membro,
 * por ação explícita e confirmada na tela. Nunca em lote. O log guarda a
 * matriz descartada. Chaves órfãs ficam (inertes).
 */
export async function resetMemberPermissions(userId: string): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "acessos", "editar")) {
    return { ok: false, error: "Sem permissão para editar acessos." };
  }
  if (userId === ctx.userId) {
    return { ok: false, error: "Ninguém edita as próprias permissões — peça a outro administrador." };
  }
  const alvo = await lerVinculo(ctx.tenant.id, userId);
  if (!alvo) return { ok: false, error: "Membro não encontrado nesta empresa." };
  if (!alvo.permissions) return { ok: true };

  const orfas = chavesOrfas(alvo.permissions);
  const novo = Object.keys(orfas).length > 0 ? orfas : null;
  await db
    .update(schema.memberships)
    .set({ permissions: novo })
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.permissions.reset",
    entity: "membership",
    entityId: userId,
    meta: { descartada: alvo.permissions },
  });
  revalidatePath("/usuarios");
  revalidatePath("/acessos");
  return { ok: true };
}

/**
 * Trava as linhas de vínculo do tenant e conta os owners DENTRO da transação
 * (AI 3.3). Sem o FOR UPDATE, dois rebaixamentos simultâneos passavam ambos
 * pela contagem e deixavam o tenant sem dono.
 */
async function ownersTravados(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: string,
) {
  const linhas = await tx
    .select({ userId: schema.memberships.userId, role: schema.memberships.role })
    .from(schema.memberships)
    .where(eq(schema.memberships.tenantId, tenantId))
    .for("update");
  return linhas;
}

/**
 * Troca o papel de um membro (AI, Parte 3).
 *  - 3.2 ninguém altera o próprio papel;
 *  - 3.3 a guarda do último owner roda em transação com as linhas travadas;
 *  - 3.4 quem troca decide o destino das telas personalizadas: manter ou
 *    voltar ao padrão do papel novo — nunca limpar em silêncio. Chaves órfãs
 *    ficam, como em "voltar ao padrão" da Gestão de Acessos.
 * A confirmação de promover a owner (3.1) é da tela.
 */
export async function changeRole(
  userId: string,
  role: Role,
  opcoes: { manterPersonalizacoes?: boolean } = {},
): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar"))
    return { ok: false, error: "Sem permissão." };
  if (!papelValido(role)) return { ok: false, error: "Papel inválido." };
  if (userId === ctx.userId)
    return { ok: false, error: "Ninguém altera o próprio papel — peça a outro owner." };
  const manter = opcoes.manterPersonalizacoes !== false;

  const r = await db.transaction(async (tx) => {
    const linhas = await ownersTravados(tx, ctx.tenant.id);
    const alvo = linhas.find((l) => l.userId === userId);
    if (!alvo) return { ok: false as const, error: "Membro não encontrado." };
    const owners = linhas.filter((l) => l.role === "owner").length;
    if (alvo.role === "owner" && role !== "owner" && owners <= 1) {
      return { ok: false as const, error: "O tenant precisa de pelo menos um owner." };
    }
    const [atual] = await tx
      .select({ permissions: schema.memberships.permissions })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, ctx.tenant.id)))
      .limit(1);
    const set: { role: Role; permissions?: PermMatrix | null } = { role };
    let descartada: PermMatrix | null = null;
    if (!manter && atual?.permissions) {
      const orfas = chavesOrfas(atual.permissions);
      set.permissions = Object.keys(orfas).length > 0 ? orfas : null;
      descartada = atual.permissions;
    }
    await tx
      .update(schema.memberships)
      .set(set)
      .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, ctx.tenant.id)));
    await logAudit(
      {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "membership.role",
        entity: "membership",
        entityId: userId,
        meta: {
          role,
          de: alvo.role,
          personalizacoes: atual?.permissions ? (manter ? "mantidas" : "descartadas") : "nenhuma",
          ...(descartada ? { descartada } : {}),
        },
      },
      tx,
    );
    return { ok: true as const };
  });
  if (!r.ok) return r;
  revalidatePath("/usuarios");
  revalidatePath("/acessos");
  return { ok: true };
}

/** Edita o nome de exibição de um membro. */
export async function updateMemberName(
  userId: string,
  name: string,
): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar"))
    return { ok: false, error: "Sem permissão." };

  // Garante que o alvo é membro deste tenant — mesmo padrão de
  // `resetMemberPassword`.
  //
  // `user` é tabela GLOBAL: o mesmo usuário pode pertencer a várias empresas.
  // Sem este filtro, um admin que soubesse o id renomeava usuário de OUTRA
  // empresa, porque o `where` batia só no id. A permissão `usuarios.editar`
  // não protegia nada aqui: ela é do tenant de quem edita, não do alvo.
  const [m] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!m) return { ok: false, error: "Membro não encontrado." };

  await db
    .update(schema.users)
    .set({ name: name.trim() || null })
    .where(eq(schema.users.id, userId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "user.rename",
    entity: "user",
    entityId: userId,
    meta: { name },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}

/**
 * Define/redefine a senha de um membro (admin). A troca só vale para membros
 * do próprio tenant. Mínimo de 8 caracteres.
 */
export async function resetMemberPassword(
  userId: string,
  password: string,
): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar"))
    return { ok: false, error: "Sem permissão." };
  if ((password ?? "").length < 8)
    return { ok: false, error: "A senha precisa de no mínimo 8 caracteres." };

  // Garante que o alvo é membro deste tenant.
  const [m] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!m) return { ok: false, error: "Membro não encontrado." };

  // Senha redefinida por outra pessoa: provisória (o dono troca no próximo
  // acesso) e as sessões abertas dessa conta deixam de valer (AI 1.1 e 1.3).
  await db
    .update(schema.users)
    .set({
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "user.password_reset",
    entity: "user",
    entityId: userId,
  });
  revalidatePath("/usuarios");
  return { ok: true };
}

/**
 * Remove o vínculo (membership) de um membro com o tenant. Não apaga o usuário
 * global (pode pertencer a outros tenants). Protege o último owner e impede a
 * auto-remoção.
 */
export async function removeMember(userId: string): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "usuarios", "excluir"))
    return { ok: false, error: "Sem permissão." };
  if (userId === ctx.userId)
    return { ok: false, error: "Você não pode remover a si mesmo." };

  // Guarda do último owner em transação, com as linhas travadas (AI 3.3).
  const r = await db.transaction(async (tx) => {
    const linhas = await ownersTravados(tx, ctx.tenant.id);
    const alvo = linhas.find((l) => l.userId === userId);
    if (!alvo) return { ok: false as const, error: "Membro não encontrado." };
    if (alvo.role === "owner" && linhas.filter((l) => l.role === "owner").length <= 1)
      return { ok: false as const, error: "O tenant precisa de pelo menos um owner." };
    await tx
      .delete(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.tenantId, ctx.tenant.id),
        ),
      );
    return { ok: true as const, role: alvo.role };
  });
  if (!r.ok) return r;
  const target = { role: r.role };

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.remove",
    entity: "membership",
    entityId: userId,
    meta: { role: target.role },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}
