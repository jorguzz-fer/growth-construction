import Image from "next/image";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { renameTenant, salvarDadosFiscais, salvarLimitesDeAlerta, uploadLogo } from "@/lib/actions/empresa";
import { getHistoricoFiscal, getUltimoTesteR2 } from "@/lib/queries";
import { analisarEmpresa } from "@/lib/empresa-analise";
import { AssistenteEmpresa } from "@/components/app/assistente-empresa";
import { AJUDA_CAMPO, estadoDoSeloR2, rotuloDoSeloR2 } from "@/lib/empresa-regras";
import { FormComResultado } from "@/components/app/form-com-resultado";
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
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function EmpresaPage() {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "empresa", "ver")) return <AccessDenied />;
  const canEdit = can(ctx.perms, "empresa", "editar");
  const r2 = isR2Configured();
  const logoUrl =
    ctx.tenant.logoKey && r2 ? await readUrl(ctx.tenant.logoKey) : null;
  // Prompt AH, 5.2 — o selo diz o que mede: variáveis presentes ≠ conexão
  // provada. Verde só depois do round-trip real registrado pela rota.
  const ultimoTeste = await getUltimoTesteR2(ctx.tenant.id);
  const selo = rotuloDoSeloR2(estadoDoSeloR2(r2, ultimoTeste));

  const t = ctx.tenant;
  const ambiente = resolverAmbiente(t.fiscalAmbiente);
  const provedorPronto = focusConfigurado(ambiente);
  const emitente = {
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
  };
  const pendencias = checarProntidaoFiscal(emitente);
  // Prompt AH, Parte 6 — análise somente leitura; nada vai a modelo, e token
  // e variáveis de ambiente não entram nela (6.3).
  const analise = analisarEmpresa(emitente, await getHistoricoFiscal(ctx.tenant.id));
  const bloqueios = pendencias.filter((p) => p.severidade === "bloqueio");
  // Os dois avisos da Parte 4 vêm do próprio checklist (decisão de 01/10).
  const avisos = pendencias.filter((p) => p.severidade === "aviso");

  return (
    <>
      <PageHeader
        title="Empresa"
        subtitle="Identidade do tenant e cadastro fiscal do emitente"
      />

      <div className="flex flex-col gap-6 min-[1180px]:flex-row min-[1180px]:items-start">
      <div className="min-w-0 flex-1">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Dados
            </h2>
            <FormComResultado action={renameTenant} sucesso="Nome salvo." aoConcluir="recarregar" className="space-y-3">
              <div>
                <Label>Nome da empresa (razão social)</Label>
                <Input name="name" defaultValue={ctx.tenant.name} disabled={!canEdit} />
                <p className="mt-1 text-[11px] text-[var(--color-ink3)]">Vai no corpo da nota. Toda troca fica na Auditoria.</p>
              </div>
              {canEdit && <Button type="submit">Salvar nome</Button>}
            </FormComResultado>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Logo
              </h2>
              <span className="flex flex-wrap items-center gap-2" data-selo-r2>
                <Badge tone={selo.tom}>{selo.texto}</Badge>
                {ultimoTeste && (
                  <span className="text-[11px] text-[var(--color-ink3)]">
                    último teste real {ultimoTeste.ok ? "OK" : `falhou em "${ultimoTeste.etapa ?? "?"}"`} em {ultimoTeste.quando.toLocaleString("pt-BR")}
                  </span>
                )}
                {r2 && !ultimoTeste && <span className="text-[11px] text-[var(--color-ink3)]">variáveis presentes; a conexão ainda não foi testada</span>}
              </span>
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
              <FormComResultado action={uploadLogo} sucesso="Logo enviado." aoConcluir="recarregar" className="flex flex-wrap items-center gap-2">
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
              </FormComResultado>
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

          <p className="text-xs text-[var(--color-ink3)]" data-texto-emissor>
            {bloqueios.length === 0
              ? "Cadastro sem pendência de bloqueio: a emissão de NFS-e passa a ser feita em Receitas › Notas Fiscais, com o provedor configurado pelo administrador do servidor."
              : "Quando as pendências de bloqueio fecharem, a emissão de NFS-e passa a ser feita em Receitas › Notas Fiscais. O provedor de emissão é configurado pelo administrador do servidor, fora desta tela."}
            {!provedorPronto && " Provedor ainda sem token neste ambiente."}
          </p>

          <FormComResultado action={salvarDadosFiscais} sucesso="Dados fiscais salvos." aoConcluir="recarregar" className="space-y-4">
            <fieldset disabled={!canEdit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Nome fantasia (opcional)</Label>
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
                  <Label>Inscrição estadual (opcional)</Label>
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
                  />
                  <p className="mt-1 text-[11px] text-[var(--color-ink3)]">{AJUDA_CAMPO.itemListaServico.ajuda}</p>
                </div>
                <div>
                  <Label>Código tributário do município</Label>
                  <Input
                    name="codigoTributarioMunicipio"
                    defaultValue={t.codigoTributarioMunicipio ?? ""}
                  />
                  <p className="mt-1 text-[11px] text-[var(--color-ink3)]">Vai no corpo da nota; alguns municípios exigem. Confira com a prefeitura.</p>
                </div>
                <div>
                  <Label>CNAE</Label>
                  <Input name="cnae" defaultValue={t.cnae ?? ""} />
                  <p className="mt-1 text-[11px] text-[var(--color-ink3)]">{AJUDA_CAMPO.cnae.ajuda}</p>
                </div>
                <div>
                  <Label>Alíquota de ISS (%)</Label>
                  <Input
                    name="aliquotaIss"
                    defaultValue={t.aliquotaIss ?? ""}
                    placeholder={AJUDA_CAMPO.aliquotaIss.placeholder}
                  />
                  <p className="mt-1 text-[11px] text-[var(--color-ink3)]">{AJUDA_CAMPO.aliquotaIss.ajuda}</p>
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
                  <Label>Complemento (opcional)</Label>
                  <Input name="complemento" defaultValue={t.complemento ?? ""} />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input name="bairro" defaultValue={t.bairro ?? ""} />
                </div>
                <div>
                  <Label>Município (nome)</Label>
                  <Input name="municipio" defaultValue={t.municipio ?? ""} />
                  <p className="mt-1 text-[11px] text-[var(--color-ink3)]">A nota usa o código IBGE ao lado; o nome é para conferência.</p>
                </div>
                <div>
                  <Label>Código IBGE do município</Label>
                  <Input
                    name="codigoMunicipio"
                    defaultValue={t.codigoMunicipio ?? ""}
                    placeholder={AJUDA_CAMPO.codigoMunicipio.placeholder}
                  />
                  <p className="mt-1 text-[11px] text-[var(--color-ink3)]">{AJUDA_CAMPO.codigoMunicipio.ajuda}</p>
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
                  <Label>Telefone (opcional)</Label>
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
          </FormComResultado>
        </CardContent>
      </Card>

      <Card className="mt-4" id="alertas">
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Alertas do Resumo Executivo</h2>
            <p className="mt-1 text-[12px] text-[var(--color-ink3)]">
              Limites do bloco Atenção, um valor só para a empresa toda. O desvio de custo só alerta quando passa dos{" "}
              <strong>dois</strong> limites juntos (percentual e valor). Toda troca fica na Auditoria.
            </p>
          </div>
          <FormComResultado action={salvarLimitesDeAlerta} sucesso="Limites salvos." aoConcluir="recarregar" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Desvio de custo acima de (%)</Label>
                <Input name="alertaDesvioPct" inputMode="decimal" defaultValue={String(Number(ctx.tenant.alertaDesvioPct)).replace(".", ",")} disabled={!canEdit} />
              </div>
              <div>
                <Label>E acima de (R$)</Label>
                <Input name="alertaDesvioValor" inputMode="decimal" defaultValue={String(Number(ctx.tenant.alertaDesvioValor)).replace(".", ",")} disabled={!canEdit} />
              </div>
              <div>
                <Label>Recebível vencido há mais de (dias)</Label>
                <Input name="alertaVencidoDias" inputMode="numeric" defaultValue={String(ctx.tenant.alertaVencidoDias)} disabled={!canEdit} />
              </div>
            </div>
            {canEdit && <Button type="submit">Salvar limites</Button>}
          </FormComResultado>
        </CardContent>
      </Card>
      </div>
      <AssistenteEmpresa usuario={ctx.userEmail ?? "anon"} analise={analise} />
      </div>
    </>
  );
}
