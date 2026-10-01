import { readFileSync, existsSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { TELAS_REMOVIDAS, avisoDeTelaRemovida, redirecionamentosDeTelasRemovidas } from "./telas-removidas";
import { SCREEN_IDS, defaultPermissions, effectivePermissions, screenIdOfPath, type PermMatrix } from "./permissions";
import { NAV_MENU } from "./nav-menu";

describe("Prompt AL · Parte 1 — a tela Acesso Contabilidade sai", () => {
  it("1 — /contabilidade redireciona para /usuarios com o aviso (BAL-3); next.config tem as mesmas regras", () => {
    const cfg = readFileSync("next.config.ts", "utf8");
    for (const r of redirecionamentosDeTelasRemovidas()) {
      expect(cfg).toContain(`{ source: "${r.source}", destination: "${r.destination}", permanent: false }`);
    }
    expect(redirecionamentosDeTelasRemovidas().map((r) => r.source)).toEqual(["/contabilidade", "/contabilidade/:path*"]);
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
