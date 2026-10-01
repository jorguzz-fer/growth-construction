/**
 * Análises do painel do assistente na tela de Unidades (Prompt J, 6.4) —
 * código puro, sem modelo de IA: "Conferir planos de pagamento" e "Revisar
 * cadastro" são contas sobre as unidades que a tela já carregou. Nada aqui
 * grava, e nada sai do sistema.
 */
import { saldoFecha } from "@/lib/unidade-exibicao";

export interface UnidadeParaAnalise {
  id: string;
  code: string;
  status: string;
  valor: number;
  mesVenda: string | null;
  /** Total das fontes do plano (`calcUnitTotal`): 0 quando não vendida. */
  total: number;
}

export interface PlanoDivergente {
  id: string;
  code: string;
  valor: number;
  total: number;
  /** total − valor: positivo = fontes acima do VGV; negativo = abaixo. */
  saldo: number;
}

/** 6.4 · unidades vendidas cuja soma das fontes não fecha com o valor (tolerância R$ 0,01). */
export function conferirPlanos(unidades: readonly UnidadeParaAnalise[]): PlanoDivergente[] {
  return unidades
    .filter((u) => u.status === "Vendido")
    .map((u) => ({ id: u.id, code: u.code, valor: u.valor, total: u.total, saldo: Math.round((u.total - u.valor) * 100) / 100 }))
    .filter((d) => !saldoFecha(d.saldo))
    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo) || a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
}

export type TipoAchado = "venda_sem_data" | "valor_zerado" | "codigo_repetido" | "vendida_sem_plano";

export interface AchadoDeCadastro {
  tipo: TipoAchado;
  id: string;
  code: string;
  descricao: string;
}

const temData = (d: string | null) => !!(d && d.trim());

/** 6.4 · venda sem data, valor zerado, código repetido, unidade vendida sem plano. */
export function revisarCadastro(unidades: readonly UnidadeParaAnalise[]): AchadoDeCadastro[] {
  const achados: AchadoDeCadastro[] = [];
  const porCodigo = new Map<string, UnidadeParaAnalise[]>();
  for (const u of unidades) {
    const k = u.code.trim().toLowerCase();
    porCodigo.set(k, [...(porCodigo.get(k) ?? []), u]);
  }
  for (const u of unidades) {
    const vendida = u.status === "Vendido";
    if (vendida && !temData(u.mesVenda)) {
      achados.push({ tipo: "venda_sem_data", id: u.id, code: u.code, descricao: "vendida sem data da venda" });
    }
    if (!(u.valor > 0)) {
      achados.push({ tipo: "valor_zerado", id: u.id, code: u.code, descricao: "valor (VGV) zerado" });
    }
    if (vendida && u.total === 0) {
      achados.push({ tipo: "vendida_sem_plano", id: u.id, code: u.code, descricao: "vendida sem plano de pagamento" });
    }
    const iguais = porCodigo.get(u.code.trim().toLowerCase()) ?? [];
    if (iguais.length > 1) {
      const outros = iguais.filter((o) => o.id !== u.id).map((o) => `"${o.code}"`);
      achados.push({ tipo: "codigo_repetido", id: u.id, code: u.code, descricao: `código repetido (também em ${outros.join(", ")})` });
    }
  }
  return achados.sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }) || a.tipo.localeCompare(b.tipo));
}

export interface AnaliseDeUnidades {
  planosDivergentes: PlanoDivergente[];
  achados: AchadoDeCadastro[];
  vendidas: number;
  total: number;
}

/** As duas análises de uma vez, para a tela passar ao painel. */
export function analisarUnidades(unidades: readonly UnidadeParaAnalise[]): AnaliseDeUnidades {
  return {
    planosDivergentes: conferirPlanos(unidades),
    achados: revisarCadastro(unidades),
    vendidas: unidades.filter((u) => u.status === "Vendido").length,
    total: unidades.length,
  };
}
