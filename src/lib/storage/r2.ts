import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cliente Cloudflare R2 (S3-compatível) para o repositório de documentos do
 * módulo Despesas. Ver docs/STACK.md §2 (Storage) e §5 (variáveis).
 *
 * O upload é feito pelo cliente direto ao R2 via presigned URL — o arquivo não
 * passa pela aplicação. A leitura usa o domínio público do bucket (R2_PUBLIC_URL)
 * ou uma presigned URL de GET.
 */

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

let cached: S3Client | null = null;

function client(): S3Client {
  if (!isR2Configured()) {
    throw new Error("Cloudflare R2 não configurado (ver .env.example).");
  }
  if (!cached) {
    cached = new S3Client({
      region: process.env.R2_REGION || "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cached;
}

/** Upload direto de um objeto (usado para arquivos pequenos, ex.: logo). */
export async function putObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Presigned URL de upload (PUT). Válida por `expiresIn` segundos. */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 600,
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

/** URL de leitura: domínio público do bucket, ou presigned GET. */
export async function readUrl(key: string, expiresIn = 600): Promise<string> {
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
    { expiresIn },
  );
}
