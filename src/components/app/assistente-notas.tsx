"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnaliseDasNotas } from "@/lib/nota-servico-analise";
import { EXPLICACAO_DO_CALCULO } from "@/lib/nota-servico-analise";
import { brl } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Faisca } from "@/components/app/assistente-funcionarios";
import { Acao } from "@/components/app/assistente-empresa";

/**
 * Painel do assistente nas Notas Fiscais (Prompt AG, seção 6). SOMENTE
 * LEITURA e determinístico: recebe a análise pronta do servidor, não chama
 * modelo de IA nem action. Nunca emite, nunca corrige, nunca sugere alíquota,
 * item da LC 116, município ou retenção.
 */
type Aba = "conferir" | "rejeitadas" | "demoradas" | "calculo";

export function AssistenteNotas({ usuario, analise, homologacao }: { usuario: string; analise: AnaliseDasNotas; homologacao: boolean }) {
  const chave = `gt:assistente:notas:recolhido:${usuario}`;
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
  const { pendenciasDaEmpresa, conferir, prontas, rejeitadas, demoradas, limiteMinutos } = analise;
  const nada = (t: string) => <p className="text-[12px] text-[var(--color-ink2)]">{t}</p>;
  const toggle = (a: Aba) => setAberta(aberta === a ? null : a);
  const linkNota = (id: string, texto: string) => (
    <Link href={`/notasfiscais/${id}`} className="font-medium text-[var(--color-accent2)] hover:underline">
      {texto}
    </Link>
  );
  const totalRejeitadas = rejeitadas.reduce((s, g) => s + g.quantas, 0);

  return (
    <aside aria-label="Assistente das Notas Fiscais" className="w-full shrink-0 rounded-[16px] border border-[var(--color-line)] bg-white p-4 shadow-sm min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:w-[300px]" data-assistente-notas>
      <div className="mb-3 flex items-start gap-2.5">
        <Faisca />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--color-ink)]">
            Assistente IA
            <Badge tone="neutral">Somente leitura</Badge>
          </div>
          <div className="text-[12px] text-[var(--color-ink2)]">Notas em aberto · {homologacao ? "homologação" : "produção"}</div>
        </div>
        <button type="button" onClick={alternar} aria-expanded={true} aria-label="Recolher o assistente" title="Recolher" className="rounded-[8px] p-1 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        <Acao cor="#FDE6E9" cor2="#C0334A" d="M12 7.5v5M12 16h.01M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" titulo="Conferir antes de emitir" descricao="O que falta em cada rascunho e rejeitada" contador={conferir.length + (pendenciasDaEmpresa.length ? 1 : 0)} aberta={aberta === "conferir"} onClick={() => toggle("conferir")}>
          <div className="space-y-2 text-[12px] text-[var(--color-ink2)]">
            {pendenciasDaEmpresa.length > 0 && (
              <div>
                <p className="font-medium text-[var(--color-ink)]">Cadastro da empresa (vale para todas):</p>
                <ul className="list-disc pl-4">
                  {pendenciasDaEmpresa.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <Link href="/empresa" className="text-[var(--color-accent2)] hover:underline">
                  Abrir Configurações → Empresa
                </Link>
              </div>
            )}
            {conferir.length === 0 && pendenciasDaEmpresa.length === 0
              ? nada(prontas ? `${prontas} nota(s) sem pendência — a tela de conferência mostra tudo antes do envio.` : "Nenhum rascunho ou rejeitada em aberto.")
              : conferir.map((c) => (
                  <div key={c.id}>
                    {linkNota(c.id, `${c.projeto} · ${brl(c.valor)}`)} <span className="text-[var(--color-ink3)]">({c.status})</span>
                    <ul className="list-disc pl-4">
                      {c.pendencias.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            {conferir.length > 0 && prontas > 0 && nada(`Outras ${prontas} nota(s) sem pendência própria.`)}
          </div>
        </Acao>

        <Acao cor="#FFF4E0" cor2="#B7791F" d="M4 6h16M4 12h10M4 18h7" titulo="Rejeitadas, agrupadas" descricao="A mesma mensagem da prefeitura costuma ter a mesma causa" contador={totalRejeitadas} aberta={aberta === "rejeitadas"} onClick={() => toggle("rejeitadas")}>
          {rejeitadas.length === 0 ? (
            nada("Nenhuma nota rejeitada em aberto.")
          ) : (
            <ul className="space-y-1.5 text-[12px] text-[var(--color-ink2)]">
              {rejeitadas.map((g) => (
                <li key={g.motivo}>
                  <span className="font-medium text-[var(--color-ink)]">{g.quantas}×</span> {g.motivo}{" "}
                  <span className="text-[var(--color-ink3)]">
                    {g.ids.slice(0, 5).map((id, i) => (
                      <span key={id}>
                        {i ? ", " : "— "}
                        {linkNota(id, `nota ${i + 1}`)}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Acao>

        <Acao cor="#E7EDFD" cor2="#2B5CD9" d="M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0z" titulo="Processando há muito tempo" descricao={`Enviadas há mais de ${limiteMinutos} minutos — a situação não se atualiza sozinha`} contador={demoradas.length} aberta={aberta === "demoradas"} onClick={() => toggle("demoradas")}>
          {demoradas.length === 0 ? (
            nada("Nenhuma nota parada em processamento.")
          ) : (
            <ul className="space-y-1 text-[12px] text-[var(--color-ink2)]">
              {demoradas.map((d) => (
                <li key={d.id}>
                  {linkNota(d.id, `${d.projeto} · ${brl(d.valor)}`)} — há {d.minutos >= 120 ? `${Math.floor(d.minutos / 60)} h` : `${d.minutos} min`}. Abra e use “Atualizar situação”.
                </li>
              ))}
            </ul>
          )}
        </Acao>

        <Acao cor="#E3F6EC" cor2="#1F8A4C" d="M4 19h16M7 15l3-3 3 2 4-5" titulo="Explicar o cálculo" descricao="Como o sistema chega ao ISS, às retenções e ao líquido" contador={0} aberta={aberta === "calculo"} onClick={() => toggle("calculo")}>
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-[var(--color-ink2)]">
            {EXPLICACAO_DO_CALCULO.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Acao>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">
        O assistente lê as notas desta empresa e não manda nada para fora do sistema. Ele não emite, não corrige e não sugere alíquota, item
        da LC 116, município ou retenção.
      </p>
    </aside>
  );
}
