"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InccRow } from "@/lib/calc";
import { marcarComoProjecao, projectFutureIncc, updateInccMonth } from "@/lib/actions/incc";
import { avisoDeFaixa, JANELA_DA_MEDIA, mesesFuturosOficiais, mesesNaMedia, ordDeHoje } from "@/lib/incc-regras";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

const CONFIRM_MSG = "Confirma a alteração deste índice? Ela recalcula os meses projetados e muda os números do Caixa e da comparação entre cenários na próxima renderização.";

/**
 * Editor da tabela INCC (Prompt Q).
 *
 * 1.2 — a projeção NUNCA roda sozinha: se há meses futuros ainda oficiais, a
 * tela informa e oferece a ação; o botão de reprojetar só recalcula os meses
 * já marcados como projeção (2.2). Converter um mês oficial em projeção é
 * ação explícita naquele mês, com confirmação (2.3).
 * 4.3 — índice fora da faixa usual avisa e deixa salvar; negativo é aceito.
 * 4.6 — mês projetado mostra quantos meses entraram na média quando < 12.
 * 4.4 — toda action devolve { ok, error }; a mensagem aparece aqui.
 */
export function InccEditor({ projectId, initial, canEdit }: { projectId: string; initial: InccRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const hoje = ordDeHoje();
  const futurosOficiais = useMemo(() => mesesFuturosOficiais(initial, hoje), [initial, hoje]);
  const projetados = initial.filter((r) => r.projected).length;

  const rodar = (acao: () => Promise<{ ok: true; meses: number } | { ok: false; error: string }>, feito: (n: number) => string) => {
    setAviso(null);
    start(async () => {
      const r = await acao();
      if (!r.ok) {
        setAviso({ ok: false, texto: r.error });
        return;
      }
      setAviso({ ok: true, texto: feito(r.meses) });
      router.refresh();
    });
  };

  const commit = (row: InccRow, raw: string, input: HTMLInputElement) => {
    const value = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isFinite(value)) {
      setAviso({ ok: false, texto: "Informe um número para a variação mensal." });
      input.value = String(row.mo);
      return;
    }
    if (value === row.mo && !row.projected) {
      input.value = String(row.mo); // sem mudança real → restaura
      return;
    }
    const faixa = avisoDeFaixa(value);
    const pergunta = (faixa ? `⚠ ${faixa}\n\n` : "") + CONFIRM_MSG;
    if (!window.confirm(pergunta)) {
      input.value = String(row.mo); // cancelado → restaura
      return;
    }
    rodar(
      () => updateInccMonth(projectId, row.m, value),
      (n) => `Índice de ${row.m} gravado como oficial.${n > 1 ? ` ${n - 1} mês(es) projetado(s) recalculado(s).` : ""}`,
    );
  };

  const reprojetar = () => {
    if (!window.confirm(`Recalcular os ${projetados} mês(es) marcados como projeção pela média móvel de ${JANELA_DA_MEDIA} meses? Meses oficiais não são tocados.`)) return;
    rodar(() => projectFutureIncc(projectId), (n) => `Projeção recalculada: ${n} mês(es) com valor novo.`);
  };

  const converterTodos = () => {
    if (!window.confirm(`Marcar como PROJEÇÃO os ${futurosOficiais.length} mês(es) futuros hoje marcados como oficiais?\n\n${futurosOficiais.join(", ")}\n\nO índice informado neles será substituído pela média móvel. Esta ação não pode ser desfeita pelo botão de reprojetar.`)) return;
    rodar(() => marcarComoProjecao(projectId, futurosOficiais), (n) => `${n} mês(es) convertido(s) em projeção e recalculado(s).`);
  };

  const converterUm = (mes: string) => {
    if (!window.confirm(`Marcar ${mes} como PROJEÇÃO? O índice informado será substituído pela média móvel.`)) return;
    rodar(() => marcarComoProjecao(projectId, [mes]), () => `${mes} convertido em projeção.`);
  };

  return (
    <>
      {canEdit && futurosOficiais.length > 0 && (
        <div role="status" className="mb-4 rounded-[10px] border border-[var(--color-warning)]/40 bg-[#fef3c7]/60 px-4 py-2.5 text-[13px] text-[#92400e]">
          Há <strong>{futurosOficiais.length}</strong> mês(es) futuro(s) marcado(s) como oficial(is) e sem projeção ({futurosOficiais.slice(0, 6).join(", ")}
          {futurosOficiais.length > 6 ? "…" : ""}). Nada é projetado sozinho: se esses meses não foram informados pela FGV, converta-os em projeção pela ação do
          mês ou pelo botão abaixo.
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button variant="outline" disabled={pending || projetados === 0} onClick={reprojetar}>
            {pending ? "Processando…" : `Recalcular projeção (média ${JANELA_DA_MEDIA}m)`}
          </Button>
        )}
        {canEdit && futurosOficiais.length > 0 && (
          <Button variant="outline" disabled={pending} onClick={converterTodos}>
            Projetar os {futurosOficiais.length} futuros oficiais…
          </Button>
        )}
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink3)]">
          <Badge tone="neutral">Oficial</Badge> índice informado
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink3)]">
          <Badge tone="warning">Projeção</Badge> média móvel de {JANELA_DA_MEDIA} meses · {projetados} {projetados === 1 ? "mês" : "meses"}
        </span>
      </div>
      {aviso && (
        <p role="status" className={`mb-3 text-[13px] ${aviso.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
          {aviso.texto}
        </p>
      )}

      <p className="mb-4 rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-ink3)]">
        Edite qualquer índice diretamente na tabela — a alteração pede confirmação, marca o mês como oficial e recalcula só os meses projetados. Meses
        oficiais nunca são sobrescritos pela projeção, estejam no futuro ou não. Índice fora da faixa usual avisa e deixa salvar; o INCC pode ser negativo.
      </p>

      <Table>
        <THead>
          <tr>
            <TH>Mês</TH>
            <TH>Tipo</TH>
            <TH className="text-right">Variação mensal %</TH>
            <TH className="text-right">Acumulado %</TH>
            {canEdit && <TH className="text-right">Ações</TH>}
          </tr>
        </THead>
        <tbody>
          {initial.map((r, i) => {
            const janela = r.projected ? mesesNaMedia(i) : null;
            const futuroOficial = futurosOficiais.includes(r.m);
            return (
              <TR key={r.m} className={r.projected ? "bg-[var(--color-warning)]/[0.06]" : undefined}>
                <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">{r.m}</TD>
                <TD>
                  <Badge tone={r.projected ? "warning" : "neutral"}>{r.projected ? "Projeção" : "Oficial"}</Badge>
                  {janela != null && janela < JANELA_DA_MEDIA && (
                    <span className="ml-1.5 text-[11px] text-[var(--color-ink3)]" title="Menos de 12 meses de histórico: a média usou o que havia">
                      média de {janela} {janela === 1 ? "mês" : "meses"}
                    </span>
                  )}
                </TD>
                <TD className="text-right">
                  <input
                    type="number"
                    step="0.001"
                    defaultValue={String(r.mo)}
                    key={`${r.m}-${r.mo}-${r.projected ? "p" : "o"}`}
                    disabled={!canEdit || pending}
                    aria-label={`Variação mensal de ${r.m}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    onBlur={(e) => commit(r, e.target.value, e.currentTarget)}
                    className={`ml-auto h-8 w-28 rounded-[8px] border px-2 text-right font-[family-name:var(--font-mono)] text-sm ${
                      r.projected ? "border-[var(--color-warning)]/40 bg-white text-[var(--color-ink2)]" : "border-[var(--color-accent2)]/20 bg-white"
                    } disabled:opacity-60`}
                  />
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{r.ac.toFixed(3)}</TD>
                {canEdit && (
                  <TD className="text-right">
                    {futuroOficial ? (
                      <button type="button" disabled={pending} onClick={() => converterUm(r.m)} className="text-[12px] text-[var(--color-warning)] hover:underline disabled:opacity-50">
                        Projetar
                      </button>
                    ) : (
                      <span className="text-[var(--color-ink4)]">—</span>
                    )}
                  </TD>
                )}
              </TR>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
