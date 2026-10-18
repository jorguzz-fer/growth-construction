/**
 * Prompt M2 (Fase 3 · revisão V5): o perfil da base de clientes — relatório
 * agregado para a tela Clientes e para a Cris. Módulo PURO.
 *
 * Só campos que não são sensíveis, e só contagens: situação do contrato,
 * cidade, finalidade (morar ou investir), canal (como conheceu), faixa etária
 * e se tem unidade. Renda, FGTS, score, documento e contato NÃO entram (regra
 * BE-2). Categoria com menos de 3 clientes vai para "Outros", para ninguém ser
 * reconhecido pelo número.
 */
export const MINIMO_POR_GRUPO = 3;

export interface ClienteParaPerfil {
  statusContrato: string | null;
  cidadeEstado: string | null;
  morarOuInvestir: string | null;
  comoConheceu: string | null;
  nascimento: string | null;
  unitCode: string | null;
}

export interface Contagem {
  rotulo: string;
  qtd: number;
}

export interface PerfilDaBase {
  total: number;
  comUnidade: number;
  porSituacao: Contagem[];
  porCidade: Contagem[];
  porFinalidade: Contagem[];
  porCanal: Contagem[];
  porFaixaEtaria: Contagem[];
}

/** Idade em anos completos; aceita "YYYY-MM-DD" e "MM/DD/YYYY". */
export function idade(nascimento: string | null | undefined, hoje: Date): number | null {
  const s = (nascimento ?? "").trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [m, d, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  let a = hoje.getFullYear() - y;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) a--;
  return a >= 0 && a < 120 ? a : null;
}

export function faixaEtaria(a: number | null): string {
  if (a == null) return "Não informada";
  if (a < 25) return "Até 24";
  if (a < 35) return "25 a 34";
  if (a < 45) return "35 a 44";
  if (a < 55) return "45 a 54";
  if (a < 65) return "55 a 64";
  return "65 ou mais";
}

/** Conta, ordena e junta em "Outros" o que tem menos que o mínimo. */
export function contar(valores: readonly (string | null | undefined)[], opts: { vazio?: string; maximo?: number } = {}): Contagem[] {
  const vazio = opts.vazio ?? "Não informado";
  const m = new Map<string, number>();
  for (const v of valores) {
    const k = (v ?? "").trim() || vazio;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  let lista = [...m.entries()].map(([rotulo, qtd]) => ({ rotulo, qtd })).sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo));
  let outros = 0;
  lista = lista.filter((c) => {
    if (c.qtd < MINIMO_POR_GRUPO && c.rotulo !== vazio) {
      outros += c.qtd;
      return false;
    }
    return true;
  });
  if (opts.maximo && lista.length > opts.maximo) {
    outros += lista.slice(opts.maximo).reduce((a, c) => a + c.qtd, 0);
    lista = lista.slice(0, opts.maximo);
  }
  if (outros) lista.push({ rotulo: `Outros (menos de ${MINIMO_POR_GRUPO} cada)`, qtd: outros });
  return lista;
}

export function perfilDaBase(clientes: readonly ClienteParaPerfil[], hoje = new Date()): PerfilDaBase {
  return {
    total: clientes.length,
    comUnidade: clientes.filter((c) => (c.unitCode ?? "").trim()).length,
    porSituacao: contar(clientes.map((c) => c.statusContrato), { vazio: "Sem situação" }),
    porCidade: contar(clientes.map((c) => c.cidadeEstado), { maximo: 8 }),
    porFinalidade: contar(clientes.map((c) => c.morarOuInvestir)),
    porCanal: contar(clientes.map((c) => c.comoConheceu), { maximo: 8 }),
    porFaixaEtaria: contar(clientes.map((c) => faixaEtaria(idade(c.nascimento, hoje))), { vazio: "Não informada" }),
  };
}
