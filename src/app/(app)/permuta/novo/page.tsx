import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { can } from "@/lib/permissions";
import { addPermuta } from "@/lib/actions/receitas";
import { getUnits, getClientes } from "@/lib/queries";
import { TIPOS_PERMUTA } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function NovoAtivoPermutaPage({
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
  if (!can(ctx.perms, "permuta", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para criar ativos de permuta.
      </p>
    );
  }

  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a obra do cookie.
  const sp = await searchParams;
  const selecao = lerSelecaoDeProjeto(ctx.projects, sp);
  const escolhido =
    selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido?.trabalho) {
    return <PedirProjeto titulo="Novo Ativo de Permuta" projetos={ctx.projects} oQue="cadastrar o ativo de permuta" />;
  }
  const { project, trabalho: version } = escolhido;

  const [units, clientes] = await Promise.all([
    getUnits(ctx.tenant.id, version.id),
    getClientes(ctx.tenant.id),
  ]);
  const unitCodes = [...new Set(units.map((u) => u.code))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · ${version.label}`}
        title="Novo Ativo de Permuta"
        subtitle="VENDIDO gera receita na Projeção e atualiza o campo Permuta em Dados_de_Venda."
      />

      <Card>
        <CardContent className="p-5">
          <form
            action={addPermuta}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {/* Obra desta tela (Prompt A): o ativo vai para a versão de trabalho dela. */}
            <input type="hidden" name="projectId" value={project.id} />
            <div>
              <Label>Unidade vendida de referência</Label>
              <Select name="unitCode" defaultValue="">
                <option value="">— selecione —</option>
                {unitCodes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Cliente</Label>
              <Select name="cliente" defaultValue="">
                <option value="">— selecione —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.nomeCompleto}>
                    {c.nomeCompleto}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Data recebimento</Label>
              <DateField name="dataRecebimento" />
            </div>
            <div>
              <Label>Tipo do bem / serviço</Label>
              <Select name="tipo" defaultValue="Imóvel">
                {TIPOS_PERMUTA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="lg:col-span-2">
              <Label>Descrição</Label>
              <Input name="descricao" placeholder="" />
            </div>
            <div>
              <Label>Valor estimado (R$)</Label>
              <Input name="estimado" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue="Disponivel">
                <option>Disponivel</option>
                <option>Vendido</option>
              </Select>
            </div>
            <div>
              <Label>Data venda / escambo</Label>
              <DateField name="dataVenda" />
            </div>
            <div>
              <Label>Valor venda (R$)</Label>
              <Input name="valorVenda" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>Forma da revenda do bem</Label>
              <Select name="formaVenda" defaultValue="avista">
                <option value="avista">Venda à vista</option>
                <option value="parcelada">Venda parcelada</option>
                <option value="escambo">Escambo (sem entrada financeira)</option>
              </Select>
            </div>
            <div>
              <Label>Parcelas (se parcelada)</Label>
              <Input name="parcelas" type="number" min="1" placeholder="Ex.: 12" />
            </div>
            <div>
              <Label>Periodicidade</Label>
              <Select name="periodicidade" defaultValue="mensal">
                <option value="mensal">Mensal</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </Select>
            </div>
            <div>
              <Label>Vencimento da 1ª parcela</Label>
              <DateField name="dataPrimParcela" />
            </div>
            <div>
              <Label>Tipo permuta</Label>
              <Input name="tipoPermuta" placeholder="" />
            </div>
            <div className="lg:col-span-2">
              <Label>Observações</Label>
              <Input name="obs" placeholder="" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">Salvar ativo</Button>
              <a href={`/permuta?proj=${project.id}`} className={buttonVariants({ variant: "ghost" })}>
                Cancelar
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
