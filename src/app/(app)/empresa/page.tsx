import Image from "next/image";
import { getActiveContext } from "@/lib/context";
import { hasLevel } from "@/lib/permissions";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { renameTenant, uploadLogo } from "@/lib/actions/empresa";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function EmpresaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const canEdit = hasLevel(ctx.perms, "config", "edit");
  const r2 = isR2Configured();
  const logoUrl =
    ctx.tenant.logoKey && r2 ? await readUrl(ctx.tenant.logoKey) : null;

  return (
    <>
      <PageHeader
        title="Empresa"
        subtitle="Identidade do tenant — nome e logo"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Dados
            </h2>
            <form action={renameTenant} className="space-y-3">
              <div>
                <Label>Nome da empresa</Label>
                <Input name="name" defaultValue={ctx.tenant.name} disabled={!canEdit} />
              </div>
              {canEdit && <Button type="submit">Salvar nome</Button>}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Logo
              </h2>
              <Badge tone={r2 ? "success" : "neutral"}>
                {r2 ? "R2 ativo" : "R2 não configurado"}
              </Badge>
            </div>

            <div className="flex h-24 w-full items-center justify-center rounded-[8px] border border-dashed border-[var(--color-accent2)]/20 bg-[var(--color-surface2)]">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="Logo"
                  width={160}
                  height={80}
                  className="max-h-20 w-auto object-contain"
                  unoptimized
                />
              ) : (
                <span className="text-xs text-[var(--color-ink4)]">
                  Sem logo
                </span>
              )}
            </div>

            {canEdit && r2 ? (
              <form action={uploadLogo} className="flex items-center gap-2">
                <input
                  type="file"
                  name="logo"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="text-xs"
                  required
                />
                <Button type="submit" size="sm">
                  Enviar
                </Button>
              </form>
            ) : (
              <p className="text-xs text-[var(--color-ink3)]">
                {r2
                  ? "Sem permissão para alterar o logo."
                  : "Configure as variáveis R2_* para habilitar o upload de logo."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
