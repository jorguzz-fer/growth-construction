import { describe, it, expect } from "vitest";
import { SCREEN_IDS, defaultPermissions, effectivePermissions, type PermMatrix } from "./permissions";
import {
  NAV_MENU,
  activeModuleId,
  isItemActive,
  permOf,
  roleLabel,
  visibleMenu,
} from "./nav-menu";

/**
 * O menu antigo (sidebar.tsx antes do Prompt C), item a item: rota → chave de
 * permissão. É a referência de não regressão — nenhuma tela pode sumir e
 * nenhuma pode mudar de chave (seções 21 e 26 do Prompt C).
 */
const MENU_ANTIGO: Record<string, string> = {
  "/budget": "budget",
  "/forecast": "forecast",
  "/planocontas": "planocontas",
  "/unidades": "unidades",
  "/contasreceber": "contasreceber",
  "/clientes": "clientes",
  "/simulador": "simulador",
  "/reembolso": "reembolso",
  "/permuta": "permuta",
  "/parametros": "parametros",
  "/despesas": "despesas",
  "/contaspagar": "contaspagar",
  "/restituicoes": "restituicoes",
  "/acerto": "despesas",
  "/medicaolanc": "medicaolanc",
  "/fornecedores": "fornecedores",
  "/contas": "contas",
  "/estoque": "estoque",
  // "/ponto" saiu no Prompt Z (Parte 1): o módulo Pessoas substitui o ponto por
  // geolocalização. `time_entry` fica no banco.
  "/caixa": "caixa",
  // "/fechamento" saiu no Prompt L, Parte 9: fechar o dia é ação no cartão do
  // Caixa e o histórico já é o Balanço do Dia (9.8). A chave "fechamento" fica.
  "/dashboard": "dashboard",
  "/projecao": "projecao",
  "/consolidado": "consolidado",
  "/balancodia": "balancodia",
  "/dre": "dre",
  "/fluxocaixa": "fluxocaixa",
  "/medicao": "medicao",
  "/resumo": "resumo",
  "/projeto": "projeto",
  "/numeracao": "numeracao",
  "/empresa": "empresa",
  "/usuarios": "usuarios",
  "/acessos": "acessos",
  "/acoes": "acoes",
  "/contabilidade": "contabilidade",
  "/diagnosticoia": "diagnosticoia",
  "/diagnostico/categorias-invertidas": "despesas",
  "/diagnostico/planos-recebiveis": "unidades",
  "/backup": "backup",
};

/** Telas que entraram no menu depois dele, cada uma com a sua chave. */
const TELAS_NOVAS: Record<string, string> = {
  "/chaves": "chaves", // V2-BLOQUEIOS B4
  "/cartoes": "cartoes", // Prompt U, seção 1
  "/funcionarios": "funcionarios", // Prompt Z, Parte 2
  "/equipes": "equipes", // Prompt Z, Parte 3
  "/conferencia": "conferencia", // Prompt AN, Parte 5 (era /diagnostico/categorias-invertidas)
};
/**
 * Prompt V, 0.2: /medicaolanc SAIU do menu (continua rota e aba da tela única
 * de Medição de Obra). O item /medicao aparece para quem tem `medicao` OU
 * `medicaolanc` — o engenheiro continua vendo o módulo Obra.
 */
const FUNDIDAS_NO_ITEM: Record<string, string> = { "/medicao": "medicaolanc" };
/** Prompt AL: /contabilidade saiu do sistema (virou redirecionamento para /usuarios). */
const SAIRAM = new Set([
  "/medicaolanc",
  "/contabilidade",
  // Prompt AN: a Conferência de lançamentos mudou para /conferencia; a de planos saiu.
  "/diagnostico/categorias-invertidas",
  "/diagnostico/planos-recebiveis",
]);
const ESPERADO = Object.fromEntries(Object.entries({ ...MENU_ANTIGO, ...TELAS_NOVAS }).filter(([href]) => !SAIRAM.has(href)));

const todos = NAV_MENU.flatMap((m) => m.items);

describe("NAV_MENU — nenhuma tela se perde", () => {
  it("tem as 38 telas do menu antigo (40 menos /fechamento e /ponto) menos /medicaolanc (fundida, Prompt V) e /contabilidade (removida, Prompt AL), mais as novas declaradas, sem duplicata", () => {
    const hrefs = todos.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect([...hrefs].sort()).toEqual(Object.keys(ESPERADO).sort());
    expect(Object.keys(MENU_ANTIGO)).toHaveLength(38);
  });

  it("Prompt V: um item só de medição, que também destaca /medicaolanc e aparece para o engenheiro", () => {
    const item = todos.find((i) => i.href === "/medicao")!;
    expect(todos.filter((i) => /medicao/.test(i.href))).toHaveLength(1);
    expect(item.permAlt).toBe("medicaolanc");
    expect(isItemActive("/medicaolanc", item.href, item.tambem)).toBe(true);
    expect(isItemActive("/medicaolanc?aba=lancadas".split("?")[0], item.href, item.tambem)).toBe(true);
    // o engenheiro não tem `medicao.ver` (a guarda central negaria /medicao): o item dele aponta para /medicaolanc
    expect(visibleMenu(defaultPermissions("engenheiro")).flatMap((m) => m.items.map((i) => i.href))).toEqual(["/medicaolanc"]);
    expect(visibleMenu(defaultPermissions("admin")).flatMap((m) => m.items.filter((i) => /medicao/.test(i.href)).map((i) => i.href))).toEqual(["/medicao"]);
  });

  it("cada tela mantém a mesma chave de permissão", () => {
    for (const it of todos) expect(permOf(it), it.href).toBe(ESPERADO[it.href]);
  });

  it("toda chave existe em SCREENS (chave errada some para todos ou aparece para todos)", () => {
    for (const it of todos) expect(SCREEN_IDS, it.href).toContain(permOf(it));
  });

  it("não traz /versao ao menu (decisão de exposição fica com o dono)", () => {
    expect(todos.some((i) => i.href.startsWith("/versao"))).toBe(false);
  });
});

/** Visibilidade pela regra de sempre, sobre a lista antiga mais as novas. */
function visiveisAntigo(perms: PermMatrix): string[] {
  return Object.entries(ESPERADO)
    .flatMap(([href, perm]) => {
      if (perms[perm]?.ver) return [href];
      // item fundido: só com a permissão da outra aba, a rota é a dela
      const alt = FUNDIDAS_NO_ITEM[href];
      return alt && perms[alt]?.ver ? [`/${alt}`] : [];
    })
    .sort();
}
function visiveisNovo(perms: PermMatrix): string[] {
  return visibleMenu(perms)
    .flatMap((m) => m.items.map((i) => i.href))
    .sort();
}

describe("visibleMenu — não amplia nem reduz acesso", () => {
  for (const role of ["owner", "admin", "membro", "contador", "engenheiro"] as const) {
    it(`papel ${role}: enxerga exatamente as mesmas telas de antes`, () => {
      const perms = defaultPermissions(role);
      expect(visiveisNovo(perms)).toEqual(visiveisAntigo(perms));
    });
  }

  it("Chaves de mudança (B4): só owner e admin, mesmo com override", () => {
    const ve = (perms: PermMatrix) => visiveisNovo(perms).includes("/chaves");
    expect(ve(defaultPermissions("owner"))).toBe(true);
    expect(ve(defaultPermissions("admin"))).toBe(true);
    for (const role of ["membro", "contador", "engenheiro"] as const) {
      expect(ve(defaultPermissions(role)), role).toBe(false);
      const override = { chaves: { ver: true, criar: true, editar: true, excluir: true } };
      expect(ve(effectivePermissions(role, override)), `${role} com override`).toBe(false);
    }
  });

  it("matriz personalizada: o mesmo conjunto de antes", () => {
    const perms = defaultPermissions("contador");
    perms.unidades = { ver: true, criar: false, editar: false, excluir: false };
    perms.dre = { ver: false, criar: false, editar: false, excluir: false };
    expect(visiveisNovo(perms)).toEqual(visiveisAntigo(perms));
  });

  it("módulo sem item visível some inteiro", () => {
    const mods = visibleMenu(defaultPermissions("engenheiro")).map((m) => m.id);
    expect(mods).toEqual(["obra"]);
  });

  it("sem permissão nenhuma, menu vazio", () => {
    expect(visibleMenu({})).toEqual([]);
  });
});

describe("isItemActive — prefixo na fronteira de segmento", () => {
  it("sub-rotas mantêm o pai destacado", () => {
    expect(isItemActive("/clientes/novo", "/clientes")).toBe(true);
    expect(isItemActive("/clientes/abc-123", "/clientes")).toBe(true);
    expect(isItemActive("/unidades/nova", "/unidades")).toBe(true);
    expect(isItemActive("/unidades/42", "/unidades")).toBe(true);
    expect(isItemActive("/permuta/novo", "/permuta")).toBe(true);
    expect(isItemActive("/reembolso/novo", "/reembolso")).toBe(true);
  });

  it("/contas × /contaspagar × /contasreceber não se destacam mutuamente", () => {
    expect(isItemActive("/contaspagar", "/contas")).toBe(false);
    expect(isItemActive("/contasreceber", "/contas")).toBe(false);
    expect(isItemActive("/contas", "/contaspagar")).toBe(false);
    expect(isItemActive("/contasreceber", "/contaspagar")).toBe(false);
    expect(isItemActive("/contas", "/contas")).toBe(true);
  });

  it("/medicao × /medicaolanc não se destacam mutuamente", () => {
    expect(isItemActive("/medicaolanc", "/medicao")).toBe(false);
    expect(isItemActive("/medicao", "/medicaolanc")).toBe(false);
  });

  it("a Conferência destaca só a si", () => {
    expect(isItemActive("/conferencia", "/conferencia")).toBe(true);
    expect(isItemActive("/conferencia", "/contas")).toBe(false);
  });

  it("nenhum par de itens do menu se destaca ao mesmo tempo", () => {
    for (const x of todos) {
      const ativos = todos.filter((y) => isItemActive(x.href, y.href));
      expect(ativos.map((y) => y.href), x.href).toEqual([x.href]);
    }
  });

  it("/perfil e rota nula não ativam nada", () => {
    expect(activeModuleId("/perfil")).toBeNull();
    expect(activeModuleId(null)).toBeNull();
  });

  it("módulo ativo acompanha a tela", () => {
    expect(activeModuleId("/projeto")).toBe("planejamento");
    expect(activeModuleId("/unidades/nova")).toBe("receitas");
    expect(activeModuleId("/diagnosticoia")).toBe("bi");
    expect(activeModuleId("/conferencia")).toBe("config");
  });
});

describe("roleLabel", () => {
  it("traduz os cinco papéis e deixa o desconhecido como veio", () => {
    expect(roleLabel("owner")).toBe("Proprietário");
    expect(roleLabel("admin")).toBe("Administrador");
    expect(roleLabel("xyz")).toBe("xyz");
  });
});
