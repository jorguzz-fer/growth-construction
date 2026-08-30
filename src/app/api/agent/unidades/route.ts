import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handleAgent } from "@/lib/agent/http";
import { requireScreen } from "@/lib/agent/auth";
import { casaNome, empacotar, limiteDe } from "@/lib/agent/lista";
import { brl, dateBR } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unidades do empreendimento — a tela "Unidades do Empreendimento".
 *
 * Lê sempre a versão **"atual"** de cada projeto (a realidade), nunca budget
 * nem forecast: "o que temos à venda hoje" é uma pergunta sobre o que é, não
 * sobre o que foi planejado.
 *
 * `?status=Disponivel` responde "o que está à venda". Sem status, devolve
 * tudo com o resumo por situação.
 */
export async function GET(req: Request) {
  return handleAgent(req, { rota: "unidades" }, async (id, url) => {
    requireScreen(id, "unidades");

    const rows = await db
      .select({
        code: schema.units.code,
        tipo: schema.units.tipo,
        m2: schema.units.m2,
        andar: schema.units.andar,
        valor: schema.units.valor,
        status: schema.units.status,
        itemType: schema.units.itemType,
        mesVenda: schema.units.mesVenda,
        projeto: schema.projects.name,
      })
      .from(schema.units)
      .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
      .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
      .where(and(eq(schema.units.tenantId, id.tenantId), eq(schema.versions.kind, "atual")));

    const status = url.searchParams.get("status");
    const projeto = url.searchParams.get("projeto");

    const filtradas = rows
      .filter((u) => casaNome(u.projeto, projeto))
      .filter((u) => !status || u.status.toLowerCase() === status.toLowerCase())
      .map((u) => ({
        unidade: u.code,
        projeto: u.projeto,
        tipo: u.tipo,
        m2: u.m2 ? Number(u.m2) : null,
        andar: u.andar,
        valor: Number(u.valor),
        valorBRL: brl(Number(u.valor)),
        status: u.status,
        item: u.itemType,
        mesVenda: dateBR(u.mesVenda),
      }))
      .sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true }));

    // Resumo por situação vem SEMPRE sobre o conjunto do projeto (antes do
    // filtro de status), senão "1 disponível" some quando se filtra por venda.
    const doProjeto = rows.filter((u) => casaNome(u.projeto, projeto));
    const porStatus: Record<string, number> = {};
    for (const u of doProjeto) porStatus[u.status] = (porStatus[u.status] ?? 0) + 1;

    return {
      empresa: id.tenantName,
      filtro: { projeto: projeto ?? "todos", status: status ?? "todos" },
      porStatus,
      ...empacotar(filtradas, { limite: limiteDe(url), valor: (u) => u.valor }),
    };
  });
}
