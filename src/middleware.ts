import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/*
 * Gate de autenticação (edge-safe): rotas do app exigem sessão. Faz apenas a
 * checagem de presença do cookie de sessão (redirect de UX); a validação real
 * do usuário/perfil acontece no servidor via getActiveContext().
 */
const PUBLIC_PATHS = ["/", "/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Expõe o pathname para o layout aplicar o controle de "Ver" por tela.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
