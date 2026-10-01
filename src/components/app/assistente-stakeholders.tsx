"use client";

import { useEffect, useState } from "react";
import type { AnaliseDeStakeholders } from "@/lib/stakeholder-analise";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Painel do assistente de Fornecedores & Stakeholders (Prompt W, seção 7;
 * Prompt E). SOMENTE LEITURA: analisa o que a página carregou, em código puro
 * (`stakeholder-analise.ts`). Nada vai a modelo; nenhum CPF sai daqui.
 *
 * Não é o mesmo selo do preenchimento por documento (7.4): aquele lê o
 * arquivo com IA e propõe campo a campo, com confirmação; este só aponta.
 *
 * Nunca (7.3): criar, editar, inativar ou excluir cadastro; conceder ou
 * retirar papel. O usuário decide na tabela.
 */

type Acao = "duplicados" | "incompletos" | "invalidos" | "inativos" | "papeis";

export function AssistenteStakeholders({ usuario, analise }: { usuario: string; analise: AnaliseDeStakeholders }) {
  const chave = `gt:assistente:fornecedores:recolhido:${usuario}`;
  const [recolhido, setRecolhido] = useState(false);
  const [aberta, setAberta] = useState<Acao | null>(null);

  useEffect(() => {
    try {
      setRecolhido(window.localStorage.getItem(chave) === "1");
    } catch {
      /* sem localStorage: fica expandido */
    }
  }, [chave]);

  const alternar = () => {
    const proximo = !recolhido;
    setRecolhido(proximo);
    try {
      window.localStorage.setItem(chave, proximo ? "1" : "0");
    } catch {
      /* preferência não persiste */
    }
  };

  if (recolhido) {
    return (
      <aside className="shrink-0 min-[1180px]:sticky min-[1180px]:top-20">
        <button type="button" onClick={alternar} aria-expanded={false} aria-label="Abrir o assistente" title="Abrir o assistente" className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--color-line)] bg-white shadow-sm hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40">
          <Faisca />
        </button>
      </aside>
    );
  }

  const { duplicados, incompletos, invalidos, inativosEmUso, papeis, total } = analise;
  const nada = (t: string) => <p className="text-[12px] text-[var(--color-ink2)]">{total === 0 ? "Nenhum cadastro ainda." : t}</p>;
  const problemasDePapel = papeis.despesaSemPapel.length + papeis.pagadorSemPapel.length;
  const li = "text-[12px] text-[var(--color-ink2)]";
  const nome = "font-medium text-[var(--color-ink)]";

  return (
    <aside aria-label="Assistente de Fornecedores" className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="neutral">Somente leitura</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Fornecedores · {total} cadastro(s)</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        <AcaoDoPainel cor="#FDE6E9" icone={<Icone cor="#C0334A" d="M8 7h12v12H8zM4 4h12v3M4 4v12h4" />} titulo="Documentos duplicados" descricao="Mesmo CPF ou CNPJ em mais de um cadastro, lado a lado" contador={duplicados.length} aberta={aberta === "duplicados"} onClick={() => setAberta(aberta === "duplicados" ? null : "duplicados")}>
          {duplicados.length === 0 ? (
            nada("Nenhum documento repetido.")
          ) : (
            <ul className="space-y-2">
              {duplicados.map((d) => (
                <li key={d.documento} className={li}>
                  <span className="font-[family-name:var(--font-mono)]">{d.documento}</span>
                  <ul className="mt-0.5 space-y-0.5 pl-3">
                    {d.cadastros.map((c) => (
                      <li key={c.id}>
                        <span className={nome}>{c.nome}</span> · {c.tipo}
                        {!c.ativo && " · inativo"}
                        {c.papeis.length ? ` · ${c.papeis.join(", ")}` : " · sem papel"}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              <li className="text-[var(--color-ink3)]">Erro ou coincidência (matriz e filial, por exemplo)? Você decide: edite ou inative na tabela. Nada é alterado por aqui.</li>
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#FEF3C7" icone={<Icone cor="#B45309" d="M12 7.5v5M12 16h.01M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" />} titulo="Cadastro incompleto" descricao="Sem documento, sem papel, sem contato ou sem endereço obrigatório" contador={incompletos.length} aberta={aberta === "incompletos"} onClick={() => setAberta(aberta === "incompletos" ? null : "incompletos")}>
          {incompletos.length === 0 ? (
            nada("Todo cadastro ativo tem documento, papel e contato.")
          ) : (
            <ul className="space-y-1">
              {incompletos.slice(0, 20).map((i) => (
                <li key={i.id} className={li}>
                  <span className={nome}>{i.nome}</span>: sem {i.faltas.join(", ")}
                  {i.faltas.includes("papel") && <span className="text-[var(--color-warning)]"> — sem papel não aparece em nenhum seletor filtrado</span>}
                </li>
              ))}
              {incompletos.length > 20 && <li className="text-[var(--color-ink3)]">… e mais {incompletos.length - 20}.</li>}
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#F3EFFE" icone={<Icone cor="#6D4BD1" d="M4 7h16M4 12h16M4 17h10" />} titulo="Documento inválido" descricao="Não passa na verificação, ou tipo incompatível com o documento" contador={invalidos.length} aberta={aberta === "invalidos"} onClick={() => setAberta(aberta === "invalidos" ? null : "invalidos")}>
          {invalidos.length === 0 ? (
            nada("Todo documento informado passa na verificação e combina com o tipo.")
          ) : (
            <ul className="space-y-1">
              {invalidos.map((i, k) => (
                <li key={`${i.id}-${k}`} className={li}>
                  <span className={nome}>{i.nome}</span>: {i.motivo}
                </li>
              ))}
              <li className="text-[var(--color-ink3)]">Dado antigo não foi corrigido: continua legível e editável na tabela.</li>
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#E7EDFD" icone={<Icone cor="#2B5CD9" d="M12 8v4l3 3M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" />} titulo="Inativos ainda em uso" descricao="Cadastro inativo com despesa recente ou obrigação como pagador" contador={inativosEmUso.length} aberta={aberta === "inativos"} onClick={() => setAberta(aberta === "inativos" ? null : "inativos")}>
          {inativosEmUso.length === 0 ? (
            nada("Nenhum inativo com lançamento nos últimos 90 dias nem obrigação pendente.")
          ) : (
            <ul className="space-y-1">
              {inativosEmUso.map((i) => (
                <li key={i.id} className={li}>
                  <span className={nome}>{i.nome}</span>
                  {i.despesasRecentes > 0 && ` · ${i.despesasRecentes} despesa(s), última em ${i.ultimaDespesa}`}
                  {i.obrigacoes > 0 && ` · ${i.obrigacoes} obrigação(ões) como pagador`}
                </li>
              ))}
              <li className="text-[var(--color-ink3)]">Os seletores já não oferecem inativos; o que estava vinculado continua visível.</li>
            </ul>
          )}
        </AcaoDoPainel>

        <AcaoDoPainel cor="#D1FAE5" icone={<Icone cor="#065F46" d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0" />} titulo="Papéis e uso real" descricao="Fornecedor sem despesa; despesa sem papel; pagador sem o papel" contador={problemasDePapel} aberta={aberta === "papeis"} onClick={() => setAberta(aberta === "papeis" ? null : "papeis")}>
          {total === 0 ? (
            nada("")
          ) : (
            <div className="space-y-2">
              <div>
                <p className={cn(li, "font-medium")}>Com obrigação como pagador e sem o papel &ldquo;Pagador por Terceiro&rdquo; ({papeis.pagadorSemPapel.length})</p>
                {papeis.pagadorSemPapel.length === 0 ? (
                  <p className={cn(li, "text-[var(--color-ink3)]")}>Nenhum.</p>
                ) : (
                  <ul className="space-y-0.5 pl-3">
                    {papeis.pagadorSemPapel.map((p) => (
                      <li key={p.id} className={li}>
                        <span className={nome}>{p.nome}</span> · {p.obrigacoes} obrigação(ões){!p.ativo && " · inativo"}
                      </li>
                    ))}
                    <li className={cn(li, "text-[var(--color-ink3)]")}>O papel é concedido na tabela, item a item, por decisão sua (1.6). O assistente não concede.</li>
                  </ul>
                )}
              </div>
              <div>
                <p className={cn(li, "font-medium")}>Com despesa e sem papel de fornecedor ({papeis.despesaSemPapel.length})</p>
                {papeis.despesaSemPapel.length === 0 ? (
                  <p className={cn(li, "text-[var(--color-ink3)]")}>Nenhum.</p>
                ) : (
                  <ul className="space-y-0.5 pl-3">
                    {papeis.despesaSemPapel.map((p) => (
                      <li key={p.id} className={li}>
                        <span className={nome}>{p.nome}</span> · {p.despesas} despesa(s){p.papeis.length ? ` · ${p.papeis.join(", ")}` : " · sem papel"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className={cn(li, "font-medium")}>Marcado como fornecedor e sem despesa ({papeis.fornecedorSemDespesa.length})</p>
                {papeis.fornecedorSemDespesa.length === 0 ? (
                  <p className={cn(li, "text-[var(--color-ink3)]")}>Nenhum.</p>
                ) : (
                  <ul className="space-y-0.5 pl-3">
                    {papeis.fornecedorSemDespesa.slice(0, 15).map((p) => (
                      <li key={p.id} className={li}>
                        <span className={nome}>{p.nome}</span> · {p.papeis.join(", ")}
                      </li>
                    ))}
                    {papeis.fornecedorSemDespesa.length > 15 && <li className={cn(li, "text-[var(--color-ink3)]")}>… e mais {papeis.fornecedorSemDespesa.length - 15}.</li>}
                  </ul>
                )}
              </div>
            </div>
          )}
        </AcaoDoPainel>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">
        Somente leitura: analisa o que a tela carregou, em código puro. Não cria, edita, inativa nem exclui cadastro; não concede papel; nenhum documento vai a modelo. O preenchimento por documento, acima, é outra coisa: lê o arquivo e propõe campo a campo, com a sua confirmação.
      </p>
    </aside>
  );
}

function Icone({ cor, d }: { cor: string; d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="1.9" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function AcaoDoPainel({ cor, icone, titulo, descricao, contador, aberta, onClick, children }: { cor: string; icone: React.ReactNode; titulo: string; descricao: string; contador: number; aberta: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[11px] border border-[var(--color-line)]", aberta && "bg-[var(--color-surface2)]")}>
      <button type="button" onClick={onClick} aria-expanded={aberta} className="flex w-full items-center gap-2.5 rounded-[11px] p-2.5 text-left hover:bg-[var(--color-surface2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)]/40">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ background: cor }}>
          {icone}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-ink)]">
            {titulo}
            {contador > 0 && <Badge tone="danger">{contador}</Badge>}
          </span>
          <span className="block text-[11.5px] leading-snug text-[var(--color-ink2)]">{descricao}</span>
        </span>
        <span className="text-[var(--color-ink3)]" aria-hidden>
          {aberta ? "▾" : "›"}
        </span>
      </button>
      {aberta && <div className="border-t border-[var(--color-line)] px-3 py-2.5">{children}</div>}
    </div>
  );
}

function Faisca() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3z" fill="#6D4BD1" />
      <path d="M18.5 15l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z" fill="#3B82F6" />
    </svg>
  );
}
