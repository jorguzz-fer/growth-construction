import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CA-41 — nenhuma migração do pacote contém operação destrutiva.
 *
 * O sistema está em produção e as migrações rodam sozinhas no boot do
 * contêiner: um `DROP` que passe na revisão não tem segunda chance. Este teste
 * é a rede que impede isso, varrendo os `.sql` a cada `vitest run`.
 *
 * O que é proibido e por quê:
 *  - `DROP TABLE` / `DROP COLUMN`  → perda de dado lançado;
 *  - `TRUNCATE`                    → esvazia tabela inteira;
 *  - `DELETE` sem escopo aprovado  → apaga lançamentos;
 *  - `ALTER COLUMN ... SET NOT NULL` em tabela populada sem backfill validado
 *                                  → a migração falha no boot e derruba o app.
 *
 * `DROP INDEX` e `DROP CONSTRAINT` são permitidos: não removem dado. `DROP`
 * dentro de `IF NOT EXISTS`/comentário também não conta — a varredura ignora
 * comentários.
 */

const DIR = join(process.cwd(), "src/lib/db/migrations");
const DIR_DOWN = join(DIR, "down");

/** Remove comentários de linha e de bloco antes de procurar por comandos. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function migrationsUp(): { arquivo: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ arquivo: f, sql: readFileSync(join(DIR, f), "utf8") }));
}

describe("CA-41 — migrações não destrutivas", () => {
  const arquivos = migrationsUp();

  it("existem migrações para varrer (o teste não pode passar por vacuidade)", () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  it.each(arquivos.map((m) => m.arquivo))("%s não derruba tabela nem coluna", (nome) => {
    const sql = semComentarios(
      arquivos.find((m) => m.arquivo === nome)!.sql,
    ).toUpperCase();
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/);
    expect(sql).not.toMatch(/\bDROP\s+COLUMN\b/);
    expect(sql).not.toMatch(/\bDROP\s+SCHEMA\b/);
    expect(sql).not.toMatch(/\bDROP\s+DATABASE\b/);
  });

  it.each(arquivos.map((m) => m.arquivo))("%s não esvazia nem apaga dados", (nome) => {
    const sql = semComentarios(
      arquivos.find((m) => m.arquivo === nome)!.sql,
    ).toUpperCase();
    expect(sql).not.toMatch(/\bTRUNCATE\b/);
    // DELETE só é aceito com escopo explícito (WHERE) — e mesmo assim o pacote
    // atual não usa nenhum.
    const deletes = sql.match(/\bDELETE\s+FROM\b/g) ?? [];
    expect(deletes.length, `DELETE encontrado em ${nome}`).toBe(0);
  });

  it.each(arquivos.map((m) => m.arquivo))(
    "%s não impõe NOT NULL a coluna de tabela já populada",
    (nome) => {
      const sql = semComentarios(
        arquivos.find((m) => m.arquivo === nome)!.sql,
      ).toUpperCase();
      // `SET NOT NULL` numa tabela com dados falha no boot do contêiner e
      // derruba a aplicação. Coluna nova entra NULLABLE ou com default seguro.
      expect(sql).not.toMatch(/\bSET\s+NOT\s+NULL\b/);
    },
  );

  it("toda migração recente (>= 0034) tem script de rollback correspondente", () => {
    // CA-39 — o `down` precisa existir e restaurar o estado anterior. A
    // convenção `migrations/down/` nasceu na 0033; migrações anteriores são
    // históricas e não são cobradas retroativamente.
    const down = new Set(
      readdirSync(DIR_DOWN)
        .filter((f) => f.endsWith(".sql"))
        .map((f) => f.replace(/\.sql$/, "")),
    );
    const semDown = arquivos
      .map((m) => m.arquivo.replace(/\.sql$/, ""))
      .filter((n) => {
        const idx = Number(n.slice(0, 4));
        return Number.isFinite(idx) && idx >= 34 && !down.has(n);
      });
    expect(semDown, `migrações sem rollback: ${semDown.join(", ")}`).toEqual([]);
  });

  it("migrações novas são idempotentes (IF NOT EXISTS / guarda DO $$)", () => {
    // As migrações rodam no boot; sem idempotência, um restart depois de um
    // rollback parcial quebra a subida.
    const problemas: string[] = [];
    for (const m of arquivos) {
      const idx = Number(m.arquivo.slice(0, 4));
      if (!Number.isFinite(idx) || idx < 34) continue;
      const sql = semComentarios(m.sql).toUpperCase();
      const criacoes = sql.match(/\b(CREATE\s+(UNIQUE\s+)?INDEX|ADD\s+COLUMN|CREATE\s+TABLE)\b/g) ?? [];
      const guardas =
        (sql.match(/\bIF\s+NOT\s+EXISTS\b/g) ?? []).length +
        (sql.match(/\bDO\s+\$\$/g) ?? []).length;
      if (criacoes.length > 0 && guardas === 0) {
        problemas.push(m.arquivo);
      }
    }
    expect(problemas, `sem guarda de idempotência: ${problemas.join(", ")}`).toEqual([]);
  });
});
