import { describe, it, expect } from "vitest";
import { ordenarLancamentos, type LancamentoOrdenavel } from "./despesas-ordering";

/**
 * Requisito 4.4 / 18.8 — a relação de despesas lançadas serve de conferência
 * imediata para quem está lançando: a última despesa CRIADA é sempre a primeira
 * linha. A ordenação é pelo momento original de criação (created_at DESC,
 * id DESC) e nunca por competência, vencimento, pagamento ou edição.
 */
const d = (
  id: string,
  createdAt: string | null,
  extra: Partial<LancamentoOrdenavel> = {},
): LancamentoOrdenavel => ({
  id,
  createdAt: createdAt ? new Date(createdAt) : null,
  ...extra,
});

describe("ordenarLancamentos", () => {
  it("coloca a última despesa criada na primeira linha e a penúltima na segunda", () => {
    const rows = [
      d("a", "2026-01-10T10:00:00Z"),
      d("c", "2026-03-10T10:00:00Z"), // mais recente
      d("b", "2026-02-10T10:00:00Z"),
    ];
    expect(ordenarLancamentos(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("desempata por id DESC quando o created_at é idêntico", () => {
    const t = "2026-05-01T12:00:00Z";
    const rows = [d("id-a", t), d("id-c", t), d("id-b", t)];
    expect(ordenarLancamentos(rows).map((r) => r.id)).toEqual([
      "id-c",
      "id-b",
      "id-a",
    ]);
  });

  it("NÃO ordena por competência (competência antiga pode ser o lançamento mais novo)", () => {
    const rows = [
      // competência recente, criada primeiro
      d("antiga", "2026-01-01T09:00:00Z", { competencia: "12/2026" }),
      // competência antiga, criada por último → deve vir no topo
      d("nova", "2026-01-01T18:00:00Z", { competencia: "01/2020" }),
    ];
    expect(ordenarLancamentos(rows)[0].id).toBe("nova");
  });

  it("NÃO ordena por vencimento", () => {
    const rows = [
      d("x", "2026-02-01T10:00:00Z", { vencimento: "01/01/2030" }),
      d("y", "2026-03-01T10:00:00Z", { vencimento: "01/01/2020" }),
    ];
    expect(ordenarLancamentos(rows)[0].id).toBe("y");
  });

  it("editar uma despesa antiga não a leva para o topo (created_at não muda)", () => {
    const rows = [
      d("antiga", "2020-01-01T10:00:00Z"),
      d("recente", "2026-01-01T10:00:00Z"),
    ];
    // Simula edição: qualquer outro campo muda, created_at permanece.
    const editada = rows.map((r) =>
      r.id === "antiga" ? { ...r, valor: "999", status: "Pago" } : r,
    );
    expect(ordenarLancamentos(editada).map((r) => r.id)).toEqual([
      "recente",
      "antiga",
    ]);
  });

  it("registros sem created_at vão para o fim, sem quebrar", () => {
    const rows = [d("sem-data", null), d("com-data", "2026-01-01T10:00:00Z")];
    expect(ordenarLancamentos(rows).map((r) => r.id)).toEqual([
      "com-data",
      "sem-data",
    ]);
  });

  it("não perde nem duplica registros (zero perda na exibição)", () => {
    const rows = [
      d("a", "2026-01-01T10:00:00Z"),
      d("b", null),
      d("c", "2026-02-01T10:00:00Z"),
      d("d", "2026-02-01T10:00:00Z"),
    ];
    const out = ordenarLancamentos(rows);
    expect(out).toHaveLength(rows.length);
    expect(new Set(out.map((r) => r.id))).toEqual(
      new Set(rows.map((r) => r.id)),
    );
  });

  it("não altera o array original", () => {
    const rows = [
      d("a", "2026-01-01T10:00:00Z"),
      d("z", "2026-09-01T10:00:00Z"),
    ];
    const antes = rows.map((r) => r.id);
    ordenarLancamentos(rows);
    expect(rows.map((r) => r.id)).toEqual(antes);
  });
});
