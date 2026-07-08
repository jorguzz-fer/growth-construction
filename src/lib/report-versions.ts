import type { Version } from "@/lib/context";

/**
 * Resolve as versões selecionadas para comparação a partir do parâmetro `vs`
 * (ids separados por vírgula). Sem seleção, usa a versão ativa. Limita a `max`.
 */
export function resolveCompareVersions(
  vs: string | undefined,
  versions: Version[],
  active: Version,
  max = 3,
): Version[] {
  const ids = (vs ?? "").split(",").filter(Boolean);
  const sel = ids.length ? versions.filter((v) => ids.includes(v.id)) : [active];
  return (sel.length ? sel : [active]).slice(0, max);
}
