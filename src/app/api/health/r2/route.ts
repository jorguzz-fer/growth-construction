import { NextResponse } from "next/server";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getTenantContext } from "@/lib/context";
import { isR2Configured, putObject, readUrl } from "@/lib/storage/r2";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico da conexão com o Cloudflare R2. Faz um round-trip completo
 * (PUT → GET → DELETE) de um objeto de teste e reporta o resultado de cada
 * etapa. Serve para validar as variáveis de ambiente logo após o deploy, sem
 * precisar tentar um upload real "no escuro".
 *
 * Protegido: exige sessão de owner/admin (não expõe nada a anônimos).
 */
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  }
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ ok: false, error: "sem permissão" }, { status: 403 });
  }

  const configured = isR2Configured();
  const steps: Record<string, string> = {};
  const env = {
    R2_ENDPOINT: mask(process.env.R2_ENDPOINT),
    R2_BUCKET: process.env.R2_BUCKET ?? null,
    R2_ACCESS_KEY_ID: mask(process.env.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ? "definido" : null,
    R2_REGION: process.env.R2_REGION ?? "auto (default)",
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL ?? null,
  };

  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error:
          "R2 não configurado — faltam variáveis obrigatórias (endpoint, bucket, access key, secret).",
        env,
      },
      { status: 503 },
    );
  }

  // key temporária no bucket: hash estável do tenant + sufixo por tentativa
  // (Prompt AH, 5.4 — dois testes simultâneos do mesmo tenant não colidem).
  const key = `_healthcheck/${ctx.tenant.id}-${key6(ctx.tenant.id)}-${Date.now().toString(36)}${key6(String(process.hrtime.bigint()))}.txt`;
  const body = Buffer.from("growth-tools r2 healthcheck", "utf8");
  // Prompt AH, 5.2 — o resultado do teste REAL fica registrado (data + etapa)
  // para a tela mostrar ao lado do selo; o selo só fica verde depois disto.
  const registrar = (ok: boolean, stage?: string) =>
    logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "tenant.r2.health", entity: "tenant", entityId: ctx.tenant.id, meta: { ok, stage: stage ?? null } }).catch(() => {});

  try {
    await putObject(key, body, "text/plain");
    steps.put = "ok";
  } catch (e) {
    steps.put = "falhou";
    await registrar(false, "put");
    return NextResponse.json(
      { ok: false, configured: true, stage: "put", error: msg(e), steps, env },
      { status: 502 },
    );
  }

  try {
    const url = await readUrl(key, 60);
    const res = await fetch(url);
    steps.get = res.ok
      ? "ok"
      : `falhou (HTTP ${res.status})`;
    if (!res.ok) throw new Error(`GET retornou HTTP ${res.status}`);
  } catch (e) {
    steps.get = "falhou";
    await tryDelete(key);
    await registrar(false, "get");
    return NextResponse.json(
      { ok: false, configured: true, stage: "get", error: msg(e), steps, env },
      { status: 502 },
    );
  }

  await tryDelete(key, steps);
  await registrar(true);

  return NextResponse.json({ ok: true, configured: true, steps, env });
}

function tryDelete(key: string, steps?: Record<string, string>) {
  return (async () => {
    try {
      const s3 = new S3Client({
        region: process.env.R2_REGION || "auto",
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });
      await s3.send(
        new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
      );
      if (steps) steps.delete = "ok";
    } catch (e) {
      if (steps) steps.delete = `falhou: ${msg(e)}`;
    }
  })();
}

function mask(v?: string | null): string | null {
  if (!v) return null;
  if (v.length <= 12) return `${v.slice(0, 3)}…`;
  return `${v.slice(0, 8)}…${v.slice(-4)}`;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** sufixo curto e estável derivado do id do tenant (sem Math.random). */
function key6(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}
