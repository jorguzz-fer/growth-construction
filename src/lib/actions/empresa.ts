"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { logAudit } from "@/lib/audit";
import { diffAudit } from "@/lib/audit-diff";
import {
  aliquotaIssValida,
  cnpjValido,
  ehRegimeEspecial,
  ehRegimeTributario,
  normalizarCep,
  normalizarCnpj,
  normalizarCodigoMunicipio,
} from "@/lib/calc/emitente-fiscal";
import { ehAmbienteFiscal } from "@/lib/fiscal/tipos";

/** Faz upload do logo da empresa para o R2 e salva a chave no tenant. */
export async function uploadLogo(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) {
    throw new Error("Sem permissão.");
  }
  if (!isR2Configured()) {
    throw new Error(
      "Storage (Cloudflare R2) não configurado — defina as variáveis R2_*.",
    );
  }
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Logo deve ter até 2 MB.");

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const key = `tenants/${ctx.tenant.id}/logo.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await putObject(key, bytes, file.type || "image/png");

  await db
    .update(schema.tenants)
    .set({ logoKey: key })
    .where(eq(schema.tenants.id, ctx.tenant.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "tenant.logo",
    entity: "tenant",
    entityId: ctx.tenant.id,
    meta: { key },
  });
  revalidatePath("/", "layout");
}

/**
 * Cadastro fiscal do emitente (Fase 1 da emissão de NF — ver docs/EMISSAO-NF.md).
 *
 * Salva PARCIAL de propósito: o cadastro é longo, vem de fontes diferentes
 * (contrato social, prefeitura, contabilidade) e travar o salvamento até estar
 * completo faria o usuário perder o que já digitou. Quem diz se dá para emitir
 * é `checarProntidaoFiscal`, na tela.
 *
 * O único campo recusado é o CNPJ com dígito verificador errado: gravar CNPJ
 * inválido só adia a rejeição para o momento da emissão, quando o erro custa
 * mais caro.
 */
export async function salvarDadosFiscais(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) {
    throw new Error("Sem permissão para editar os dados fiscais.");
  }

  const t = (campo: string) => {
    const v = formData.get(campo);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const cnpj = normalizarCnpj(t("cnpj"));
  if (cnpj && !cnpjValido(cnpj)) {
    throw new Error("CNPJ inválido — confira os dígitos verificadores.");
  }

  const aliquotaTexto = t("aliquotaIss")?.replace(",", ".");
  const aliquota = aliquotaTexto === null ? null : Number(aliquotaTexto);
  if (aliquota !== null && !aliquotaIssValida(aliquota)) {
    throw new Error("A alíquota de ISS deve estar entre 0 e 5%.");
  }

  const ambiente = t("fiscalAmbiente");
  const valores = {
    nomeFantasia: t("nomeFantasia"),
    cnpj,
    inscricaoMunicipal: t("inscricaoMunicipal"),
    inscricaoEstadual: t("inscricaoEstadual"),
    regimeTributario: ehRegimeTributario(t("regimeTributario"))
      ? t("regimeTributario")
      : null,
    regimeEspecial: ehRegimeEspecial(t("regimeEspecial")) ? t("regimeEspecial") : null,
    itemListaServico: t("itemListaServico"),
    codigoTributarioMunicipio: t("codigoTributarioMunicipio"),
    cnae: t("cnae"),
    aliquotaIss: aliquota === null ? null : String(aliquota),
    logradouro: t("logradouro"),
    numeroEndereco: t("numeroEndereco"),
    complemento: t("complemento"),
    bairro: t("bairro"),
    codigoMunicipio: normalizarCodigoMunicipio(t("codigoMunicipio")),
    municipio: t("municipio"),
    uf: t("uf")?.toUpperCase() ?? null,
    cep: normalizarCep(t("cep")),
    telefone: t("telefone"),
    emailFiscal: t("emailFiscal"),
    fiscalAmbiente: ehAmbienteFiscal(ambiente) ? ambiente : "homologacao",
  };

  const [antes] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenant.id))
    .limit(1);

  await db
    .update(schema.tenants)
    .set(valores)
    .where(eq(schema.tenants.id, ctx.tenant.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "tenant.fiscal",
    entity: "tenant",
    entityId: ctx.tenant.id,
    meta: {
      changes: diffAudit(antes as unknown as Record<string, unknown>, valores),
    },
  });
  revalidatePath("/empresa");
}

export async function renameTenant(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) return;
  const name = ((formData.get("name") as string) || "").trim();
  if (!name) return;
  await db
    .update(schema.tenants)
    .set({ name })
    .where(eq(schema.tenants.id, ctx.tenant.id));
  revalidatePath("/", "layout");
}
