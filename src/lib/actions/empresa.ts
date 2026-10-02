"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { logAudit } from "@/lib/audit";
import { diffAudit, houveMudanca } from "@/lib/audit-diff";
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
import { campoInalterado, recusaDoCadastroFiscal, recusaDoNome, TELA_EMPRESA } from "@/lib/empresa-regras";

/**
 * Prompt AH, 2.4: as três actions devolvem `{ ok, error }` com o campo e o
 * porquê — exceção de Server Action chega sem mensagem em produção.
 */
export type ResultadoEmpresa = { ok: true } | { ok: false; error: string };

const SEM_SESSAO = "Sessão expirada. Entre de novo.";

/** Faz upload do logo da empresa para o R2 e salva a chave no tenant. */
export async function uploadLogo(formData: FormData): Promise<ResultadoEmpresa> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_EMPRESA, "editar")) return { ok: false, error: "Sem permissão para alterar o logo." };
  if (!isR2Configured()) return { ok: false, error: "Storage (Cloudflare R2) não configurado — defina as variáveis R2_*." };
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecione um arquivo de imagem." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "Logo deve ter até 2 MB." };

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const key = `tenants/${ctx.tenant.id}/logo.${ext}`;
  try {
    await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "image/png");
  } catch (e) {
    console.error("[empresa] falha ao enviar o logo:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao enviar o logo." };
  }

  await db.update(schema.tenants).set({ logoKey: key }).where(eq(schema.tenants.id, ctx.tenant.id));
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "tenant.logo", entity: "tenant", entityId: ctx.tenant.id, meta: { key } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Cadastro fiscal do emitente (Fase 1 da emissão de NF — ver docs/EMISSAO-NF.md).
 *
 * Salva PARCIAL de propósito: o cadastro é longo, vem de fontes diferentes
 * (contrato social, prefeitura, contabilidade) e travar o salvamento até estar
 * completo faria o usuário perder o que já digitou. Quem diz se dá para emitir
 * é `checarProntidaoFiscal`, na tela.
 *
 * O que é recusado é só o objetivamente inválido quando PREENCHIDO: CNPJ com
 * dígito errado, alíquota fora de 0–5 e — Prompt AH, Parte 2 — CEP sem 8
 * dígitos, código IBGE sem 7 dígitos e UF fora das 27 siglas (os mesmos
 * validadores do checklist; a tela chama esses campos de bloqueio e o
 * servidor passa a concordar). Vazio continua passando. Nenhum valor já
 * gravado é normalizado ou corrigido por aqui (2.5).
 */
export async function salvarDadosFiscais(formData: FormData): Promise<ResultadoEmpresa> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_EMPRESA, "editar")) return { ok: false, error: "Sem permissão para editar os dados fiscais." };

  const t = (campo: string) => {
    const v = formData.get(campo);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  // Decisão de 01/10/2026: dado inválido JÁ GRAVADO não é tocado nem trava o
  // salvamento dos outros campos. Campo que voltou igual ao gravado mantém o
  // valor exato do banco (sem normalizar) e não passa pela validação; ele
  // aparece como pendência no checklist. Só o que o usuário mudou é validado.
  const [antes] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, ctx.tenant.id)).limit(1);
  const gravado = (col: "cnpj" | "cep" | "codigoMunicipio" | "uf" | "aliquotaIss") => {
    const v = antes?.[col];
    return v === null || v === undefined || String(v).trim() === "" ? null : String(v);
  };
  const manteve = (campo: string, col: Parameters<typeof gravado>[0]) => campoInalterado(t(campo), gravado(col));

  const cnpj = manteve("cnpj", "cnpj") ? gravado("cnpj") : normalizarCnpj(t("cnpj"));
  if (!manteve("cnpj", "cnpj") && cnpj && !cnpjValido(cnpj)) return { ok: false, error: "CNPJ: os dígitos verificadores não conferem — revise o número." };

  const aliquotaTexto = t("aliquotaIss")?.replace(",", ".");
  const aliquotaMantida = manteve("aliquotaIss", "aliquotaIss") || (aliquotaTexto != null && gravado("aliquotaIss") != null && Number(aliquotaTexto) === Number(gravado("aliquotaIss")));
  const aliquota = aliquotaTexto === null || aliquotaTexto === undefined ? null : Number(aliquotaTexto);
  if (!aliquotaMantida && aliquota !== null && !aliquotaIssValida(aliquota)) return { ok: false, error: "Alíquota de ISS: deve estar entre 0 e 5% (teto constitucional)." };

  const cep = manteve("cep", "cep") ? gravado("cep") : normalizarCep(t("cep"));
  const codigoMunicipio = manteve("codigoMunicipio", "codigoMunicipio") ? gravado("codigoMunicipio") : normalizarCodigoMunicipio(t("codigoMunicipio"));
  const uf = manteve("uf", "uf") ? gravado("uf") : t("uf")?.toUpperCase() ?? null;
  const recusa = recusaDoCadastroFiscal({
    cep: manteve("cep", "cep") ? null : cep,
    codigoMunicipio: manteve("codigoMunicipio", "codigoMunicipio") ? null : codigoMunicipio,
    uf: manteve("uf", "uf") ? null : uf,
  });
  if (recusa) return { ok: false, error: recusa };

  const ambiente = t("fiscalAmbiente");
  const valores = {
    nomeFantasia: t("nomeFantasia"),
    cnpj,
    inscricaoMunicipal: t("inscricaoMunicipal"),
    inscricaoEstadual: t("inscricaoEstadual"),
    regimeTributario: ehRegimeTributario(t("regimeTributario")) ? t("regimeTributario") : null,
    regimeEspecial: ehRegimeEspecial(t("regimeEspecial")) ? t("regimeEspecial") : null,
    itemListaServico: t("itemListaServico"),
    codigoTributarioMunicipio: t("codigoTributarioMunicipio"),
    cnae: t("cnae"),
    aliquotaIss: aliquotaMantida ? gravado("aliquotaIss") : aliquota === null ? null : String(aliquota),
    logradouro: t("logradouro"),
    numeroEndereco: t("numeroEndereco"),
    complemento: t("complemento"),
    bairro: t("bairro"),
    codigoMunicipio,
    municipio: t("municipio"),
    uf,
    cep,
    telefone: t("telefone"),
    emailFiscal: t("emailFiscal"),
    fiscalAmbiente: ehAmbienteFiscal(ambiente) ? ambiente : "homologacao",
  };

  const changes = diffAudit(antes as unknown as Record<string, unknown>, valores);

  await db.update(schema.tenants).set(valores).where(eq(schema.tenants.id, ctx.tenant.id));

  // Diff vazio não gera linha de log (AK, Parte 2). O cadastro fiscal é longo e
  // costuma ser revisitado só para conferir; registrar cada visita produziria
  // uma trilha de "tenant.fiscal" vazios em volta da alteração que importa. O
  // `update` continua rodando — ver a justificativa em `updateDespesa`.
  if (houveMudanca(changes)) {
    await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "tenant.fiscal", entity: "tenant", entityId: ctx.tenant.id, meta: { changes } });
  }
  revalidatePath("/empresa");
  return { ok: true };
}

/**
 * Prompt AH, Parte 3: a razão social vai no corpo da nota — trocá-la deixa
 * rastro (`de`/`para`, como o cadastro fiscal) e a recusa é dita, não muda.
 */
export async function renameTenant(formData: FormData): Promise<ResultadoEmpresa> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_EMPRESA, "editar")) return { ok: false, error: "Sem permissão para alterar o nome da empresa." };
  const name = ((formData.get("name") as string) || "").trim();
  const recusa = recusaDoNome(name);
  if (recusa) return { ok: false, error: recusa };
  const [antes] = await db.select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, ctx.tenant.id)).limit(1);
  if (!antes) return { ok: false, error: "Empresa não encontrada." };
  const changes = diffAudit({ name: antes.name }, { name });
  if (!houveMudanca(changes)) return { ok: true };
  await db.update(schema.tenants).set({ name }).where(eq(schema.tenants.id, ctx.tenant.id));
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "tenant.rename", entity: "tenant", entityId: ctx.tenant.id, meta: { changes } });
  revalidatePath("/", "layout");
  return { ok: true };
}
