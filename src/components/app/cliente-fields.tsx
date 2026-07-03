import { Input, Label, Select } from "@/components/ui/input";
import type { ClienteRow } from "@/lib/queries";

type FieldType = "text" | "number" | "unit" | "textarea";
interface Field {
  name: keyof ClienteRow;
  label: string;
  type?: FieldType;
  required?: boolean;
  colSpan?: string;
}
interface Group {
  title: string;
  fields: Field[];
}

const GROUPS: Group[] = [
  {
    title: "Vínculo & contrato",
    fields: [
      { name: "unitCode", label: "Unidade comprada", type: "unit" },
      { name: "statusContrato", label: "Status do contrato" },
    ],
  },
  {
    title: "Dados cadastrais",
    fields: [
      { name: "nomeCompleto", label: "Nome completo", required: true, colSpan: "sm:col-span-2" },
      { name: "cpfCnpj", label: "CPF / CNPJ" },
      { name: "nascimento", label: "Nascimento" },
      { name: "nacionalidade", label: "Nacionalidade" },
      { name: "estadoCivil", label: "Estado civil" },
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
    fields: [
      { name: "bancoFinanc", label: "Banco financiador" },
      { name: "rendaBruta", label: "Renda bruta (R$)", type: "number" },
      { name: "rendaLiquida", label: "Renda líquida (R$)", type: "number" },
      { name: "comprometimento", label: "Comprometimento (%)" },
      { name: "possuiFgts", label: "Possui FGTS?" },
      { name: "saldoFgts", label: "Saldo FGTS (R$)", type: "number" },
      { name: "scoreCredito", label: "Score de crédito", type: "number" },
      { name: "restricoes", label: "Restrições?" },
    ],
  },
  {
    title: "Inteligência de mercado",
    fields: [
      { name: "morarOuInvestir", label: "Morar ou investir?" },
      { name: "ramoAtividade", label: "Ramo de atividade" },
      { name: "cargoFuncao", label: "Cargo / Função" },
      { name: "areaAtuacao", label: "Área de atuação" },
      { name: "empresa", label: "Empresa" },
      { name: "regimeTrabalho", label: "Regime de trabalho" },
      { name: "localTrabalho", label: "Local de trabalho" },
      { name: "tempoEmpresa", label: "Tempo de empresa (anos)" },
      { name: "possuiImovel", label: "Já possui imóvel?" },
      { name: "motivacaoCompra", label: "Motivação de compra" },
      { name: "comoConheceu", label: "Como conheceu" },
      { name: "indicadoPor", label: "Indicado por" },
      { name: "interesse", label: "Interesse (1–5)", type: "number" },
      { name: "obsEstrategicas", label: "Obs. estratégicas", type: "textarea", colSpan: "sm:col-span-4" },
    ],
  },
];

export function ClienteFields({
  cliente,
  unitCodes,
}: {
  cliente?: ClienteRow;
  unitCodes: string[];
}) {
  const val = (f: keyof ClienteRow) => {
    const v = cliente?.[f];
    return v == null ? "" : String(v);
  };
  return (
    <div className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h3 className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            {g.title}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {g.fields.map((f) => (
              <div key={f.name} className={f.colSpan}>
                <Label>{f.label}</Label>
                {f.type === "unit" ? (
                  <Select name={f.name} defaultValue={val(f.name)}>
                    <option value="">—</option>
                    {unitCodes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                ) : f.type === "textarea" ? (
                  <textarea
                    name={f.name}
                    defaultValue={val(f.name)}
                    rows={2}
                    className="w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent2)]"
                  />
                ) : (
                  <Input
                    name={f.name}
                    type={f.type === "number" ? "number" : "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    required={f.required}
                    defaultValue={val(f.name)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
