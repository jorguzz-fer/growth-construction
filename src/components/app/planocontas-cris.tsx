"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCrisFormulario } from "@/components/app/cris-contexto";
import { criarContasPropostas } from "@/lib/actions/planocontas";
import { categoriaDaContaProposta, contasDaProposta, formularioDoPlano, recusaDaContaProposta, type ContaProposta, type GrupoDoPlanoCris } from "@/lib/planocontas-cris";
import { Button } from "@/components/ui/button";

/**
 * Prompt G2 — a conferência das contas que a Cris propôs. Nada é criado até o
 * botão; o servidor valida tudo de novo.
 */
export function PropostaDeContas({ grupos, codigos, podeCriar }: { grupos: GrupoDoPlanoCris[]; codigos: string[]; podeCriar: boolean }) {
  const router = useRouter();
  const [lista, setLista] = useState<ContaProposta[]>([]);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [pendente, start] = useTransition();
  const existentes = new Set(codigos);
  useCrisFormulario(podeCriar && grupos.length ? formularioDoPlano(grupos) : null, (p) => {
    const nova = contasDaProposta(p.valores, grupos);
    setLista(nova);
    setMarcadas(new Set(nova.map((c, i) => (recusaDaContaProposta(c, grupos, existentes) ? -1 : i)).filter((i) => i >= 0)));
    setMsg(nova.length ? null : "A Cris não propôs nenhuma conta completa (grupo, código e nome).");
  });
  if (!lista.length && !msg) return null;
  const criar = () =>
    start(async () => {
      const r = await criarContasPropostas(lista.filter((_, i) => marcadas.has(i)));
      if (!r.ok) return setMsg(r.error);
      setMsg(
        [r.criadas.length ? `Criada(s): ${r.criadas.join(", ")}.` : "Nenhuma conta criada.", ...r.recusadas.map((x) => `${x.code}: ${x.motivo}`)].join(" "),
      );
      setLista([]);
      router.refresh();
    });
  return (
    <div className="mb-4 rounded-[13px] border border-[#6D4BD1]/30 bg-[#6D4BD1]/5 p-4" data-proposta-contas>
      <h2 className="text-[14px] font-semibold text-[var(--color-ink)]">Contas propostas pela Cris</h2>
      <p className="mb-2 text-[12px] text-[var(--color-ink3)]">Confira e marque as que devem entrar. Nada foi criado ainda.</p>
      {lista.length > 0 && (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--color-ink3)]">
              <th className="py-1 pr-2" />
              <th className="py-1 pr-2">Código</th>
              <th className="py-1 pr-2">Nome</th>
              <th className="py-1 pr-2">Grupo</th>
              <th className="py-1 pr-2">Natureza</th>
              <th className="py-1 pr-2">Categoria da DRE</th>
              <th className="py-1">Conferir</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c, i) => {
              const recusa = recusaDaContaProposta(c, grupos, existentes);
              return (
                <tr key={i} className="border-t border-[var(--color-line)]" data-conta-proposta={c.code}>
                  <td className="py-1 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`Criar ${c.code}`}
                      disabled={!!recusa}
                      checked={marcadas.has(i)}
                      onChange={() => setMarcadas((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                    />
                  </td>
                  <td className="py-1 pr-2 font-[family-name:var(--font-mono)]">{c.code}</td>
                  <td className="py-1 pr-2">{c.name}</td>
                  <td className="py-1 pr-2">{c.groupCode}</td>
                  <td className="py-1 pr-2">{c.natureza}</td>
                  <td className="py-1 pr-2">
                    {categoriaDaContaProposta(c, grupos)}
                    {!c.dreCategory && <span className="text-[var(--color-ink4)]"> (padrão)</span>}
                  </td>
                  <td className="py-1 text-[var(--color-danger)]">{recusa ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {lista.length > 0 && (
          <Button type="button" size="sm" disabled={pendente || marcadas.size === 0} onClick={criar} data-criar-contas>
            Criar as contas marcadas
          </Button>
        )}
        {lista.length > 0 && (
          <button type="button" className="text-[12px] text-[var(--color-ink3)] hover:underline" onClick={() => { setLista([]); setMsg(null); }}>
            Descartar a proposta
          </button>
        )}
        {msg && <span role="status" className="text-[12.5px] text-[var(--color-ink2)]">{msg}</span>}
      </div>
    </div>
  );
}
