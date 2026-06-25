import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";

/*
 * Configuração base do Auth.js (NextAuth v5) com adapter Drizzle + Postgres.
 *
 * Na Fase 0 nenhum provider está habilitado ainda — o fluxo de login completo
 * (providers, papéis owner/admin/contador/membro, convites) entra na Fase 6.
 * Ver docs/STACK.md §2 (Autenticação) e §7 (Roadmap).
 *
 * Para habilitar, por exemplo, login por e-mail/OAuth, adicione o provider em
 * `providers` e configure os secrets correspondentes nas variáveis de ambiente.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
  },
  providers: [
    // Ex. (Fase 6):
    // Resend({ from: process.env.EMAIL_FROM }),
    // Google({ clientId: ..., clientSecret: ... }),
  ],
});
