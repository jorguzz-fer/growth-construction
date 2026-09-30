import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import type { ClienteRow } from "@/lib/queries";
import { campoSensivelCliente } from "@/lib/clientes-sensivel";
import {
  INTERESSE_MAX,
  INTERESSE_MIN,
  interesseNaFaixa,
  type OpcoesDeUnidade,
} from "@/lib/clientes-regras";
import { UnidadePorObra } from "@/components/app/unidade-por-obra";

type FieldType = "text" | "number" | "unit" | "textarea" | "date" | "select" | "interesse";
interface Field {
  name: keyof ClienteRow;
  label: string;
  type?: FieldType;
  required?: boolean;
  colSpan?: string;
  options?: string[];
  /** Linha de ajuda sob o campo. */
  ajuda?: string;
}

const SIM_NAO = ["Sim", "Não"];
const ESTADO_CIVIL = [
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "União estável",
];
interface Group {
  title: string;
  fields: Field[];
  /** Bloco inteiro exige a permissão de dados do cliente (Prompt M, 5.4.1). */
  sensivel?: boolean;
}

const GROUPS: Group[] = [
  {
    title: "Vínculo & contrato",
    fields: [
      { name: "unitCode", label: "Unidade comprada", type: "unit" },
      {
        name: "statusContrato",
        label: "Status do contrato",
        // Prompt M, 6.2.1 — o efeito aparece antes de o usuário tropeçar nele.
        ajuda:
          "Em branco, a unidade continua reservada a este cliente. Só Distratado ou Cancelado a liberam para outro comprador.",
      },
    ],
  },
  {
    title: "Dados cadastrais",
    fields: [
      { name: "nomeCompleto", label: "Nome completo", required: true, colSpan: "sm:col-span-2" },
      { name: "cpfCnpj", label: "CPF / CNPJ" },
      { name: "nascimento", label: "Nascimento", type: "date" },
      { name: "nacionalidade", label: "Nacionalidade" },
      { name: "estadoCivil", label: "Estado civil", type: "select", options: ESTADO_CIVIL },
      { name: "endereco", label: "Endereço", colSpan: "sm:col-span-2" },
      { name: "cidadeEstado", label: "Cidade / Estado" },
      { name: "cep", label: "CEP" },
      { name: "emailPrincipal", label: "E-mail principal" },
      { name: "emailSecundario", label: "E-mail secundário" },
      { name: "celular", label: "Celular / WhatsApp" },
      { name: "telefone", label: "Telefone" },
    ],
  },
  {
    title: "Dados financeiros",
    sensivel: true,
    fields: [
      { name: "bancoFinanc", label: "Banco financiador" },
      { name: "rendaBruta", label: "Renda bruta (R$)", type: "number" },
      { name: "rendaLiquida", label: "Renda líquida (R$)", type: "number" },
      { name: "comprometimento", label: "Comprometimento (%)" },
      { name: "possuiFgts", label: "Possui FGTS?", type: "select", options: SIM_NAO },
      { name: "saldoFgts", label: "Saldo FGTS (R$)", type: "number" },
      { name: "scoreCredito", label: "Score de crédito", type: "number" },
      { name: "restricoes", label: "Restrições?", type: "select", options: SIM_NAO },
    ],
  },
  {
    title: "Inteligência de mercado",
    sensivel: true,
    fields: [
      { name: "morarOuInvestir", label: "Morar ou investir?", type: "select", options: ["Morar", "Investir"] },
      { name: "ramoAtividade", label: "Ramo de atividade" },
      { name: "cargoFuncao", label: "Cargo / Função" },
      { name: "areaAtuacao", label: "Área de atuação" },
      { name: "empresa", label: "Empresa" },
      { name: "regimeTrabalho", label: "Regime de trabalho", type: "select", options: ["CLT", "PJ", "Autônomo", "Servidor público", "Empresário", "Aposentado", "Outro"] },
      { name: "localTrabalho", label: "Local de trabalho" },
      { name: "tempoEmpresa", label: "Tempo de empresa (anos)" },
      { name: "possuiImovel", label: "Já possui imóvel?", type: "select", options: SIM_NAO },
      { name: "motivacaoCompra", label: "Motivação de compra" },
      { name: "comoConheceu", label: "Como conheceu" },
      { name: "indicadoPor", label: "Indicado por" },
      { name: "interesse", label: "Interesse (1–5)", type: "interesse" },
      { name: "obsEstrategicas", label: "Obs. estratégicas", type: "textarea", colSpan: "sm:col-span-4" },
    ],
  },
];

/**
 * Campos do comprador. Quem não tem `clientesdados:ver` não vê os blocos
 * sensíveis nem o estado civil — eles não existem na tela (nem vazios), e o
 * servidor nem os seleciona. Com `ver` sem `editar`, aparecem desabilitados
 * (campo desabilitado não é enviado, e a action também os ignora).
 */
export function ClienteFields({
  cliente,
  unidades,
  veDados = false,
  editaDados = false,
  cpfMascarado = null,
}: {
  cliente?: Partial<ClienteRow>;
  unidades: OpcoesDeUnidade;
  veDados?: boolean;
  editaDados?: boolean;
  /** CPF já cadastrado, mascarado, para quem não vê o documento completo. */
  cpfMascarado?: string | null;
}) {
  const val = (f: keyof ClienteRow) => {
    const v = cliente?.[f];
    return v == null ? "" : String(v);
  };
  const grupos = GROUPS.filter((g) => !g.sensivel || veDados).map((g) => ({
    ...g,
    fields: g.fields.filter((f) => veDados || !campoSensivelCliente(f.name)),
  }));
  return (
    <div className="space-y-6">
      {grupos.map((g) => (
        <div key={g.title}>
          <h3 className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            {g.title}
            {g.sensivel && (
              <span className="ml-2 normal-case tracking-normal text-[var(--color-ink4)]">
                · exige permissão de dados do cliente
              </span>
            )}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {g.fields.map((f) => {
              const bloqueado = campoSensivelCliente(f.name) && !editaDados;
              if (f.type === "unit") {
                // Duas células da grade: a obra (filtro) e a unidade (6.6).
                return (
                  <UnidadePorObra
                    key={f.name}
                    label={f.label}
                    obras={unidades.obras}
                    unidades={unidades.unidades}
                    obraInicial={unidades.obraInicial}
                    vinculada={cliente?.unitCode ?? null}
                  />
                );
              }
              return (
              <div key={f.name} className={f.colSpan}>
                <Label>{f.label}</Label>
                {f.name === "cpfCnpj" && !veDados ? (
                  // Sem a permissão, o CPF não vem do servidor. Vazio = mantém o
                  // cadastrado; digitar substitui.
                  <Input
                    name="cpfCnpj"
                    defaultValue=""
                    placeholder={cpfMascarado ? `${cpfMascarado} — digite para substituir` : ""}
                  />
                ) : f.type === "interesse" ? (
                  // Seleção de 1 a 5 (6.7). Valor fora da faixa já gravado
                  // continua como opção, sinalizado, até alguém corrigir.
                  <>
                    <Select name={f.name} defaultValue={val(f.name)} disabled={bloqueado}>
                      <option value="">—</option>
                      {cliente?.interesse != null && !interesseNaFaixa(cliente.interesse) && (
                        <option value={String(cliente.interesse)}>
                          {cliente.interesse} · fora da faixa
                        </option>
                      )}
                      {Array.from({ length: INTERESSE_MAX - INTERESSE_MIN + 1 }, (_, i) => INTERESSE_MIN + i).map(
                        (n) => (
                          <option key={n} value={String(n)}>
                            {n}
                          </option>
                        ),
                      )}
                    </Select>
                    {cliente?.interesse != null && !interesseNaFaixa(cliente.interesse) && (
                      <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-warning)]">
                        Gravado como {cliente.interesse}, fora da faixa de {INTERESSE_MIN} a {INTERESSE_MAX}.
                      </p>
                    )}
                  </>
                ) : f.type === "select" ? (
                  <Select name={f.name} defaultValue={val(f.name)} disabled={bloqueado}>
                    <option value="">—</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : f.type === "date" ? (
                  <DateField name={f.name} defaultValue={val(f.name)} />
                ) : f.type === "textarea" ? (
                  <textarea
                    name={f.name}
                    defaultValue={val(f.name)}
                    rows={2}
                    disabled={bloqueado}
                    className="w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent2)]"
                  />
                ) : (
                  <Input
                    name={f.name}
                    type={f.type === "number" ? "number" : "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    required={f.required}
                    defaultValue={val(f.name)}
                    disabled={bloqueado}
                  />
                )}
                {f.ajuda && (
                  <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ink3)]">{f.ajuda}</p>
                )}
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
