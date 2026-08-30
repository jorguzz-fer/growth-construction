import { NextResponse } from "next/server";
import { onlyDigits, phoneVariants, secretsMatch } from "@/lib/agent/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ECO — diagnóstico, não é endpoint de dado.
 *
 * Existe para responder UMA pergunta que a documentação da fazer.ai e a
 * experiência de campo respondem de forma contraditória: **quais variáveis de
 * contexto (`{{contact_phone}}` e afins) realmente chegam numa ferramenta
 * HTTP, e por qual canal?**
 *
 * O `tool_create` afirma que elas resolvem em url, query, headers e corpo.
 * Mas em 26/08 (cliente Alumine) ficou provado que **no corpo não chega nem
 * literal**: o mesmo JSON passava por curl e voltava 400 pela plataforma.
 * Esse teste nunca cobriu header nem query — que é exatamente onde a nossa
 * autenticação pretende ler o telefone.
 *
 * Então: aponte uma tool para cá com `{{contact_phone}}` em todos os canais,
 * chame no playground e leia o que voltou. O que estiver preenchido, funciona.
 *
 * Só o bearer é exigido — o objetivo é justamente ver requisição que ainda
 * não sabe se autenticar. Não devolve nenhum dado do banco, e o token vem
 * mascarado.
 */
export async function GET(req: Request) {
  return eco(req, null);
}

export async function POST(req: Request) {
  let corpo: unknown = null;
  try {
    corpo = await req.json();
  } catch {
    corpo = "<corpo ausente ou não-JSON>";
  }
  return eco(req, corpo);
}

function eco(req: Request, corpo: unknown) {
  const esperado = process.env.AGENT_API_TOKEN ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const tokenOk = Boolean(esperado) && secretsMatch(token, esperado);

  if (!tokenOk) {
    return NextResponse.json(
      { ok: false, codigo: "token_invalido", erro: "Token de agente inválido ou ausente." },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    // O bearer não volta no eco nem mascarado pela metade: só o comprimento.
    headers[k] = k.toLowerCase() === "authorization" ? `<${v.length} chars>` : v;
  }

  const telHeader = req.headers.get("x-agent-phone");
  const telQuery = url.searchParams.get("telefone");
  const bruto = telHeader ?? telQuery ?? "";

  return NextResponse.json({
    ok: true,
    diagnostico: {
      metodo: req.method,
      query: Object.fromEntries(url.searchParams.entries()),
      headers,
      corpo,
      telefone: {
        header: telHeader,
        query: telQuery,
        digitos: onlyDigits(bruto) || null,
        variantes: phoneVariants(bruto),
        // Se vier literalmente "{{contact_phone}}", a plataforma NÃO resolveu
        // a variável naquele canal — é o resultado que o teste procura.
        naoResolvido: /\{\{.*\}\}/.test(bruto),
      },
    },
  });
}
