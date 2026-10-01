import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Prompt L, Parte 6 (6.1) — a DRE é por competência e vem da despesa; o
 * caixa (cash_entry) não entra nela. Este teste trava isso no código: os
 * arquivos que montam a DRE não podem ler a tabela de movimentos.
 */
describe("DRE não lê o caixa (Prompt L, 6.1)", () => {
  it("página da DRE e cálculo de natureza não citam cash_entry nem getCash", () => {
    for (const f of ["src/app/(app)/dre/page.tsx", "src/lib/dre-inputs.ts", "src/lib/calc/dre-cascata.ts", "src/lib/calc/natureza-dre.ts", "src/components/app/dre-controls.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/cashEntries|cash_entry|getCash\b|getCashAll/);
    }
  });
});
