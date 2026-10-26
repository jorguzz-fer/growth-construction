import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { semesterInfo } from "@/lib/semester";
import { extrairDados } from "@/lib/backup-dados";
import { planilhaDoSemestre } from "@/lib/backup";
import { montarLeiaMe, montarManifesto, type ResumoDoPacote } from "@/lib/backup-pacote-texto";
import { getObjectBytes, isR2Configured, putObjectFile } from "@/lib/storage/r2";
import { emParalelo } from "@/lib/em-paralelo";

/**
 * Prompt AO, Parte 4 — gera o pacote completo EM SEGUNDO PLANO.
 *
 * - O pedido e o progresso ficam em `backup_pacote` (a tela acompanha).
 * - Documentos baixados com concorrência limitada (4.4), direto para o disco.
 * - O ZIP é escrito em disco por stream e enviado ao R2 por stream: nem os
 *   documentos nem o ZIP ficam inteiros na memória (4.1).
 * - Falha de documento ou de tabela é declarada no leia-me e o pacote sai (4.5).
 *   Falha geral marca o pedido como "falhou", com a mensagem.
 *
 * SOMENTE LEITURA nos dados de negócio: a única escrita é o próprio registro
 * do pacote (10.2).
 */

/** Documentos baixados ao mesmo tempo (4.4: seis a dez). */
export const CONCORRENCIA_DE_DOCUMENTOS = 8;

const nomeSeguro = (s: string) => s.replace(/[^\w.\-]+/g, "_");

/** Nome do arquivo do pacote. */
export function nomeDoPacote(empresa: string, semestre: string): string {
  const slug = semestre.replace(/[^\w-]+/g, "");
  const tenantSlug = (empresa || "tenant").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  return `Backup_completo_${tenantSlug}_${slug}.zip`;
}

async function atualizar(id: string, campos: Partial<typeof schema.backupPacotes.$inferInsert>) {
  await db
    .update(schema.backupPacotes)
    .set({ ...campos, atualizadoEm: new Date() })
    .where(eq(schema.backupPacotes.id, id));
}

/** Gera o pacote do pedido `id`. Nunca lança: o resultado fica no registro. */
export async function gerarPacote(id: string): Promise<void> {
  const [job] = await db.select().from(schema.backupPacotes).where(eq(schema.backupPacotes.id, id)).limit(1);
  if (!job || job.status !== "gerando") return;
  const info = semesterInfo(job.semestre);
  let dir: string | null = null;
  try {
    if (!info) throw new Error("Semestre inválido.");
    const [tenant] = await db.select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, job.tenantId)).limit(1);
    const empresa = tenant?.name ?? "";
    dir = await mkdtemp(join(tmpdir(), "backup-"));

    // 1. Tabelas (o recorte é no SQL).
    const dados = await extrairDados(job.tenantId, info, (feitas, total, tabela) =>
      atualizar(id, { etapa: `Lendo tabelas: ${tabela}`, feitas, total }),
    );

    // 2. A planilha de sempre.
    await atualizar(id, { etapa: "Montando a planilha" });
    const planilha = await planilhaDoSemestre(job.tenantId, info);

    // 3. Documentos, com concorrência limitada, direto para o disco.
    const r2 = isR2Configured();
    const docsDir = join(dir, "documentos");
    await mkdir(docsDir);
    const baixados: ({ nome: string; caminho: string } | undefined)[] = [];
    const falhos: string[] = [];
    let feitosDocs = 0;
    if (r2 && dados.documentos.length) {
      await atualizar(id, { etapa: "Baixando documentos", feitas: 0, total: dados.documentos.length });
      await emParalelo(dados.documentos, CONCORRENCIA_DE_DOCUMENTOS, async (doc, i) => {
        try {
          const bytes = await getObjectBytes(doc.storageKey);
          const nome = `${String(i + 1).padStart(3, "0")}_${nomeSeguro(doc.filename || `documento_${i + 1}`)}`;
          const caminho = join(docsDir, nome);
          await writeFile(caminho, bytes);
          baixados[i] = { nome, caminho };
        } catch {
          falhos.push(doc.filename || doc.storageKey);
        }
        feitosDocs++;
        if (feitosDocs % 10 === 0 || feitosDocs === dados.documentos.length)
          await atualizar(id, { etapa: "Baixando documentos", feitas: feitosDocs, total: dados.documentos.length });
      });
    }

    // 4. Leia-me e manifesto.
    const slug = info.key.replace(/[^\w-]+/g, "");
    const resumo: ResumoDoPacote = {
      empresa,
      semestre: info.key,
      rotulo: info.label,
      geradoEm: new Date(),
      capturadoEm: dados.capturadoEm,
      corte: dados.corte,
      tabelas: dados.tabelas.map((t) => ({
        tabela: t.tabela,
        familia: t.familia,
        camada: t.camada,
        recorte: t.recorte,
        linhas: t.linhas.length,
        semData: t.semData,
        colunasOmitidas: t.colunasOmitidas,
        ...(t.motivoOmissao ? { motivoOmissao: t.motivoOmissao } : {}),
        somas: t.somas,
        ...(t.erro ? { erro: t.erro } : {}),
      })),
      referenciasFora: dados.referenciasFora,
      sequencias: dados.sequencias,
      documentos: {
        noPeriodo: dados.documentos.length,
        incluidos: baixados.filter(Boolean).length,
        falhos,
        asoOmitidos: dados.asoOmitidos,
        semStorage: !r2 && dados.documentos.length > 0,
      },
      planilha: `planilha/dados_${slug}.xlsx`,
    };

    // 5. O ZIP, por stream, em disco.
    await atualizar(id, { etapa: "Compactando" });
    const zip = new JSZip();
    zip.file("_leia-me.txt", montarLeiaMe(resumo));
    zip.file("_manifesto.json", JSON.stringify(montarManifesto(resumo), null, 2));
    zip.file(resumo.planilha, planilha.xlsxBytes);
    for (const t of dados.tabelas) zip.file(`dados/${t.tabela}.json`, JSON.stringify(t.linhas));
    for (const b of baixados) if (b) zip.file(`documentos/${b.nome}`, createReadStream(b.caminho));
    const arquivo = nomeDoPacote(empresa, info.key);
    const caminhoZip = join(dir, arquivo);
    await new Promise<void>((ok, falha) => {
      zip
        .generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE" })
        .on("error", falha)
        .pipe(createWriteStream(caminhoZip))
        .on("finish", () => ok())
        .on("error", falha);
    });

    // 6. Para o R2, por stream.
    await atualizar(id, { etapa: "Guardando o pacote" });
    const storageKey = `backups/${job.tenantId}/${id}/${arquivo}`;
    const bytes = await putObjectFile(storageKey, caminhoZip, "application/zip");

    await atualizar(id, {
      status: "pronto",
      etapa: "Pronto",
      storageKey,
      arquivo,
      bytes,
      concluidoEm: new Date(),
      resumo: resumoParaRegistro(resumo),
    });
  } catch (e) {
    await atualizar(id, { status: "falhou", etapa: "Falhou", erro: e instanceof Error ? e.message.slice(0, 500) : "falha na geração", concluidoEm: new Date() }).catch(() => {});
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * O que fica guardado no registro do pacote: contagens, sem nome de arquivo
 * nem dado pessoal. É o que a tela e o assistente leem (Parte 8).
 */
export function resumoParaRegistro(r: ResumoDoPacote): Record<string, unknown> {
  return {
    geradoEm: r.geradoEm.toISOString(),
    cadastroCapturadoEm: r.capturadoEm.toISOString(),
    tabelas: r.tabelas.map((t) => ({ tabela: t.tabela, familia: t.familia, camada: t.camada, linhas: t.linhas, semData: t.semData, ...(t.erro ? { erro: true } : {}) })),
    totalDeLinhas: r.tabelas.reduce((s, t) => s + t.linhas, 0),
    documentos: { noPeriodo: r.documentos.noPeriodo, incluidos: r.documentos.incluidos, falhos: r.documentos.falhos.length, asoOmitidos: r.documentos.asoOmitidos },
    referenciasFora: r.referenciasFora,
    tabelasComFalha: r.tabelas.filter((t) => t.erro).map((t) => t.tabela),
  };
}

/** Os pacotes da empresa, do mais recente ao mais antigo. */
export async function pacotesDaEmpresa(tenantId: string, limite = 20) {
  return db
    .select({
      p: schema.backupPacotes,
      email: schema.users.email,
    })
    .from(schema.backupPacotes)
    .leftJoin(schema.users, eq(schema.users.id, schema.backupPacotes.createdBy))
    .where(eq(schema.backupPacotes.tenantId, tenantId))
    .orderBy(desc(schema.backupPacotes.createdAt))
    .limit(limite);
}

/** Pedido em andamento (e não parado) da empresa, se houver. */
export async function pacoteEmAndamento(tenantId: string, agora = new Date()) {
  const { situacaoDoPacote } = await import("@/lib/backup-historico");
  const rows = await db
    .select()
    .from(schema.backupPacotes)
    .where(and(eq(schema.backupPacotes.tenantId, tenantId), eq(schema.backupPacotes.status, "gerando")))
    .limit(5);
  return rows.find((r) => situacaoDoPacote(r, agora) === "gerando") ?? null;
}
