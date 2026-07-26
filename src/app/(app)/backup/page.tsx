import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { listSemesters } from "@/lib/backup";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "backup", "ver")) return null;

  const { semesters, pendingKey } = await listSemesters(ctx.tenant.id);
  const pending = semesters.find((s) => s.key === pendingKey) ?? null;

  return (
    <>
      <PageHeader title="Backup & Arquivamento" />

      {pending && (
        <Card className="mb-5 border-l-4 border-[var(--color-warning)]">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[14px] font-semibold text-[var(--color-ink)]">
                Um semestre foi encerrado — faça o backup
              </div>
              <p className="mt-1 text-[12.5px] text-[var(--color-ink3)]">
                O {pending.label} já se encerrou. Baixe uma cópia de segurança
                (planilha dos dados + documentos do período). Nada é removido do
                sistema — os dados continuam disponíveis normalmente.
              </p>
            </div>
            <a
              href={`/backup/download?sem=${pending.key}`}
              className="shrink-0 rounded-[8px] bg-[var(--color-accent2)] px-4 py-2 text-center text-[13px] font-medium text-white hover:opacity-90"
            >
              Baixar backup do {pending.label.split(" (")[0]}
            </a>
          </CardContent>
        </Card>
      )}

      <Card className="mb-5">
        <CardContent className="p-5 text-[12.5px] leading-relaxed text-[var(--color-ink3)]">
          A cada virada de semestre (janeiro e julho), o app avisa e oferece o
          backup do semestre que se encerrou. Cada backup é um único arquivo{" "}
          <strong className="text-[var(--color-ink)]">.zip</strong> com uma
          planilha (Despesas, Contas a Receber e Caixa do período) e os
          documentos salvos naquele semestre. Esta é apenas uma cópia de
          segurança: <strong className="text-[var(--color-ink)]">nenhum dado é
          apagado</strong> e a visualização não muda.
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <tr>
                <TH>Semestre</TH>
                <TH className="text-right">Despesas</TH>
                <TH className="text-right">Contas a Receber</TH>
                <TH className="text-right">Caixa</TH>
                <TH className="text-right">Documentos</TH>
                <TH>Situação</TH>
                <TH className="text-right">Backup</TH>
              </tr>
            </THead>
            <tbody>
              {semesters.map((s) => (
                <TR key={s.key}>
                  <TD className="font-medium text-[var(--color-ink)]">{s.label}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">{s.despesas}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">{s.contasReceber}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">{s.caixa}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">{s.documentos}</TD>
                  <TD>
                    <Badge tone={s.closed ? "neutral" : "success"}>
                      {s.closed ? "Encerrado" : "Em andamento"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <a
                      href={`/backup/download?sem=${s.key}`}
                      className="text-[13px] text-[var(--color-accent2)] hover:underline"
                    >
                      Baixar ZIP
                    </a>
                  </TD>
                </TR>
              ))}
              {semesters.length === 0 && (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-[var(--color-ink4)]">
                    Ainda não há dados para arquivar.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
