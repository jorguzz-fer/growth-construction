"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { lerRascunhoDaNota, podeEditar, type RascunhoDaNota } from "@/lib/nota-servico";
import { resolverAmbiente } from "@/lib/fiscal/focus";

export type ResultadoNota = { ok: true; id: string } | { ok: false; error: string };

/**
 * Prompt AG — salva o RASCUNHO de uma NFS-e (criar ou corrigir). Não envia
 * nada ao provedor. Só rascunho e rejeitada são editáveis (2.1, 2.2); nota
 * vive na versão Atual da obra (1.3); o vínculo com a conta a receber é só
 * referência — nada é criado nem alterado nela (BAG-2).
 */
export async function salvarRascunhoDeNota(formData: FormData): Promise<ResultadoNota> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  const id = typeof formData.get("id") === "string" ? String(formData.get("id")).trim() : "";
  if (!can(ctx.perms, "notasfiscais", id ? "editar" : "criar")) return { ok: false, error: "Sem permissão para montar nota fiscal." };
  const lido = lerRascunhoDaNota((c) => formData.get(c));
  if (!lido.ok) return lido;
  const r = lido.rascunho;

  // A obra precisa ser uma das que a pessoa vê, e ter versão Atual (1.3).
  if (!ctx.projects.some((p) => p.id === r.projectId)) return { ok: false, error: "Obra não encontrada." };
  const [atual] = await db
    .select({ id: schema.versions.id })
    .from(schema.versions)
    .where(and(eq(schema.versions.tenantId, ctx.tenant.id), eq(schema.versions.projectId, r.projectId), eq(schema.versions.kind, "atual")))
    .limit(1);
  if (!atual) return { ok: false, error: "Esta obra não tem versão Atual: a nota é fato real e só vive na Atual." };
  if (r.contaReceberId) {
    const [cr] = await db
      .select({ id: schema.contasReceber.id })
      .from(schema.contasReceber)
      .where(and(eq(schema.contasReceber.id, r.contaReceberId), eq(schema.contasReceber.tenantId, ctx.tenant.id), eq(schema.contasReceber.projectId, r.projectId)))
      .limit(1);
    if (!cr) return { ok: false, error: "A conta a receber escolhida não é desta obra." };
  }
  const valores = valoresDoRascunho(r);

  try {
    const notaId = await db.transaction(async (tx) => {
      if (id) {
        const [n] = await tx
          .select({ status: schema.notasServico.status })
          .from(schema.notasServico)
          .where(and(eq(schema.notasServico.id, id), eq(schema.notasServico.tenantId, ctx.tenant.id)))
          .for("update")
          .limit(1);
        if (!n) throw new Recusa("Nota não encontrada.");
        if (!podeEditar(n.status)) throw new Recusa("Esta nota já foi enviada: não se edita mais (nenhuma situação volta).");
        await tx
          .update(schema.notasServico)
          .set({ ...valores, versionId: atual.id })
          .where(and(eq(schema.notasServico.id, id), eq(schema.notasServico.tenantId, ctx.tenant.id)));
        await tx.insert(schema.notaServicoEventos).values({ tenantId: ctx.tenant.id, notaId: id, tipo: "editada", status: n.status, createdBy: ctx.userId });
        return id;
      }
      const [nova] = await tx
        .insert(schema.notasServico)
        .values({ tenantId: ctx.tenant.id, versionId: atual.id, ambiente: resolverAmbiente(ctx.tenant.fiscalAmbiente), createdBy: ctx.userId, ...valores })
        .returning({ id: schema.notasServico.id });
      await tx.insert(schema.notaServicoEventos).values({ tenantId: ctx.tenant.id, notaId: nova.id, tipo: "criada", status: "rascunho", createdBy: ctx.userId });
      return nova.id;
    });
    // Sem dado do tomador na auditoria: só a nota e o valor.
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: id ? "nfse.rascunho.editar" : "nfse.rascunho.criar",
      entity: "nota_servico",
      entityId: notaId,
      meta: { projectId: r.projectId, valorServicos: r.valorServicos, contaReceberId: r.contaReceberId },
    });
    revalidatePath("/notasfiscais");
    return { ok: true, id: notaId };
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, error: e.message };
    throw e;
  }
}

class Recusa extends Error {}

function valoresDoRascunho(r: RascunhoDaNota) {
  return {
    projectId: r.projectId,
    contaReceberId: r.contaReceberId,
    competencia: r.competencia,
    discriminacao: r.discriminacao,
    itemListaServico: r.itemListaServico,
    codigoTributarioMunicipio: r.codigoTributarioMunicipio,
    valorServicos: String(r.valorServicos),
    valorDeducoes: String(r.valorDeducoes),
    descontoIncondicionado: String(r.descontoIncondicionado),
    descontoCondicionado: String(r.descontoCondicionado),
    aliquotaIss: String(r.aliquotaIss),
    issRetido: r.issRetido,
    retencoes: r.retencoes,
    outrasRetencoes: String(r.outrasRetencoes),
    tomadorCpfCnpj: r.tomadorCpfCnpj,
    tomadorNome: r.tomadorNome,
    tomadorInscricaoMunicipal: r.tomadorInscricaoMunicipal,
    tomadorEmail: r.tomadorEmail,
    tomadorTelefone: r.tomadorTelefone,
    tomadorLogradouro: r.tomadorLogradouro,
    tomadorNumero: r.tomadorNumero,
    tomadorComplemento: r.tomadorComplemento,
    tomadorBairro: r.tomadorBairro,
    tomadorCodigoMunicipio: r.tomadorCodigoMunicipio,
    tomadorUf: r.tomadorUf,
    tomadorCep: r.tomadorCep,
  };
}
