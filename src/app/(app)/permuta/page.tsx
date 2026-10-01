import Link from "next/link";
import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getPermutasDaTela } from "@/lib/queries";
import { PermutaActions } from "@/components/app/permuta-actions";
import { can } from "@/lib/permissions";
import { brl0, dateBR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/** Tom do badge por tipo de ativo (ex.: Carro azul, Imóvel verde). */
function tipoTone(tipo: string | null): BadgeProps["tone"] {
  switch ((tipo ?? "").toLowerCase()) {
    case "carro":
      return "info";
    case "imovel":
    case "imóvel":
      return "success";
    default:
      return "accent";
  }
}

export default async function PermutaPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; project?: string; salvo?: string; cancelado?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "permuta", "ver")) return <AccessDenied />;
  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a obra do cookie.
  const sp = await searchParams;
  const selecao = lerSelecaoDeProjeto(ctx.projects, sp);
  const escolhido =
    selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido?.trabalho) {
    return <PedirProjeto titulo="Inventário de Permuta" projetos={ctx.projects} oQue="ver o inventário de permuta" />;
  }
  const { project, trabalho: version } = escolhido;
  // A lista mantém os cancelados legíveis (2.3); os totais não os contam (2.4).
  const rows = await getPermutasDaTela(ctx.tenant.id, version.id);
  const ativos = rows.filter((p) => !p.cancelado);
  const estimado = ativos.reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  const projetada = ativos
    .filter((p) => p.status === "Vendido")
    .reduce((a, p) => a + Number(p.valorVenda ?? 0), 0);
  const canCriar = can(ctx.perms, "permuta", "criar");
  const canEditar = can(ctx.perms, "permuta", "editar");
  const canExcluir = can(ctx.perms, "permuta", "excluir");

  return (
    <>
      <PageHeader
        title="Inventário de Permuta"
        eyebrow={`${project.name} · ${version.label}`}
        subtitle="Ativos recebidos como permuta"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <ProjectPicker
              projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
              selected={project.id}
            />
            {canCriar && (
              <Link
                href={`/permuta/novo?proj=${project.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                + Novo Ativo
              </Link>
            )}
          </div>
        }
      />
      <LembrarProjeto projectId={project.id} />
      {(sp.salvo || sp.cancelado) && (
        <p role="status" className="mb-4 rounded-[10px] border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2.5 text-sm text-[var(--color-ink)]">
          {sp.cancelado ? "Ativo cancelado. Ele continua na lista, fora dos totais." : "Ativo gravado."}
        </p>
      )}

      <p className="mb-6 text-sm text-[var(--color-ink3)]">
        Estimado: <strong className="text-[var(--color-ink)]">{brl0(estimado)}</strong>{" "}
        · Receita projetada:{" "}
        <strong className="text-[var(--color-success)]">{brl0(projetada)}</strong>
      </p>

      <Table>
        <THead>
          <tr>
            <TH className="text-right">#</TH>
            <TH>Unidade</TH>
            <TH>Cliente</TH>
            <TH>Dt.receb.</TH>
            <TH>Tipo</TH>
            <TH>Descricao</TH>
            <TH className="text-right">Val.est.</TH>
            <TH>Status</TH>
            <TH>Dt.venda</TH>
            <TH className="text-right">Val.venda</TH>
            <TH>Tipo perm.</TH>
            <TH>Obs.</TH>
            <TH className="text-right">Ações</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={13} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhum ativo de permuta nesta versão.
              </TD>
            </TR>
          ) : (
            rows.map((p, i) => {
              const sold = p.status === "Vendido" && !p.cancelado;
              return (
                <TR key={p.id} className={p.cancelado ? "text-[var(--color-ink4)] line-through" : undefined}>
                  <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink4)]">
                    {i + 1}
                  </TD>
                  <TD className="font-medium text-[var(--color-ink)]">
                    {p.unitCode ?? "—"}
                  </TD>
                  <TD>{p.clienteNome || "—"}</TD>
                  <TD className="font-[family-name:var(--font-mono)]">
                    {dateBR(p.dataRecebimento)}
                  </TD>
                  <TD>
                    {p.tipo ? <Badge tone={tipoTone(p.tipo)}>{p.tipo}</Badge> : "—"}
                  </TD>
                  <TD>{p.descricao || "—"}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brl0(Number(p.estimado ?? 0))}
                  </TD>
                  <TD>
                    {p.cancelado ? (
                      <Badge tone="neutral" title={`Cancelado em ${dateBR(p.canceladoEm)} por ${p.canceladoPor ?? "—"}${p.motivoCancelamento ? `: ${p.motivoCancelamento}` : ""}`}>
                        Cancelado
                      </Badge>
                    ) : (
                      <span className="inline-flex flex-wrap gap-1">
                        <Badge tone={sold ? "success" : "neutral"}>{p.status ?? "—"}</Badge>
                        {p.noEstoque && <Badge tone="info">no Estoque</Badge>}
                      </span>
                    )}
                  </TD>
                  <TD className="font-[family-name:var(--font-mono)]">
                    {dateBR(p.dataVenda)}
                  </TD>
                  <TD
                    className={`text-right font-[family-name:var(--font-mono)] ${
                      sold ? "font-semibold text-[var(--color-success)]" : ""
                    }`}
                  >
                    {sold ? brl0(Number(p.valorVenda ?? 0)) : "—"}
                  </TD>
                  <TD>{p.tipoPermuta || "—"}</TD>
                  <TD>{p.obs || "—"}</TD>
                  <TD className="text-right">
                    <PermutaActions
                      id={p.id}
                      rotulo={[p.unitCode, p.descricao || p.tipo].filter(Boolean).join(" · ")}
                      projectId={project.id}
                      cancelado={p.cancelado}
                      canEditar={canEditar}
                      canExcluir={canExcluir}
                    />
                  </TD>
                </TR>
              );
            })
          )}
        </tbody>
      </Table>

      {/* Prompt P, 1.3/1.4 — o aviso "VENDIDO … atualiza o campo Permuta em
          Dados_de_Venda" saiu: nada no sistema escreve a linha Permuta do
          plano a partir desta tabela, e induzia a contar o bem duas vezes. */}
    </>
  );
}
