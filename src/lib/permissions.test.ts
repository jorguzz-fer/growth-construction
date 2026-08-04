import { describe, it, expect } from "vitest";
import {
  SCREENS,
  can,
  defaultPermissions,
  effectivePermissions,
  screenIdOfPath,
  type PermMatrix,
} from "./permissions";

/**
 * Teste de REGRESSÃO das permissões.
 *
 * O cliente relatou (e considerou resolvido) um erro em que remover permissões
 * uma a uma acabava provocando "Acesso negado" em telas que deveriam continuar
 * liberadas. A auditoria não encontrou o defeito no código atual — a matriz é
 * enviada inteira e o merge é por tela. Estes testes fixam esse comportamento
 * para que a regressão não volte silenciosamente.
 */
describe("effectivePermissions — merge por tela", () => {
  it("remover a permissão de UMA tela não afeta as demais", () => {
    const base = defaultPermissions("membro");
    const telasComVer = SCREENS.filter((s) => base[s.id]?.ver).map((s) => s.id);
    expect(telasComVer.length).toBeGreaterThan(1);

    const alvo = telasComVer[0];
    const overrides: PermMatrix = {
      [alvo]: { ver: false, criar: false, editar: false, excluir: false },
    };
    const eff = effectivePermissions("membro", overrides);

    expect(can(eff, alvo, "ver")).toBe(false);
    // Todas as outras telas permanecem exatamente como estavam.
    for (const id of telasComVer.slice(1)) {
      expect(can(eff, id, "ver")).toBe(true);
    }
  });

  it("remover várias telas, uma a uma, não derruba as restantes", () => {
    const base = defaultPermissions("membro");
    const telas = SCREENS.filter((s) => base[s.id]?.ver).map((s) => s.id);
    const overrides: PermMatrix = {};
    // Simula o usuário desmarcando as 3 primeiras telas em sequência.
    for (const id of telas.slice(0, 3)) {
      overrides[id] = { ver: false, criar: false, editar: false, excluir: false };
    }
    const eff = effectivePermissions("membro", overrides);
    for (const id of telas.slice(0, 3)) expect(can(eff, id, "ver")).toBe(false);
    for (const id of telas.slice(3)) expect(can(eff, id, "ver")).toBe(true);
  });

  it("override parcial não apaga as demais ações da mesma tela", () => {
    const base = defaultPermissions("membro");
    const alvo = SCREENS.find((s) => base[s.id]?.ver)!.id;
    const eff = effectivePermissions("membro", { [alvo]: { excluir: false } } as PermMatrix);
    expect(can(eff, alvo, "ver")).toBe(true);
    expect(can(eff, alvo, "excluir")).toBe(false);
  });

  it("sem overrides devolve exatamente os padrões do papel", () => {
    expect(effectivePermissions("membro", null)).toEqual(defaultPermissions("membro"));
  });
});

describe("perfil contador — somente leitura", () => {
  const perms = defaultPermissions("contador");

  it("não pode criar, editar nem excluir em nenhuma tela", () => {
    for (const s of SCREENS) {
      expect(can(perms, s.id, "criar")).toBe(false);
      expect(can(perms, s.id, "editar")).toBe(false);
      expect(can(perms, s.id, "excluir")).toBe(false);
    }
  });

  it("enxerga os relatórios essenciais", () => {
    for (const id of ["dre", "fluxocaixa", "consolidado"]) {
      expect(can(perms, id, "ver")).toBe(true);
    }
  });

  it("continua somente-leitura mesmo se um override tentar liberar escrita", () => {
    // Blindagem: ainda que a matriz salva contivesse escrita, o papel contador
    // não deve poder excluir lançamentos. Se este teste passar a falhar, a
    // decisão precisa ser consciente.
    const eff = effectivePermissions("contador", {
      dre: { ver: true, criar: false, editar: false, excluir: false },
    } as PermMatrix);
    expect(can(eff, "dre", "ver")).toBe(true);
    expect(can(eff, "dre", "excluir")).toBe(false);
  });
});

describe("owner — acesso total", () => {
  it("pode tudo em todas as telas", () => {
    const perms = defaultPermissions("owner");
    for (const s of SCREENS) {
      expect(can(perms, s.id, "ver")).toBe(true);
      expect(can(perms, s.id, "excluir")).toBe(true);
    }
  });
});

describe("screenIdOfPath", () => {
  it("mapeia a rota para a tela governada", () => {
    expect(screenIdOfPath("/despesas")).toBe("despesas");
    expect(screenIdOfPath("/despesas/123")).toBe("despesas");
  });

  it("devolve null para rota não governada ou vazia", () => {
    expect(screenIdOfPath("/rota-inexistente")).toBeNull();
    expect(screenIdOfPath(null)).toBeNull();
  });
});

describe("can — ausência de permissão nega por padrão", () => {
  it("tela desconhecida é negada", () => {
    expect(can({}, "qualquer", "ver")).toBe(false);
  });
});
