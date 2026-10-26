"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarNota, enviarNota, reenviarNota, type ResultadoDoEnvio } from "@/lib/actions/notas-servico";
import { Button } from "@/components/ui/button";

/** Prompt AG — o resultado de uma ação sobre a nota, em texto simples. */
function Resultado({ r }: { r: ResultadoDoEnvio | null }) {
  if (!r) return null;
  if (r.ok) return r.aviso ? <p className="text-[13px] text-[var(--color-ink2)]" role="status">{r.aviso}</p> : null;
  return (
    <div className="text-[13px] text-[var(--color-danger)]" role="alert">
      <p>{r.error}</p>
      {r.pendencias?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {r.pendencias.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * O ponto sem volta (4.2): só envia com a caixa marcada. Em produção a frase
 * diz que a nota tem valor fiscal.
 */
export function EnviarNota({ id, producao }: { id: string; producao: boolean }) {
  const router = useRouter();
  const [conferido, setConferido] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<ResultadoDoEnvio | null>(null);
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-[13px] text-[var(--color-ink)]">
        <input type="checkbox" className="mt-0.5" checked={conferido} onChange={(e) => setConferido(e.target.checked)} data-conferido />
        <span>
          Conferi o tomador, os valores e o município.{" "}
          {producao
            ? "Entendo que a nota será emitida em PRODUÇÃO, com valor fiscal, e que depois de autorizada só pode ser cancelada."
            : "É uma nota de homologação: sem valor fiscal."}
        </span>
      </label>
      <Button
        disabled={!conferido || pendente}
        onClick={() =>
          iniciar(async () => {
            const res = await enviarNota(id, conferido);
            setR(res);
            if (res.ok) router.push(`/notasfiscais/${id}`);
          })
        }
      >
        {pendente ? "Enviando…" : producao ? "Emitir nota fiscal" : "Enviar para homologação"}
      </Button>
      <Resultado r={r} />
    </div>
  );
}

/** Nota processando: consultar o provedor, ou reenviar a MESMA ref se ele não a conhece. */
export function AcoesDaNotaProcessando({ id, podeReenviar }: { id: string; podeReenviar: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<ResultadoDoEnvio | null>(null);
  const rodar = (f: () => Promise<ResultadoDoEnvio>) =>
    iniciar(async () => {
      const res = await f();
      setR(res);
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pendente} onClick={() => rodar(() => atualizarNota(id))}>
          {pendente ? "Consultando…" : "Atualizar situação"}
        </Button>
        {podeReenviar && (
          <Button variant="outline" disabled={pendente} onClick={() => rodar(() => reenviarNota(id))}>
            Reenviar (mesma referência)
          </Button>
        )}
      </div>
      {podeReenviar && (
        <p className="text-[12px] text-[var(--color-ink3)]">
          Reenviar só serve quando o envio não chegou à Focus. O sistema consulta antes e, se a Focus já tiver a nota, não reenvia nada.
        </p>
      )}
      <Resultado r={r} />
    </div>
  );
}
