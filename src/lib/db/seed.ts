/**
 * Seed do banco — popula um tenant de demonstração (RMV / SIGNATURE SUARÃO)
 * com as 3 versões fixas, plano de contas (CEF + complementar), tabela INCC,
 * stakeholders, contas bancárias e unidades de amostra com plano de pagamento.
 *
 * Uso: `npm run db:seed` (requer DATABASE_URL apontando para um Postgres).
 * Idempotente no nível do tenant: se "RMV Empreendimentos" já existir, aborta.
 *
 * Os dados de origem vêm de src/lib/calc/constants e do protótipo (docs/SPEC.md).
 */
import { eq } from "drizzle-orm";
import { db, schema } from "./index";
import {
  PLANO_CONTAS,
  PAPEIS_STAKEHOLDER,
  DEFAULT_INCC,
} from "@/lib/calc/constants";
import { bla401, emptyUnit } from "@/lib/calc/__fixtures__";
import type { CalcUnit } from "@/lib/calc/types";

/** Extrai a parte do plano de pagamento (JSONB) de uma CalcUnit. */
function planOf(u: CalcUnit) {
  const { code: _c, status: _s, valor: _v, ...plan } = u;
  void _c;
  void _s;
  void _v;
  return plan;
}

async function main() {
  const existing = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.name, "RMV Empreendimentos"))
    .limit(1);

  if (existing.length > 0) {
    console.log("Tenant 'RMV Empreendimentos' já existe — seed abortado.");
    return;
  }

  console.log("Criando tenant, projeto e versões...");
  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: "RMV Empreendimentos" })
    .returning();

  // Usuário owner + vínculo (RBAC). O login real (Auth.js) entra na operação.
  const [owner] = await db
    .insert(schema.users)
    .values({ name: "RMV Admin", email: "admin@rmv.com.br" })
    .returning();
  await db
    .insert(schema.memberships)
    .values({ userId: owner.id, tenantId: tenant.id, role: "owner" });

  const [project] = await db
    .insert(schema.projects)
    .values({
      tenantId: tenant.id,
      name: "SIGNATURE SUARÃO",
      kind: "proj",
      status: "Em andamento",
    })
    .returning();

  const versionsSeed = [
    {
      key: "budget",
      kind: "budget" as const,
      label: "Budget / Orçamento",
      color: "#6366f1",
      isDefault: false,
    },
    {
      key: "forecast",
      kind: "forecast" as const,
      label: "Previsto / Forecast",
      color: "#10b981",
      isDefault: true,
    },
    {
      key: "atual",
      kind: "atual" as const,
      label: "Atual — caixa real",
      color: "#f59e0b",
      isDefault: false,
    },
  ];
  const insertedVersions = await db
    .insert(schema.versions)
    .values(
      versionsSeed.map((v) => ({
        ...v,
        projectId: project.id,
        tenantId: tenant.id,
      })),
    )
    .returning();
  const forecast = insertedVersions.find((v) => v.key === "forecast")!;

  console.log("Plano de contas (CEF + complementar)...");
  const chartRows = [
    ...PLANO_CONTAS.obra.flatMap((g) =>
      g.sub.map((s) => ({
        tenantId: tenant.id,
        code: s.id,
        name: s.nome,
        groupCode: g.id,
        groupName: g.nome,
        kind: "cef" as const,
      })),
    ),
    ...PLANO_CONTAS.complementar.flatMap((g) =>
      g.sub.map((s) => ({
        tenantId: tenant.id,
        code: s.id,
        name: s.nome,
        groupCode: g.id,
        groupName: g.nome,
        kind: "complementar" as const,
      })),
    ),
  ];
  await db.insert(schema.chartAccounts).values(chartRows);
  console.log(`  ${chartRows.length} subitens.`);

  console.log("Tabela INCC (48 meses)...");
  await db.insert(schema.inccRates).values(
    DEFAULT_INCC.map((r, i) => ({
      projectId: project.id,
      tenantId: tenant.id,
      mes: r.m,
      monthly: r.mo.toString(),
      accumulated: r.ac.toString(),
      ordem: i,
    })),
  );

  console.log("Stakeholders e contas bancárias...");
  await db.insert(schema.stakeholders).values([
    {
      tenantId: tenant.id,
      nome: "Brasil Mix Concreto Ltda",
      tipo: "PJ",
      doc: "20.957.509/0001-34",
      papeis: ["Fornecedor de Material"],
    },
    {
      tenantId: tenant.id,
      nome: "Inácio de Sousa",
      tipo: "PF",
      doc: "332.641.358-09",
      papeis: ["Mão de Obra RPA"],
    },
    {
      tenantId: tenant.id,
      nome: "BMV Construções Ltda",
      tipo: "PJ",
      doc: "",
      papeis: ["Construtora"],
    },
  ]);
  // sanidade: todos os papéis seedados existem na lista canônica
  void PAPEIS_STAKEHOLDER;

  await db.insert(schema.bankAccounts).values([
    { tenantId: tenant.id, banco: "Itaú", ag: "0039", cc: "99155-9", tipo: "Imobiliária" },
    { tenantId: tenant.id, banco: "Caixa", ag: "0742", op: "1292", cc: "579179671-0", tipo: "Construtora" },
    { tenantId: tenant.id, banco: "Inter", ag: "0001", cc: "28519646-4", tipo: "Imobiliária" },
    { tenantId: tenant.id, banco: "Caixa", ag: "0742", op: "1292", cc: "575733196-4", tipo: "Imobiliária" },
  ]);

  console.log("Unidades de amostra (versão forecast)...");
  const u401 = bla401();
  const u402 = emptyUnit("BLA 402", 539580);
  await db.insert(schema.units).values([
    {
      versionId: forecast.id,
      tenantId: tenant.id,
      code: u401.code,
      bloco: "A",
      tipo: "3D T1",
      m2: "77.83",
      andar: 4,
      valor: u401.valor.toString(),
      status: "Vendido",
      mesVenda: "01/27/2026",
      paymentPlan: planOf(u401),
    },
    {
      versionId: forecast.id,
      tenantId: tenant.id,
      code: u402.code,
      bloco: "A",
      tipo: "3D T2",
      m2: "78.20",
      andar: 4,
      valor: u402.valor.toString(),
      status: "Disponivel",
      paymentPlan: planOf(u402),
    },
  ]);

  console.log("✓ Seed concluído.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
