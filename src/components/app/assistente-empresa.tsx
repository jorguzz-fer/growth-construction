"use client";

import { useEffect, useState } from "react";
import type { AnaliseDaEmpresa } from "@/lib/empresa-analise";
import { ONDE_ENCONTRAR, ROTULO_CAMPO } from "@/lib/empresa-analise";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Faisca } from "@/components/app/assistente-funcionarios";

/**
 * Painel do assistente na tela Empresa (Prompt AH, Parte 6). SOMENTE LEITURA:
 * traduz a exigência fiscal; nunca sugere valor de campo fiscal, nunca
 * preenche, nunca afirma que o cadastro está correto (6.2). Não chama action
 * nenhuma — recebe a análise pronta do servidor.
 */
type Acao = "falta" | "onde" | "conferir" | "historico";

export function AssistenteEmpresa({ usuario, analise }: { usuario: string; analise: AnaliseDaEmpresa }) {
  const chave = `gt:assistente:empresa:recolhido:${usuario}`;
  const [recolhido, setRecolhido] = useState(false);
  const [aberta, setAberta] = useState<Acao | null>(null);
  useEffect(() => {
    try {
      setRecolhido(window.localStorage.getItem(chave) === "1");
    } catch {
      /* sem localStorage */
    }
  }, [chave]);
  const alternar = () => {
    const p = !recolhido;
    setRecolhido(p);
    try {
      window.localStorage.setItem(chave, p ? "1" : "0");
    } catch {
      /* preferência não persiste */
    }
  };
  if (recolhido) {
    return (
      <div className="flex justify-end">
        <button type="button" onClick={alternar} aria-expanded={false} aria-label="Abrir o assistente" className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--color-line)] bg-white shadow-sm hover:bg-[var(--color-surface2)]">
          <Faisca />
        </button>
      </div>
    );
  }
  const { passos, avisos, divergencias, historico, semPendenciaAberta } = analise;
  const nada = (t: string) => <p className="text-[12px] text-[var(--color-ink2)]">{t}</p>;
  const toggle = (a: Acao) => setAberta(aberta === a ? null : a);
  const conferir = divergencias.length + avisos.length;

  return (
    <aside aria-label="Assistente da Empresa" className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="neutral">Somente leitura</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Cadastro fiscal · o que a nota exige</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        <Acao cor="#FDE6E9" cor2="#C0334A" d="M12 7.5v5M12 16h.01M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" titulo="O que falta para emitir" descricao="As pendências de bloqueio, do que está à mão ao que depende de terceiros" contador={passos.length} aberta={aberta === "falta"} onClick={() => toggle("falta")}>
          {passos.length === 0 ? (
            nada("Nenhuma pendência de bloqueio aberta. Isso não confirma que os dados estão certos — só que nada obrigatório está faltando ou malformado.")
          ) : (
            <ol className="list-decimal space-y-1.5 pl-4 text-[12px] text-[var(--color-ink2)]">
              {passos.map((p) => (
                <li key={p.campo}>
                  <span className="font-medium text-[var(--color-ink)]">{p.label}</span> — destrava {p.destrava}. <span className="text-[var(--color-ink3)]">Onde: {p.onde}</span>
                </li>
              ))}
            </ol>
          )}
        </Acao>

        <Acao cor="#E7EDFD" cor2="#2B5CD9" d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" titulo="Onde encontrar cada dado" descricao="A fonte de cada campo — nunca o valor" contador={0} aberta={aberta === "onde"} onClick={() => toggle("onde")}>
          <ul className="space-y-1 text-[12px] text-[var(--color-ink2)]">
            {Object.entries(ONDE_ENCONTRAR).map(([campo, o]) => (
              <li key={campo}>
                <span className="font-medium text-[var(--color-ink)]">{ROTULO_CAMPO[campo] ?? (campo === "endereco" ? "Endereço" : campo === "email" ? "E-mail fiscal" : campo === "razaoSocial" ? "Razão social" : campo)}</span>: {o.onde}
              </li>
            ))}
          </ul>
        </Acao>

        <Acao cor="#FFF4E0" cor2="#B7791F" d="M9 12l2 2 4-4M4 6h16M4 18h16" titulo="Conferir o que está preenchido" descricao="Divergências entre campos e avisos do cadastro" contador={conferir} aberta={aberta === "conferir"} onClick={() => toggle("conferir")}>
          {conferir === 0 ? (
            nada("Nenhuma divergência entre campos e nenhum aviso aberto.")
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-[12px] text-[var(--color-ink2)]">
              {divergencias.map((d) => (
                <li key={`d-${d.campo}`}>{d.texto}</li>
              ))}
              {avisos.map((a) => (
                <li key={`a-${a.campo}`}>
                  <span className="font-medium text-[var(--color-ink)]">{a.label}:</span> {a.mensagem}
                </li>
              ))}
            </ul>
          )}
        </Acao>

        <Acao cor="#E3F6EC" cor2="#1F8A4C" d="M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" titulo="Histórico de alterações" descricao="Quem mudou o cadastro fiscal ou o nome, e quais campos" contador={0} aberta={aberta === "historico"} onClick={() => toggle("historico")}>
          {historico.length === 0 ? (
            nada("Nenhuma alteração registrada no cadastro fiscal.")
          ) : (
            <ul className="space-y-1.5 text-[12px] text-[var(--color-ink2)]">
              {historico.map((h, i) => (
                <li key={i}>
                  <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">{h.quando.toLocaleString("pt-BR")}</span> · {h.quem ?? "usuário removido"}: {h.campos.map((c) => ROTULO_CAMPO[c] ?? c).join(", ") || "sem campos"}
                </li>
              ))}
            </ul>
          )}
        </Acao>
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-ink3)]">
        {semPendenciaAberta ? "Sem pendência aberta não é o mesmo que cadastro correto. " : ""}O assistente não sugere CNPJ, inscrição, alíquota, item da LC 116, CNAE nem código de município, e não preenche campo.
      </p>
    </aside>
  );
}

function Acao({ cor, cor2, d, titulo, descricao, contador, aberta, onClick, children }: { cor: string; cor2: string; d: string; titulo: string; descricao: string; contador: number; aberta: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[11px] border border-[var(--color-line)]", aberta && "bg-[var(--color-surface2)]")}>
      <button type="button" onClick={onClick} aria-expanded={aberta} className="flex w-full items-center gap-2.5 rounded-[11px] p-2.5 text-left hover:bg-[var(--color-surface2)]">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ background: cor }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor2} strokeWidth="1.9" aria-hidden>
            <path d={d} />
          </svg>
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
