"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pedirPacoteCompleto } from "@/lib/actions/backup-pacote";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface PacoteNaTela {
  id: string;
  semestre: string;
  rotulo: string;
  situacao: "gerando" | "pronto" | "falhou" | "interrompido";
  etapa: string | null;
  feitas: number;
  total: number;
  pedidoEm: string;
  por: string;
  bytes: number | null;
  linhas: number | null;
  documentos: string | null;
  erro: string | null;
}

const TOM = { gerando: "info", pronto: "success", falhou: "danger", interrompido: "warning" } as const;
const ROTULO = { gerando: "Gerando", pronto: "Pronto", falhou: "Falhou", interrompido: "Interrompido" } as const;

function tamanho(b: number | null): string {
  if (b == null) return "—";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Prompt AO, 4.3 — pedir o pacote completo, acompanhar e baixar. A geração
 * roda no servidor; enquanto houver pedido em andamento, a tela se atualiza
 * sozinha a cada 3 segundos.
 */
export function BackupPacote({ semestres, pacotes, disponivel }: { semestres: { key: string; label: string }[]; pacotes: PacoteNaTela[]; disponivel: boolean }) {
  const router = useRouter();
  const [semestre, setSemestre] = useState(semestres[0]?.key ?? "");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const andamento = pacotes.some((p) => p.situacao === "gerando");

  useEffect(() => {
    if (!andamento) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [andamento, router]);

  return (
    <div className="space-y-4" data-pacote-completo>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={semestre}
          onChange={(e) => setSemestre(e.target.value)}
          className="h-9 rounded-[8px] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[13px]"
          aria-label="Semestre do pacote"
        >
          {semestres.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <Button
          disabled={!disponivel || !semestre || pendente || andamento}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await pedirPacoteCompleto(semestre);
              if (!r.ok) setErro(r.error);
              router.refresh();
            })
          }
        >
          {pendente ? "Pedindo…" : "Gerar pacote completo"}
        </Button>
        {andamento && <span className="text-[12px] text-[var(--color-ink3)]">Um pacote está sendo gerado — a tela se atualiza sozinha.</span>}
        {!disponivel && <span className="text-[12px] text-[var(--color-ink3)]">Indisponível: o armazenamento (R2) não está configurado no servidor.</span>}
      </div>
      {erro && (
        <p className="text-[13px] text-[var(--color-danger)]" role="alert">
          {erro}
        </p>
      )}
      {pacotes.length > 0 && (
        <Table aria-label="Pacotes completos gerados">
          <THead>
            <tr>
              <TH>Semestre</TH>
              <TH>Pedido</TH>
              <TH>Situação</TH>
              <TH className="text-right">Linhas</TH>
              <TH>Documentos</TH>
              <TH className="text-right">Tamanho</TH>
              <TH className="text-right">Arquivo</TH>
            </tr>
          </THead>
          <tbody>
            {pacotes.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium text-[var(--color-ink)]">{p.rotulo}</TD>
                <TD className="text-[12px] text-[var(--color-ink2)]">
                  {p.pedidoEm} · {p.por}
                </TD>
                <TD>
                  <Badge tone={TOM[p.situacao]}>{ROTULO[p.situacao]}</Badge>
                  {p.situacao === "gerando" && (
                    <span className="mt-1 block text-[11.5px] text-[var(--color-ink3)]" data-progresso>
                      {p.etapa ?? "Na fila"}
                      {p.total ? ` · ${p.feitas}/${p.total}` : ""}
                    </span>
                  )}
                  {p.situacao === "interrompido" && <span className="mt-1 block text-[11.5px] text-[var(--color-ink3)]">O servidor parou no meio. Peça de novo.</span>}
                  {p.situacao === "falhou" && p.erro && <span className="mt-1 block text-[11.5px] text-[var(--color-danger)]">{p.erro}</span>}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">{p.linhas ?? "—"}</TD>
                <TD className="text-[12px]">{p.documentos ?? "—"}</TD>
                <TD className="text-right text-[12px]">{tamanho(p.bytes)}</TD>
                <TD className="text-right">
                  {p.situacao === "pronto" ? (
                    <a href={`/backup/pacote/${p.id}`} className="text-[13px] text-[var(--color-accent2)] hover:underline">
                      Baixar
                    </a>
                  ) : (
                    "—"
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
