"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addFuncionario } from "@/lib/actions/funcionarios";
import type { FuncionarioLista } from "@/lib/queries";
import { situacaoDoFuncionario } from "@/lib/funcionario-regras";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { FuncionarioCampos } from "@/components/app/funcionario-campos";
import { VALORES_VAZIOS, fdDe, type ValoresFuncionario } from "@/lib/funcionario-form";

const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Lista de funcionários (Prompt Z, Parte 2): CPF mascarado (7.1); desligados ficam, com a situação (2.4). */
export function FuncionariosManager({ funcionarios, projetos, canCriar, podeDados }: { funcionarios: FuncionarioLista[]; projetos: { id: string; nome: string }[]; canCriar: boolean; podeDados: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState(false);
  const [v, setV] = useState<ValoresFuncionario>(VALORES_VAZIOS);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [mostrarDesligados, setMostrarDesligados] = useState(false);
  const lista = funcionarios.filter((f) => mostrarDesligados || !f.desligamento);

  const salvar = () =>
    start(async () => {
      const r = await addFuncionario(fdDe(v));
      if (!r.ok) return setMsg({ ok: false, texto: r.error });
      setMsg({ ok: true, texto: `Funcionário cadastrado.${r.aviso ? ` Atenção: ${r.aviso}` : ""}` });
      setV(VALORES_VAZIOS);
      setNovo(false);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-ink2)]">
          <input type="checkbox" checked={mostrarDesligados} onChange={(e) => setMostrarDesligados(e.target.checked)} /> Mostrar desligados
        </label>
        {canCriar && <Button type="button" size="sm" onClick={() => setNovo(!novo)}>{novo ? "Fechar" : "Novo funcionário"}</Button>}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-[12.5px] ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>{msg.texto}</p>}
      {novo && canCriar && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">Novo funcionário (CLT)</h3>
            <p className="text-[12px] text-[var(--color-ink3)]">Autônomo, engenheiro e mestre de obra que emitem nota ou recibo ficam em Fornecedores. Aqui entra quem tem vínculo CLT.</p>
            <FuncionarioCampos v={v} onChange={(k, val) => setV({ ...v, [k]: val })} podeDados={podeDados} projetos={projetos} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
              <Button type="button" disabled={pending} onClick={salvar}>{pending ? "Salvando…" : "Cadastrar"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="tbl-scroll overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Nome</TH>
                  <TH>CPF</TH>
                  <TH>Cargo</TH>
                  <TH>Setor / Obra</TH>
                  <TH>Admissão</TH>
                  <TH>Contrato</TH>
                  <TH>Situação</TH>
                  <TH></TH>
                </tr>
              </THead>
              <tbody>
                {lista.map((f) => (
                  <TR key={f.id} className={f.desligamento ? "opacity-60" : ""}>
                    <TD className="font-medium text-[var(--color-ink)]">{f.nome}</TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]" data-cpf>{f.cpfMascarado ?? "—"}</TD>
                    <TD>{f.cargo ?? "—"}</TD>
                    <TD className="text-[var(--color-ink2)]">{[f.setor, f.projectName].filter(Boolean).join(" · ") || "—"}</TD>
                    <TD className="font-[family-name:var(--font-mono)]">{dataBR(f.admissao)}</TD>
                    <TD className="text-[var(--color-ink3)]">{f.tipoContrato ?? "—"}</TD>
                    <TD><Badge tone={f.desligamento ? "neutral" : "success"}>{situacaoDoFuncionario(f)}{f.desligamento ? ` em ${dataBR(f.desligamento)}` : ""}</Badge></TD>
                    <TD className="text-right"><Link href={`/funcionarios/${f.id}`} className="text-[12px] text-[var(--color-accent2)] hover:underline">Ficha →</Link></TD>
                  </TR>
                ))}
                {lista.length === 0 && <TR><TD colSpan={8} className="py-8 text-center text-[var(--color-ink4)]">Nenhum funcionário{mostrarDesligados ? "" : " ativo"} cadastrado.</TD></TR>}
              </tbody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
