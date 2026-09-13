# RECEITA, FINANCIAMENTO BANCÁRIO E TOTAIS

Coleta em `main` (commit `45f4ce3`). Sem resumo, sem análise.

---

## 1. `getMonthlyRevenue`

Recebe `(versionId, projectId)` e devolve um `MonthlyProjection` — um mapa
`"MM/YYYY" → número`. O caminho **bifurca pelo `kind` da versão**.

### Tabelas que a função alcança

| Tabela | Por onde | Quando | Como entra na soma |
|---|---|---|---|
| `version` | `getVersionKind(versionId)` — `queries.ts:945–952` | sempre | não soma nada; só decide o ramo (`budget`/`forecast` × demais) |
| `budget_line` | `select` direto na própria função | só se o `kind` é `budget` ou `forecast` | filtra `kind = "receita"` e acumula `valor` na chave `mes`, que já vem `"MM/YYYY"`. **Retorna aqui — nenhuma das tabelas abaixo é lida** |
| `unit` | `getUnits(versionId)` — `queries.ts:85–91` | demais versões (`atual`, `custom`) | cada unidade passa por `expandUnitReceivables(r.paymentPlan, r.status)`; cada recebível vira `MM/YYYY` a partir de `rec.dia` (`"MM/DD/YYYY"`), somando `rec.valor` |
| `reembolso` | `getReembolsos(versionId)` — `queries.ts:134–141` | demais versões | `reembursementsByMonth(reembToCalc(...))` devolve o mapa mensal, que é somado chave a chave |
| `conta_receber` | `select` direto na própria função | demais versões | filtra `project_id = projectId` **e** `cancelado = false`; agrega pelo mês do `vencimento`, somando `valor` |

Dois detalhes do escopo, visíveis no código:

- `unit` e `reembolso` são filtrados por **versão**; `conta_receber` é filtrada
  por **projeto**. A tabela `conta_receber` não tem `version_id`.
- O ramo `budget`/`forecast` sai por `return` antes de qualquer outra leitura:
  para essas versões a receita vem **só** de `budget_line`.

### Quem chama

| Arquivo | Linha |
|---|---|
| `src/app/(app)/dre/page.tsx` | — (importa e chama) |
| `src/app/(app)/dashboard/page.tsx` | 49 |
| `src/app/(app)/projecao/page.tsx` | 144 |
| `src/app/(app)/resumo/page.tsx` | 120 |
| `src/app/(app)/contabilidade/page.tsx` | 20 |
| `src/lib/fluxo-caixa.ts` | 41 |
| `src/lib/queries.ts` | 2163 |

### `src/lib/queries.ts` · linhas 1100–1176

```ts
/**
 * Receita projetada mês a mês de uma versão.
 *
 * Cada versão respeita o que foi lançado NELA:
 *  - Budget/Forecast → budget_line (planejamento);
 *  - Atual → o que está efetivamente lançado, isto é, as CONTAS A RECEBER
 *    lançadas mais os recebíveis derivados dos planos de pagamento das vendas,
 *    mais os reembolsos. É daí que sai a projeção de receita futura.
 *
 * As duas origens da Atual são complementares, não duplicadas: os recebíveis de
 * venda são derivados do plano da unidade e não são copiados para conta_receber
 * (ver comentário do schema em `contasReceber`).
 */
export async function getMonthlyRevenue(
  versionId: string,
  projectId: string,
): Promise<MonthlyProjection> {
  const kind = await getVersionKind(versionId);
  if (kind === "budget" || kind === "forecast") {
    const lines = await db
      .select({ mes: schema.budgetLines.mes, valor: schema.budgetLines.valor })
      .from(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, "receita"),
        ),
      );
    const out: MonthlyProjection = {};
    for (const l of lines) out[l.mes] = (out[l.mes] || 0) + Number(l.valor);
    return out;
  }

  const [unitRows, reembRows] = await Promise.all([
    getUnits(versionId),
    getReembolsos(versionId),
  ]);
  const out: MonthlyProjection = {};
  // Receita da versão Atual = recebíveis das vendas (MESMA fonte da tela Contas
  // a Receber: expandUnitReceivables — leitura tolerante do plano, sem depender
  // das flags usar*). Assim DRE e Fluxo batem com os recebíveis exibidos.
  // Agrega por mês do vencimento ("MM/DD/YYYY" → "MM/YYYY").
  for (const r of unitRows) {
    for (const rec of expandUnitReceivables(r.paymentPlan, r.status)) {
      const p = rec.dia.split("/");
      if (p.length !== 3) continue;
      const mk = `${p[0]}/${p[2]}`;
      out[mk] = (out[mk] || 0) + rec.valor;
    }
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  for (const [mm, v] of Object.entries(reemb)) out[mm] = (out[mm] || 0) + v;

  // CONTAS A RECEBER lançadas do projeto — a projeção de receita futura da
  // versão Atual depende delas. Sem isto, uma receita lançada à mão (fora de um
  // plano de venda) aparecia em Contas a Receber e sumia da DRE, do Fluxo de
  // Caixa e do Dashboard. Agrega pelo mês do vencimento e ignora as canceladas.
  const crRows = await db
    .select({
      valor: schema.contasReceber.valor,
      vencimento: schema.contasReceber.vencimento,
    })
    .from(schema.contasReceber)
    .where(
      and(
        eq(schema.contasReceber.projectId, projectId),
        eq(schema.contasReceber.cancelado, false),
      ),
    );
  for (const c of crRows) {
    const p = (c.vencimento ?? "").split("/");
    if (p.length !== 3) continue;
    const mk = `${p[0]}/${p[2]}`;
    out[mk] = (out[mk] || 0) + Number(c.valor);
  }
  return out;
}
```

As três funções auxiliares que ela usa para alcançar as tabelas:

### `src/lib/queries.ts` · linhas 945–952

`getVersionKind` — lê `version`.

```ts
export async function getVersionKind(versionId: string): Promise<string | null> {
  const [v] = await db
    .select({ kind: schema.versions.kind })
    .from(schema.versions)
    .where(eq(schema.versions.id, versionId))
    .limit(1);
  return v?.kind ?? null;
}
```

### `src/lib/queries.ts` · linhas 85–91

`getUnits` — lê `unit`.

```ts
export async function getUnits(versionId: string): Promise<UnitRow[]> {
  return db
    .select()
    .from(schema.units)
    .where(eq(schema.units.versionId, versionId))
    .orderBy(asc(schema.units.code));
}
```

### `src/lib/queries.ts` · linhas 134–141

`getReembolsos` — lê `reembolso`.

```ts
export async function getReembolsos(
  versionId: string,
): Promise<ReembolsoRow[]> {
  return db
    .select()
    .from(schema.reembolsos)
    .where(eq(schema.reembolsos.versionId, versionId));
}
```

---

## 2. A linha Banco dentro do `payment_plan`

O `payment_plan` é uma coluna **JSONB** em `unit` — não há tabela nem colunas
próprias para as fontes. O tipo TypeScript que a descreve vive em
`src/lib/calc/types.ts`.

`Banco` é a **última** fonte da cascata e a única sem flag `usar*` própria —
quem a liga é o `usarFinanc` da `Permuta`, a fonte anterior.

### `src/lib/calc/types.ts` · linhas 45–50

`BancoSource` — a linha Banco. Quatro campos.

```ts
export interface BancoSource {
  valFinanc: number;
  dataEntrada: string;
  dataPrimParc: string;
  statusFinanc: string;
}
```

| Campo | Tipo | O que guarda |
|---|---|---|
| `valFinanc` | `number` | valor financiado pelo banco |
| `dataEntrada` | `string` | data de entrada do processo no banco |
| `dataPrimParc` | `string` | vencimento da primeira parcela — é a data usada como vencimento do recebível |
| `statusFinanc` | `string` | status do financiamento, texto livre |

E o lugar dela na cascata:

### `src/lib/calc/types.ts` · linhas 52–69

`PaymentPlan` — `Banco: BancoSource` é o último campo.

```ts
/**
 * Cascata de fontes de recebimento de uma unidade. Cada flag `usar*` ativa a
 * próxima fonte na cascata (ver docs/SPEC.md §5).
 */
export interface PaymentPlan {
  usarAS: boolean;
  AS: SignalSource & { usarS1: boolean };
  S1: SignalSource & { usarS2: boolean };
  S2: SignalSource & { usarS3: boolean };
  S3: SignalSource & { usarMens: boolean };
  Mensais: PeriodicSource & { usarSem: boolean };
  Semestrais: PeriodicSource & { usarAnu: boolean };
  Anuais: PeriodicSource & { usarFGTS: boolean };
  FGTS: FgtsSource & { usarSub: boolean };
  Subsidio: SubsidioSource & { usarPer: boolean };
  Permuta: PermutaSource & { usarFinanc: boolean };
  Banco: BancoSource;
}
```

---

## 3. Todo ponto que lê `Banco.valFinanc`

| Arquivo | Linha | O que faz com o valor |
|---|---|---|
| `src/lib/calc/receivables.ts` | 68 | vira **um recebível avulso** rotulado `"Financiamento"`, com vencimento em `Banco.dataPrimParc` — é assim que o financiamento entra na tela Contas a Receber e em `getMonthlyRevenue` |
| `src/lib/calc/projection.ts` | 261 | soma ao **total da unidade** em `calcUnitTotal`, junto de sinais, mensais, FGTS, subsídio e permuta |
| `src/lib/calc/projection.ts` | 386 | acumula no campo `banco` de `VersionTotals`, em `calcTotals` — **só de unidades com `status === "Vendido"`** |
| `src/components/app/unit-form.tsx` | 253 | campo “Valor financiado” do formulário — leitura para exibir e escrita ao editar |
| `src/lib/xlsx/growth-template.ts` | 133 | escreve na coluna “Banc Valor” da planilha exportada |
| `src/lib/xlsx/growth-template.ts` | 301 | lê de volta da planilha na importação |
| `src/lib/calc/plan.ts` | 18 | valor inicial `0` ao montar um plano vazio |
| `src/lib/calc/__fixtures__.ts` | 29, 60 | fixtures de teste |

O trecho de `receivables.ts` que o transforma em recebível:

### `src/lib/calc/receivables.ts` · linhas 64–69

A linha do `Banco` fica junto de FGTS, Subsídio e Permuta — todas fontes de parcela única.

```ts
  const singles: { venc: string; val: number; label: string }[] = [
    { venc: str(sec("FGTS").dataPrev), val: num(sec("FGTS").val), label: "FGTS" },
    { venc: str(sec("Subsidio").dataPrev), val: num(sec("Subsidio").val), label: "Subsídio" },
    { venc: str(sec("Permuta").dataPrev), val: num(sec("Permuta").val), label: "Permuta" },
    { venc: str(sec("Banco").dataPrimParc), val: num(sec("Banco").valFinanc), label: "Financiamento" },
  ];
```

E o de `calcUnitTotal`:

### `src/lib/calc/projection.ts` · linhas 245–263

`calcUnitTotal` — total contratado de uma unidade.

```ts
export function calcUnitTotal(u: CalcUnit): number {
  if (u.status !== "Vendido") return 0;
  let t = 0;
  t +=
    (u.AS.val || 0) * (u.AS.n || 1) +
    (u.S1.val || 0) * (u.S1.n || 1) +
    (u.S2.val || 0) * (u.S2.n || 1) +
    (u.S3.val || 0) * (u.S3.n || 1);
  t +=
    (u.Mensais.val || 0) * (u.Mensais.n || 0) +
    (u.Semestrais.val || 0) * (u.Semestrais.n || 0) +
    (u.Anuais.val || 0) * (u.Anuais.n || 0);
  t +=
    (u.FGTS.val || 0) +
    (u.Subsidio.val || 0) +
    (u.Permuta.val || 0) +
    (u.Banco.valFinanc || 0);
  return t;
}
```

---

## 4. `calcTotals` e os campos `banco` e `reemb`

### `src/lib/calc/projection.ts` · linhas 353–413

```ts
/**
 * Agrega os totais de receita de uma versão (VGV, sinais, mensais, semestrais,
 * anuais, FGTS, subsídio, permuta recebida/vendida, reembolsos, banco e
 * contagem por status). Espelha `calcTotals()`, recebendo as coleções da
 * versão ao invés de ler estado global.
 */
export function calcTotals(
  units: readonly CalcUnit[],
  permutas: readonly CalcPermuta[],
  reembolsos: readonly CalcReembolso[],
): VersionTotals {
  let sinais = 0,
    mens = 0,
    sem = 0,
    anu = 0,
    fgts = 0,
    sub = 0,
    permRec = 0,
    permVend = 0,
    banco = 0;

  units.forEach((u) => {
    if (u.status !== "Vendido") return;
    sinais +=
      (u.AS.val || 0) * (u.AS.n || 1) +
      (u.S1.val || 0) +
      (u.S2.val || 0) +
      (u.S3.val || 0);
    mens += (u.Mensais.val || 0) * (u.Mensais.n || 0);
    sem += (u.Semestrais.val || 0) * (u.Semestrais.n || 0);
    anu += (u.Anuais.val || 0) * (u.Anuais.n || 0);
    fgts += u.FGTS.val || 0;
    sub += u.Subsidio.val || 0;
    banco += u.Banco.valFinanc || 0;
  });

  permutas.forEach((p) => {
    permRec += p.estimado || 0;
    if (p.status === "Vendido") permVend += p.valorVenda || 0;
  });

  const reemb = reembolsos.reduce((a, r) => a + (r.valor || 0), 0);
  const vgv = units.reduce((a, u) => a + u.valor, 0);

  return {
    vgv,
    sinais,
    mens,
    sem,
    anu,
    fgts,
    sub,
    permRec,
    permVend,
    reemb,
    banco,
    disp: units.filter((u) => u.status === "Disponivel").length,
    res: units.filter((u) => u.status === "Reservado").length,
    vend: units.filter((u) => u.status === "Vendido").length,
  };
}
```

### O tipo devolvido

### `src/lib/calc/types.ts` · linhas 108–124

`VersionTotals` — `banco` e `reemb` são dois dos catorze campos.

```ts
/** Agregados de receita por versão (ver `calcTotals`). */
export interface VersionTotals {
  vgv: number;
  sinais: number;
  mens: number;
  sem: number;
  anu: number;
  fgts: number;
  sub: number;
  permRec: number;
  permVend: number;
  reemb: number;
  banco: number;
  disp: number;
  res: number;
  vend: number;
}
```

### Quem chama `calcTotals`

**Apenas a tela Resumo Executivo**, duas vezes — uma por bloco da página:

| Arquivo | Linha |
|---|---|
| `src/app/(app)/resumo/page.tsx` | 38 |
| `src/app/(app)/resumo/page.tsx` | 134 |
| `src/lib/calc/projection.test.ts` | 65 (teste) |

### Quem consome `totals.banco`

| Arquivo | Linha | Uso |
|---|---|---|
| `src/app/(app)/resumo/page.tsx` | 271 | exibe `brl0(totals.banco)` |
| `src/app/(app)/resumo/page.tsx` | 279 | exibe `brl0(totals.banco)` |
| `src/lib/calc/projection.test.ts` | 74 | asserção do teste |

Nenhum outro ponto do repositório lê o campo.

### Quem consome `totals.reemb`

| Arquivo | Linha | Uso |
|---|---|---|
| `src/app/(app)/resumo/page.tsx` | 59 | linha “Reembolso (aba própria)” |
| `src/app/(app)/resumo/page.tsx` | 161 | linha “Reembolso (aba própria)” |

### Cuidado: existem dois `reemb` diferentes

O nome se repete em duas estruturas sem relação direta, e confundi-las leva a
conclusão errada sobre a Projeção e o Consolidado:

| | `VersionTotals.reemb` | o `reemb` da Projeção/Consolidado |
|---|---|---|
| Tipo | `number` — um escalar | `MonthlyProjection` — mapa `"MM/YYYY" → número` |
| Origem | `calcTotals`, somando `r.valor` de todos os reembolsos | `reembursementsByMonth(reembToCalc(...))` |
| Onde aparece | só em `resumo/page.tsx` (59, 161) | `projecao/page.tsx` (82, 89), `consolidado/page.tsx` (80, 88, 164) |

Em `consolidado/page.tsx:116` o mapa é desestruturado como
`const [{ sources, reemb: reembMonth }, incc] = ...` — ou seja, o `rv.reemb`
das linhas 80 e 88 é o **mapa mensal**, não o escalar de `calcTotals`.
