import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface CompareColumn {
  label: string;
  color?: string;
}

export interface CompareRow {
  label: string;
  values: number[];
  /** ênfase visual: linha de subtotal ou total final. */
  emphasis?: "sub" | "final";
}

/**
 * Tabela de comparação de 1–3 versões: primeira coluna = linhas do relatório
 * (fontes/categorias/indicadores), demais colunas = uma por versão selecionada,
 * cada célula com o total daquela linha na versão. Compartilhada por todos os
 * reports para o modo "comparar versões".
 */
export function VersionCompareTable({
  firstColLabel = "Item",
  columns,
  rows,
}: {
  firstColLabel?: string;
  columns: CompareColumn[];
  rows: CompareRow[];
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <TH>{firstColLabel}</TH>
                {columns.map((c, ci) => (
                  <TH key={ci} className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {c.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: c.color }}
                        />
                      )}
                      {c.label}
                    </span>
                  </TH>
                ))}
              </tr>
            </THead>
            <tbody>
              {rows.map((r, ri) => {
                const emph = r.emphasis;
                return (
                  <TR
                    key={ri}
                    className={emph ? "bg-[var(--color-surface2)]" : undefined}
                  >
                    <TD
                      className={
                        emph === "final"
                          ? "font-semibold text-[var(--color-accent)]"
                          : emph === "sub"
                            ? "font-semibold text-[var(--color-ink)]"
                            : "text-[var(--color-ink2)]"
                      }
                    >
                      {r.label}
                    </TD>
                    {r.values.map((v, i) => (
                      <TD
                        key={i}
                        className={`text-right font-[family-name:var(--font-mono)] ${
                          emph ? "font-semibold" : ""
                        } ${
                          v < 0
                            ? "text-[var(--color-danger)]"
                            : emph
                              ? "text-[var(--color-ink)]"
                              : "text-[var(--color-ink2)]"
                        }`}
                      >
                        {v !== 0 ? brl0(v) : "—"}
                      </TD>
                    ))}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
