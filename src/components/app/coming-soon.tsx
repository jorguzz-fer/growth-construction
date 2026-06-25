import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle?: string;
  phase: string;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink4)]">
            {phase}
          </span>
          <p className="text-sm text-[var(--color-ink3)]">
            Tela em construção — entra na fase indicada do roadmap
            (docs/STACK.md §7).
          </p>
        </CardContent>
      </Card>
    </>
  );
}
