/**
 * Cálculo dos valores da NFS-e.
 *
 * Produz exatamente os números que vão no bloco `servico` da nota (base de
 * cálculo, ISS, retenções) e o **valor líquido a receber** — que é o que
 * interessa ao Contas a Receber e à conciliação de caixa. Nota de R$ 100.000
 * com ISS retido e INSS não deposita R$ 100.000 na conta; se o sistema tratar
 * bruto e líquido como a mesma coisa, toda conciliação vai acusar diferença.
 *
 * ## O que este módulo NÃO decide
 *
 * **Quais tributos incidem.** Retenção federal em serviço de construção civil
 * depende do tipo de contrato (empreitada global × cessão de mão de obra), do
 * regime do prestador e da natureza do tomador — regra que muda por contrato e
 * que a contabilidade do cliente define, não o software. Aqui cada retenção é
 * informada explicitamente (alíquota e, quando for o caso, base própria); o
 * módulo só faz a conta. Um padrão embutido produziria nota errada com
 * aparência de nota certa, que é o pior resultado possível.
 *
 * A convenção de base segue a prática fiscal: o **ISS** incide sobre a base de
 * cálculo (serviços menos deduções e desconto incondicionado) e as **retenções
 * federais** sobre o valor bruto dos serviços, salvo base informada caso a caso
 * — é comum o INSS ter base própria (só a parcela de mão de obra).
 */

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Uma retenção federal: alíquota em % e, opcionalmente, base própria. */
export interface RetencaoFederal {
  aliquota: number;
  /** Base própria. Ausente = valor bruto dos serviços. */
  base?: number;
}

export interface RetencoesFederais {
  pis?: RetencaoFederal;
  cofins?: RetencaoFederal;
  csll?: RetencaoFederal;
  /** IRRF. */
  ir?: RetencaoFederal;
  /** INSS — costuma ter base própria (parcela de mão de obra da medição). */
  inss?: RetencaoFederal;
}

export interface EntradaNfse {
  valorServicos: number;
  /** Deduções admitidas pelo município (materiais, subempreitada). */
  valorDeducoes?: number;
  descontoIncondicionado?: number;
  descontoCondicionado?: number;
  /** Alíquota do ISS em % (0 a 5). */
  aliquotaIss: number;
  /** O tomador retém o ISS? */
  issRetido: boolean;
  retencoes?: RetencoesFederais;
  /** Retenções municipais/contratuais que não têm campo próprio. */
  outrasRetencoes?: number;
}

export interface ResultadoNfse {
  baseCalculo: number;
  valorIss: number;
  /** Só é maior que zero quando o ISS é retido pelo tomador. */
  valorIssRetido: number;
  retencoes: { pis: number; cofins: number; csll: number; ir: number; inss: number };
  totalRetencoesFederais: number;
  outrasRetencoes: number;
  /** Tudo que o tomador retém e recolhe no lugar do prestador. */
  totalRetencoes: number;
  /** Bruto menos desconto incondicionado menos retenções. */
  valorLiquido: number;
  /** O mesmo, caso o desconto condicionado se concretize. */
  valorLiquidoComDescontoCondicionado: number;
}

const naoNegativo = (v: number | undefined | null) =>
  !v || !Number.isFinite(v) || v < 0 ? 0 : v;

function aplicar(
  ret: RetencaoFederal | undefined,
  baseBruta: number,
): number {
  if (!ret || !Number.isFinite(ret.aliquota) || ret.aliquota <= 0) return 0;
  const base = ret.base === undefined ? baseBruta : naoNegativo(ret.base);
  return round2((base * ret.aliquota) / 100);
}

/**
 * Recusa o que a prefeitura recusaria — ou o que produziria nota sem sentido.
 * Devolve `null` quando está tudo certo.
 */
export function validarNfse(e: EntradaNfse): string | null {
  if (!Number.isFinite(e.valorServicos) || e.valorServicos <= 0) {
    return "O valor dos serviços deve ser maior que zero.";
  }
  if (!Number.isFinite(e.aliquotaIss) || e.aliquotaIss < 0 || e.aliquotaIss > 5) {
    return "A alíquota do ISS deve estar entre 0 e 5%.";
  }
  const deducoes = naoNegativo(e.valorDeducoes);
  const descIncond = naoNegativo(e.descontoIncondicionado);
  if (deducoes + descIncond > e.valorServicos) {
    return "Deduções e desconto incondicionado não podem superar o valor dos serviços.";
  }
  return null;
}

/**
 * Calcula os valores da nota.
 *
 * Assume entrada já validada por `validarNfse` — valores negativos são tratados
 * como zero em vez de gerar número absurdo silenciosamente.
 */
export function calcularNfse(e: EntradaNfse): ResultadoNfse {
  const bruto = naoNegativo(e.valorServicos);
  const deducoes = naoNegativo(e.valorDeducoes);
  const descIncond = naoNegativo(e.descontoIncondicionado);
  const descCond = naoNegativo(e.descontoCondicionado);

  const baseCalculo = round2(Math.max(0, bruto - deducoes - descIncond));
  const aliquota = Math.max(0, e.aliquotaIss || 0);
  const valorIss = round2((baseCalculo * aliquota) / 100);
  const valorIssRetido = e.issRetido ? valorIss : 0;

  const r = e.retencoes ?? {};
  const retencoes = {
    pis: aplicar(r.pis, bruto),
    cofins: aplicar(r.cofins, bruto),
    csll: aplicar(r.csll, bruto),
    ir: aplicar(r.ir, bruto),
    inss: aplicar(r.inss, bruto),
  };
  const totalRetencoesFederais = round2(
    retencoes.pis + retencoes.cofins + retencoes.csll + retencoes.ir + retencoes.inss,
  );
  const outrasRetencoes = round2(naoNegativo(e.outrasRetencoes));
  const totalRetencoes = round2(
    valorIssRetido + totalRetencoesFederais + outrasRetencoes,
  );

  const valorLiquido = round2(bruto - descIncond - totalRetencoes);

  return {
    baseCalculo,
    valorIss,
    valorIssRetido,
    retencoes,
    totalRetencoesFederais,
    outrasRetencoes,
    totalRetencoes,
    valorLiquido,
    valorLiquidoComDescontoCondicionado: round2(valorLiquido - descCond),
  };
}

/**
 * Natureza da operação da NFS-e (campo `natureza_operacao`).
 *
 * `1` tributa no município do prestador e `2` fora dele. Na construção civil o
 * ISS é devido no município da OBRA (LC 116/2003, art. 3º, III) — por isso a
 * escolha sai da comparação entre o município do prestador e o da prestação, e
 * não de uma preferência do usuário.
 */
export const NATUREZAS_OPERACAO = [
  { id: "1", label: "Tributação no município" },
  { id: "2", label: "Tributação fora do município" },
  { id: "3", label: "Isenção" },
  { id: "4", label: "Imune" },
  { id: "5", label: "Exigibilidade suspensa por decisão judicial" },
  { id: "6", label: "Exigibilidade suspensa por procedimento administrativo" },
] as const;

export type NaturezaOperacao = (typeof NATUREZAS_OPERACAO)[number]["id"];

export function naturezaPorMunicipio(
  codigoMunicipioPrestador: string | null | undefined,
  codigoMunicipioPrestacao: string | null | undefined,
): NaturezaOperacao {
  const p = (codigoMunicipioPrestador ?? "").replace(/\D/g, "");
  const s = (codigoMunicipioPrestacao ?? "").replace(/\D/g, "");
  if (!p || !s || p === s) return "1";
  return "2";
}
