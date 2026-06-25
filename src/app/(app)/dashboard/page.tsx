import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { brlk } from "@/lib/utils";

/*
 * Dashboard "hello world" da Fase 0.
 *
 * Os KPIs abaixo são placeholders estáticos só para validar layout, fontes e
 * tokens de design. A ligação com dados reais (versões, projeção, caixa) entra
 * a partir da Fase 2. Ver docs/SPEC.md §9.1.
 */
const kpis = [
  { label: "VGV do empreendimento", value: brlk(46789988.9), tone: "accent" },
  { label: "Unidades", value: "195", tone: "ink" },
  { label: "Vendidas", value: "0", tone: "forecast" },
  { label: "Receita realizada", value: brlk(0), tone: "atual" },
] as const;

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink3)]">
          SIGNATURE SUARÃO · RMV Empreendimentos
        </span>
        <h1 className="mt-1 font-[family-name:var(--font-serif)] text-3xl text-[var(--color-ink)]">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink3)]">
          Visão geral do empreendimento — placeholders da Fase 0.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5">
              <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                {k.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Próximos passos</CardTitle>
          <CardDescription>
            Roadmap de migração (docs/STACK.md §7)
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-[var(--color-ink2)]">
          <ul className="list-inside list-disc space-y-1">
            <li>Fase 0 — Scaffold ✓ (você está aqui)</li>
            <li>Fase 1 — Modelo de dados (Drizzle schema completo)</li>
            <li>Fase 2 — Módulo Receitas (unidades, plano de pagamento, INCC)</li>
            <li>Fase 3 — Módulo Despesas (plano de contas, fornecedores, R2)</li>
            <li>Fase 4 — Caixa &amp; Open Finance (Pluggy)</li>
            <li>Fase 5 — Reports (DRE, medição de obra, rolling forecast)</li>
            <li>Fase 6 — Config &amp; multi-tenant (RBAC, auditoria)</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
