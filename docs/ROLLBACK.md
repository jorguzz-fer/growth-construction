# Backup, verificação de integridade e rollback

Procedimento obrigatório para qualquer alteração estrutural (migração de schema)
ou correção em massa de dados. **Regra bloqueante: zero perda de dados.**

## Por que este documento existe

A auditoria identificou dois riscos no processo atual:

1. **As migrações são forward-only.** O `drizzle-kit generate` não produz
   scripts de reversão (`down`). Antes desta convenção, **nenhuma migração podia
   ser desfeita** — a única recuperação possível era restaurar um backup.
2. **As migrações rodam sozinhas no deploy.** O `docker-entrypoint.sh` executa
   `node migrate.mjs` a cada boot do container. Portanto, subir uma imagem já
   aplica a migração em produção; não há etapa manual de confirmação.

Consequência: **o backup não é opcional.** Ele é o único rollback real.

## Procedimento padrão

### 1. Snapshot antes de qualquer alteração

```bash
export DATABASE_URL="postgres://..."
./scripts/db-snapshot.sh --verify-restore
```

O script:
- gera `backups/growth_<timestamp>.dump` (formato custom, permite restauração
  seletiva por tabela);
- **aborta** se o dump sair suspeito (< 1 KB);
- grava o inventário de registros em `backups/growth_<timestamp>_inventario.txt`;
- com `--verify-restore`, restaura o dump num banco descartável e reimprime o
  inventário — **provando que a restauração funciona** antes de você precisar
  dela.

Não prossiga sem um dump verificado.

### 2. Relatório de integridade ANTES

```bash
psql "$DATABASE_URL" -f scripts/integridade.sql > antes.txt
```

Registra contagem por tabela, totais financeiros, vínculos de anexos e registros
órfãos.

### 3. Aplicar a migração

```bash
npm run db:migrate
```

### 4. Relatório de integridade DEPOIS e comparação

```bash
psql "$DATABASE_URL" -f scripts/integridade.sql > depois.txt
diff antes.txt depois.txt
```

**Critério de aceite:** as contagens e os totais financeiros só podem divergir
naquilo que a migração pretendia alterar — e a divergência precisa ser explicada
por escrito. Qualquer diferença inesperada = **rollback imediato** (passo 5).

### 5. Rollback

**Opção A — script de reversão (preferencial, quando existir).** Toda migração
com risco deve vir acompanhada de um par em `src/lib/db/migrations/down/`:

```
src/lib/db/migrations/0034_exemplo.sql          # aplicada pelo drizzle
src/lib/db/migrations/down/0034_exemplo.sql     # reversão manual
```

```bash
psql "$DATABASE_URL" -f src/lib/db/migrations/down/0034_exemplo.sql
```

O arquivo `down/` deve ser **idempotente** (`IF EXISTS` / `IF NOT EXISTS`) e
precisa ser testado numa cópia do banco antes do deploy.

**Opção B — restauração do snapshot** (quando não há `down`, ou quando houve
perda de dados):

```bash
pg_restore --dbname="$DATABASE_URL" --clean --if-exists \
  backups/growth_<timestamp>.dump
```

> `--clean` recria os objetos. Use apenas com o serviço parado, para não competir
> com escritas simultâneas da aplicação.

## Regras para escrever migrações

- **Aditivas por padrão.** Adicionar coluna/tabela é seguro; remover não é.
- **Nunca `DROP COLUMN` / `DROP TABLE` numa migração de correção.** Para
  descontinuar um campo: pare de escrevê-lo, mantenha-o no banco e remova-o
  apenas numa janela posterior, com backup dedicado.
- **Colunas novas nasçam nulas ou com `DEFAULT`**, para não invalidar linhas
  existentes.
- **Backfill em migração separada** da alteração de schema — assim o rollback de
  uma não obriga o rollback da outra.
- **Nunca apagar registro suspeito.** Use exclusão lógica (`cancelado = true`),
  preservando o histórico e permitindo reversão.
- **Idempotência**: a migração precisa poder rodar duas vezes sem quebrar (o
  entrypoint roda a cada boot).

## Exclusão de anexos

A remoção de um anexo apaga **apenas o vínculo** (`document`), preservando o
objeto no storage (R2). A `storageKey` é registrada no log de auditoria
(`document.unlink`), de modo que um anexo removido por engano pode ser
revinculado. Nenhum arquivo é destruído pela aplicação.
