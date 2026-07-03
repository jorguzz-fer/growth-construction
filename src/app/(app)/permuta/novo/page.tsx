import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { addPermuta } from "@/lib/actions/receitas";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function NovoAtivoPermutaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "permuta", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para criar ativos de permuta.
      </p>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Novo Ativo de Permuta"
        subtitle="VENDIDO gera receita na Projeção e atualiza o campo Permuta em Dados_de_Venda."
      />

      <Card>
        <CardContent className="p-5">
          <form
            action={addPermuta}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div>
              <Label>Unidade</Label>
              <Input name="unitCode" placeholder="BLA 401" />
            </div>
            <div>
              <Label>Cliente</Label>
              <Input name="cliente" placeholder="" />
            </div>
            <div>
              <Label>Data recebimento (MM/DD/YYYY)</Label>
              <Input name="dataRecebimento" placeholder="01/10/2026" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select name="tipo" defaultValue="Carro">
                <option>Carro</option>
                <option>Imovel</option>
                <option>Outro</option>
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
              <Label>Data venda (MM/DD/YYYY)</Label>
              <Input name="dataVenda" placeholder="01/10/2026" />
            </div>
            <div>
              <Label>Valor venda (R$)</Label>
              <Input name="valorVenda" type="number" step="0.01" placeholder="0" />
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
              <a href="/permuta" className={buttonVariants({ variant: "ghost" })}>
                Cancelar
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
