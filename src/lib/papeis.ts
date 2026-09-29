import type { Role } from "@/lib/context";

/**
 * A lista de papéis — uma só (AI 3.5). O formulário de criação e o seletor da
 * linha saíam de listas diferentes; agora os dois leem daqui.
 */
export const PAPEIS: Role[] = ["owner", "admin", "membro", "contador", "engenheiro"];

/** Papéis oferecidos ao criar usuário: owner só por promoção, com confirmação. */
export const PAPEIS_CRIACAO: Role[] = PAPEIS.filter((p) => p !== "owner");

export function papelValido(v: unknown): v is Role {
  return typeof v === "string" && (PAPEIS as string[]).includes(v);
}
