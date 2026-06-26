import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";

/*
 * Auth.js (NextAuth v5): login por credenciais (e-mail + senha) com segundo
 * fator TOTP opcional. Sessão por JWT (exigida pelo provider Credentials).
 * Inicialização lazy para o build não depender de env. Ver docs/STACK.md §2.
 */
export const { handlers, signIn, signOut, auth } = NextAuth(() => ({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
        totp: { label: "Código MFA", type: "text" },
      },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const [u] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!u || !u.passwordHash) return null;
        if (!verifyPassword(password, u.passwordHash)) return null;

        // Segundo fator, se habilitado.
        if (u.mfaEnabled) {
          const code = String(creds?.totp ?? "");
          if (!u.mfaSecret || !verifyTotp(u.mfaSecret, code)) return null;
        }
        return { id: u.id, email: u.email, name: u.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) (token as { uid?: string }).uid = user.id;
      return token;
    },
    session({ session, token }) {
      const uid = (token as { uid?: string }).uid;
      if (uid && session.user) {
        (session.user as { id?: string }).id = uid;
      }
      return session;
    },
  },
}));
