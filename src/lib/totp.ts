import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const ISSUER = "Growth Tools";

/** Gera um novo segredo TOTP em base32. */
export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secretBase32: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** otpauth:// URL para apps autenticadores. */
export function otpauthUrl(secretBase32: string, label: string): string {
  return totp(secretBase32, label).toString();
}

/** Data URL (PNG) do QR code para a URL otpauth. */
export async function qrDataUrl(secretBase32: string, label: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl(secretBase32, label));
}

/** Valida um código TOTP (janela ±1 período). */
export function verifyTotp(secretBase32: string, token: string): boolean {
  if (!token) return false;
  const delta = totp(secretBase32, "verify").validate({
    token: token.replace(/\s/g, ""),
    window: 1,
  });
  return delta !== null;
}
