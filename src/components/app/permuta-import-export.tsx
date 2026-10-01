"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { importPermutas } from "@/lib/actions/receitas";
import {
  COLUNAS_DA_PLANILHA,
  dataDaCelula,
  numeroDaCelula,
  prepararImportacaoDePermutas,
  resumoDaImportacaoDePermutas,
  type AtivoExistente,
  type LinhaIgnoradaPermuta,
  type LinhaImportacaoPermuta,
} from "@/lib/permuta-inventario";
import { baixarXlsx } from "@/lib/download";
import { dateBR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface PermutaExport {
  id: string;
  unitCode: string | null;
  clienteNome: string | null;
  dataRecebimento: string | null;
  tipo: string | null;
  descricao: string | null;
  estimado: string | null;
  status: string | null;
  dataVenda: string | null;
  valorVenda: string | null;
  formaVenda: string | null;
  tipoPermuta: string | null;
  obs: string | null;
  cancelado: boolean;
}

interface LinhaPrevia extends LinhaImportacaoPermuta {
  acao: "inserir" | "atualizar" | "ignorar";
  motivo: string | null;
}

/**
 * Exportar, modelo e importar o inventário de permuta (Prompt P, 5.4–5.6).
 * A prévia é obrigatória: quantas linhas inserem, quantas atualizam, quantas
 * ficam de fora e por quê, antes de gravar. A validação de verdade é a da
 * action (mesma do formulário), que também confere a trava da versão.
 */
export function PermutaImportExport({ projectId, projectName, ativos, canImport }: { projectId: string; projectName: string; ativos: PermutaExport[]; canImport: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<LinhaPrevia[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ignoradas, setIgnoradas] = useState<LinhaIgnoradaPermuta[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const exportar = () => {
    const aoa: (string | number)[][] = [[...COLUNAS_DA_PLANILHA]];
    for (const a of ativos.filter((x) => !x.cancelado))
      aoa.push([
        a.id,
        a.unitCode ?? "",
        a.clienteNome ?? "",
        a.dataRecebimento ? dateBR(a.dataRecebimento) : "",
        a.tipo ?? "",
        a.descricao ?? "",
        Number(a.estimado ?? 0),
        a.status ?? "",
        a.dataVenda ? dateBR(a.dataVenda) : "",
        Number(a.valorVenda ?? 0) || "",
        a.formaVenda ?? "",
        a.tipoPermuta ?? "",
        a.obs ?? "",
      ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Permuta");
    baixarXlsx(wb, `permuta-${projectName.replace(/[^\w]+/g, "_")}.xlsx`);
  };

  const modelo = () => {
    const wb = XLSX.utils.book_new();
    const aoa = [[...COLUNAS_DA_PLANILHA], ["", "101", "Nome do cliente como no cadastro", "15/09/2026", "Imóvel", "Apto 12, bairro X", 80000, "Disponivel", "", "", "avista", "", ""]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Permuta");
    baixarXlsx(wb, "modelo-permuta.xlsx");
  };

  const onFile = async (file: File) => {
    setMsg(null);
    setIgnoradas([]);
    setErro(null);
    setPreview(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
      const ws = wb.Sheets["Permuta"] ?? wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" }).filter((r) => r.some((c) => String(c ?? "").trim()));
      if (grid.length < 2) return setErro("Planilha vazia ou sem linhas de dados.");
      const head = (grid[0] as unknown[]).map((c) => String(c ?? "").trim().toLowerCase());
      const idx = (aliases: string[]) => head.findIndex((h) => aliases.some((a) => h.includes(a)));
      const col = {
        id: idx(["id"]),
        unidade: idx(["unidade", "unit"]),
        cliente: idx(["cliente"]),
        dataReceb: idx(["data receb", "recebimento"]),
        tipo: head.findIndex((h) => h === "tipo" || h === "tipo do bem"),
        descricao: idx(["descri"]),
        estimado: idx(["estimado"]),
        status: idx(["status", "situa"]),
        dataVenda: idx(["data venda", "data da venda"]),
        valorVenda: idx(["valor venda", "valor da venda"]),
        forma: idx(["forma"]),
        tipoPermuta: idx(["tipo permuta"]),
        obs: idx(["obs"]),
      };
      if (col.unidade < 0 || col.estimado < 0) return setErro('Colunas "Unidade" e "Valor estimado" são obrigatórias. Baixe o modelo e use os mesmos cabeçalhos.');
      const existentes: AtivoExistente[] = ativos.map((a) => ({ id: a.id, status: a.status, cancelado: a.cancelado }));
      const linhas: LinhaImportacaoPermuta[] = [];
      const errosDeLeitura: { i: number; motivo: string }[] = [];
      grid.slice(1).forEach((r, i) => {
        const cell = (c: number) => (c >= 0 ? String((r as unknown[])[c] ?? "").trim() : "");
        const raw = (c: number) => (c >= 0 ? (r as unknown[])[c] : "");
        const motivos: string[] = [];
        const estimadoN = numeroDaCelula(raw(col.estimado));
        if (estimadoN != null && Number.isNaN(estimadoN)) motivos.push(`valor estimado ilegível "${cell(col.estimado)}"`);
        const valorVendaN = col.valorVenda >= 0 ? numeroDaCelula(raw(col.valorVenda)) : null;
        if (valorVendaN != null && Number.isNaN(valorVendaN)) motivos.push(`valor de venda ilegível "${cell(col.valorVenda)}"`);
        const dataReceb = dataDaCelula(raw(col.dataReceb));
        if (dataReceb === null) motivos.push(`data de recebimento ilegível "${cell(col.dataReceb)}"`);
        const dataVenda = col.dataVenda >= 0 ? dataDaCelula(raw(col.dataVenda)) : "";
        if (dataVenda === null) motivos.push(`data de venda ilegível "${cell(col.dataVenda)}"`);
        if (motivos.length) errosDeLeitura.push({ i, motivo: motivos.join("; ") });
        linhas.push({
          id: cell(col.id) || undefined,
          unitCode: cell(col.unidade) || null,
          cliente: cell(col.cliente) || null,
          dataRecebimento: dataReceb || null,
          tipo: cell(col.tipo) || null,
          descricao: cell(col.descricao) || null,
          // Ilegível vira null de propósito: a validação recusa e a linha é
          // reportada — nunca gravada como zero (5.5).
          estimado: estimadoN == null || Number.isNaN(estimadoN) ? null : String(estimadoN),
          status: cell(col.status) || "Disponivel",
          dataVenda: dataVenda || null,
          valorVenda: valorVendaN == null || Number.isNaN(valorVendaN) ? null : String(valorVendaN),
          formaVenda: cell(col.forma) || null,
          tipoPermuta: cell(col.tipoPermuta) || null,
          obs: cell(col.obs) || null,
        });
      });
      const prep = prepararImportacaoDePermutas(linhas, existentes);
      const previa: LinhaPrevia[] = linhas.map((l, i) => {
        const leitura = errosDeLeitura.find((e) => e.i === i);
        const ign = prep.ignoradas.find((x) => x.linha === `linha ${i + 1}` || x.linha.startsWith(`linha ${i + 1} (`));
        return { ...l, acao: leitura || ign ? "ignorar" : l.id ? "atualizar" : "inserir", motivo: leitura?.motivo ?? ign?.motivo ?? null };
      });
      if (previa.length === 0) return setErro("Nenhuma linha com dados.");
      setPreview(previa);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler a planilha.");
    }
  };

  const validas = preview?.filter((r) => r.acao !== "ignorar") ?? [];
  const novas = validas.filter((r) => r.acao === "inserir").length;
  const atualizar = validas.length - novas;
  const fora = (preview?.length ?? 0) - validas.length;

  const confirmar = () => {
    if (validas.length === 0) return;
    setErro(null);
    start(async () => {
      const res = await importPermutas(
        validas.map(({ acao, motivo, ...r }) => {
          void acao;
          void motivo;
          return r;
        }),
        projectId,
      );
      if (!res.ok) return setErro(res.error);
      setMsg(`${projectName}: ${resumoDaImportacaoDePermutas(res)}`);
      setIgnoradas(res.ignoradas);
      setPreview(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={exportar} disabled={pending}>
          ⬇ Exportar inventário
        </Button>
        <Button variant="outline" size="sm" onClick={modelo} disabled={pending}>
          Modelo
        </Button>
        {canImport && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onFile(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={pending}>
              ⬆ Importar planilha
            </Button>
          </>
        )}
        {msg && (
          <span role="status" className="text-xs text-[var(--color-success)]">
            {msg}
          </span>
        )}
        {erro && <span className="text-xs text-[var(--color-danger)]">{erro}</span>}
      </div>
      {ignoradas.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-[var(--color-ink3)]">
          {ignoradas.map((i, k) => (
            <li key={k}>
              <span className="font-medium">{i.linha}</span>: {i.motivo}
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Pré-visualização — {projectName}</h3>
              <Badge tone="success">{novas} a inserir</Badge>
              <Badge tone="info">{atualizar} a atualizar</Badge>
              {fora > 0 && <Badge tone="danger">{fora} ignorada(s)</Badge>}
            </div>
            <p className="mb-2 text-[11.5px] text-[var(--color-ink3)]">
              Linha com Id (coluna da exportação) atualiza o ativo; sem Id, insere. Ativo vendido ou cancelado não é alterado por planilha. Célula ilegível é
              reportada, nunca gravada como zero. A versão congelada recusa a importação.
            </p>
            <div className="max-h-[360px] overflow-auto rounded-[8px] border border-[var(--color-accent2)]/12">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0 bg-[var(--color-surface2)] text-left font-[family-name:var(--font-mono)] text-[10px] uppercase text-[var(--color-ink3)]">
                  <tr>
                    <th className="px-2 py-2">Ação</th>
                    <th className="px-2 py-2">Unidade</th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Receb.</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Descrição</th>
                    <th className="px-2 py-2 text-right">Estimado</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className={`border-t border-[var(--color-accent2)]/8 ${r.acao === "ignorar" ? "bg-[var(--color-danger)]/5" : ""}`}>
                      <td className="px-2 py-1.5">
                        <Badge tone={r.acao === "inserir" ? "success" : r.acao === "atualizar" ? "info" : "danger"}>
                          {r.acao === "inserir" ? "Inserir" : r.acao === "atualizar" ? "Atualizar" : "Ignorar"}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 font-medium">{r.unitCode ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.cliente ?? "—"}</td>
                      <td className="px-2 py-1.5 font-[family-name:var(--font-mono)]">{r.dataRecebimento ? dateBR(r.dataRecebimento) : "—"}</td>
                      <td className="px-2 py-1.5">{r.tipo ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.descricao ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-[family-name:var(--font-mono)]">
                        {r.estimado == null ? "—" : Number(r.estimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-1.5">{r.status ?? "—"}</td>
                      <td className={`px-2 py-1.5 ${r.acao === "ignorar" ? "text-[var(--color-danger)]" : ""}`}>{r.motivo ?? "✓"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={confirmar} disabled={pending || validas.length === 0}>
                {pending ? "Importando…" : `Confirmar (${validas.length})`}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)} disabled={pending}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
