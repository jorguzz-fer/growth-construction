import { getActiveContext } from "@/lib/context";
import { getChartAccounts, type ChartAccountRow } from "@/lib/queries";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

interface Group {
  code: string;
  name: string;
  kind: "cef" | "complementar";
  items: ChartAccountRow[];
}

function groupBy(rows: ChartAccountRow[], kind: "cef" | "complementar"): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows.filter((x) => x.kind === kind)) {
    if (!map.has(r.groupCode)) {
      map.set(r.groupCode, {
        code: r.groupCode,
        name: r.groupName,
        kind,
        items: [],
      });
    }
    map.get(r.groupCode)!.items.push(r);
  }
  return [...map.values()].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
}

export default async function PlanoContasPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const rows = await getChartAccounts(ctx.tenant.id);
  const cef = groupBy(rows, "cef");
  const comp = groupBy(rows, "complementar");

  return (
    <>
      <PageHeader
        title="Plano de Contas"
        subtitle={`Dupla classificação: Grupo CEF/complementar + Categoria DRE · ${rows.length} subitens`}
      />

      <div className="mb-6">
        <h2 className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          Categorias DRE
        </h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS_DRE.map((c) => (
            <Badge key={c} tone="accent">
              {c}
            </Badge>
          ))}
        </div>
      </div>

      <Section title="Orçamento Sintético — Grupos CEF" groups={cef} />
      <Section title="Grupos Complementares" groups={comp} />
    </>
  );
}

function Section({ title, groups }: { title: string; groups: Group[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        {title}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.code}>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">
                  {g.code}
                </span>
                <span className="text-sm font-medium text-[var(--color-ink)]">
                  {g.name}
                </span>
              </div>
              <ul className="space-y-1">
                {g.items.map((it) => (
                  <li
                    key={it.id}
                    className="flex gap-2 text-[13px] text-[var(--color-ink2)]"
                  >
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink4)]">
                      {it.code}
                    </span>
                    <span>{it.name}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
