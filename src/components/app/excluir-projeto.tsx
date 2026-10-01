"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProject, inventarioDoProjeto } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { descreverInventario, totalDoInventario, type InventarioDoProjeto } from "@/lib/projeto-regras";

/**
 * Exclusão protegida do projeto (Prompt B, 37). O diálogo mostra o inventário
 * do que a exclusão física leva junto (unidades, despesas, caixa, medições…)
 * e só libera o botão quando o nome do projeto é digitado igual ao cadastro
 * — conferido de novo no servidor. As regras de exclusão não mudam; só a
 * proteção de interface. Abre pelo menu `[...]`, longe do Salvar.
 */
export function ExcluirProjeto({ projectId, nome, aberto, onFechar, voltarParaTodos = false }: { projectId: string; nome: string; aberto: boolean; onFechar: () => void; voltarParaTodos?: boolean }) {
  const router = useRouter();
  const [inventario, setInventario] = useState<InventarioDoProjeto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [digitado, setDigitado] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setDigitado("");
    setErro(null);
    setInventario(null);
    let vivo = true;
    inventarioDoProjeto(projectId).then((r) => {
      if (!vivo) return;
      if (r.ok) setInventario(r.inventario);
      else setErro(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [aberto, projectId]);

  if (!aberto) return null;
  const confere = digitado.trim().toLowerCase() === nome.trim().toLowerCase();
  const itens = inventario ? descreverInventario(inventario) : [];
  const total = inventario ? totalDoInventario(inventario) : 0;

  const excluir = () =>
    start(async () => {
      const r = await deleteProject(projectId, digitado);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      onFechar();
      if (voltarParaTodos) router.push("/projeto?proj=all");
      else router.refresh();
    });

  return (
    <div role="dialog" aria-modal="true" aria-label={`Excluir ${nome}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[14px] border border-[var(--color-line)] bg-white p-5 shadow-xl">
        <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">Excluir {nome}?</h3>
        <p className="mt-1 text-[12.5px] text-[var(--color-ink2)]">
          A exclusão é <strong>física e definitiva</strong>: leva junto as versões (Orçamento, Previsão, Atual) e tudo o que está dentro delas. Não há como desfazer.
        </p>
        <div className="mt-3 rounded-[10px] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3 text-[12.5px] text-[var(--color-ink)]">
          {inventario == null && !erro && <span className="text-[var(--color-ink3)]">Contando os registros vinculados…</span>}
          {inventario != null && total === 0 && <span>Nenhum registro vinculado: só o cadastro e as versões vazias saem.</span>}
          {inventario != null && total > 0 && (
            <>
              <div className="mb-1 font-medium">Vai junto com o projeto:</div>
              <ul className="list-disc space-y-0.5 pl-5">
                {itens.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="mt-3">
          <Label>Para confirmar, digite o nome do projeto</Label>
          <Input value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder={nome} aria-label="Nome do projeto para confirmar a exclusão" disabled={pending} autoFocus />
        </div>
        {erro && <p className="mt-2 text-[12px] text-[var(--color-danger)]" role="alert">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" size="sm" className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/90" onClick={excluir} disabled={pending || !confere || inventario == null}>
            {pending ? "Excluindo…" : "Excluir definitivamente"}
          </Button>
        </div>
      </div>
    </div>
  );
}
