"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { excelSerial } from "@/lib/utils";

export async function addReembolso(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "reembolso", "criar")) return;
  const data = (formData.get("data") as string) || null;
  await db.insert(schema.reembolsos).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    data,
    origem: (formData.get("origem") as string) || null,
    valor: (formData.get("valor") as string) || "0",
    pct: (formData.get("pct") as string) || null,
    obs: (formData.get("obs") as string) || null,
    // SERIAL = INT(Data): calculado automaticamente a partir da data real.
    serial: excelSerial(data),
    status: "Recebido",
  });
  revalidatePath("/reembolso");
  redirect("/reembolso");
}

export async function addPermuta(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "permuta", "criar")) return;
  await db.insert(schema.permutas).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    unitCode: (formData.get("unitCode") as string) || null,
    cliente: (formData.get("cliente") as string) || null,
    dataRecebimento: (formData.get("dataRecebimento") as string) || null,
    tipo: (formData.get("tipo") as string) || null,
    descricao: (formData.get("descricao") as string) || null,
    estimado: (formData.get("estimado") as string) || "0",
    status: (formData.get("status") as string) || "Disponivel",
    dataVenda: (formData.get("dataVenda") as string) || null,
    valorVenda: (formData.get("valorVenda") as string) || "0",
    tipoPermuta: (formData.get("tipoPermuta") as string) || null,
    formaVenda: (formData.get("formaVenda") as string) || null,
    parcelas: formData.get("parcelas") ? Number(formData.get("parcelas")) : null,
    periodicidade: (formData.get("periodicidade") as string) || null,
    dataPrimParcela: (formData.get("dataPrimParcela") as string) || null,
    obs: (formData.get("obs") as string) || null,
  });
  revalidatePath("/permuta");
  revalidatePath("/fluxocaixa");
  revalidatePath("/dre");
  revalidatePath("/caixa");
  redirect("/permuta");
}
