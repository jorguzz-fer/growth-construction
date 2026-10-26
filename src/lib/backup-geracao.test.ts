import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { copyFile, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { count, eq } from "drizzle-orm";

/** Prompt AO, Parte 4 — geração em segundo plano, documentos e download. Banco real; R2 simulado. */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("server-only", () => ({}));
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({ ...(await orig<typeof import("@/lib/context")>()), getTenantContext: async () => ctxRef.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
const fila = vi.hoisted(() => ({ depois: [] as (() => Promise<void>)[] }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => void fila.depois.push(fn) }));
const r2 = vi.hoisted(() => ({
  ligado: true,
  saida: "",
  falhaNoEnvio: false,
  simultaneos: 0,
  maxSimultaneos: 0,
  falhar: new Set<string>(),
}));
vi.mock("@/lib/storage/r2", () => ({
  isR2Configured: () => r2.ligado,
  getObjectBytes: async (k: string) => {
    r2.simultaneos++;
    r2.maxSimultaneos = Math.max(r2.maxSimultaneos, r2.simultaneos);
    await new Promise((ok) => setTimeout(ok, 2));
    r2.simultaneos--;
    if (r2.falhar.has(k)) throw new Error("sumiu");
    return new TextEncoder().encode(`conteudo de ${k}`);
  },
  putObjectFile: async (_k: string, caminho: string) => {
    if (r2.falhaNoEnvio) throw new Error("R2 fora do ar");
    await copyFile(caminho, r2.saida);
    return (await readFile(caminho)).byteLength;
  },
  presignDownload: async (k: string, nome: string) => `https://r2.exemplo/${k}?nome=${nome}&assinado=1`,
}));

describe.skipIf(!HAS_DB)("Prompt AO · geração do pacote completo", async () => {
  const JSZip = (await import("jszip")).default;
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { gerarPacote } = await import("./backup-geracao");
  const { pedirPacoteCompleto } = await import("./actions/backup-pacote");
  const { GET } = await import("@/app/(app)/backup/pacote/[id]/route");
  const { TABELAS_DO_PACOTE } = await import("./backup-catalogo");
  let tenantId = "";
  let dir = "";
  const como = (role: "owner" | "membro" | "contador") =>
    (ctxRef.current = { tenant: { id: tenantId, name: "Empresa Backup" }, projects: [], userId: null, userEmail: "t@t", role, perms: defaultPermissions(role) });
  const pedido = async (semestre = "2026-H1") =>
    (await db.insert(schema.backupPacotes).values({ tenantId, semestre }).returning())[0].id;
  const registro = async (id: string) => (await db.select().from(schema.backupPacotes).where(eq(schema.backupPacotes.id, id)))[0];
  const abrir = async () => JSZip.loadAsync(await readFile(r2.saida));

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "teste-backup-"));
    tenantId = (await db.insert(schema.tenants).values({ name: "Empresa Backup" }).returning())[0].id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA" }).returning();
    const [v] = await db.insert(schema.versions).values({ projectId: p.id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    await db.insert(schema.despesas).values({ tenantId, versionId: v.id, valor: "100", categoriaDre: "Custo Variável", status: "Pago", competencia: "03/2026" });
    await db.insert(schema.documents).values(
      Array.from({ length: 400 }, (_, i) => ({ tenantId, storageKey: `k/${i}`, filename: `doc ${i}.pdf`, tipo: "Nota Fiscal", uploadedAt: new Date(2026, 1, 1 + (i % 25)) })),
    );
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });
  beforeEach(() => {
    r2.ligado = true;
    r2.falhaNoEnvio = false;
    r2.falhar.clear();
    r2.maxSimultaneos = 0;
    r2.saida = join(dir, `pacote-${Math.random().toString(36).slice(2)}.zip`);
    fila.depois = [];
  });

  it("gera o ZIP com leia-me, manifesto, planilha, uma tabela por arquivo e os 400 documentos — com no máximo 8 downloads ao mesmo tempo", async () => {
    const despesasAntes = Number((await db.select({ n: count() }).from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId)))[0].n);
    r2.falhar.add("k/7");
    const id = await pedido();
    await gerarPacote(id);
    const reg = await registro(id);
    expect(reg).toMatchObject({ status: "pronto", etapa: "Pronto", arquivo: "Backup_completo_Empresa_Backup_2026-H1.zip" });
    expect(reg.storageKey).toBe(`backups/${tenantId}/${id}/Backup_completo_Empresa_Backup_2026-H1.zip`);
    expect(reg.bytes).toBeGreaterThan(0);
    expect(r2.maxSimultaneos).toBeLessThanOrEqual(8);
    expect(r2.maxSimultaneos).toBeGreaterThan(1);

    const zip = await abrir();
    const nomes = Object.keys(zip.files);
    for (const n of ["_leia-me.txt", "_manifesto.json", "planilha/dados_2026-H1.xlsx"]) expect(nomes).toContain(n);
    for (const t of TABELAS_DO_PACOTE) expect(nomes, t.tabela).toContain(`dados/${t.tabela}.json`);
    expect(nomes.filter((n) => n.startsWith("documentos/") && !n.endsWith("/"))).toHaveLength(399);
    expect(await zip.file("documentos/001_doc_0.pdf")!.async("string")).toBe("conteudo de k/0");

    // O manifesto bate com o conteúdo, tabela a tabela (teste 5).
    const manifesto = JSON.parse(await zip.file("_manifesto.json")!.async("string"));
    for (const t of manifesto.tabelas) {
      const linhas = JSON.parse(await zip.file(t.arquivo)!.async("string"));
      expect(linhas.length, t.tabela).toBe(t.linhas);
    }
    expect(manifesto.documentos).toMatchObject({ noPeriodo: 400, incluidos: 399, falhos: ["doc 7.pdf"] });
    const leiaMe = await zip.file("_leia-me.txt")!.async("string");
    expect(leiaMe).toContain("documentos não baixados: doc 7.pdf");
    expect(leiaMe).toContain("DADO PESSOAL — LGPD");
    // O resumo do registro não leva nome de arquivo.
    expect(JSON.stringify(reg.resumo)).not.toContain("doc 7.pdf");
    expect(reg.resumo).toMatchObject({ documentos: { noPeriodo: 400, incluidos: 399, falhos: 1 } });
    // Nenhuma escrita em dado de negócio.
    expect(Number((await db.select({ n: count() }).from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId)))[0].n)).toBe(despesasAntes);
  });

  it("falha ao guardar: o pedido fica 'falhou' com a mensagem — e não 'gerando' para sempre", async () => {
    r2.falhaNoEnvio = true;
    const id = await pedido("2026-H2");
    await gerarPacote(id);
    expect(await registro(id)).toMatchObject({ status: "falhou", erro: "R2 fora do ar" });
    // A pasta temporária foi apagada.
    expect((await readdir(tmpdir())).filter((n) => n.startsWith("backup-"))).toEqual([]);
  });

  it("pedir: só quem tem Backup; sem R2 não pede; um pedido por vez; o pedido vai para a Auditoria", async () => {
    await db.delete(schema.backupPacotes).where(eq(schema.backupPacotes.tenantId, tenantId));
    como("membro");
    expect(await pedirPacoteCompleto("2026-H1")).toMatchObject({ ok: false, error: expect.stringContaining("Sem permissão") });
    como("contador");
    expect(await pedirPacoteCompleto("2026-H1")).toMatchObject({ ok: false });
    como("owner");
    r2.ligado = false;
    expect(await pedirPacoteCompleto("2026-H1")).toMatchObject({ ok: false, error: expect.stringContaining("R2") });
    r2.ligado = true;
    expect(await pedirPacoteCompleto("XXXX")).toMatchObject({ ok: false, error: "Semestre inválido." });
    const r = await pedirPacoteCompleto("2026-H1");
    expect(r.ok).toBe(true);
    expect(await pedirPacoteCompleto("2025-H2")).toMatchObject({ ok: false, error: expect.stringContaining("Já há um pacote") });
    expect(fila.depois).toHaveLength(1);
    const [aud] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "backup.pacote.gerar"));
    expect(aud).toMatchObject({ tenantId, entityId: "2026-H1" });
    await fila.depois[0]();
    if (r.ok) expect((await registro(r.id)).status).toBe("pronto");
  });

  it("baixar: grava na Auditoria e redireciona para o link temporário; recusas", async () => {
    const id = await pedido();
    await gerarPacote(id);
    como("owner");
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("assinado=1");
    const auds = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "backup.download"));
    expect(auds.find((a) => a.tenantId === tenantId)).toMatchObject({ entityId: "2026-H1" });
    expect(auds.find((a) => a.tenantId === tenantId)!.meta).toMatchObject({ pacote: "completo", pacoteId: id });

    const emAndamento = await pedido();
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ id: emAndamento }) })).status).toBe(409);
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) })).status).toBe(404);
    como("membro");
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ id }) })).status).toBe(403);
  });
});
