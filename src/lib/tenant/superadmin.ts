/**
 * Super-admins da plataforma — operadores da Growth Tools que podem criar e
 * gerenciar contas (tenants). NÃO é um papel do tenant (owner/admin/…), e sim
 * um privilégio de plataforma, controlado por e-mail.
 *
 * Fonte: env `SUPERADMIN_EMAILS` (lista separada por vírgula). Se ausente, cai
 * no bootstrap com os operadores conhecidos (os mesmos admins do seed), para o
 * recurso já funcionar no deploy atual sem configuração extra.
 */
const BOOTSTRAP_SUPERADMINS = [
  "fer.jorge@gmail.com",
  "thiago.liberman@gmail.com",
];

export function superAdminEmails(): string[] {
  const env = process.env.SUPERADMIN_EMAILS;
  if (env && env.trim()) {
    return env
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  return BOOTSTRAP_SUPERADMINS;
}

export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.toLowerCase());
}
