"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarNota, cancelarNota, enviarNota, reenviarNota, type ResultadoDoEnvio } from "@/lib/actions/notas-servico";
import { MOTIVO_MAXIMO, MOTIVO_MINIMO } from "@/lib/nota-servico";
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
export function AcoesDaNotaProcessando({ id, podeReenviar, rotulo = "Atualizar situação" }: { id: string; podeReenviar: boolean; rotulo?: string }) {
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
          {pendente ? "Consultando…" : rotulo}
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

/**
 * 5.6 — cancelar é irreversível na prefeitura: motivo escrito e o número da
 * nota digitado. A nota não some; fica "cancelada" com quem, quando e por quê.
 */
export function CancelarNota({ id, identificador }: { id: string; identificador: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<ResultadoDoEnvio | null>(null);
  if (!aberto)
    return (
      <Button variant="outline" onClick={() => setAberto(true)} data-abrir-cancelamento>
        Cancelar nota fiscal…
      </Button>
    );
  const pronto = motivo.trim().length >= MOTIVO_MINIMO && confirmacao.trim() === identificador;
  return (
    <div className="space-y-3" data-cancelamento>
      <p className="text-[13px] text-[var(--color-ink2)]">
        O cancelamento vai para a prefeitura e não se desfaz. Algumas prefeituras só aceitam dentro do mês de competência. A nota continua
        aqui, marcada como cancelada.
      </p>
      <div>
        <label className="text-[12px] font-medium text-[var(--color-ink2)]" htmlFor="motivo-cancelamento">
          Motivo ({MOTIVO_MINIMO} a {MOTIVO_MAXIMO} caracteres)
        </label>
        <textarea
          id="motivo-cancelamento"
          className="mt-1 w-full rounded-[8px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px]"
          rows={3}
          maxLength={MOTIVO_MAXIMO}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
      <div>
        <label className="text-[12px] font-medium text-[var(--color-ink2)]" htmlFor="confirmacao-cancelamento">
          Para confirmar, digite o número da nota: <strong>{identificador}</strong>
        </label>
        <input
          id="confirmacao-cancelamento"
          className="mt-1 block h-9 w-48 rounded-[8px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex gap-2">
        <Button
          className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/90"
          disabled={!pronto || pendente}
          onClick={() =>
            iniciar(async () => {
              const res = await cancelarNota(id, motivo, confirmacao);
              setR(res);
              router.refresh();
            })
          }
        >
          {pendente ? "Cancelando…" : "Cancelar nota fiscal"}
        </Button>
        <Button variant="ghost" disabled={pendente} onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
      <Resultado r={r} />
    </div>
  );
}
