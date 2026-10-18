import type { Contagem, PerfilDaBase } from "@/lib/perfil-clientes";

function Lista({ titulo, itens, total }: { titulo: string; itens: Contagem[]; total: number }) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink3)]">{titulo}</h3>
      <ul className="space-y-0.5 text-[12.5px]">
        {itens.map((c) => (
          <li key={c.rotulo} className="flex justify-between gap-3">
            <span className="text-[var(--color-ink2)]">{c.rotulo}</span>
            <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
              {c.qtd} <span className="text-[var(--color-ink4)]">({total ? Math.round((c.qtd / total) * 100) : 0}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Prompt M2 — o perfil da base, só contagens (sem nome, documento, renda ou contato). */
export function PerfilDaBaseCard({ perfil }: { perfil: PerfilDaBase }) {
  return (
    <details className="mb-4 rounded-[12px] border border-[var(--color-line)] bg-white p-4" data-perfil-base>
      <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
        Perfil da base · {perfil.total} cliente(s), {perfil.comUnidade} com unidade
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Lista titulo="Situação do contrato" itens={perfil.porSituacao} total={perfil.total} />
        <Lista titulo="Finalidade" itens={perfil.porFinalidade} total={perfil.total} />
        <Lista titulo="Faixa etária" itens={perfil.porFaixaEtaria} total={perfil.total} />
        <Lista titulo="Cidade" itens={perfil.porCidade} total={perfil.total} />
        <Lista titulo="Como conheceu" itens={perfil.porCanal} total={perfil.total} />
      </div>
      <p className="mt-3 text-[11.5px] text-[var(--color-ink3)]">
        Só contagens. Grupo com menos de 3 clientes entra em &ldquo;Outros&rdquo;. Renda, FGTS, score, documento e contato não entram no perfil.
      </p>
    </details>
  );
}
