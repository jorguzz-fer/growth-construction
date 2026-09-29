import Link from "next/link";
import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import { getPermutas } from "@/lib/queries";
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
  searchParams: Promise<{ proj?: string; project?: string }>;
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
  const rows = await getPermutas(version.id);
  const estimado = rows.reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  const projetada = rows
    .filter((p) => p.status === "Vendido")
    .reduce((a, p) => a + Number(p.valorVenda ?? 0), 0);
  const canCriar = can(ctx.perms, "permuta", "criar");

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
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={12} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhum ativo de permuta nesta versão.
              </TD>
            </TR>
          ) : (
            rows.map((p, i) => {
              const sold = p.status === "Vendido";
              return (
                <TR key={p.id}>
                  <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink4)]">
                    {i + 1}
                  </TD>
                  <TD className="font-medium text-[var(--color-ink)]">
                    {p.unitCode ?? "—"}
                  </TD>
                  <TD>{p.cliente || "—"}</TD>
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
                    <Badge tone={sold ? "success" : "neutral"}>
                      {p.status ?? "—"}
                    </Badge>
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
                </TR>
              );
            })
          )}
        </tbody>
      </Table>

      <div className="mt-6 flex items-start gap-2 rounded-[10px] bg-[#d1fae5] px-4 py-3 text-[13px] leading-relaxed text-[#065f46]">
        <span aria-hidden className="mt-px">
          ⓘ
        </span>
        <p>
          <strong>VENDIDO</strong> gera receita na Projeção e atualiza
          automaticamente o campo Permuta em Dados_de_Venda.
        </p>
      </div>
    </>
  );
}
