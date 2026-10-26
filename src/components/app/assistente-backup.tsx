"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Faisca } from "@/components/app/assistente-funcionarios";
import { Acao } from "@/components/app/assistente-empresa";

/**
 * Painel do assistente na tela Backup de dados (Prompt AO, Parte 8). SOMENTE
 * LEITURA e determinístico: recebe a análise pronta do servidor. Nunca gera
 * nem baixa pacote (exportação é ato humano) e nunca mostra conteúdo de linha.
 */
type Aba = "contem" | "mudou" | "sem";

export interface AnaliseDoBackup {
  pacote: { rotulo: string; geradoEm: string; frases: string[] } | null;
  mudancas: { rotulo: string; desde: string; frases: string[] }[];
  semBackup: { key: string; label: string; motivo: string }[];
}

export function AssistenteBackup({ usuario, analise }: { usuario: string; analise: AnaliseDoBackup }) {
  const chave = `gt:assistente:backup:recolhido:${usuario}`;
  const [recolhido, setRecolhido] = useState(false);
  const [aberta, setAberta] = useState<Aba | null>(null);
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
  const nada = (t: string) => <p className="text-[12px] text-[var(--color-ink2)]">{t}</p>;
  const toggle = (a: Aba) => setAberta(aberta === a ? null : a);
  const lista = (xs: string[]) => (
    <ul className="list-disc space-y-1 pl-4 text-[12px] text-[var(--color-ink2)]">
      {xs.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
  const totalMudancas = analise.mudancas.reduce((s, m) => s + m.frases.length, 0);

  return (
    <aside aria-label="Assistente do Backup" className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]" data-assistente-backup>
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="neutral">Somente leitura</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Backup · o que está salvo e o que falta</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div className="space-y-2">
        <Acao cor="#E7EDFD" cor2="#2B5CD9" d="M4 6h16M4 12h16M4 18h10" titulo="O que este pacote contém" descricao="O último pacote completo, lido do manifesto" contador={0} aberta={aberta === "contem"} onClick={() => toggle("contem")}>
          {analise.pacote ? (
            <>
              <p className="mb-1 text-[12px] font-medium text-[var(--color-ink)]">
                {analise.pacote.rotulo} · gerado em {analise.pacote.geradoEm}
              </p>
              {lista(analise.pacote.frases)}
            </>
          ) : (
            nada("Nenhum pacote completo pronto ainda.")
          )}
        </Acao>
        <Acao cor="#FFF4E0" cor2="#B7791F" d="M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" titulo="O que mudou desde o último backup" descricao="Lançamentos criados ou alterados depois do último download" contador={totalMudancas} aberta={aberta === "mudou"} onClick={() => toggle("mudou")}>
          {analise.mudancas.length === 0 ? (
            nada("Nada novo nos semestres já baixados — ou nenhum semestre foi baixado ainda.")
          ) : (
            <div className="space-y-2">
              {analise.mudancas.map((m) => (
                <div key={m.rotulo}>
                  <p className="text-[12px] font-medium text-[var(--color-ink)]">
                    {m.rotulo} · baixado em {m.desde}
                  </p>
                  {lista(m.frases)}
                </div>
              ))}
              {nada("Só aparece o que tem data de criação ou de alteração. Para guardar o estado atual, gere o pacote de novo.")}
            </div>
          )}
        </Acao>
        <Acao cor="#FDE6E9" cor2="#C0334A" d="M12 7.5v5M12 16h.01M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" titulo="Períodos sem backup" descricao="Semestres encerrados ainda não salvos" contador={analise.semBackup.length} aberta={aberta === "sem"} onClick={() => toggle("sem")}>
          {analise.semBackup.length === 0
            ? nada("Todos os semestres encerrados com dados já foram baixados depois de encerrados.")
            : lista(analise.semBackup.map((s) => `${s.label}: ${s.motivo}`))}
        </Acao>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">
        O assistente só lê contagens. Ele não gera nem baixa pacote e não mostra o conteúdo dos dados.
      </p>
    </aside>
  );
}
