import { readFileSync, existsSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { TELAS_REMOVIDAS, avisoDeTelaRemovida, redirecionamentosDeTelasRemovidas } from "./telas-removidas";
import { SCREEN_IDS, defaultPermissions, effectivePermissions, overridesDivergentes, screenIdOfPath, type PermMatrix } from "./permissions";
import { NAV_MENU } from "./nav-menu";

describe("Prompt AL · Parte 1 — a tela Acesso Contabilidade sai", () => {
  it("1 — /contabilidade redireciona para /usuarios com o aviso (BAL-3); next.config tem as mesmas regras", () => {
    const cfg = readFileSync("next.config.ts", "utf8");
    for (const r of redirecionamentosDeTelasRemovidas()) {
      expect(cfg).toContain(`{ source: "${r.source}", destination: "${r.destination}", permanent: false }`);
    }
    expect(redirecionamentosDeTelasRemovidas().map((r) => r.source)).toEqual([
      "/contabilidade",
      "/contabilidade/:path*",
      "/diagnostico/planos-recebiveis",
      "/diagnostico/planos-recebiveis/:path*",
    ]);
    expect(avisoDeTelaRemovida("contabilidade")).toMatch(/Acesso Contabilidade saiu/);
    expect(avisoDeTelaRemovida(["contabilidade"])).toBe(TELAS_REMOVIDAS.contabilidade.aviso);
    expect(avisoDeTelaRemovida(undefined)).toBeNull();
    expect(avisoDeTelaRemovida("toString")).toBeNull();
    expect(avisoDeTelaRemovida("dre")).toBeNull();
  });

  it("1.4 — a página não existe mais (nenhuma rota fica sem id de permissão)", () => {
    expect(existsSync("src/app/(app)/contabilidade/page.tsx")).toBe(false);
    expect(SCREEN_IDS).not.toContain("contabilidade");
    expect(screenIdOfPath("/contabilidade")).toBeNull();
  });

  it("2 — nenhum item de menu aponta para ela", () => {
    expect(NAV_MENU.flatMap((m) => m.items).some((i) => i.href.startsWith("/contabilidade"))).toBe(false);
  });

  it("3 — varredura: nenhuma menção restante à rota ou ao id no código", () => {
    // fora deste módulo (que guarda o redirecionamento) e dos testes
    const arquivos = [
      "src/lib/permissions.ts",
      "src/lib/nav-menu.ts",
      "src/lib/actions/users.ts",
      "src/app/(app)/usuarios/page.tsx",
      "src/app/(app)/acessos/page.tsx",
      "src/components/app/access-matrix.tsx",
    ];
    for (const f of arquivos) {
      const txt = readFileSync(f, "utf8");
      expect(txt, f).not.toMatch(/["'`]\/contabilidade/);
      expect(txt, f).not.toMatch(/inviteContador/);
    }
  });

  it("5 — override gravado para `contabilidade` é inerte: não muda nenhuma célula efetiva", () => {
    const comOrfa: PermMatrix = { contabilidade: { ver: true, criar: true, editar: true, excluir: true } };
    for (const role of ["membro", "contador", "engenheiro"] as const) {
      expect(effectivePermissions(role, comOrfa)).toEqual(effectivePermissions(role, null));
      expect(effectivePermissions(role, comOrfa)).not.toHaveProperty("contabilidade");
    }
  });

  it("8.2 — owner, admin, membro e engenheiro: nenhuma célula das telas que ficam muda", () => {
    for (const role of ["owner", "admin", "membro", "engenheiro"] as const) {
      const p = defaultPermissions(role);
      expect(Object.keys(p).sort()).toEqual([...SCREEN_IDS].sort());
    }
  });
});

describe("Prompt AN · Partes 5 e 6 — Conferência com id próprio; a de planos sai", () => {
  it("16a — /diagnostico/planos-recebiveis não existe mais, redireciona para Unidades com o aviso, e nenhum menu aponta para ela", () => {
    expect(existsSync("src/app/(app)/diagnostico/planos-recebiveis/page.tsx")).toBe(false);
    expect(avisoDeTelaRemovida("planos-recebiveis")).toMatch(/Conferência de planos saiu.*plano de pagamento da unidade/);
    expect(NAV_MENU.flatMap((m) => m.items).some((i) => i.href.startsWith("/diagnostico/"))).toBe(false);
  });

  it("17 — a Conferência mora em /conferencia, tem id em SCREENS e passa pelo enforcement central; a URL antiga redireciona", () => {
    expect(existsSync("src/app/(app)/conferencia/page.tsx")).toBe(true);
    expect(existsSync("src/app/(app)/diagnostico/categorias-invertidas/page.tsx")).toBe(false);
    expect(screenIdOfPath("/conferencia")).toBe("conferencia");
    expect(readFileSync("next.config.ts", "utf8")).toContain('{ source: "/diagnostico/categorias-invertidas", destination: "/conferencia", permanent: false }');
  });

  it("18 — a checagem própria continua: a página exige conferencia E despesas", () => {
    const src = readFileSync("src/app/(app)/conferencia/page.tsx", "utf8");
    expect(src).toContain('can(ctx.perms, "conferencia", "ver")');
    expect(src).toContain('can(ctx.perms, "despesas", "ver")');
  });

  it("19 — quem alcançava continua alcançando: conferencia = despesas, célula a célula, para todo papel e override", () => {
    const overrides: (PermMatrix | null)[] = [
      null,
      { despesas: { ver: false, criar: false, editar: false, excluir: false } },
      { despesas: { ver: true, criar: false, editar: false, excluir: false } },
      { despesas: { ver: true, criar: true, editar: true, excluir: true } },
      // override gravado na própria chave não vale
      { conferencia: { ver: true, criar: true, editar: true, excluir: true }, despesas: { ver: false, criar: false, editar: false, excluir: false } },
    ];
    for (const role of ["owner", "admin", "membro", "contador", "engenheiro"] as const)
      for (const restrito of [false, true])
        for (const o of overrides) {
          const e = effectivePermissions(role, o, { membroRestrito: restrito });
          expect(e.conferencia, `${role} ${JSON.stringify(o)}`).toEqual(e.despesas);
        }
  });

  it("a tela que acompanha outra não é gravada como override", () => {
    const m = defaultPermissions("membro");
    m.conferencia = { ver: false, criar: false, editar: false, excluir: false };
    expect(overridesDivergentes("membro", m)).not.toHaveProperty("conferencia");
  });
});
