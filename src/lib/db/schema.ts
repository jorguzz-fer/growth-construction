import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  bigint,
  pgEnum,
  uuid,
  numeric,
  boolean,
  jsonb,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { PaymentPlan } from "@/lib/calc/types";

/*
 * Schema da Fase 0 — Scaffold.
 *
 * Contém apenas as tabelas necessárias para Auth.js (NextAuth v5) com adapter
 * Drizzle, mais o esqueleto de multi-tenancy (tenants + memberships) para
 * ancorar o RBAC. O modelo de domínio completo (projetos, versões, unidades,
 * plano de pagamento, despesas, fornecedores, contas) entra na Fase 1.
 * Ver docs/SPEC.md §3 e docs/STACK.md §7.
 */

/** Papéis de acesso do tenant (ver docs/STACK.md §2 - Autenticação). */
export const roleEnum = pgEnum("role", [
  "owner",
  "admin",
  "membro",
  "contador", // somente leitura (acesso contabilidade)
  "engenheiro", // acesso apenas ao Lançamento de Medição
]);

// ───────────────────────────── Auth.js ──────────────────────────────

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  /** hash da senha (login por credenciais; scrypt). */
  passwordHash: text("password_hash"),
  /** segredo TOTP (base32) para MFA. */
  mfaSecret: text("mfa_secret"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ────────────────────────── Multi-tenancy ───────────────────────────

/** Empresa cliente (incorporadora). Ver docs/SPEC.md §1. */
export const tenants = pgTable("tenant", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** chave do logo no storage R2. */
  logoKey: text("logo_key"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Vínculo usuário ⇄ tenant com papel (RBAC). */
export const memberships = pgTable(
  "membership",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("membro"),
    /**
     * Permissões granulares (override do perfil/role): matriz tela → ações
     * {ver,criar,editar,excluir}. Null = usa os defaults do role.
     * Ver src/lib/permissions.ts.
     */
    permissions: jsonb("permissions").$type<
      Record<string, { ver: boolean; criar: boolean; editar: boolean; excluir: boolean }>
    >(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (m) => [primaryKey({ columns: [m.userId, m.tenantId] })],
);

// ─────────────────────────── Enums de domínio ───────────────────────────

/** Empreendimento (proj) ou escritório/filial (office). Ver docs/SPEC.md §3. */
export const projectKindEnum = pgEnum("project_kind", ["proj", "office"]);
export const projectStatusEnum = pgEnum("project_status", [
  "Em andamento",
  "Planejamento",
]);

/** Tipo de versão/cenário. Ver docs/SPEC.md §4. */
export const versionKindEnum = pgEnum("version_kind", [
  "budget",
  "forecast",
  "atual",
  "custom",
]);

export const unitStatusEnum = pgEnum("unit_status", [
  "Disponivel",
  "Reservado",
  "Vendido",
  "Permutado",
]);

/** Tipo do item comercializável: unidade individual ou condomínio inteiro. */
export const unitItemTypeEnum = pgEnum("unit_item_type", ["unidade", "condominio"]);

export const stakeholderTypeEnum = pgEnum("stakeholder_type", ["PJ", "PF"]);

export const bankAccountTypeEnum = pgEnum("bank_account_type", [
  "Imobiliária",
  "Construtora",
]);

/** Origem do subitem do plano de contas. Ver docs/SPEC.md §8.3. */
export const accountKindEnum = pgEnum("account_kind", ["cef", "complementar"]);

/** As 7 categorias da DRE. Ver docs/SPEC.md §8.3. */
export const dreCategoryEnum = pgEnum("dre_category", [
  "Receita",
  "Custo Variável",
  "Custo Fixo",
  "Despesa Variável",
  "Despesa Fixa",
  "Retiradas",
  "Investimento",
  "Empréstimos",
  "Despesas Financeiras",
]);

// ──────────────────────── Projetos & versões ────────────────────────

/** Empreendimento ou escritório do tenant. */
export const projects = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: projectKindEnum("kind").notNull().default("proj"),
  status: projectStatusEnum("status").notNull().default("Planejamento"),
  /** Duração planejada do empreendimento, em meses. */
  durationMonths: integer("duration_months"),
  /** Datas de início e fim da obra ("MM/DD/YYYY", como no restante do app). */
  startDate: text("start_date"),
  endDate: text("end_date"),
  /**
   * Cliente da obra (lista fechada). NULL = empreendimento próprio da
   * construtora/incorporadora (tenant), que comercializará as unidades.
   */
  clienteId: uuid("cliente_id").references((): AnyPgColumn => clientes.id, {
    onDelete: "set null",
  }),
  // ── Custo do terreno / valor global (visão econômica × financeira) ──────
  /** Custo de construção (obra) e custo de aquisição do terreno. */
  custoConstrucao: numeric("custo_construcao", { precision: 15, scale: 2 }),
  custoTerreno: numeric("custo_terreno", { precision: 15, scale: 2 }),
  /** Valor de venda da construção e do terreno (compõem o valor global). */
  valorConstrucao: numeric("valor_construcao", { precision: 15, scale: 2 }),
  valorTerreno: numeric("valor_terreno", { precision: 15, scale: 2 }),
  /** Forma de pagamento e proprietário do terreno. */
  formaPagamentoTerreno: text("forma_pagamento_terreno"),
  proprietarioTerreno: text("proprietario_terreno"),
  /**
   * Terreno pago direto ao proprietário (não passa pelo caixa da construtora).
   * Quando true, o valor do terreno compõe a visão econômica/global, mas NÃO é
   * lançado no caixa da construtora.
   */
  terrenoForaCaixa: boolean("terreno_fora_caixa").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Versão/cenário de planejamento de um projeto. Cada versão isola seus dados
 * de movimento (units, permutas, reembolsos, caixa, despesas). Limite de 6 por
 * projeto (3 fixas + 3 customizadas). Ver docs/SPEC.md §4.
 */
export const versions = pgTable(
  "version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** chave estável: "budget" | "forecast" | "atual" | slug da customizada */
    key: text("key").notNull(),
    kind: versionKindEnum("kind").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    /** congelada: bloqueia lançamentos/edições (ver Configuração da Versão). */
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (v) => [unique("version_project_key_uq").on(v.projectId, v.key)],
);

// ─────────────────────────────── Unidades ───────────────────────────────

/**
 * Unidade (imóvel) de uma versão. O plano de pagamento em cascata é guardado
 * como JSONB (`payment_plan`) — agregado sempre lido/gravado por inteiro e
 * consumido 1:1 pela lógica de cálculo (src/lib/calc). Ver docs/SPEC.md §3 e §5.
 */
export const units = pgTable("unit", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  bloco: text("bloco"),
  tipo: text("tipo"),
  m2: numeric("m2", { precision: 8, scale: 2 }),
  andar: integer("andar"),
  /** VGV da unidade. */
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  status: unitStatusEnum("status").notNull().default("Disponivel"),
  /** Item comercializável: unidade individual (default) ou condomínio inteiro. */
  itemType: unitItemTypeEnum("item_type").notNull().default("unidade"),
  /** "MM/DD/YYYY" como no protótipo. */
  mesVenda: text("mes_venda"),
  paymentPlan: jsonb("payment_plan").$type<PaymentPlan>(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

/** Inventário de ativos recebidos em permuta. Ver docs/SPEC.md §3 e §7.4. */
export const permutas = pgTable("permuta", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** código da unidade vinculada (ex.: "BLA 401"). */
  unitCode: text("unit_code"),
  cliente: text("cliente"),
  dataRecebimento: text("data_recebimento"),
  tipo: text("tipo"),
  descricao: text("descricao"),
  estimado: numeric("estimado", { precision: 15, scale: 2 }),
  status: text("status"),
  dataVenda: text("data_venda"),
  valorVenda: numeric("valor_venda", { precision: 15, scale: 2 }),
  tipoPermuta: text("tipo_permuta"),
  /** revenda do bem recebido: "avista" | "parcelada" | "escambo". */
  formaVenda: text("forma_venda"),
  /** nº de parcelas (revenda parcelada). */
  parcelas: integer("parcelas"),
  /** periodicidade das parcelas: "mensal" | "semestral" | "anual". */
  periodicidade: text("periodicidade"),
  /** vencimento da 1ª parcela "MM/DD/YYYY". */
  dataPrimParcela: text("data_prim_parcela"),
  obs: text("obs"),
});

/** Reembolsos da versão. Ver docs/SPEC.md §3 e §7.3. */
export const reembolsos = pgTable("reembolso", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** data REAL "MM/DD/YYYY". */
  data: text("data"),
  origem: text("origem"),
  valor: numeric("valor", { precision: 15, scale: 2 }),
  pct: text("pct"),
  obs: text("obs"),
  serial: integer("serial"),
  status: text("status"),
});

// ─────────────────── Fornecedores / contas / despesas ───────────────────

/** Stakeholder global do tenant (compartilhado entre versões). §3 e §8.2 */
export const stakeholders = pgTable("stakeholder", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: stakeholderTypeEnum("tipo").notNull().default("PJ"),
  doc: text("doc"),
  /** múltiplos papéis (ver PAPEIS_STAKEHOLDER em src/lib/calc/constants). */
  papeis: text("papeis").array().notNull().default([]),
  email: text("email"),
  tel: text("tel"),
  obs: text("obs"),
  /** cadastro ativo? Inativação lógica preserva histórico e vínculos. */
  ativo: boolean("ativo").notNull().default(true),
});

/** Conta bancária do tenant, com campos preparados para Open Finance. §3 */
export const bankAccounts = pgTable("bank_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  banco: text("banco").notNull(),
  ag: text("ag"),
  op: text("op"),
  cc: text("cc"),
  tipo: bankAccountTypeEnum("tipo").notNull().default("Construtora"),
  /** saldo atual da conta — rastreado (Open Finance/extrato) ou manual. */
  saldo: numeric("saldo", { precision: 15, scale: 2 }).notNull().default("0"),
  /** como o saldo é atualizado: "manual" ou "auto" (Open Finance/extrato). */
  saldoSource: text("saldo_source").notNull().default("manual"),
  openFinanceId: text("open_finance_id"),
  lastSync: timestamp("last_sync", { mode: "date" }),
});

/**
 * Subitem do plano de contas (dupla classificação CEF/complementar). Registro
 * por tenant, derivado de PLANO_CONTAS. Ver docs/SPEC.md §8.3.
 */
export const chartAccounts = pgTable(
  "chart_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** código do subitem (ex.: "1.1", "T.3"). */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** código do grupo pai (ex.: "1", "T"). */
    groupCode: text("group_code").notNull(),
    groupName: text("group_name").notNull(),
    kind: accountKindEnum("kind").notNull(),
  },
  (c) => [unique("chart_account_tenant_code_uq").on(c.tenantId, c.code)],
);

/** Lançamento de despesa por versão (competência + dupla classificação). §8.1 */
export const despesas = pgTable("despesa", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** nº de documento interno (ex.: BMV-2026-001682). */
  numDoc: text("num_doc"),
  fornecedorId: uuid("fornecedor_id").references(() => stakeholders.id, {
    onDelete: "set null",
  }),
  bancoId: uuid("banco_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  /** subitem CEF/plano de contas (ex.: "1.1"). */
  contaCef: text("conta_cef"),
  categoriaDre: dreCategoryEnum("categoria_dre"),
  competencia: text("competencia"),
  vencimento: text("vencimento"),
  dataCaixa: text("data_caixa"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status"),
  obs: text("obs"),
  // ── Fase 2: forma e condição de pagamento ──
  formaPagamento: text("forma_pagamento"),
  formaPagamentoDesc: text("forma_pagamento_desc"),
  condicaoPagamento: text("condicao_pagamento"),
  qtdParcelas: integer("qtd_parcelas"),
  dataEmissao: text("data_emissao"),
  // boleto
  boletoLinhaDigitavel: text("boleto_linha_digitavel"),
  boletoCodigoBarras: text("boleto_codigo_barras"),
  boletoBanco: text("boleto_banco"),
  // cheque
  chequeNumero: text("cheque_numero"),
  chequeBanco: text("cheque_banco"),
  chequeAg: text("cheque_ag"),
  chequeConta: text("cheque_conta"),
  chequeEmitente: text("cheque_emitente"),
  chequeDataEmissao: text("cheque_data_emissao"),
  chequeDataCompensacao: text("cheque_data_compensacao"),
  chequeStatus: text("cheque_status"),
  /** Fase 4: despesa paga por terceiro (não gera saída de caixa na competência). */
  pagoPorTerceiro: boolean("pago_por_terceiro").notNull().default(false),
  /** Cancelamento lógico: mantém histórico, sai de saldos/relatórios. */
  cancelado: boolean("cancelado").notNull().default(false),
  canceladoEm: text("cancelado_em"),
  canceladoPor: text("cancelado_por"),
  motivoCancelamento: text("motivo_cancelamento"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Despesa paga por terceiro com restituição posterior (Fase 4). A despesa é
 * reconhecida 1× na DRE (competência); esta tabela registra a OBRIGAÇÃO da
 * empresa com quem desembolsou. A saída de caixa ocorre só nas restituições.
 */
export const despesaTerceiros = pgTable("despesa_terceiro", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  despesaId: uuid("despesa_id")
    .notNull()
    .references(() => despesas.id, { onDelete: "cascade" }),
  /** quem desembolsou o dinheiro (consultora/sócio/funcionário/empresa). */
  pagadorTerceiroId: uuid("pagador_terceiro_id").references(() => stakeholders.id, {
    onDelete: "set null",
  }),
  /** empresa/projeto responsável pela obrigação. */
  empresaResponsavelId: uuid("empresa_responsavel_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }).notNull().default("0"),
  valorRestituido: numeric("valor_restituido", { precision: 15, scale: 2 }).notNull().default("0"),
  dataPagamentoOriginal: text("data_pagamento_original"),
  dataPrevistaRestituicao: text("data_prevista_restituicao"),
  /** Aguardando restituição | Parcialmente restituído | Restituído | Cancelado */
  status: text("status").notNull().default("Aguardando restituição"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Restituição (parcial ou integral) de uma despesa paga por terceiro. Fase 4. */
export const restituicoes = pgTable("restituicao", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  despesaTerceiroId: uuid("despesa_terceiro_id")
    .notNull()
    .references(() => despesaTerceiros.id, { onDelete: "cascade" }),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  dataRestituicao: text("data_restituicao"),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  comprovante: text("comprovante"),
  obs: text("obs"),
  usuarioId: text("usuario_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Parcela de uma despesa (conta a pagar). Fase 2. */
export const despesaParcelas = pgTable(
  "despesa_parcela",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    despesaId: uuid("despesa_id")
      .notNull()
      .references(() => despesas.id, { onDelete: "cascade" }),
    numeroParcela: integer("numero_parcela").notNull(),
    vencimento: text("vencimento"),
    valorOriginal: numeric("valor_original", { precision: 15, scale: 2 }).notNull().default("0"),
    valorPago: numeric("valor_pago", { precision: 15, scale: 2 }).notNull().default("0"),
    multa: numeric("multa", { precision: 15, scale: 2 }).notNull().default("0"),
    juros: numeric("juros", { precision: 15, scale: 2 }).notNull().default("0"),
    desconto: numeric("desconto", { precision: 15, scale: 2 }).notNull().default("0"),
    outrosAcrescimos: numeric("outros_acrescimos", { precision: 15, scale: 2 }).notNull().default("0"),
    dataPagamento: text("data_pagamento"),
    formaPagamento: text("forma_pagamento"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    /** Pendente | Pago | Pago parcialmente | Vencido | Renegociado | Cancelado */
    status: text("status").notNull().default("Pendente"),
    obs: text("obs"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("despesa_parcela_uq").on(t.despesaId, t.numeroParcela)],
);

/**
 * Registro de pagamento de uma parcela/despesa (Fase 3). Guarda a composição
 * (valor original, desconto, multa, juros, outros) e o total efetivamente pago.
 * Suporta pagamento parcial (vários registros por parcela).
 */
export const pagamentos = pgTable("pagamento", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  parcelaId: uuid("parcela_id").references(() => despesaParcelas.id, {
    onDelete: "cascade",
  }),
  despesaId: uuid("despesa_id").references(() => despesas.id, {
    onDelete: "cascade",
  }),
  valorOriginal: numeric("valor_original", { precision: 15, scale: 2 }).notNull().default("0"),
  desconto: numeric("desconto", { precision: 15, scale: 2 }).notNull().default("0"),
  multa: numeric("multa", { precision: 15, scale: 2 }).notNull().default("0"),
  juros: numeric("juros", { precision: 15, scale: 2 }).notNull().default("0"),
  outrosAcrescimos: numeric("outros_acrescimos", { precision: 15, scale: 2 }).notNull().default("0"),
  valorTotalPago: numeric("valor_total_pago", { precision: 15, scale: 2 }).notNull().default("0"),
  dataPagamento: text("data_pagamento"),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  /** categoria DRE dos encargos (juros/multa). */
  categoriaEncargos: text("categoria_encargos").notNull().default("Despesas Financeiras"),
  obs: text("obs"),
  usuarioId: text("usuario_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Documento anexado (NF/contrato) — armazenado no Cloudflare R2. Fase 3. §11 */
export const documents = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  despesaId: uuid("despesa_id").references(() => despesas.id, {
    onDelete: "cascade",
  }),
  /** chave do objeto no bucket R2. */
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  /** tipo do documento: Boleto, Nota Fiscal, Recibo, Contrato, Comprovante… */
  tipo: text("tipo"),
  /** quem realizou o upload (e-mail/id). */
  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Medição de obra lançada pelo engenheiro, por competência (MM/YYYY) e grupo
 * de obra (CEF). A soma das medições alimenta o Custo Variável da DRE.
 */
export const medicoes = pgTable("medicao", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** "MM/YYYY". */
  competencia: text("competencia").notNull(),
  /** código do grupo CEF (ex.: "1", "3"). */
  grupoCode: text("grupo_code").notNull(),
  grupoName: text("grupo_name").notNull(),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Cliente comprador de uma unidade — cadastro comercial com dados cadastrais,
 * financeiros e de inteligência de mercado. Vinculado ao tenant e à unidade
 * comprada (por código). Ver pedido de "sessão de clientes (compradores)".
 */
export const clientes = pgTable("cliente", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** código da unidade comprada (ex.: "BLA 401"). */
  unitCode: text("unit_code"),
  statusContrato: text("status_contrato"),
  // ── Dados cadastrais ──
  nomeCompleto: text("nome_completo").notNull(),
  cpfCnpj: text("cpf_cnpj"),
  nascimento: text("nascimento"),
  nacionalidade: text("nacionalidade"),
  estadoCivil: text("estado_civil"),
  endereco: text("endereco"),
  cidadeEstado: text("cidade_estado"),
  cep: text("cep"),
  emailPrincipal: text("email_principal"),
  emailSecundario: text("email_secundario"),
  celular: text("celular"),
  telefone: text("telefone"),
  // ── Dados financeiros ──
  bancoFinanc: text("banco_financ"),
  rendaBruta: numeric("renda_bruta", { precision: 15, scale: 2 }),
  rendaLiquida: numeric("renda_liquida", { precision: 15, scale: 2 }),
  comprometimento: text("comprometimento"),
  possuiFgts: text("possui_fgts"),
  saldoFgts: numeric("saldo_fgts", { precision: 15, scale: 2 }),
  scoreCredito: integer("score_credito"),
  restricoes: text("restricoes"),
  // ── Inteligência de mercado ──
  morarOuInvestir: text("morar_ou_investir"),
  ramoAtividade: text("ramo_atividade"),
  cargoFuncao: text("cargo_funcao"),
  areaAtuacao: text("area_atuacao"),
  empresa: text("empresa"),
  regimeTrabalho: text("regime_trabalho"),
  localTrabalho: text("local_trabalho"),
  tempoEmpresa: text("tempo_empresa"),
  possuiImovel: text("possui_imovel"),
  motivacaoCompra: text("motivacao_compra"),
  comoConheceu: text("como_conheceu"),
  indicadoPor: text("indicado_por"),
  interesse: integer("interesse"),
  obsEstrategicas: text("obs_estrategicas"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ───────────────────────────── Caixa & INCC ─────────────────────────────

/** Lançamento de caixa (real) por versão, conciliável. Ver docs/SPEC.md §9.4. */
export const cashEntries = pgTable("cash_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  data: text("data"),
  descricao: text("descricao"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  cat: text("cat"),
  unitCode: text("unit_code"),
  /** nº do documento do extrato (quando importado). */
  doc: text("doc"),
  /** assinatura do lançamento importado (dedup do extrato). */
  importHash: text("import_hash"),
  /** conciliado com o extrato? */
  rec: boolean("rec").notNull().default(false),
});

/** Tabela INCC por projeto (48 meses, editável). Ver docs/SPEC.md §6. */
export const inccRates = pgTable(
  "incc_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** "MM/YYYY". */
    mes: text("mes").notNull(),
    /** variação mensal (%). */
    monthly: numeric("monthly", { precision: 8, scale: 4 }).notNull(),
    /** acumulado (%). */
    accumulated: numeric("accumulated", { precision: 8, scale: 4 }).notNull(),
    ordem: integer("ordem").notNull(),
    /** true = valor projetado (média móvel 12m); false = índice oficial. */
    projected: boolean("projected").notNull().default(false),
  },
  (r) => [unique("incc_project_mes_uq").on(r.projectId, r.mes)],
);

// ─────────────────────────────── Auditoria ──────────────────────────────

/**
 * Log de auditoria: registra quem alterou o quê (ver docs/SPEC.md §12.7).
 * Append-only; preenchido pela camada de Server Actions.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  /** ação executada, ex.: "despesa.create". */
  action: text("action").notNull(),
  /** entidade afetada, ex.: "despesa". */
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  /** detalhes (diff/resumo) em JSON. */
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─────────────────────── Numeração de documentos ─────────────────────────

/**
 * Sequência numérica configurável por tenant/entidade (ex.: numeração das
 * Despesas). O próximo número é reservado de forma atômica no banco
 * (UPDATE ... RETURNING dentro de transação), evitando duplicidade sob
 * concorrência. `nextNumber` é semeado a partir do maior número já existente.
 */
export const numberSequences = pgTable(
  "number_sequence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** entidade numerada, ex.: "despesa". */
    entity: text("entity").notNull().default("despesa"),
    prefix: text("prefix").notNull().default("PED"),
    usePrefix: boolean("use_prefix").notNull().default(true),
    digits: integer("digits").notNull().default(6),
    nextNumber: bigint("next_number", { mode: "number" }).notNull().default(1),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("number_sequence_tenant_entity_uq").on(t.tenantId, t.entity)],
);

// ───────────────── Lançamento simplificado (Budget/Forecast) ─────────────

/**
 * Lançamento simplificado mensal das versões Budget/Forecast. Uma linha por
 * (versão, tipo, chave da linha, mês). Receita: chave = fonte consolidada
 * (Mensais, Semestrais, …, Reembolso). Despesa: chave = grupo do plano de
 * contas (CEF), associado a uma categoria da DRE. A versão "atual" continua
 * usando o lançamento detalhado (unidades/despesas).
 */
export const budgetLines = pgTable(
  "budget_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    /** "receita" | "despesa" */
    kind: text("kind").notNull(),
    /** fonte de receita OU código do grupo CEF (despesa). */
    rowKey: text("row_key").notNull(),
    /** categoria DRE associada (para despesa; "Receita" para receita). */
    dreCategory: text("dre_category"),
    /** "MM/YYYY". */
    mes: text("mes").notNull(),
    valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  },
  (t) => [unique("budget_line_uq").on(t.versionId, t.kind, t.rowKey, t.mes)],
);

/**
 * Fechamento operacional diário (Balanço do Dia). Persiste o resultado do
 * fechamento de caixa de um dia (por obra ou consolidado).
 */
export const dailyClosings = pgTable("daily_closing", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** obra do fechamento; NULL = consolidado (todas as obras). */
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  /** dia do fechamento, "MM/DD/YYYY". */
  dia: text("dia").notNull(),
  saldoInicial: numeric("saldo_inicial", { precision: 15, scale: 2 }).notNull().default("0"),
  totalEntradas: numeric("total_entradas", { precision: 15, scale: 2 }).notNull().default("0"),
  totalSaidas: numeric("total_saidas", { precision: 15, scale: 2 }).notNull().default("0"),
  saldoFinal: numeric("saldo_final", { precision: 15, scale: 2 }).notNull().default("0"),
  divergencias: numeric("divergencias", { precision: 15, scale: 2 }).notNull().default("0"),
  responsavelId: text("responsavel_id").references(() => users.id, {
    onDelete: "set null",
  }),
  responsavelNome: text("responsavel_nome"),
  obs: text("obs"),
  closedAt: timestamp("closed_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Histórico de transferências de pendências entre fechamentos (auditoria).
 * Cada conta a pagar/receber não liquidada no fechamento é registrada como
 * transferida para o dia seguinte.
 */
export const carryOvers = pgTable("carry_over", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  closingId: uuid("closing_id").references(() => dailyClosings.id, {
    onDelete: "cascade",
  }),
  /** "pagar" | "receber" */
  tipo: text("tipo").notNull(),
  /** id da despesa ou chave do recebível. */
  refId: text("ref_id"),
  descricao: text("descricao"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  vencimento: text("vencimento"),
  fromDia: text("from_dia").notNull(),
  toDia: text("to_dia").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Item de estoque (produto/material) cadastrado no tenant. */
export const stockItems = pgTable("stock_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  sku: text("sku"),
  nome: text("nome").notNull(),
  /** unidade de medida (un, kg, m, m2, m3, sc, …). */
  unidade: text("unidade").notNull().default("un"),
  categoria: text("categoria"),
  custoUnit: numeric("custo_unit", { precision: 15, scale: 2 }).notNull().default("0"),
  /** estoque mínimo para alerta. */
  minimo: numeric("minimo", { precision: 15, scale: 3 }).notNull().default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Movimentação de estoque: entrada ou saída, associada a uma obra. */
export const stockMovements = pgTable("stock_movement", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => stockItems.id, { onDelete: "cascade" }),
  /** obra à qual a movimentação está associada (NULL = geral/almoxarifado). */
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  /** "entrada" | "saida" */
  tipo: text("tipo").notNull(),
  /**
   * Origem/motivo padronizado da movimentação. Entradas: Compra, Permuta,
   * Devolução, Ajuste, Transferência. Saídas: Consumo na obra, Perda/Quebra,
   * Devolução ao fornecedor, Transferência, Ajuste.
   */
  origem: text("origem"),
  quantidade: numeric("quantidade", { precision: 15, scale: 3 }).notNull().default("0"),
  custoUnit: numeric("custo_unit", { precision: 15, scale: 2 }).notNull().default("0"),
  /** data da movimentação, "MM/DD/YYYY". */
  data: text("data"),
  doc: text("doc"),
  /** Vínculo opcional a uma despesa (entrada por compra). */
  despesaId: uuid("despesa_id").references(() => despesas.id, {
    onDelete: "set null",
  }),
  /** Vínculo opcional a uma permuta (entrada por permuta). */
  permutaId: uuid("permuta_id").references(() => permutas.id, {
    onDelete: "set null",
  }),
  /** Responsável pelo lançamento (quem deu entrada/baixa). */
  responsavel: text("responsavel"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
