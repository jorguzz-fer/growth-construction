/**
 * Descrição em texto → formulário do ativo de permuta (Prompt P, 7.1/7.3).
 *
 * Contrato do que a IA devolve e a regra que transforma isso numa PROPOSTA de
 * preenchimento: valores para o formulário + alerta por campo. Nada aqui
 * grava — quem grava é o usuário, pelo botão do formulário, pela mesma
 * `addPermuta` com a mesma validação e permissão. Módulo PURO.
 *
 * Linguagem (7.7): o bem é ATIVO; a venda posterior é caixa e ganho — nunca
 * "receita".
 */
import { isoParaDataInterna, type Alerta } from "@/lib/ai/campos";
import { brl } from "@/lib/utils";

export interface DadosAtivoLidos {
  /** Código/identificação da unidade de origem ("12", "Apto 101"). "" se não dito. */
  unitCode: string;
  /** Nome do cliente que entregou o bem. "" se não dito. */
  cliente: string;
  /** ISO YYYY-MM-DD ou "". */
  dataRecebimento: string;
  /** Tipo do bem (Imóvel, Veículo, Materiais, Serviços…). "" se não dito. */
  tipo: string;
  descricao: string;
  /** Valor estimado em reais; null se não dito. */
  estimado: number | null;
  baixaConfianca: string[];
  observacoes: string[];
}

export type CampoAtivo = "unitCode" | "cliente" | "dataRecebimento" | "tipo" | "descricao" | "estimado";

/** Onde o painel deixa a proposta para o formulário ler (sessionStorage; nunca passa pelo servidor até "Salvar"). */
export const CHAVE_PROPOSTA_PERMUTA = "gt:proposta-permuta";

export interface PropostaGuardadaPermuta {
  projectId: string;
  proposta: PropostaDeAtivo;
}

export const ROTULO_CAMPO_ATIVO: Record<CampoAtivo, string> = {
  unitCode: "Unidade de origem",
  cliente: "Cliente",
  dataRecebimento: "Data de recebimento",
  tipo: "Tipo do bem",
  descricao: "Descrição",
  estimado: "Valor estimado",
};

export interface ValoresDoAtivoPropostos {
  unitCode: string;
  /** Id do cliente do cadastro quando o nome casou; senão "". */
  clienteId: string;
  clienteNome: string;
  /** Interno MM/DD/YYYY ou "". */
  dataRecebimento: string;
  tipo: string;
  descricao: string;
  /** Texto para o MoneyInput ("80000") ou "". */
  estimado: string;
}

export interface PropostaDeAtivo {
  valores: ValoresDoAtivoPropostos;
  alertas: Partial<Record<CampoAtivo, Alerta>>;
  preenchidos: string[];
  observacoes: string[];
  resumo: string;
}

export interface OpcoesDaTela {
  /** Códigos das unidades da versão de trabalho da obra. */
  unidades: readonly string[];
  /** Clientes da empresa. */
  clientes: readonly { id: string; nome: string }[];
  /** Tipos de bem aceitos pelo formulário. */
  tipos: readonly string[];
}

const normaliza = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Código lido → código cadastrado: igual sem caixa/acento, ou o número dentro do texto ("casa 12" → "12"). */
export function casarUnidade(lido: string, unidades: readonly string[]): string | null {
  const l = normaliza(lido);
  if (!l) return null;
  const exato = unidades.find((u) => normaliza(u) === l);
  if (exato) return exato;
  const digitos = l.replace(/\D+/g, "");
  if (digitos) {
    const porNumero = unidades.filter((u) => normaliza(u).replace(/\D+/g, "") === digitos);
    if (porNumero.length === 1) return porNumero[0];
  }
  const contem = unidades.filter((u) => normaliza(u).includes(l) || l.includes(normaliza(u)));
  return contem.length === 1 ? contem[0] : null;
}

/** Nome lido → cliente do cadastro: igual, ou todas as palavras (≥ 3 letras) do lido dentro do nome, com um único candidato. */
export function casarCliente(lido: string, clientes: readonly { id: string; nome: string }[]): { id: string; nome: string } | null {
  const l = normaliza(lido);
  if (!l) return null;
  const exato = clientes.find((c) => normaliza(c.nome) === l);
  if (exato) return exato;
  const palavras = l.split(/\s+/).filter((p) => p.length >= 3);
  if (palavras.length === 0) return null;
  const cand = clientes.filter((c) => {
    const n = normaliza(c.nome);
    return palavras.every((p) => n.includes(p));
  });
  return cand.length === 1 ? cand[0] : null;
}

/** Tipo lido → tipo do formulário (sem caixa/acento; "carro" vira Veículo, "apartamento" vira Imóvel). */
export function casarTipo(lido: string, tipos: readonly string[]): string | null {
  const l = normaliza(lido);
  if (!l) return null;
  const exato = tipos.find((t) => normaliza(t) === l);
  if (exato) return exato;
  const sinonimos: Record<string, string[]> = {
    imovel: ["apartamento", "apto", "casa", "terreno", "lote", "sala", "loja", "imovel"],
    veiculo: ["carro", "caminhao", "caminhonete", "moto", "veiculo", "automovel", "utilitario"],
    materiais: ["material", "materiais", "tijolo", "cimento", "aco", "piso"],
    servicos: ["servico", "servicos", "mao de obra", "empreitada"],
    equipamentos: ["equipamento", "equipamentos", "betoneira", "andaime"],
    maquinas: ["maquina", "maquinas", "retroescavadeira", "escavadeira", "trator"],
  };
  // Palavra inteira: "aço" não pode casar dentro de "ações".
  const temPalavra = (frase: string, palavra: string) => new RegExp(`(^|[^a-z0-9])${palavra}([^a-z0-9]|$)`).test(frase);
  for (const [chave, lista] of Object.entries(sinonimos)) {
    if (lista.some((p) => temPalavra(l, p))) {
      const t = tipos.find((x) => normaliza(x) === chave);
      if (t) return t;
    }
  }
  return null;
}

export function montarPropostaDeAtivo(x: DadosAtivoLidos, opcoes: OpcoesDaTela): PropostaDeAtivo {
  const alertas: Partial<Record<CampoAtivo, Alerta>> = {};
  const preenchidos: string[] = [];
  const baixa = new Set((x.baixaConfianca ?? []).map((s) => s.trim()));
  const faltando = (campo: CampoAtivo, motivo: string) => void (alertas[campo] = { nivel: "faltando", motivo });
  const conferir = (campo: CampoAtivo, motivo: string) => void (alertas[campo] = { nivel: "conferir", motivo });
  const ok = (campo: CampoAtivo) => {
    preenchidos.push(ROTULO_CAMPO_ATIVO[campo]);
    if (baixa.has(campo)) conferir(campo, "Entendido com pouca certeza — confira.");
  };

  // Unidade de origem
  const unidade = x.unitCode ? casarUnidade(x.unitCode, opcoes.unidades) : null;
  if (unidade) ok("unitCode");
  else if (x.unitCode) conferir("unitCode", `A descrição fala em "${x.unitCode}", que não é uma unidade desta obra — escolha na lista.`);
  else faltando("unitCode", "A descrição não diz de qual unidade (venda) veio o bem.");

  // Cliente
  const cliente = x.cliente ? casarCliente(x.cliente, opcoes.clientes) : null;
  if (cliente) ok("cliente");
  else if (x.cliente) conferir("cliente", `"${x.cliente}" não está no cadastro de clientes — escolha na lista ou cadastre antes.`);
  else faltando("cliente", "A descrição não diz quem entregou o bem.");

  // Data de recebimento
  const data = x.dataRecebimento ? isoParaDataInterna(x.dataRecebimento) : "";
  if (data) ok("dataRecebimento");
  else if (x.dataRecebimento) conferir("dataRecebimento", `Data não reconhecida ("${x.dataRecebimento}") — informe.`);
  else faltando("dataRecebimento", "A descrição não diz quando o bem foi recebido.");

  // Tipo
  const tipo = x.tipo ? casarTipo(x.tipo, opcoes.tipos) : null;
  if (tipo) ok("tipo");
  else if (x.tipo) conferir("tipo", `"${x.tipo}" não é um tipo da lista — escolha o mais próximo.`);
  else faltando("tipo", "A descrição não diz o tipo do bem.");

  // Descrição (opcional)
  const descricao = (x.descricao ?? "").trim();
  if (descricao) ok("descricao");

  // Estimado
  const estimado = typeof x.estimado === "number" && Number.isFinite(x.estimado) && x.estimado > 0 ? Math.round(x.estimado * 100) / 100 : 0;
  if (estimado > 0) ok("estimado");
  else faltando("estimado", "A descrição não diz o valor pelo qual o bem entra no inventário.");

  const partes = [tipo ?? x.tipo ?? "bem", descricao ? `"${descricao}"` : null, estimado > 0 ? `avaliado em ${brl(estimado)}` : null, unidade ? `da unidade ${unidade}` : null, cliente ? `entregue por ${cliente.nome}` : null].filter(Boolean);
  return {
    valores: {
      unitCode: unidade ?? "",
      clienteId: cliente?.id ?? "",
      clienteNome: cliente?.nome ?? x.cliente ?? "",
      dataRecebimento: data,
      tipo: tipo ?? "",
      descricao,
      estimado: estimado > 0 ? String(estimado) : "",
    },
    alertas,
    preenchidos,
    observacoes: x.observacoes ?? [],
    resumo: `Ativo recebido em permuta: ${partes.join(", ")}. Entra no inventário pelo valor estimado; não é receita.`,
  };
}
