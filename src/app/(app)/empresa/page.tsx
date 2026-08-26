import Image from "next/image";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { renameTenant, salvarDadosFiscais, uploadLogo } from "@/lib/actions/empresa";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { R2HealthCheck } from "@/components/app/r2-healthcheck";
import {
  REGIMES_ESPECIAIS,
  REGIMES_TRIBUTARIOS,
  checarProntidaoFiscal,
  formatarCnpj,
} from "@/lib/calc/emitente-fiscal";
import { focusConfigurado, resolverAmbiente } from "@/lib/fiscal/focus";

export const dynamic = "force-dynamic";

export default async function EmpresaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const canEdit = can(ctx.perms, "empresa", "editar");
  const r2 = isR2Configured();
  const logoUrl =
    ctx.tenant.logoKey && r2 ? await readUrl(ctx.tenant.logoKey) : null;

  const t = ctx.tenant;
  const ambiente = resolverAmbiente(t.fiscalAmbiente);
  const provedorPronto = focusConfigurado(ambiente);
  const pendencias = checarProntidaoFiscal({
    razaoSocial: t.name,
    nomeFantasia: t.nomeFantasia,
    cnpj: t.cnpj,
    inscricaoMunicipal: t.inscricaoMunicipal,
    inscricaoEstadual: t.inscricaoEstadual,
    regimeTributario: t.regimeTributario,
    regimeEspecial: t.regimeEspecial,
    itemListaServico: t.itemListaServico,
    codigoTributarioMunicipio: t.codigoTributarioMunicipio,
    cnae: t.cnae,
    aliquotaIss: t.aliquotaIss === null ? null : Number(t.aliquotaIss),
    logradouro: t.logradouro,
    numero: t.numeroEndereco,
    complemento: t.complemento,
    bairro: t.bairro,
    codigoMunicipio: t.codigoMunicipio,
    municipio: t.municipio,
    uf: t.uf,
    cep: t.cep,
    telefone: t.telefone,
    email: t.emailFiscal,
  });
  const bloqueios = pendencias.filter((p) => p.severidade === "bloqueio");
  const avisos = pendencias.filter((p) => p.severidade === "aviso");

  return (
    <>
      <PageHeader
        title="Empresa"
        subtitle="Identidade do tenant e cadastro fiscal do emitente"
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

            {canEdit && <R2HealthCheck />}

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

      <Card className="mt-4">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Dados fiscais — emissão de nota
              </h2>
              <p className="mt-1 text-xs text-[var(--color-ink3)]">
                Dados do prestador exigidos na NFS-e. {formatarCnpj(t.cnpj) || "CNPJ não informado"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={ambiente === "producao" ? "warning" : "info"}>
                {ambiente === "producao" ? "Produção" : "Homologação"}
              </Badge>
              <Badge tone={bloqueios.length === 0 ? "success" : "neutral"}>
                {bloqueios.length === 0
                  ? "Cadastro completo"
                  : `${bloqueios.length} pendência(s)`}
              </Badge>
              <Badge tone={provedorPronto ? "success" : "neutral"}>
                {provedorPronto ? "Provedor configurado" : "Sem token do provedor"}
              </Badge>
            </div>
          </div>

          {(bloqueios.length > 0 || avisos.length > 0) && (
            <ul className="space-y-1.5 rounded-[8px] border border-[var(--color-accent2)]/20 bg-[var(--color-surface2)] p-3">
              {[...bloqueios, ...avisos].map((p) => (
                <li key={p.campo} className="flex items-start gap-2 text-xs">
                  <Badge tone={p.severidade === "bloqueio" ? "danger" : "warning"}>
                    {p.severidade === "bloqueio" ? "falta" : "confira"}
                  </Badge>
                  <span className="text-[var(--color-ink2)]">
                    <strong className="text-[var(--color-ink)]">{p.label}:</strong>{" "}
                    {p.mensagem}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!provedorPronto && (
            <p className="text-xs text-[var(--color-ink3)]">
              Defina <code>FOCUS_NFE_TOKEN</code> (ou a variante por ambiente) para
              habilitar o envio ao provedor de emissão.
            </p>
          )}

          <form action={salvarDadosFiscais} className="space-y-4">
            <fieldset disabled={!canEdit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Nome fantasia</Label>
                  <Input name="nomeFantasia" defaultValue={t.nomeFantasia ?? ""} />
                </div>
                <div>
                  <Label>CNPJ</Label>
                  <Input
                    name="cnpj"
                    defaultValue={t.cnpj ?? ""}
                    placeholder="00.000.000/0001-00"
                  />
                </div>
                <div>
                  <Label>Inscrição municipal</Label>
                  <Input
                    name="inscricaoMunicipal"
                    defaultValue={t.inscricaoMunicipal ?? ""}
                  />
                </div>
                <div>
                  <Label>Inscrição estadual</Label>
                  <Input
                    name="inscricaoEstadual"
                    defaultValue={t.inscricaoEstadual ?? ""}
                  />
                </div>
                <div>
                  <Label>Regime tributário</Label>
                  <Select name="regimeTributario" defaultValue={t.regimeTributario ?? ""}>
                    <option value="">—</option>
                    {REGIMES_TRIBUTARIOS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Regime especial (opcional)</Label>
                  <Select name="regimeEspecial" defaultValue={t.regimeEspecial ?? ""}>
                    <option value="">—</option>
                    {REGIMES_ESPECIAIS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Item da lista de serviço (LC 116)</Label>
                  <Input
                    name="itemListaServico"
                    defaultValue={t.itemListaServico ?? ""}
                    placeholder="7.02"
                  />
                </div>
                <div>
                  <Label>Código tributário do município</Label>
                  <Input
                    name="codigoTributarioMunicipio"
                    defaultValue={t.codigoTributarioMunicipio ?? ""}
                  />
                </div>
                <div>
                  <Label>CNAE</Label>
                  <Input name="cnae" defaultValue={t.cnae ?? ""} placeholder="4120400" />
                </div>
                <div>
                  <Label>Alíquota de ISS (%)</Label>
                  <Input
                    name="aliquotaIss"
                    defaultValue={t.aliquotaIss ?? ""}
                    placeholder="3"
                  />
                </div>
                <div>
                  <Label>Ambiente de emissão</Label>
                  <Select name="fiscalAmbiente" defaultValue={ambiente}>
                    <option value="homologacao">Homologação (sem valor fiscal)</option>
                    <option value="producao">Produção (nota válida)</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <Label>Logradouro</Label>
                  <Input name="logradouro" defaultValue={t.logradouro ?? ""} />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input name="numeroEndereco" defaultValue={t.numeroEndereco ?? ""} />
                </div>
                <div>
                  <Label>Complemento</Label>
                  <Input name="complemento" defaultValue={t.complemento ?? ""} />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input name="bairro" defaultValue={t.bairro ?? ""} />
                </div>
                <div>
                  <Label>Município</Label>
                  <Input name="municipio" defaultValue={t.municipio ?? ""} />
                </div>
                <div>
                  <Label>Código IBGE (7 dígitos)</Label>
                  <Input
                    name="codigoMunicipio"
                    defaultValue={t.codigoMunicipio ?? ""}
                    placeholder="3552502"
                  />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input name="uf" defaultValue={t.uf ?? ""} maxLength={2} />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input name="cep" defaultValue={t.cep ?? ""} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input name="telefone" defaultValue={t.telefone ?? ""} />
                </div>
                <div className="md:col-span-2">
                  <Label>E-mail fiscal</Label>
                  <Input
                    name="emailFiscal"
                    type="email"
                    defaultValue={t.emailFiscal ?? ""}
                  />
                </div>
              </div>
            </fieldset>

            {canEdit ? (
              <Button type="submit">Salvar dados fiscais</Button>
            ) : (
              <p className="text-xs text-[var(--color-ink3)]">
                Sem permissão para alterar os dados fiscais.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </>
  );
}
