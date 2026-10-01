import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl0 } from "@/lib/utils";
import { LIMITE_ATUALIZACAO_DIAS } from "@/lib/calc/cadeia-caixa";

export interface SaldoDaConta {
  id: string;
  nome: string;
  emConta: number;
  conciliado: number;
  origem: "auto" | "manual";
  atualizadoEm: string | null;
  diasDesde: number | null;
  conectada: boolean;
}

/**
 * Topo do Caixa (Prompt L, 1.0 e 1.2): os dois saldos lado a lado — EM
 * CONTA (extrato, fato do banco) e CONCILIADO (o que os lançamentos
 * sustentam) — por conta e no total, com a diferença; quando e por onde o
 * saldo em conta foi obtido (1.0.1), alerta quando está velho (1.0.2),
 * importar extrato em destaque (1.0.3) e o caminho do Open Finance (1.0.4).
 */
export function SaldosCaixa({ contas, total, importar, openFinance }: { contas: SaldoDaConta[]; total: { emConta: number; conciliado: number }; importar: React.ReactNode; openFinance: { configurado: boolean; podeConfigurar: boolean } }) {
  const diferencaTotal = Math.round((total.emConta - total.conciliado) * 100) / 100;
  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Os dois saldos</h2>
            <p className="text-[11.5px] text-[var(--color-ink3)]">
              <strong>Em conta</strong> é o do extrato (fato do banco). <strong>Conciliado</strong> é o que os lançamentos sustentam. Num dia inteiramente conciliado, os dois coincidem; a diferença é o que a tela existe para mostrar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {importar}
            {openFinance.podeConfigurar ? (
              <Link href="/contas" className="text-[12px] text-[var(--color-accent2)] hover:underline" title="Informe o ID Open Finance da conta em Contas Correntes">
                Open Finance {openFinance.configurado ? "ativo" : "não configurado"} → configurar
              </Link>
            ) : (
              <Badge tone={openFinance.configurado ? "success" : "neutral"}>Open Finance {openFinance.configurado ? "ativo" : "não configurado"}</Badge>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--color-ink4)]">
                <th className="py-1 font-normal">Conta</th>
                <th className="py-1 text-right font-normal">Em conta (extrato)</th>
                <th className="py-1 text-right font-normal">Conciliado</th>
                <th className="py-1 text-right font-normal">Diferença</th>
                <th className="py-1 font-normal">Última atualização do saldo em conta</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => {
                const dif = Math.round((c.emConta - c.conciliado) * 100) / 100;
                const velho = c.diasDesde == null || c.diasDesde > LIMITE_ATUALIZACAO_DIAS;
                return (
                  <tr key={c.id} className="border-t border-[var(--color-line)]">
                    <td className="py-1.5 font-medium text-[var(--color-ink)]">{c.nome}</td>
                    <td className="py-1.5 text-right font-[family-name:var(--font-mono)]">{brl0(c.emConta)}</td>
                    <td className="py-1.5 text-right font-[family-name:var(--font-mono)]">{brl0(c.conciliado)}</td>
                    <td className={`py-1.5 text-right font-[family-name:var(--font-mono)] ${Math.abs(dif) > 0.005 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>{brl0(dif)}</td>
                    <td className="py-1.5 text-[11.5px] text-[var(--color-ink2)]">
                      {c.atualizadoEm ? `${c.atualizadoEm.slice(0, 10).split("-").reverse().join("/")} · ${c.origem === "auto" ? (c.conectada ? "Open Finance / extrato" : "extrato importado") : "lançado à mão"}` : "nunca atualizado"}
                      {velho && <Badge tone="warning" className="ml-1.5">{c.diasDesde == null ? "sem data" : `há ${c.diasDesde} dias`} — extrato desatualizado?</Badge>}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--color-line)] font-semibold text-[var(--color-ink)]">
                <td className="py-1.5">Total (contas ativas da empresa)</td>
                <td className="py-1.5 text-right font-[family-name:var(--font-mono)]">{brl0(total.emConta)}</td>
                <td className="py-1.5 text-right font-[family-name:var(--font-mono)]">{brl0(total.conciliado)}</td>
                <td className={`py-1.5 text-right font-[family-name:var(--font-mono)] ${Math.abs(diferencaTotal) > 0.005 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>{brl0(diferencaTotal)}</td>
                <td className="py-1.5 text-[11px] font-normal text-[var(--color-ink3)]">{contas.length === 0 ? "Nenhuma conta ativa — cadastre em Contas Correntes." : "Lançamentos sem conta entram só no total."}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
