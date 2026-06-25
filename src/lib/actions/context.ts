"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_PROJECT_COOKIE, ACTIVE_VERSION_COOKIE } from "@/lib/context";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setActiveVersion(versionId: string) {
  const ck = await cookies();
  ck.set(ACTIVE_VERSION_COOKIE, versionId, { path: "/", maxAge: ONE_YEAR });
  revalidatePath("/", "layout");
}

export async function setActiveProject(projectId: string) {
  const ck = await cookies();
  ck.set(ACTIVE_PROJECT_COOKIE, projectId, { path: "/", maxAge: ONE_YEAR });
  // Troca de projeto reseta a versão ativa (será resolvida pela default).
  ck.delete(ACTIVE_VERSION_COOKIE);
  revalidatePath("/", "layout");
}
