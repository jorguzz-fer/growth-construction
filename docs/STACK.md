# STACK — Reconstrução para Produção (VPS + Coolify)

> Stack de produção do **Growth Tools · Construction App**, projetada para rodar **inteiramente em uma VPS gerenciada por [Coolify](https://coolify.io)** — sem dependência de PaaS proprietária (Vercel/Supabase Cloud).
> Funcionalidades de origem: ver [`SPEC.md`](./SPEC.md).

---

## 1. Por que mudar a stack original

O protótipo planejava **Next.js + Supabase Cloud + Vercel Pro**. Para auto-hospedagem em VPS com Coolify, trocamos os serviços gerenciados por componentes que o Coolify orquestra nativamente via Docker + Traefik:

| Camada | Plano original (PaaS) | **Stack VPS + Coolify** |
|---|---|---|
| Frontend + Backend | Next.js 14 na Vercel | **Next.js 15 (App Router) — container Docker no Coolify** |
| Banco de dados | Supabase Postgres (cloud) | **PostgreSQL 16 — recurso one-click do Coolify** |
| Auth | Supabase Auth | **Auth.js (NextAuth v5)** + Postgres, ou **Supabase self-hosted** |
| Storage de arquivos | Supabase Storage | **MinIO (S3-compatível) — container Coolify** |
| Deploy / SSL / Proxy | Vercel | **Coolify + Traefik + Let's Encrypt (automático)** |
| Open Finance | Pluggy/Belvo | **Pluggy** (API externa — inalterada) |
| Jobs/agendados | Vercel Cron | **Coolify Scheduled Tasks** ou worker BullMQ + Redis |

---

## 2. Stack recomendada (decisão)

```
┌─────────────────────────────────────────────────────────────┐
│  VPS (Ubuntu 22.04+, 4 vCPU / 8 GB RAM recomendado)          │
│  └─ Coolify (auto-gerencia Docker, Traefik, SSL)            │
│      ├─ app          → Next.js 15 (web + API routes)        │
│      ├─ postgres     → PostgreSQL 16                        │
│      ├─ redis        → Redis 7 (cache + filas BullMQ)       │
│      ├─ minio        → MinIO (documentos/anexos)            │
│      └─ worker       → Node worker (jobs: sync OF, PDFs)    │
└─────────────────────────────────────────────────────────────┘
```

### Frontend / App
- **Next.js 15** (App Router, React Server Components) + **TypeScript**.
- **Tailwind CSS** + **shadcn/ui** (componentes acessíveis) — substitui o CSS manual do protótipo.
- **TanStack Query** (estado de servidor) + **Zustand** (estado de UI leve: versão ativa, projeto ativo).
- **Recharts** ou **Chart.js** (manter Chart.js reduz retrabalho dos gráficos do protótipo).
- **SheetJS (xlsx)** para importação de planilhas (já usado no protótipo).
- **react-hook-form + Zod** para os formulários complexos do plano de pagamento.

### Backend / API
- **Next.js API Routes / Server Actions** (monólito full-stack — simples de deployar em um container).
- **Prisma** (ORM) ou **Drizzle ORM** — recomendado **Drizzle** (leve, SQL-first, migrações claras).
- **Zod** para validação compartilhada cliente/servidor.
- Geração de **PDF** (medição de obra / relatórios) via **@react-pdf/renderer** ou **Puppeteer** no worker.

### Banco de dados
- **PostgreSQL 16** (recurso nativo do Coolify, com backups agendados).
- **Multi-tenancy** por coluna `tenant_id` + isolamento na camada de aplicação (ou RLS se usar Supabase self-hosted).
- Modelar **versões/cenários** como dados versionados (`version_id` em todas as tabelas de movimento).

### Autenticação
- **Auth.js (NextAuth v5)** com adapter Drizzle/Prisma + Postgres.
- Papéis: `owner`, `admin`, `contador` (somente leitura), `membro`.
- Sessão por JWT/cookie httpOnly. RBAC na camada de API.
- *(Alternativa: subir o stack Supabase self-hosted completo no Coolify se quiser Auth + Realtime + Storage integrados — mais pesado, porém compatível com o plano original.)*

### Storage de documentos
- **MinIO** (S3-compatível) para o repositório de notas fiscais/contratos do módulo Despesas.
- SDK `@aws-sdk/client-s3` apontando para o endpoint MinIO interno do Coolify.

### Open Finance
- **Pluggy** (agregador brasileiro) — API externa.
- Worker agendado puxa extratos e popula lançamentos de caixa para conciliação.
- Credenciais via variáveis de ambiente do Coolify (secrets).

### Jobs / agendamento
- **Redis 7 + BullMQ** para filas (sincronização Open Finance, geração de PDF, recálculo de projeções pesadas).
- Alternativa simples: **Scheduled Tasks** nativas do Coolify (cron) chamando endpoints internos.

---

## 3. Deploy no Coolify — passo a passo

### Pré-requisitos
- VPS com Ubuntu 22.04+ e Coolify instalado (`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`).
- Domínio apontando para o IP da VPS (DNS A record). Subdomínios sugeridos:
  - `app.growthtools.com.br` → Next.js
  - `s3.growthtools.com.br` → MinIO (opcional, console)

### Passos
1. **Criar projeto** no Coolify (ex.: `growth-tools`).
2. **Adicionar recurso PostgreSQL** (one-click) → anotar `DATABASE_URL` interna.
3. **Adicionar recurso Redis** (one-click).
4. **Adicionar recurso MinIO** (one-click) → criar bucket `documentos`, gerar access/secret key.
5. **Adicionar aplicação** apontando para o repositório Git:
   - Build pack: **Dockerfile** (ver §4) ou **Nixpacks**.
   - Porta exposta: `3000`.
   - Habilitar **HTTPS automático** (Traefik + Let's Encrypt).
6. **Configurar variáveis de ambiente** (§5) como secrets.
7. **Rodar migrações** no deploy (comando pós-build `drizzle-kit migrate` / `prisma migrate deploy`).
8. **Adicionar worker** (segunda aplicação, mesmo repo, comando `node worker.js`) — sem porta pública.
9. **Configurar backups** do Postgres no Coolify (diário) + retenção.
10. **Webhook de deploy**: conectar o Coolify ao GitHub para CI/CD em cada push na branch de produção.

---

## 4. Dockerfile (Next.js standalone)

```dockerfile
# --- deps ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build          # next build (output: 'standalone')

# --- runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

> Em `next.config.js`: `output: 'standalone'` para imagem mínima.

---

## 5. Variáveis de ambiente

```env
# App
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.growthtools.com.br
AUTH_SECRET=__gerar_com_openssl_rand_base64_32__

# Postgres (interno Coolify)
DATABASE_URL=postgresql://user:pass@postgres:5432/growthtools

# Redis
REDIS_URL=redis://redis:6379

# MinIO / S3
S3_ENDPOINT=http://minio:9000
S3_BUCKET=documentos
S3_ACCESS_KEY=__minio_access_key__
S3_SECRET_KEY=__minio_secret_key__
S3_REGION=us-east-1

# Open Finance (Pluggy)
PLUGGY_CLIENT_ID=__id__
PLUGGY_CLIENT_SECRET=__secret__
```

---

## 6. Estrutura de pastas sugerida (monorepo simples)

```
growth-construction/
├─ docs/
│  ├─ SPEC.md
│  └─ STACK.md
├─ src/
│  ├─ app/                 # rotas Next.js (App Router)
│  │  ├─ (auth)/login
│  │  ├─ (app)/dashboard
│  │  ├─ (app)/unidades
│  │  ├─ (app)/despesas
│  │  └─ api/              # endpoints / server actions
│  ├─ components/          # UI (shadcn)
│  ├─ lib/
│  │  ├─ db/               # Drizzle schema + migrations
│  │  ├─ calc/             # calcProj, calcTotals, INCC, simulador
│  │  ├─ openfinance/      # cliente Pluggy
│  │  └─ pdf/              # geração medição de obra
│  └─ workers/             # BullMQ jobs
├─ Dockerfile
├─ next.config.js
└─ package.json
```

> **Reaproveitamento direto do protótipo:** a lógica de cálculo (`calcProj`, `calcUnitTotal`, `calcTotals`, `recalcINCC`, `getINCC`, simulador SAC/PRICE) e a estrutura `PLANO_CONTAS` / `CATEGORIAS_DRE` / `PAPEIS_STAKEHOLDER` podem ser portadas quase 1:1 do HTML para `src/lib/calc/` e `src/lib/db/seed`.

---

## 7. Roadmap de migração sugerido

1. **Fase 0 — Scaffold:** Next.js 15 + Tailwind + Drizzle + Auth.js; Dockerfile; subir "hello world" no Coolify com Postgres.
2. **Fase 1 — Modelo de dados:** migrar entidades do §3 do SPEC para schema Drizzle (tenant, projeto, versão, unidade, plano de pagamento, despesa, fornecedor, conta).
3. **Fase 2 — Receitas:** portar Unidades, plano de pagamento, INCC, Projeção, Consolidado, Simulador (reusar lógica de cálculo).
4. **Fase 3 — Despesas:** Lançamentos, Plano de Contas, Fornecedores, repositório de documentos (MinIO).
5. **Fase 4 — Caixa & Open Finance:** integração Pluggy + conciliação automática.
6. **Fase 5 — Reports:** Dashboard multi-versão, DRE, Fluxo de Caixa, Medição (PDF), Rolling, Resumo.
7. **Fase 6 — Config & multi-tenant:** Usuários, papéis, acesso contabilidade (read-only), auditoria.
