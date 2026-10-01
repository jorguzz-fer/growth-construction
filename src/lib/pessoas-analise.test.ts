import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analisarEquipes, analisarFuncionarios, casarNomesComEquipe, type MembroParaAnalise } from "./pessoas-analise";

describe("assistentes do módulo Pessoas (Prompt Z, seção 6)", () => {
  it("6.1 — cadastro incompleto, desligados alocados, CPF duplicado entre funcionário e fornecedor (só nomes saem), admissão faltando com ASO, vencimentos, folha", () => {
    const a = analisarFuncionarios({
      funcionarios: [
        { id: "a", nome: "Ana", cpf: "52998224725", cargo: null, admissao: "2026-09-01", desligamento: null },
        { id: "b", nome: "Bruno", cpf: null, cargo: "Servente", admissao: null, desligamento: null },
        { id: "d", nome: "Dora", cpf: "11144477735", cargo: "Pedreira", admissao: "2026-01-01", desligamento: "2026-08-31" },
      ],
      fornecedoresPF: [{ nome: "Ana Autônoma", cpf: "529.982.247-25" }],
      docs: [{ funcionarioId: "a", tipo: "CPF", validade: null }, { funcionarioId: "a", tipo: "CNH", validade: "2026-10-10" }, { funcionarioId: "a", tipo: "CNH", validade: "2028-10-10" }, { funcionarioId: "b", tipo: "ASO — exame admissional", validade: "2026-09-15" }],
      alocacoes: [{ funcionarioId: "d", stakeholderId: null, projectId: "p1", projectName: "OBRA 28", funcaoId: null, nome: "Dora" }],
      folhas: [{ competencia: "09/2026", despesaId: null, documentos: 0 }],
      despesas: [{ id: "x", numDoc: "PED-9", competencia: "08/2026", valor: 10000, texto: "Folha agosto" }],
      hojeISO: "2026-10-01",
    });
    expect(a.cadastroIncompleto).toEqual([{ id: "a", nome: "Ana", faltam: ["cargo"] }, { id: "b", nome: "Bruno", faltam: ["CPF", "data de admissão"] }]);
    expect(a.desligadosAlocados).toEqual([{ id: "d", nome: "Dora", desligamento: "2026-08-31", obras: ["OBRA 28"] }]);
    expect(a.cpfDuplicado).toEqual([{ nomes: ["Ana", "Ana Autônoma"], origens: ["funcionário", "fornecedor"] }]);
    expect(JSON.stringify(a)).not.toMatch(/52998224725|11144477735/); // 16 — nenhum CPF sai
    expect(a.admissaoFaltando.find((x) => x.id === "a")?.faltaAso).toBe(true);
    expect(a.admissaoFaltando.find((x) => x.id === "b")?.faltaAso).toBe(false);
    expect(a.admissaoFaltando[0].faltaAso).toBe(true); // ASO primeiro
    expect(a.documentosVencendo).toEqual([{ id: "b", nome: "Bruno", tipo: "ASO — exame admissional", validade: "2026-09-15", estado: "vencido", dias: -16 }]); // a CNH v2 de 2028 substitui a v1
    expect(a.folha).toEqual({ folhaSemDespesa: ["09/2026"], despesaSemFolha: [{ numDoc: "PED-9", competencia: "08/2026", valor: 10000 }], folhaSemDocumento: ["09/2026"] });
  });

  it("6.2 — proposta do dia a partir da equipe ativa; diárias sem lançamento; obra sem equipe; alocação sem função; sobreposição", () => {
    const equipe: MembroParaAnalise[] = [
      { id: "m1", nome: "João Pedreiro", origem: "autonomo", stakeholderId: "s1", funcionarioId: null, funcaoId: "f", valorDiaria: 250, situacao: "ativa" },
      { id: "m2", nome: "Carlos CLT", origem: "clt", stakeholderId: null, funcionarioId: "c1", funcaoId: null, valorDiaria: null, situacao: "ativa" },
      { id: "m3", nome: "Antigo", origem: "autonomo", stakeholderId: "s3", funcionarioId: null, funcaoId: "f", valorDiaria: null, situacao: "encerrada" },
    ];
    const a = analisarEquipes({
      equipe,
      diarias: [{ id: "d1", equipeProjetoId: "m1", quantidade: 2, valor: 250, despesaId: null }, { id: "d2", equipeProjetoId: "m1", quantidade: 1, valor: 250, despesaId: "x" }],
      alocacoesAtivas: [{ funcionarioId: null, stakeholderId: "s1", projectId: "p1", projectName: "OBRA 28", funcaoId: "f", nome: "João Pedreiro" }, { funcionarioId: null, stakeholderId: "s1", projectId: "p2", projectName: "OBRA 31", funcaoId: "f", nome: "João Pedreiro" }, { funcionarioId: "c1", stakeholderId: null, projectId: "p1", projectName: "OBRA 28", funcaoId: null, nome: "Carlos CLT" }],
      projetos: [{ id: "p1", name: "OBRA 28" }, { id: "p2", name: "OBRA 31" }, { id: "p3", name: "OBRA 40" }],
      diaJaRegistrado: false,
    });
    expect(a.propostaDoDia).toEqual([{ equipeProjetoId: "m1", nome: "João Pedreiro", quantidade: 1, semValor: false }, { equipeProjetoId: "m2", nome: "Carlos CLT", quantidade: 1, semValor: false }]);
    expect(a.diariasSemLancamento).toEqual([{ equipeProjetoId: "m1", nome: "João Pedreiro", quantidade: 2, valor: 500 }]);
    expect(a.obrasSemEquipe).toEqual([{ projectId: "p3", projectName: "OBRA 40" }]);
    expect(a.alocacaoSemFuncao).toEqual([{ equipeProjetoId: "m2", nome: "Carlos CLT" }]);
    expect(a.sobreposicoes).toEqual([{ nome: "João Pedreiro", obras: ["OBRA 28", "OBRA 31"] }]);
    expect(analisarEquipes({ equipe, diarias: [], alocacoesAtivas: [], projetos: [], diaJaRegistrado: true }).propostaDoDia).toEqual([]);
    const c = casarNomesComEquipe([{ nome: "JOAO PEDREIRO", quantidade: 1 }, { nome: "Carlos", quantidade: 0.5 }, { nome: "Zé", quantidade: 1 }], equipe);
    expect(c.casados.map((x) => [x.equipeProjetoId, x.quantidade])).toEqual([["m1", 1], ["m2", 0.5]]);
    expect(c.semPar).toEqual(["Zé"]);
  });

  it("17 / 6.1 nunca / 6.3 — o módulo não importa ação nem banco; os painéis não cadastram, editam, desligam, excluem, alocam nem lançam despesa", () => {
    expect(readFileSync("src/lib/pessoas-analise.ts", "utf8")).not.toMatch(/@\/lib\/actions|@\/lib\/db|"use server"/);
    const f = readFileSync("src/components/app/assistente-funcionarios.tsx", "utf8");
    expect(f).not.toMatch(/@\/lib\/actions/); // somente leitura: nenhuma action
    const e = readFileSync("src/components/app/assistente-equipes.tsx", "utf8");
    expect(e).not.toMatch(/alocarMembro|encerrarAlocacao|deleteFuncionario|lancarDespesa|addDespesa|desligarFuncionario/);
    expect(e).toMatch(/registrarDiariasDoDia/); // a única gravação, por clique
    expect(e).toMatch(/lerFolhaDePonto/);
  });
});
