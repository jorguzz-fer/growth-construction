import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getPlanosSuspeitos } from "@/lib/actions/diagnostico";
import { dateBR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico dos planos de pagamento de venda (item 6.3).
 *
 * Aponta duas coisas, sem alterar nenhuma delas:
 *
 *  - intervalo entre a data-base (ato) e a primeira mensal maior que a carência
 *    esperada — pode ser carência combinada em contrato ou digitação errada;
 *  - dia de vencimento que não existe em algum mês da série (ex.: 31 em abril).
 *
 * **Nenhuma data de recebível contratado é alterada aqui.** Corrigir um plano é
 * decisão comercial, feita na tela da unidade, com o contrato à vista.
 */
export default async function PlanosRecebiveisPage({
  searchParams,
}: {
  searchParams: Promise<{ carencia?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "unidades", "ver")) return <AccessDenied />;

  const sp = await searchParams;
  const carencia = Number(sp.carencia) > 0 ? Number(sp.carencia) : 1;
  const rows = await getPlanosSuspeitos(carencia);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Diagnóstico — planos de recebíveis"
        subtitle={`Planos cuja primeira mensal está a mais de ${carencia} mês(es) da data-base, ou com dia de vencimento inexistente em algum mês.`}
      />

      <Card className="mb-4">
        <CardContent className="p-4 text-[13px] leading-relaxed text-[var(--color-ink2)]">
          Esta tela é <strong>somente leitura</strong>. Um intervalo grande pode
          ser carência combinada em contrato — não é necessariamente erro. Nenhuma
          data de recebível já contratado foi ou será alterada por este
          diagnóstico; corrigir um plano é decisão comercial, feita na tela da
          unidade, com o contrato à vista.
        </CardContent>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
        <Badge tone={rows.length > 0 ? "warning" : "success"}>
          {rows.length} plano(s) a conferir
        </Badge>
        <span className="text-[var(--color-ink3)]">
          Carência considerada: {carencia} mês(es) —{" "}
          {[1, 2, 3, 6, 12].map((n) => (
            <Link
              key={n}
              href={`/diagnostico/planos-recebiveis?carencia=${n}`}
              className={
                n === carencia
                  ? "mx-1 font-semibold text-[var(--color-ink)]"
                  : "mx-1 text-[var(--color-accent2)] hover:underline"
              }
            >
              {n}
            </Link>
          ))}
        </span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-[var(--color-ink3)]">
            Nenhum plano divergente com essa carência.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table wrapperClassName="max-h-[70vh] scroll-x-always" className="min-w-[1000px]">
              <THead className="sticky top-0 z-10">
                <tr>
                  <TH>Unidade</TH>
                  <TH>Projeto</TH>
                  <TH>Data-base</TH>
                  <TH>1ª mensal</TH>
                  <TH className="text-right">Intervalo</TH>
                  <TH>Observação</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.unitId}>
                    <TD className="whitespace-nowrap font-medium text-[var(--color-ink)]">
                      {r.unitCode}
                    </TD>
                    <TD className="whitespace-nowrap">{r.projectName}</TD>
                    <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                      {r.dataBase ? `${r.labelBase} · ${dateBR(r.dataBase)}` : "—"}
                    </TD>
                    <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                      {r.primeiraParcela ? dateBR(r.primeiraParcela) : "—"}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">
                      {r.intervaloMeses > 0 ? (
                        <span
                          className={
                            r.intervaloMeses > carencia
                              ? "text-[var(--color-warning)]"
                              : undefined
                          }
                        >
                          {r.intervaloMeses} {r.intervaloMeses === 1 ? "mês" : "meses"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="text-[12px] text-[var(--color-ink3)]">
                      {r.intervaloMeses > carencia && (
                        <div>
                          Primeira mensal {r.intervaloMeses} meses após o{" "}
                          {r.labelBase.toLowerCase()}. Confirme a carência.
                        </div>
                      )}
                      {r.datasInvalidas.map((d) => (
                        <div key={d} className="text-[var(--color-danger)]">
                          {d}
                        </div>
                      ))}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
