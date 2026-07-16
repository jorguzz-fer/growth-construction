"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { getAtualVersion } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";

/** Distância entre dois pontos (graus) em metros — fórmula de haversine. */
function haversineMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Cadastra/atualiza a localização e o raio permitido de uma obra. */
export async function updateObraLocation(
  projectId: string,
  patch: { endereco?: string | null; latitude?: string; longitude?: string; raio?: number },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "ponto", "editar")) {
    throw new Error("Sem permissão para configurar a obra.");
  }
  if (!ctx.projects.some((p) => p.id === projectId)) return;
  const set: Partial<typeof schema.projects.$inferInsert> = {};
  if (patch.endereco !== undefined) set.endereco = patch.endereco?.trim() || null;
  if (patch.latitude !== undefined)
    set.latitude = patch.latitude?.toString().trim() ? patch.latitude : null;
  if (patch.longitude !== undefined)
    set.longitude = patch.longitude?.toString().trim() ? patch.longitude : null;
  if (patch.raio !== undefined)
    set.pontoRaioMetros = Number.isFinite(patch.raio) && patch.raio! > 0 ? Math.round(patch.raio!) : 100;
  if (Object.keys(set).length === 0) return;
  await db.update(schema.projects).set(set).where(eq(schema.projects.id, projectId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "obra.location.update",
    entity: "project",
    entityId: projectId,
    meta: set,
  });
  revalidatePath("/ponto");
}

export interface RegistrarPontoInput {
  projectId: string;
  tipo: "entrada" | "saida";
  latitude: number;
  longitude: number;
  precisaoMetros?: number;
  dispositivo?: string;
  justificativa?: string;
}

export interface RegistrarPontoResult {
  ok: boolean;
  distanciaMetros: number | null;
  raio: number;
  dentroRaio: boolean;
  message: string;
}

/**
 * Registra entrada/saída de ponto. Usa o relógio do SERVIDOR (não confia no
 * dispositivo) e valida o geofence: só aceita dentro do raio permitido, salvo
 * quando um gestor (permissão de editar) informa justificativa.
 */
export async function registrarPonto(
  input: RegistrarPontoInput,
): Promise<RegistrarPontoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "ponto", "criar")) {
    throw new Error("Sem permissão para registrar ponto.");
  }
  const [obra] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!obra) throw new Error("Obra não encontrada.");

  const raio = obra.pontoRaioMetros ?? 100;
  let distancia: number | null = null;
  if (obra.latitude != null && obra.longitude != null) {
    distancia = haversineMetros(
      Number(obra.latitude),
      Number(obra.longitude),
      input.latitude,
      input.longitude,
    );
  }
  const dentroRaio = distancia != null && distancia <= raio;
  const podeForcar = can(ctx.perms, "ponto", "editar"); // gestor
  const justificativa = input.justificativa?.trim() || null;

  if (obra.latitude == null || obra.longitude == null) {
    throw new Error("A obra ainda não tem localização cadastrada. Peça ao gestor para configurar.");
  }
  if (!dentroRaio && !(podeForcar && justificativa)) {
    return {
      ok: false,
      distanciaMetros: distancia,
      raio,
      dentroRaio: false,
      message: `Você está a ${distancia} m da obra (limite ${raio} m). Aproxime-se para registrar o ponto.`,
    };
  }

  const now = new Date();
  const data = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  await db.insert(schema.timeEntries).values({
    tenantId: ctx.tenant.id,
    projectId: input.projectId,
    userId: ctx.userId,
    funcionario: ctx.userEmail || ctx.userId || null,
    tipo: input.tipo,
    data,
    hora,
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    precisaoMetros: input.precisaoMetros != null ? Math.round(input.precisaoMetros) : null,
    distanciaMetros: distancia,
    dentroRaio,
    dispositivo: input.dispositivo || null,
    justificativa: !dentroRaio ? justificativa : null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "ponto.registrar",
    entity: "time_entry",
    entityId: input.projectId,
    meta: { tipo: input.tipo, data, hora, distancia, dentroRaio },
  });
  revalidatePath("/ponto");
  return {
    ok: true,
    distanciaMetros: distancia,
    raio,
    dentroRaio,
    message: `Ponto de ${input.tipo} registrado às ${hora} (${data}).`,
  };
}

/**
 * Apura os dias trabalhados de um funcionário numa obra e gera UMA conta a
 * pagar (despesa) com o valor previsto. Evita gerar em duplicidade marcando os
 * registros já vinculados a uma despesa.
 */
export async function gerarContaPagarPonto(input: {
  projectId: string;
  funcionario: string;
  entryIds: string[];
  valorDiaria: number;
  competencia: string; // "MM/YYYY"
}) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "ponto", "editar")) {
    throw new Error("Sem permissão para gerar contas a pagar do ponto.");
  }
  const version = await getAtualVersion(ctx.tenant.id, input.projectId);
  if (!version) throw new Error("Projeto sem versão Atual.");

  // Considera só os registros informados que ainda não geraram despesa.
  const entries = await db
    .select()
    .from(schema.timeEntries)
    .where(and(eq(schema.timeEntries.tenantId, ctx.tenant.id), eq(schema.timeEntries.projectId, input.projectId)))
    .orderBy(asc(schema.timeEntries.data));
  const alvo = entries.filter(
    (e) => input.entryIds.includes(e.id) && !e.despesaId && e.funcionario === input.funcionario,
  );
  // Dias distintos trabalhados (entrada conta como dia).
  const dias = new Set(alvo.filter((e) => e.tipo === "entrada").map((e) => e.data));
  if (dias.size === 0) throw new Error("Nenhum dia elegível para apuração (já apurados ou sem entrada).");
  const valor = dias.size * (input.valorDiaria || 0);

  const numDoc = await reserveDespesaNumber(ctx.tenant.id);
  const [row] = await db
    .insert(schema.despesas)
    .values({
      versionId: version.id,
      tenantId: ctx.tenant.id,
      numDoc,
      competencia: input.competencia || null,
      valor: String(valor),
      status: "A pagar",
      categoriaDre: "Custo Variável",
      obs: `Mão de obra (ponto) · ${input.funcionario} · ${dias.size} dia(s)`,
    })
    .returning();

  // Vincula os registros à despesa gerada (evita gerar de novo).
  for (const e of alvo) {
    await db.update(schema.timeEntries).set({ despesaId: row.id }).where(eq(schema.timeEntries.id, e.id));
  }
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "ponto.gerar_conta",
    entity: "despesa",
    entityId: row.id,
    meta: { funcionario: input.funcionario, dias: dias.size, valor },
  });
  revalidatePath("/ponto");
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
}
