/**
 * Prompt AE, 6.2 — prévia da chave "resumo_definicao_nova", por obra (versão
 * Atual): os indicadores de hoje e os da definição nova, lado a lado, e o
 * total de unidades. SOMENTE LEITURA, pelas mesmas funções da tela
 * (`calcTotals` e `indicadoresDoResumo`), com a chave desligada e ligada.
 */
import { calcTotals } from "@/lib/calc";
import { getPermutas, getReembolsos, getUnits, getVersionsDoProjeto, permToCalc, reembToCalc, toCalcUnit } from "@/lib/queries";
import { indicadoresDoResumo } from "@/lib/resumo-tela";

export interface LinhaPreviaResumo {
  label: string;
  hoje: number | null;
  nova: number | null;
}

export interface PreviaResumoObra {
  projeto: string;
  temAtual: boolean;
  linhas: LinhaPreviaResumo[];
}

export async function previaResumoDefinicaoNova(
  tenantId: string,
  projetos: readonly { id: string; name: string }[],
): Promise<PreviaResumoObra[]> {
  const out: PreviaResumoObra[] = [];
  for (const p of projetos) {
    const atual = (await getVersionsDoProjeto(tenantId, p.id)).find((v) => v.kind === "atual");
    if (!atual) {
      out.push({ projeto: p.name, temAtual: false, linhas: [] });
      continue;
    }
    const [units, perms, reembs] = await Promise.all([getUnits(tenantId, atual.id), getPermutas(tenantId, atual.id), getReembolsos(tenantId, atual.id)]);
    const lib = reembToCalc(reembs).map((r, i) => ({ ...r, status: reembs[i].status ?? null }));
    const calc = (definicaoNova: boolean) => {
      const totals = calcTotals(units.map(toCalcUnit), permToCalc(perms), lib, { definicaoNova });
      return { totals, ind: indicadoresDoResumo({ totals, unidades: units, permutas: perms, liberacoes: reembs.length, definicaoNova }) };
    };
    const hoje = calc(false);
    const nova = calc(true);
    const valorDe = (xs: typeof hoje.ind, label: string) => {
      const i = xs.find((x) => x.label === label);
      return i ? (i.vazio ? null : i.value) : null;
    };
    const labels = [...new Set([...hoje.ind.map((i) => i.label), ...nova.ind.map((i) => i.label)])];
    out.push({
      projeto: p.name,
      temAtual: true,
      linhas: [
        ...labels.map((label) => ({ label, hoje: valorDe(hoje.ind, label), nova: valorDe(nova.ind, label) })),
        { label: "Total de unidades (contagem)", hoje: hoje.totals.vend + hoje.totals.res + hoje.totals.disp, nova: units.length },
      ],
    });
  }
  return out;
}
