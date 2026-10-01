import { avisoDeValidade, checklistDeAdmissao, conferenciaDaFolha, TIPO_ASO_ADMISSIONAL, type DespesaDeFolhaCandidata, type FolhaParaConferir } from "@/lib/funcionario-docs-regras";
import { soDigitos } from "@/lib/funcionario-regras";
import { acumuladoPorMembro, type DiariaParaAcumular } from "@/lib/equipe-regras";

/**
 * Assistentes do módulo Pessoas (Prompt Z, seção 6; Prompt E). PURO.
 *
 * 6.3 — o que NENHUM dos dois recebe: CPF, endereço, salário, dados
 * bancários, dependentes e dados de folha. As funções abaixo RECEBEM o CPF
 * (para comparar) mas DEVOLVEM só nomes, datas, tipos e quantidades — e
 * rodam no servidor; o painel recebe o resultado. Nenhum documento anexado é
 * lido: o assistente sabe QUE TIPO existe, não o que está dentro (16a).
 *
 * 6.1 Funcionários: somente leitura. 6.2 Equipes: propõe e para.
 */

/* ───────────── 6.1 — Funcionários (somente leitura) ───────────── */

export interface FuncionarioParaAnalise {
  id: string;
  nome: string;
  /** usado só para comparar; nunca sai no resultado. */
  cpf: string | null;
  cargo: string | null;
  admissao: string | null;
  desligamento: string | null;
}
export interface DocTipoDoFuncionario {
  funcionarioId: string;
  tipo: string | null;
  validade: string | null;
}
export interface AlocacaoAtiva {
  funcionarioId: string | null;
  stakeholderId: string | null;
  projectId: string;
  projectName: string;
  funcaoId: string | null;
  nome: string;
}

export interface AnaliseDeFuncionarios {
  cadastroIncompleto: { id: string; nome: string; faltam: string[] }[];
  desligadosAlocados: { id: string; nome: string; desligamento: string; obras: string[] }[];
  cpfDuplicado: { nomes: string[]; origens: string[] }[];
  admissaoFaltando: { id: string; nome: string; faltam: string[]; faltaAso: boolean }[];
  documentosVencendo: { id: string; nome: string; tipo: string; validade: string; estado: "vencendo" | "vencido"; dias: number }[];
  folha: { folhaSemDespesa: string[]; despesaSemFolha: { numDoc: string | null; competencia: string | null; valor: number }[]; folhaSemDocumento: string[] };
}

export function analisarFuncionarios(p: {
  funcionarios: readonly FuncionarioParaAnalise[];
  fornecedoresPF: readonly { nome: string; cpf: string | null }[];
  docs: readonly DocTipoDoFuncionario[];
  alocacoes: readonly AlocacaoAtiva[];
  folhas: readonly FolhaParaConferir[];
  despesas: readonly DespesaDeFolhaCandidata[];
  hojeISO: string;
}): AnaliseDeFuncionarios {
  const ativos = p.funcionarios.filter((f) => !f.desligamento);
  // CPF duplicado — comparação no servidor; só nomes saem
  const porCpf = new Map<string, { nome: string; origem: string }[]>();
  for (const f of p.funcionarios) {
    const d = soDigitos(f.cpf);
    if (d) porCpf.set(d, [...(porCpf.get(d) ?? []), { nome: f.nome, origem: "funcionário" }]);
  }
  for (const s of p.fornecedoresPF) {
    const d = soDigitos(s.cpf);
    if (d && porCpf.has(d)) porCpf.set(d, [...(porCpf.get(d) ?? []), { nome: s.nome, origem: "fornecedor" }]);
  }
  const cpfDuplicado = [...porCpf.values()].filter((xs) => xs.length > 1).map((xs) => ({ nomes: xs.map((x) => x.nome), origens: [...new Set(xs.map((x) => x.origem))] }));
  const docsPor = new Map<string, DocTipoDoFuncionario[]>();
  for (const d of p.docs) docsPor.set(d.funcionarioId, [...(docsPor.get(d.funcionarioId) ?? []), d]);
  const documentosVencendo: AnaliseDeFuncionarios["documentosVencendo"] = [];
  for (const f of ativos) {
    // só a ÚLTIMA versão de cada tipo conta para validade
    const ultimas = new Map<string, DocTipoDoFuncionario>();
    for (const d of docsPor.get(f.id) ?? []) if (d.tipo && d.validade) ultimas.set(d.tipo, d);
    for (const d of ultimas.values()) {
      const v = avisoDeValidade(d.validade, p.hojeISO);
      if (v && v.estado !== "ok") documentosVencendo.push({ id: f.id, nome: f.nome, tipo: d.tipo!, validade: d.validade!, estado: v.estado, dias: v.dias });
    }
  }
  return {
    cadastroIncompleto: ativos
      .map((f) => ({ id: f.id, nome: f.nome, faltam: [!f.cpf && "CPF", !f.cargo && "cargo", !f.admissao && "data de admissão"].filter((x): x is string => !!x) }))
      .filter((x) => x.faltam.length > 0),
    desligadosAlocados: p.funcionarios
      .filter((f) => !!f.desligamento)
      .map((f) => ({ id: f.id, nome: f.nome, desligamento: f.desligamento!, obras: [...new Set(p.alocacoes.filter((a) => a.funcionarioId === f.id).map((a) => a.projectName))] }))
      .filter((x) => x.obras.length > 0),
    cpfDuplicado,
    admissaoFaltando: ativos
      .map((f) => {
        const c = checklistDeAdmissao((docsPor.get(f.id) ?? []).map((d) => d.tipo ?? ""));
        return { id: f.id, nome: f.nome, faltam: c.faltantes, faltaAso: c.faltaAso };
      })
      .filter((x) => x.faltam.length > 0)
      .sort((a, b) => Number(b.faltaAso) - Number(a.faltaAso)),
    documentosVencendo: documentosVencendo.sort((a, b) => a.dias - b.dias),
    folha: (() => {
      const c = conferenciaDaFolha(p.folhas, p.despesas);
      return { folhaSemDespesa: c.folhaSemDespesa, despesaSemFolha: c.despesaSemFolha.map((d) => ({ numDoc: d.numDoc, competencia: d.competencia, valor: d.valor })), folhaSemDocumento: c.folhaSemDocumento };
    })(),
  };
}
export { TIPO_ASO_ADMISSIONAL };

/* ───────────── 6.2 — Equipes (propõe e para) ───────────── */

export interface MembroParaAnalise {
  id: string;
  nome: string;
  origem: "autonomo" | "clt" | "socio";
  stakeholderId: string | null;
  funcionarioId: string | null;
  funcaoId: string | null;
  valorDiaria: number | null;
  situacao: string;
}
export interface PropostaDeDiaria {
  equipeProjetoId: string;
  nome: string;
  quantidade: number;
  /** autônomo sem valor vigente: proposta sai marcada, a gravação vai recusar até definir. */
  semValor: boolean;
}
export interface AnaliseDeEquipes {
  /** 6.2 — a lista de quem trabalhou hoje, a partir da equipe ativa (a pessoa confirma ou ajusta). */
  propostaDoDia: PropostaDeDiaria[];
  diariasSemLancamento: { equipeProjetoId: string; nome: string; quantidade: number; valor: number }[];
  obrasSemEquipe: { projectId: string; projectName: string }[];
  alocacaoSemFuncao: { equipeProjetoId: string; nome: string }[];
  sobreposicoes: { nome: string; obras: string[] }[];
}

export function analisarEquipes(p: {
  equipe: readonly MembroParaAnalise[];
  diarias: readonly DiariaParaAcumular[];
  alocacoesAtivas: readonly AlocacaoAtiva[];
  projetos: readonly { id: string; name: string }[];
  diaJaRegistrado: boolean;
}): AnaliseDeEquipes {
  const ativos = p.equipe.filter((m) => m.situacao === "ativa");
  const acumulado = acumuladoPorMembro(p.diarias);
  const porPessoa = new Map<string, { nome: string; obras: Set<string> }>();
  for (const a of p.alocacoesAtivas) {
    const chave = a.funcionarioId ? `f:${a.funcionarioId}` : `s:${a.stakeholderId}`;
    const x = porPessoa.get(chave) ?? { nome: a.nome, obras: new Set<string>() };
    x.obras.add(a.projectName);
    porPessoa.set(chave, x);
  }
  const comEquipe = new Set(p.alocacoesAtivas.map((a) => a.projectId));
  return {
    propostaDoDia: p.diaJaRegistrado ? [] : ativos.map((m) => ({ equipeProjetoId: m.id, nome: m.nome, quantidade: 1, semValor: m.origem === "autonomo" && !(m.valorDiaria && m.valorDiaria > 0) })),
    diariasSemLancamento: acumulado.membros
      .filter((a) => a.semDespesa.valor > 0)
      .map((a) => ({ equipeProjetoId: a.equipeProjetoId, nome: p.equipe.find((m) => m.id === a.equipeProjetoId)?.nome ?? "?", quantidade: a.semDespesa.quantidade, valor: a.semDespesa.valor })),
    obrasSemEquipe: p.projetos.filter((pr) => !comEquipe.has(pr.id)).map((pr) => ({ projectId: pr.id, projectName: pr.name })),
    alocacaoSemFuncao: ativos.filter((m) => !m.funcaoId).map((m) => ({ equipeProjetoId: m.id, nome: m.nome })),
    sobreposicoes: [...porPessoa.values()].filter((x) => x.obras.size > 1).map((x) => ({ nome: x.nome, obras: [...x.obras].sort() })),
  };
}

/** 6.2 — nomes lidos da folha de ponto casados com a equipe (por nome normalizado ou sobreposição de palavras). */
export function casarNomesComEquipe(lidos: readonly { nome: string; quantidade: number }[], equipe: readonly MembroParaAnalise[]): { casados: PropostaDeDiaria[]; semPar: string[] } {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  const ativos = equipe.filter((m) => m.situacao === "ativa");
  const casados: PropostaDeDiaria[] = [];
  const semPar: string[] = [];
  for (const l of lidos) {
    const n = norm(l.nome);
    const tk = new Set(n.split(" ").filter((t) => t.length >= 3));
    let melhor: { m: MembroParaAnalise; score: number } | null = null;
    for (const m of ativos) {
      const mn = norm(m.nome);
      if (mn === n) {
        melhor = { m, score: 2 };
        break;
      }
      const mt = mn.split(" ").filter((t) => t.length >= 3);
      const comum = mt.filter((t) => tk.has(t)).length;
      const score = mt.length ? comum / mt.length : 0;
      if (comum >= 1 && score >= 0.5 && (!melhor || score > melhor.score)) melhor = { m, score };
    }
    if (melhor) casados.push({ equipeProjetoId: melhor.m.id, nome: melhor.m.nome, quantidade: [0.5, 1, 1.5, 2].includes(l.quantidade) ? l.quantidade : 1, semValor: melhor.m.origem === "autonomo" && !(melhor.m.valorDiaria && melhor.m.valorDiaria > 0) });
    else semPar.push(l.nome);
  }
  return { casados, semPar };
}
