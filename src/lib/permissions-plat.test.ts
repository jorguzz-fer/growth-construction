import { describe, it, expect } from "vitest";
import type { Role } from "./context";
import { SCREENS, TELAS_SO_PLATAFORMA, defaultPermissions, effectivePermissions, overridesDivergentes, validarMatriz } from "./permissions";

/**
 * Prompt PLAT (Fase 3, revisão V5): Chaves de mudança e Backup só para os
 * operadores da plataforma — nem owner nem admin do cliente.
 */
const NONE = { ver: false, criar: false, editar: false, excluir: false };
const FULL = { ver: true, criar: true, editar: true, excluir: true };
const PAPEIS: Role[] = ["owner", "admin", "membro", "contador", "engenheiro"];

describe("Prompt PLAT — telas só da plataforma", () => {
  it("são exatamente Chaves e Backup, e existem em SCREENS", () => {
    expect([...TELAS_SO_PLATAFORMA].sort()).toEqual(["backup", "chaves"]);
    for (const id of TELAS_SO_PLATAFORMA) expect(SCREENS.some((s) => s.id === id)).toBe(true);
  });

  it("nenhum papel do cliente alcança, nem com override que concede tudo", () => {
    const tudo = Object.fromEntries(SCREENS.map((s) => [s.id, { ...FULL }]));
    for (const role of PAPEIS) {
      for (const id of TELAS_SO_PLATAFORMA) {
        expect(defaultPermissions(role)[id], `${role} padrão ${id}`).toEqual(NONE);
        expect(effectivePermissions(role, tudo)[id], `${role} override ${id}`).toEqual(NONE);
      }
    }
  });

  it("o operador da plataforma alcança, em qualquer papel", () => {
    for (const role of PAPEIS) {
      for (const id of TELAS_SO_PLATAFORMA) {
        expect(effectivePermissions(role, null, { operadorDaPlataforma: true })[id], `${role} ${id}`).toEqual(FULL);
      }
    }
  });

  it("as demais telas do owner não mudam", () => {
    const e = effectivePermissions("owner", null);
    for (const s of SCREENS) if (!TELAS_SO_PLATAFORMA.has(s.id)) expect(e[s.id], s.id).toEqual(FULL);
  });

  it("não se concede por override, e salvar a matriz não grava nada delas", () => {
    expect(validarMatriz({ backup: { ...FULL } })).toMatch(/plataforma/);
    expect(validarMatriz({ chaves: { ver: true, criar: false, editar: false, excluir: false } })).toMatch(/plataforma/);
    const matriz = effectivePermissions("membro", null);
    expect(overridesDivergentes("membro", matriz)).toEqual({});
  });
});
