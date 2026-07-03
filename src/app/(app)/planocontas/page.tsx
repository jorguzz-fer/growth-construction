import { getActiveContext } from "@/lib/context";
import { getChartAccounts, type ChartAccountRow } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PlanoContasManager } from "@/components/app/planocontas-manager";

export const dynamic = "force-dynamic";

type Kind = "cef" | "complementar";
interface Group {
  code: string;
  name: string;
  kind: Kind;
  items: { id: string; code: string; name: string }[];
}

function groupBy(rows: ChartAccountRow[], kind: Kind): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows.filter((x) => x.kind === kind)) {
    if (!map.has(r.groupCode)) {
      map.set(r.groupCode, { code: r.groupCode, name: r.groupName, kind, items: [] });
    }
    map.get(r.groupCode)!.items.push({ id: r.id, code: r.code, name: r.name });
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }
  return groups.sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
}

/** Categorias DRE — relatório fixo (não editável). */
const DRE_CATS = [
  { name: "Receita", desc: "Vendas de unidades, reembolsos, permuta", icon: "📈", color: "var(--color-success)" },
  { name: "Custo Variável", desc: "Medição de obra do mês (engenheiro), mão de obra direta", icon: "📊", color: "var(--color-danger)" },
  { name: "Custo Fixo", desc: "Administração local, aluguel canteiro", icon: "➖", color: "var(--color-ink3)" },
  { name: "Despesa Variável", desc: "Comissões, marketing proporcional", icon: "📉", color: "#f59e0b" },
  { name: "Despesa Fixa", desc: "Escritório, contabilidade, tecnologia", icon: "➖", color: "#f59e0b" },
  { name: "Retiradas", desc: "Pró-labore, distribuição de lucros", icon: "💰", color: "var(--color-accent)" },
  { name: "Investimento", desc: "Compra de terreno, equipamentos permanentes", icon: "🏢", color: "#3b82f6" },
];

export default async function PlanoContasPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const rows = await getChartAccounts(ctx.tenant.id);
  const cef = groupBy(rows, "cef");
  const comp = groupBy(rows, "complementar");
  const perms = {
    criar: can(ctx.perms, "planocontas", "criar"),
    editar: can(ctx.perms, "planocontas", "editar"),
    excluir: can(ctx.perms, "planocontas", "excluir"),
  };

  return (
    <>
      <PageHeader
        title="Plano de Contas"
        subtitle="Dupla classificação: Grupo CEF/Obra + Categoria DRE"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <PlanoContasManager cef={cef} comp={comp} perms={perms} />

        <aside>
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
                Categorias DRE
              </h2>
              <div className="space-y-3">
                {DRE_CATS.map((c, i) => (
                  <div
                    key={c.name}
                    className={`flex items-start gap-3 ${
                      i < DRE_CATS.length - 1
                        ? "border-b border-[var(--color-accent2)]/10 pb-3"
                        : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 text-[15px]"
                      style={{ color: c.color }}
                    >
                      {c.icon}
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--color-ink)]">
                        {c.name}
                      </div>
                      <div className="text-[12px] leading-snug text-[var(--color-ink3)]">
                        {c.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-ink3)]">
                ⓘ As 7 categorias DRE são fixas (estrutura do relatório) e não são
                editáveis. A edição de inserir/editar/excluir vale para os grupos e
                subitens CEF / complementares.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
