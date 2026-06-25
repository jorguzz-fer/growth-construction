# Growth Tools · Construction App

SaaS de **FP&A e BI para incorporadoras imobiliárias** — Tools for Growth (TFG).
Cliente piloto: RMV Empreendimentos / BMV Construções — empreendimento
**SIGNATURE SUARÃO** (195 unidades, padrão MCMV/PEC).

Reconstrução do protótipo single-file (`growth-tools-construction.zip`) em stack
de produção para deploy em **VPS + Coolify**.

- Especificação funcional: [`docs/SPEC.md`](./docs/SPEC.md)
- Stack e roadmap de produção: [`docs/STACK.md`](./docs/STACK.md)

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend + Backend | Next.js 15 (App Router, RSC) + TypeScript |
| UI | Tailwind CSS v4 + componentes shadcn-style |
| Banco | PostgreSQL 16 + **Drizzle ORM** |
| Auth | Auth.js (NextAuth v5) + adapter Drizzle |
| Storage | Cloudflare R2 (S3-compatível) — *Fase 3* |
| Open Finance | Pluggy — *Fase 4* |
| Deploy | Docker (standalone) + Coolify + Traefik |

## Status

- **Fase 0 — Scaffold ✓**: Next.js + Tailwind + Drizzle + Auth.js + Dockerfile,
  com páginas placeholder (`/`, `/dashboard`, `/login`).
- **Fase 1 — Modelo de dados ✓**: schema Drizzle completo do domínio
  (projetos, versões/cenários, unidades + plano de pagamento, permutas,
  reembolsos, caixa, despesas, fornecedores, contas bancárias, plano de contas
  CEF/DRE, INCC), migrações e seed de demonstração.
- **Bônus**: lógica de cálculo pura portada do protótipo para `src/lib/calc/`
  (projeção, totais, INCC, simulador SAC/PRICE) — com **17 testes de paridade**.

Os módulos funcionais (telas) entram nas fases seguintes
(ver [`docs/STACK.md §7`](./docs/STACK.md)).

## Desenvolvimento

```bash
# 1. dependências
npm install

# 2. variáveis de ambiente
cp .env.example .env.local      # preencha DATABASE_URL e AUTH_SECRET

# 3. banco (precisa de um Postgres rodando)
npm run db:generate             # gera migrações a partir do schema Drizzle
npm run db:migrate              # aplica no banco

# 4. app
npm run dev                     # http://localhost:3000
```

### Scripts úteis

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `start` | Build e execução de produção |
| `npm run typecheck` | Checagem de tipos (tsc) |
| `npm run lint` | ESLint |
| `npm run test` | Testes (Vitest) da lógica de cálculo |
| `npm run db:generate` | Gera migrações Drizzle |
| `npm run db:migrate` | Aplica migrações |
| `npm run db:seed` | Popula o tenant de demonstração (RMV) |
| `npm run db:studio` | Drizzle Studio (explorar o banco) |

## Estrutura

```
src/
├─ app/                  # rotas (App Router)
│  ├─ (auth)/login       # login (placeholder — Fase 6)
│  ├─ (app)/dashboard    # dashboard (placeholder — Fase 2+)
│  └─ api/auth/…         # handler do Auth.js
├─ components/ui/        # componentes base (button, card)
└─ lib/
   ├─ db/                # Drizzle: schema, client, migrations, seed
   ├─ auth.ts            # configuração Auth.js
   ├─ calc/              # cálculos puros + constantes + testes ✓
   │                     #   (projeção, totais, INCC, simulador SAC/PRICE)
   ├─ openfinance/       # cliente Pluggy — Fase 4
   └─ pdf/               # geração de PDF (medição de obra) — Fase 5
```

## Deploy (Coolify)

Build pack **Dockerfile**, porta `3000`, HTTPS automático via Traefik.
Configure as variáveis de [`.env.example`](./.env.example) como secrets e rode
`npm run db:migrate` no pós-deploy. Passo a passo completo em
[`docs/STACK.md §3`](./docs/STACK.md).
