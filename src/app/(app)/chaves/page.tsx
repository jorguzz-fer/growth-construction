import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { CHAVES } from "@/lib/chaves";
import { membroRestritoPorAmbiente } from "@/lib/membro-padrao";
import { definirChave } from "@/lib/actions/chaves";
import { FormComResultado } from "@/components/app/form-com-resultado";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Chaves de mudança por empresa (V2-BLOQUEIOS B4). Cada mudança que altera
 * número ou acesso nasce desligada; aqui se confere a prévia e se liga.
 */
export default async function ChavesPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "chaves", "ver")) return <AccessDenied />;
  const podeEditar = can(ctx.perms, "chaves", "editar");

  const linhas = await db
    .select()
    .from(schema.tenantFlags)
    .where(eq(schema.tenantFlags.tenantId, ctx.tenant.id));
  const estado = new Map(linhas.map((l) => [l.chave, l]));
  // A chave do membro também liga pela variável de ambiente, de antes do B4.
  const peloAmbiente: Record<string, boolean> = {
    membro_padrao_restrito: membroRestritoPorAmbiente(ctx.tenant.id),
  };

  return (
    <>
      <PageHeader title="Chaves de mudança" />
      <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-[var(--color-ink2)]">
        Mudanças que alteram número de relatório ou acesso entram <strong>desligadas</strong>.
        Desligada, a empresa continua exatamente como antes. Confira a prévia de cada uma e
        ligue quando estiver de acordo. Desligar volta ao comportamento anterior. Toda troca
        fica na Auditoria.
      </p>
      <div className="space-y-4">
        {CHAVES.map((c) => {
          const l = estado.get(c.id);
          const ligadaAqui = l?.ligada ?? false;
          const ambiente = peloAmbiente[c.id] ?? false;
          const ligada = ligadaAqui || ambiente;
          return (
            <Card key={c.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-[var(--color-ink)]">{c.titulo}</h2>
                  <Badge tone={ligada ? "success" : "neutral"}>{ligada ? "Ligada" : "Desligada"}</Badge>
                  {ambiente && (
                    <span className="text-[12px] text-[var(--color-ink3)]">
                      · ligada pela configuração do servidor (MEMBRO_PADRAO_RESTRITO)
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] text-[var(--color-ink2)]">{c.efeito}</p>
                <p className="mt-1 text-[12px] text-[var(--color-ink3)]">
                  Origem: {c.origem}
                  {l && (
                    <>
                      {" "}· última troca por {l.alteradaPor ?? "—"} em{" "}
                      {l.alteradaEm.toLocaleString("pt-BR")}
                    </>
                  )}
                </p>
                <p className="mt-2 text-[13px]">
                  Prévia:{" "}
                  <Link href={c.previa.href} className="text-[var(--color-accent2)] hover:underline">
                    {c.previa.rotulo}
                  </Link>
                </p>
                {podeEditar &&
                  (ligadaAqui ? (
                    <FormComResultado
                      action={definirChave}
                      aoConcluir="recarregar"
                      sucesso="Chave desligada."
                      className="mt-3 flex items-center gap-3"
                    >
                      <input type="hidden" name="chave" value={c.id} />
                      <input type="hidden" name="ligar" value="0" />
                      <Button type="submit" size="sm" variant="outline">
                        Desligar
                      </Button>
                    </FormComResultado>
                  ) : (
                    <FormComResultado
                      action={definirChave}
                      aoConcluir="recarregar"
                      sucesso="Chave ligada."
                      className="mt-3 flex flex-wrap items-center gap-3"
                    >
                      <input type="hidden" name="chave" value={c.id} />
                      <input type="hidden" name="ligar" value="1" />
                      <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink2)]">
                        <input type="checkbox" name="viPrevia" />
                        Conferi a prévia e concordo com o efeito
                      </label>
                      <Button type="submit" size="sm">
                        Ligar
                      </Button>
                    </FormComResultado>
                  ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
