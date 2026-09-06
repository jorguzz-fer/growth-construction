# MAPA DE INTERLIGAÇÕES

Como as telas do Growth Construction se ligam entre si através dos dados, em
`main` (commit `45f4ce3`). Inventário: tabelas e listas, sem opinião.

Tudo aqui foi extraído do código, não escrito à mão:

- **Leitura** — funções de `src/lib/queries.ts` que cada página importa, e as
  tabelas que cada função referencia (`schema.<tabela>`).
- **Escrita** — chamadas `.insert/.update/.delete(schema.<tabela>)` dentro de
  cada Server Action.
- **Propagação** — as chamadas `revalidatePath("...")` de cada action. É o
  vínculo mais direto entre telas: gravar numa tela invalida o cache de outra.

| | |
|---|---|
| Telas mapeadas | 48 |
| Funções distintas de `queries.ts` usadas por páginas | 45 |
| Arquivos de Server Actions importados por páginas | 30 |
| Componentes de `components/app/` na árvore das páginas | 59 |

---

## 1. Propagação de escrita — quem invalida quem

Cada linha é uma Server Action que grava e depois invalida o cache de uma ou
mais rotas. Quando a action invalida `/` com escopo `layout`, a aplicação
inteira é revalidada.

| Action | Arquivo | Grava em | Invalida |
|---|---|---|---|
| `changePassword` | `account.ts` | `user` | `/perfil` |
| `confirmMfa` | `account.ts` | `user` | `/` |
| `disableMfa` | `account.ts` | `user` | `/perfil` |
| `getOrCreateMfaSetup` | `account.ts` | `user` | — |
| `concluirAcerto` | `acerto.ts` | `acerto_item`, `acerto`, `cash_entry`, `despesa`, `acerto`, `despesa` | `/acerto`, `/caixa`, `/contaspagar`, `/dre`, `/fluxocaixa` |
| `estornarAcerto` | `acerto.ts` | `cash_entry`, `acerto`, `despesa` | `/acerto`, `/caixa`, `/contaspagar`, `/dre` |
| `ratearEntreObras` | `acerto.ts` | `acerto_item`, `acerto`, `cash_entry`, `despesa`, `rateio_obra`, `acerto` | `/acerto`, `/caixa`, `/despesas`, `/dre` |
| `importFromBudget` | `budget.ts` | `budget_line`, `budget_line` | — |
| `saveBudgetDespesaLinhas` | `budget.ts` | `budget_line`, `budget_line` | — |
| `saveBudgetLines` | `budget.ts` | `budget_line`, `budget_line` | — |
| `addCash` | `caixa.ts` | `cash_entry` | `/caixa` |
| `conciliarContaReceber` | `caixa.ts` | `cash_entry`, `conta_receber` | `/caixa`, `/contasreceber` |
| `conciliarDespesa` | `caixa.ts` | `cash_entry`, `despesa` | `/caixa`, `/contaspagar`, `/despesas` |
| `criarContaFromExtrato` | `caixa.ts` | `conta_receber`, `despesa`, `cash_entry` | `/caixa`, `/contaspagar`, `/contasreceber`, `/despesas` |
| `criarLancamentoDoExtrato` | `caixa.ts` | `cash_entry`, `conta_receber`, `despesa`, `cash_entry` | `/caixa`, `/contaspagar`, `/contasreceber`, `/despesas` |
| `desfazerConciliacao` | `caixa.ts` | `cash_entry`, `conta_receber`, `despesa` | `/caixa`, `/contaspagar`, `/contasreceber`, `/despesas` |
| `extractExtratoPdf` | `caixa.ts` | `document` | — |
| `importCash` | `caixa.ts` | `cash_entry`, `bank_account` | `/caixa`, `/contas` |
| `pairMovimento` | `caixa.ts` | `cash_entry` | — |
| `toggleConciliado` | `caixa.ts` | `cash_entry` | `/caixa` |
| `addCliente` | `clientes.ts` | `cliente` | `/clientes` |
| `deleteCliente` | `clientes.ts` | `cliente` | `/clientes` |
| `updateCliente` | `clientes.ts` | `cliente` | `/clientes` |
| `uploadClienteDoc` | `clientes.ts` | `document` | — |
| `cancelarContaReceber` | `contas-receber.ts` | `conta_receber` | `/contasreceber` |
| `createContaReceber` | `contas-receber.ts` | `conta_receber` | `/contasreceber` |
| `updateContaReceber` | `contas-receber.ts` | `conta_receber` | `/contasreceber` |
| `addConta` | `contas.ts` | `bank_account` | `/caixa`, `/contas` |
| `deleteConta` | `contas.ts` | `bank_account` | `/caixa`, `/contas` |
| `updateConta` | `contas.ts` | `bank_account` | `/caixa`, `/contas` |
| `setActiveProject` | `context.ts` | — | `/` |
| `setActiveVersion` | `context.ts` | — | `/` |
| `addBankAccount` | `despesas.ts` | `bank_account` | `/fornecedores` |
| `addDespesa` | `despesas.ts` | `despesa_parcela`, `despesa_terceiro`, `despesa`, `documento_fiscal`, `document` | `/despesas` |
| `addDespesaDocs` | `despesas.ts` | `document` | `/contaspagar`, `/despesas` |
| `addStakeholder` | `despesas.ts` | `document`, `stakeholder` | `/fornecedores` |
| `cancelarDespesa` | `despesas.ts` | `despesa` | `/caixa`, `/contaspagar`, `/despesas`, `/dre`, `/fluxocaixa` |
| `deleteDespesa` | `despesas.ts` | `despesa` | `/despesas` |
| `deleteDespesaDoc` | `despesas.ts` | `document` | `/contaspagar`, `/despesas` |
| `deleteStakeholder` | `despesas.ts` | `stakeholder` | `/fornecedores` |
| `pagarDespesa` | `despesas.ts` | `cash_entry`, `pagamento`, `despesa` | `/caixa`, `/contaspagar`, `/despesas`, `/dre`, `/fluxocaixa` |
| `setStakeholderAtivo` | `despesas.ts` | `stakeholder` | `/fornecedores` |
| `updateDespesa` | `despesas.ts` | `despesa` | `/despesas` |
| `updateStakeholder` | `despesas.ts` | `stakeholder` | `/fornecedores` |
| `uploadDespesaDoc` | `despesas.ts` | `document` | `/despesas` |
| `reclassificarDespesas` | `diagnostico.ts` | `despesa` | `/despesas`, `/diagnostico/categorias-invertidas`, `/dre` |
| `salvarDocumentoFiscal` | `documento-fiscal.ts` | `documento_fiscal`, `documento_fiscal` | `/despesas` |
| `renameTenant` | `empresa.ts` | `tenant` | `/` |
| `salvarDadosFiscais` | `empresa.ts` | `tenant` | `/empresa` |
| `uploadLogo` | `empresa.ts` | `tenant` | `/` |
| `addStockItem` | `estoque.ts` | `stock_item` | `/estoque` |
| `addStockMovement` | `estoque.ts` | `stock_movement` | `/estoque` |
| `deleteStockItem` | `estoque.ts` | `stock_item` | `/estoque` |
| `closeDia` | `fechamento.ts` | `carry_over`, `daily_closing` | `/balancodia`, `/fechamento` |
| `projectFutureIncc` | `incc.ts` | — | `/parametros` |
| `saveIncc` | `incc.ts` | `incc_rate` | `/parametros` |
| `updateInccMonth` | `incc.ts` | — | `/parametros` |
| `addMedicao` | `medicao.ts` | `medicao` | `/dre`, `/medicaolanc` |
| `deleteMedicao` | `medicao.ts` | `medicao` | `/dre`, `/medicaolanc` |
| `updateMedicao` | `medicao.ts` | `medicao` | `/dre`, `/medicaolanc` |
| `updateDespesaSequence` | `numeracao.ts` | `number_sequence` | `/despesas`, `/numeracao` |
| `registrarPagamento` | `pagamentos.ts` | `cash_entry`, `pagamento`, `despesa_parcela` | `/caixa`, `/despesas`, `/dre`, `/fluxocaixa` |
| `createForecastFromBudget` | `planning.ts` | `version` | `/forecast` |
| `duplicateForecast` | `planning.ts` | `version` | `/forecast` |
| `saveBudgetPlanning` | `planning.ts` | `budget_account`, `budget_line`, `budget_account`, `budget_line` | `/budget`, `/dre`, `/fluxocaixa`, `/forecast` |
| `setVersionStatus` | `planning.ts` | `version` | `/budget`, `/forecast` |
| `addChartGroup` | `planocontas.ts` | `chart_account` | `/planocontas` |
| `addChartItem` | `planocontas.ts` | `chart_account` | `/planocontas` |
| `deleteChartGroup` | `planocontas.ts` | `chart_account` | `/planocontas` |
| `deleteChartItem` | `planocontas.ts` | `chart_account` | `/planocontas` |
| `renameChartGroup` | `planocontas.ts` | `chart_account` | `/planocontas` |
| `setChartAccountAtivo` | `planocontas.ts` | `chart_account` | `/planocontas` |
| `updateChartItem` | `planocontas.ts` | `chart_account` | `/planocontas` |
| `gerarContaPagarPonto` | `ponto.ts` | `despesa`, `time_entry` | `/contaspagar`, `/despesas`, `/ponto` |
| `registrarPonto` | `ponto.ts` | `time_entry` | `/ponto` |
| `updateObraLocation` | `ponto.ts` | `project` | `/ponto` |
| `createProject` | `projects.ts` | `incc_rate`, `project`, `version` | `/` |
| `deleteProject` | `projects.ts` | `project` | `/` |
| `deleteProjetoDoc` | `projects.ts` | `document` | `/projeto` |
| `updateProject` | `projects.ts` | `project` | `/` |
| `uploadProjetoDoc` | `projects.ts` | `document` | `/projeto` |
| `registrarRecebimentoTerceiro` | `recebimento-terceiro.ts` | `recebimento_terceiro`, `conta_receber` | `/contasreceber`, `/restituicoes` |
| `registrarRepasse` | `recebimento-terceiro.ts` | `cash_entry`, `repasse`, `cash_entry`, `recebimento_terceiro` | `/caixa`, `/fluxocaixa`, `/restituicoes` |
| `addPermuta` | `receitas.ts` | `permuta` | `/caixa`, `/dre`, `/fluxocaixa`, `/permuta` |
| `addReembolso` | `receitas.ts` | `reembolso` | `/reembolso` |
| `compensarSaldos` | `restituicao-lote.ts` | `compensacao`, `despesa_terceiro`, `recebimento_terceiro` | `/restituicoes` |
| `confirmarRestituicaoLote` | `restituicao-lote.ts` | `cash_entry`, `restituicao_item`, `restituicao`, `despesa_terceiro` | `/caixa`, `/contaspagar`, `/fluxocaixa`, `/restituicoes` |
| `cancelarRestituicao` | `restituicoes.ts` | `restituicao`, `cash_entry`, `cash_entry`, `despesa_terceiro` | `/caixa`, `/restituicoes` |
| `criarDespesaTerceiro` | `restituicoes.ts` | `despesa_terceiro`, `despesa`, `despesa` | `/contaspagar`, `/dre`, `/restituicoes` |
| `registrarRestituicao` | `restituicoes.ts` | `cash_entry`, `restituicao`, `cash_entry`, `despesa_terceiro` | `/caixa`, `/contaspagar`, `/fluxocaixa`, `/restituicoes` |
| `createTenantAccount` | `tenants.ts` | — | `/plataforma` |
| `deleteUnit` | `units.ts` | `unit` | `/unidades` |
| `importUnits` | `units.ts` | `unit` | `/unidades` |
| `saveUnit` | `units.ts` | `unit`, `unit` | `/unidades` |
| `changeRole` | `users.ts` | `membership` | `/usuarios` |
| `removeMember` | `users.ts` | `membership` | `/usuarios` |
| `resetMemberPassword` | `users.ts` | `user` | `/usuarios` |
| `setMemberPermissions` | `users.ts` | `membership` | `/usuarios` |
| `updateMemberName` | `users.ts` | `user` | `/usuarios` |
| `importVersionData` | `version-io.ts` | `despesa`, `permuta`, `reembolso`, `unit`, `despesa`, `permuta`, `reembolso`, `unit`, `incc_rate` | `/` |
| `deleteVersion` | `versions.ts` | `version` | `/` |
| `duplicateVersion` | `versions.ts` | `cash_entry`, `despesa`, `permuta`, `reembolso`, `unit`, `version` | `/` |
| `setDefaultVersion` | `versions.ts` | `version` | `/` |
| `toggleVersionLock` | `versions.ts` | `version` | `/` |
| `updateVersion` | `versions.ts` | `version` | `/` |

Total: 105 actions que gravam e/ou invalidam.

### Índice inverso — o que invalida cada rota

| Rota invalidada | Nº | Actions |
|---|---|---|
| `/caixa` | 22 | `addCash` (caixa.ts), `addConta` (contas.ts), `addPermuta` (receitas.ts), `cancelarDespesa` (despesas.ts), `cancelarRestituicao` (restituicoes.ts), `conciliarContaReceber` (caixa.ts), `conciliarDespesa` (caixa.ts), `concluirAcerto` (acerto.ts), `confirmarRestituicaoLote` (restituicao-lote.ts), `criarContaFromExtrato` (caixa.ts), `criarLancamentoDoExtrato` (caixa.ts), `deleteConta` (contas.ts), `desfazerConciliacao` (caixa.ts), `estornarAcerto` (acerto.ts), `importCash` (caixa.ts), `pagarDespesa` (despesas.ts), `ratearEntreObras` (acerto.ts), `registrarPagamento` (pagamentos.ts), `registrarRepasse` (recebimento-terceiro.ts), `registrarRestituicao` (restituicoes.ts), `toggleConciliado` (caixa.ts), `updateConta` (contas.ts) |
| `/despesas` | 18 | `addDespesaDocs` (despesas.ts), `addDespesa` (despesas.ts), `cancelarDespesa` (despesas.ts), `conciliarDespesa` (caixa.ts), `criarContaFromExtrato` (caixa.ts), `criarLancamentoDoExtrato` (caixa.ts), `deleteDespesaDoc` (despesas.ts), `deleteDespesa` (despesas.ts), `desfazerConciliacao` (caixa.ts), `gerarContaPagarPonto` (ponto.ts), `pagarDespesa` (despesas.ts), `ratearEntreObras` (acerto.ts), `reclassificarDespesas` (diagnostico.ts), `registrarPagamento` (pagamentos.ts), `salvarDocumentoFiscal` (documento-fiscal.ts), `updateDespesaSequence` (numeracao.ts), `updateDespesa` (despesas.ts), `uploadDespesaDoc` (despesas.ts) |
| `/` | 14 | `confirmMfa` (account.ts), `createProject` (projects.ts), `deleteProject` (projects.ts), `deleteVersion` (versions.ts), `duplicateVersion` (versions.ts), `importVersionData` (version-io.ts), `renameTenant` (empresa.ts), `setActiveProject` (context.ts), `setActiveVersion` (context.ts), `setDefaultVersion` (versions.ts), `toggleVersionLock` (versions.ts), `updateProject` (projects.ts), `updateVersion` (versions.ts), `uploadLogo` (empresa.ts) |
| `/contaspagar` | 14 | `addDespesaDocs` (despesas.ts), `cancelarDespesa` (despesas.ts), `conciliarDespesa` (caixa.ts), `concluirAcerto` (acerto.ts), `confirmarRestituicaoLote` (restituicao-lote.ts), `criarContaFromExtrato` (caixa.ts), `criarDespesaTerceiro` (restituicoes.ts), `criarLancamentoDoExtrato` (caixa.ts), `deleteDespesaDoc` (despesas.ts), `desfazerConciliacao` (caixa.ts), `estornarAcerto` (acerto.ts), `gerarContaPagarPonto` (ponto.ts), `pagarDespesa` (despesas.ts), `registrarRestituicao` (restituicoes.ts) |
| `/dre` | 13 | `addMedicao` (medicao.ts), `addPermuta` (receitas.ts), `cancelarDespesa` (despesas.ts), `concluirAcerto` (acerto.ts), `criarDespesaTerceiro` (restituicoes.ts), `deleteMedicao` (medicao.ts), `estornarAcerto` (acerto.ts), `pagarDespesa` (despesas.ts), `ratearEntreObras` (acerto.ts), `reclassificarDespesas` (diagnostico.ts), `registrarPagamento` (pagamentos.ts), `saveBudgetPlanning` (planning.ts), `updateMedicao` (medicao.ts) |
| `/fluxocaixa` | 9 | `addPermuta` (receitas.ts), `cancelarDespesa` (despesas.ts), `concluirAcerto` (acerto.ts), `confirmarRestituicaoLote` (restituicao-lote.ts), `pagarDespesa` (despesas.ts), `registrarPagamento` (pagamentos.ts), `registrarRepasse` (recebimento-terceiro.ts), `registrarRestituicao` (restituicoes.ts), `saveBudgetPlanning` (planning.ts) |
| `/contasreceber` | 8 | `cancelarContaReceber` (contas-receber.ts), `conciliarContaReceber` (caixa.ts), `createContaReceber` (contas-receber.ts), `criarContaFromExtrato` (caixa.ts), `criarLancamentoDoExtrato` (caixa.ts), `desfazerConciliacao` (caixa.ts), `registrarRecebimentoTerceiro` (recebimento-terceiro.ts), `updateContaReceber` (contas-receber.ts) |
| `/planocontas` | 7 | `addChartGroup` (planocontas.ts), `addChartItem` (planocontas.ts), `deleteChartGroup` (planocontas.ts), `deleteChartItem` (planocontas.ts), `renameChartGroup` (planocontas.ts), `setChartAccountAtivo` (planocontas.ts), `updateChartItem` (planocontas.ts) |
| `/restituicoes` | 7 | `cancelarRestituicao` (restituicoes.ts), `compensarSaldos` (restituicao-lote.ts), `confirmarRestituicaoLote` (restituicao-lote.ts), `criarDespesaTerceiro` (restituicoes.ts), `registrarRecebimentoTerceiro` (recebimento-terceiro.ts), `registrarRepasse` (recebimento-terceiro.ts), `registrarRestituicao` (restituicoes.ts) |
| `/fornecedores` | 5 | `addBankAccount` (despesas.ts), `addStakeholder` (despesas.ts), `deleteStakeholder` (despesas.ts), `setStakeholderAtivo` (despesas.ts), `updateStakeholder` (despesas.ts) |
| `/usuarios` | 5 | `changeRole` (users.ts), `removeMember` (users.ts), `resetMemberPassword` (users.ts), `setMemberPermissions` (users.ts), `updateMemberName` (users.ts) |
| `/contas` | 4 | `addConta` (contas.ts), `deleteConta` (contas.ts), `importCash` (caixa.ts), `updateConta` (contas.ts) |
| `/forecast` | 4 | `createForecastFromBudget` (planning.ts), `duplicateForecast` (planning.ts), `saveBudgetPlanning` (planning.ts), `setVersionStatus` (planning.ts) |
| `/acerto` | 3 | `concluirAcerto` (acerto.ts), `estornarAcerto` (acerto.ts), `ratearEntreObras` (acerto.ts) |
| `/clientes` | 3 | `addCliente` (clientes.ts), `deleteCliente` (clientes.ts), `updateCliente` (clientes.ts) |
| `/estoque` | 3 | `addStockItem` (estoque.ts), `addStockMovement` (estoque.ts), `deleteStockItem` (estoque.ts) |
| `/medicaolanc` | 3 | `addMedicao` (medicao.ts), `deleteMedicao` (medicao.ts), `updateMedicao` (medicao.ts) |
| `/parametros` | 3 | `projectFutureIncc` (incc.ts), `saveIncc` (incc.ts), `updateInccMonth` (incc.ts) |
| `/ponto` | 3 | `gerarContaPagarPonto` (ponto.ts), `registrarPonto` (ponto.ts), `updateObraLocation` (ponto.ts) |
| `/unidades` | 3 | `deleteUnit` (units.ts), `importUnits` (units.ts), `saveUnit` (units.ts) |
| `/budget` | 2 | `saveBudgetPlanning` (planning.ts), `setVersionStatus` (planning.ts) |
| `/perfil` | 2 | `changePassword` (account.ts), `disableMfa` (account.ts) |
| `/projeto` | 2 | `deleteProjetoDoc` (projects.ts), `uploadProjetoDoc` (projects.ts) |
| `/balancodia` | 1 | `closeDia` (fechamento.ts) |
| `/diagnostico/categorias-invertidas` | 1 | `reclassificarDespesas` (diagnostico.ts) |
| `/empresa` | 1 | `salvarDadosFiscais` (empresa.ts) |
| `/fechamento` | 1 | `closeDia` (fechamento.ts) |
| `/numeracao` | 1 | `updateDespesaSequence` (numeracao.ts) |
| `/permuta` | 1 | `addPermuta` (receitas.ts) |
| `/plataforma` | 1 | `createTenantAccount` (tenants.ts) |
| `/reembolso` | 1 | `addReembolso` (receitas.ts) |

---

## 2. Leitura — o que cada tela consulta

| Tela | Funções de `queries.ts` | Tabelas alcançadas |
|---|---|---|
| `/acerto` | `getBankAccounts`, `getChartAccounts`, `getStakeholders` | `bank_account`, `chart_account`, `stakeholder` |
| `/acessos` | `getMembers` | `membership`, `user` |
| `/acoes` | `getAuditLog`, `getMembers` | `audit_log`, `membership`, `user` |
| `/balancodia` | `getDailyClosings` | `cliente`, `daily_closing`, `project`, `stock_item`, `stock_movement` |
| `/budget` | `getBudgetPlanning` | `budget_account`, `budget_line`, `project`, `version` |
| `/caixa` | `getBankAccounts`, `getCash`, `getConciliacaoData`, `getInccRows`, `getPermutas`, `getReembolsos`, `getUnits` | `bank_account`, `cash_entry`, `incc_rate`, `permuta`, `reembolso`, `unit` |
| `/clientes` | `getClientes` | `cliente`, `medicao` |
| `/clientes/[id]` | `getUnitCodesByTenant` | `unit` |
| `/clientes/novo` | `getUnitCodesByTenant` | `unit` |
| `/consolidado` | `getInccRows`, `getRevenueBySource` | `budget_line`, `incc_rate` |
| `/contabilidade` | `getDespesas`, `getMembers`, `getMonthlyRevenue` | `budget_line`, `conta_receber`, `despesa`, `membership`, `user` |
| `/contas` | `getBankAccounts` | `bank_account` |
| `/contaspagar` | `getContasPagar` | `cliente`, `despesa`, `project`, `stakeholder`, `version` |
| `/contasreceber` | `getBankAccounts`, `getClientes`, `getContasReceber`, `getReceivables`, `getUnitCodesByTenant` | `bank_account`, `cliente`, `conta_receber`, `daily_closing`, `medicao`, `project`, `unit`, `version` |
| `/dashboard` | `getContasPagar`, `getIndicadoresObra`, `getIndicadoresObraConsolidado`, `getMonthlyRevenue`, `getReceivables`, `getStatusProjeto`, `getUnits`, `getVersionsDoProjeto` | `budget_line`, `cash_entry`, `cliente`, `conta_receber`, `daily_closing`, `despesa`, `medicao_servico`, `project`, `servico`, `stakeholder`, `unit`, `version` |
| `/despesas` | `getAtualVersion`, `getBankAccounts`, `getChartAccounts`, `getDespesaNoTenant`, `getDespesas`, `getDespesasByTenant`, `getDocsFiscaisPorDespesa`, `getDocuments`, `getDocumentsByDespesa`, `getParcelasByVersion`, `getRepositorio`, `getSocios`, `getStakeholders` | `bank_account`, `cash_entry`, `chart_account`, `despesa`, `despesa_parcela`, `document`, `documento_fiscal`, `project`, `stakeholder`, `version` |
| `/dre` | `getExpenseRows`, `getInccRows`, `getMonthlyRevenue`, `getPermutas` | `budget_line`, `conta_receber`, `despesa_parcela`, `incc_rate`, `permuta` |
| `/estoque` | `getDespesaOptions`, `getPermutaOptions`, `getStockItems`, `getStockMovements` | `budget_line`, `cliente`, `despesa`, `permuta`, `project`, `stakeholder`, `stock_item`, `stock_movement` |
| `/fechamento` | `getBankAccounts`, `getCashByTenant`, `getContasPagar`, `getReceivables` | `bank_account`, `cash_entry`, `cliente`, `daily_closing`, `despesa`, `project`, `stakeholder`, `unit`, `version` |
| `/fluxocaixa` | `getBankAccounts`, `getInccRows`, `getVersionsDoProjeto` | `bank_account`, `incc_rate`, `version` |
| `/forecast` | `getBudgetPlanning`, `getForecastComparison`, `getProjectVersionsByKind` | `budget_account`, `budget_line`, `project`, `version` |
| `/fornecedores` | `getStakeholders` | `stakeholder` |
| `/medicao` | `getBudgetLines`, `getMedicoes` | `budget_line`, `medicao` |
| `/medicaolanc` | `getAtualVersion`, `getChartAccounts`, `getMedicoes` | `chart_account`, `medicao`, `version` |
| `/parametros` | `getInccRows` | `incc_rate` |
| `/permuta` | `getPermutas` | `permuta` |
| `/permuta/novo` | `getClientes`, `getUnits` | `cliente`, `medicao`, `unit` |
| `/planocontas` | `getChartAccounts` | `chart_account` |
| `/projecao` | `getInccRows`, `getMonthlyRevenue`, `getReembolsos`, `getRevenueBySource`, `getUnits` | `budget_line`, `conta_receber`, `incc_rate`, `reembolso`, `unit` |
| `/projeto` | `getClientes`, `getDocuments` | `cliente`, `document`, `medicao` |
| `/reembolso` | `getReembolsos` | `reembolso` |
| `/restituicoes` | `getBankAccounts`, `getChartAccounts`, `getStakeholders` | `bank_account`, `chart_account`, `stakeholder` |
| `/resumo` | `getMonthlyRevenue`, `getPermutas`, `getReembolsos`, `getUnits` | `budget_line`, `conta_receber`, `permuta`, `reembolso`, `unit` |
| `/simulador` | `getInccRows` | `incc_rate` |
| `/unidades` | `getAtualVersion`, `getUnits` | `unit`, `version` |
| `/unidades/[id]` | `getUnitWithProject` | `unit`, `version` |
| `/usuarios` | `getMembers` | `membership`, `user` |

Telas que não importam nada de `queries.ts` (11): `/backup`, `/diagnostico/categorias-invertidas`, `/diagnostico/planos-recebiveis`, `/diagnosticoia`, `/empresa`, `/numeracao`, `/perfil`, `/ponto`, `/reembolso/novo`, `/unidades/nova`, `/versao`.

---

## 3. Índice por tabela — quem lê e quem grava

A coluna **telas que leem** cobre apenas o que passa por `src/lib/queries.ts`.
Várias tabelas são lidas por funções que vivem dentro dos próprios arquivos de
Server Actions — `getAcertos` em `actions/acerto.ts`, `getDespesaTerceiros` em
`actions/restituicoes.ts`, `getRepositorio` chamado por action, e assim por
diante. Por isso tabelas como `acerto`, `acerto_item` e `compensacao` aparecem
com `—` na leitura mesmo sendo exibidas em tela.

| Tabela | Telas que leem | Actions que gravam |
|---|---|---|
| `acerto` | — | `concluirAcerto` (insert), `concluirAcerto` (update), `estornarAcerto` (update), `ratearEntreObras` (insert), `ratearEntreObras` (update) |
| `acerto_item` | — | `concluirAcerto` (insert), `ratearEntreObras` (insert) |
| `audit_log` | `/acoes` | — |
| `bank_account` | `/acerto`, `/caixa`, `/contas`, `/contasreceber`, `/despesas`, `/fechamento`, `/fluxocaixa`, `/restituicoes` | `addBankAccount` (insert), `addConta` (insert), `deleteConta` (delete), `importCash` (update), `updateConta` (update) |
| `budget_account` | `/budget`, `/forecast` | `saveBudgetPlanning` (delete), `saveBudgetPlanning` (insert) |
| `budget_line` | `/budget`, `/consolidado`, `/contabilidade`, `/dashboard`, `/dre`, `/estoque`, `/forecast`, `/medicao`, `/projecao`, `/resumo` | `importFromBudget` (delete), `importFromBudget` (insert), `saveBudgetDespesaLinhas` (delete), `saveBudgetDespesaLinhas` (insert), `saveBudgetLines` (delete), `saveBudgetLines` (insert), `saveBudgetPlanning` (delete), `saveBudgetPlanning` (insert) |
| `carry_over` | — | `closeDia` (insert) |
| `cash_entry` | `/caixa`, `/dashboard`, `/despesas`, `/fechamento` | `addCash` (insert), `cancelarRestituicao` (insert), `cancelarRestituicao` (update), `conciliarContaReceber` (update), `conciliarDespesa` (update), `concluirAcerto` (insert), `confirmarRestituicaoLote` (insert), `criarContaFromExtrato` (update), `criarLancamentoDoExtrato` (insert), `criarLancamentoDoExtrato` (update), `desfazerConciliacao` (update), `duplicateVersion` (insert), `estornarAcerto` (insert), `importCash` (insert), `pagarDespesa` (insert), `pairMovimento` (insert), `ratearEntreObras` (insert), `registrarPagamento` (insert), `registrarRepasse` (insert), `registrarRepasse` (update), `registrarRestituicao` (insert), `registrarRestituicao` (update), `toggleConciliado` (update) |
| `chart_account` | `/acerto`, `/despesas`, `/medicaolanc`, `/planocontas`, `/restituicoes` | `addChartGroup` (insert), `addChartItem` (insert), `deleteChartGroup` (delete), `deleteChartItem` (delete), `renameChartGroup` (update), `setChartAccountAtivo` (update), `updateChartItem` (update) |
| `cliente` | `/balancodia`, `/clientes`, `/contaspagar`, `/contasreceber`, `/dashboard`, `/estoque`, `/fechamento`, `/permuta/novo`, `/projeto` | `addCliente` (insert), `deleteCliente` (delete), `updateCliente` (update) |
| `compensacao` | — | `compensarSaldos` (insert) |
| `conta_receber` | `/contabilidade`, `/contasreceber`, `/dashboard`, `/dre`, `/projecao`, `/resumo` | `cancelarContaReceber` (update), `conciliarContaReceber` (update), `createContaReceber` (insert), `criarContaFromExtrato` (insert), `criarLancamentoDoExtrato` (insert), `desfazerConciliacao` (update), `registrarRecebimentoTerceiro` (update), `updateContaReceber` (update) |
| `daily_closing` | `/balancodia`, `/contasreceber`, `/dashboard`, `/fechamento` | `closeDia` (insert) |
| `despesa` | `/contabilidade`, `/contaspagar`, `/dashboard`, `/despesas`, `/estoque`, `/fechamento` | `addDespesa` (insert), `cancelarDespesa` (update), `conciliarDespesa` (update), `concluirAcerto` (insert), `concluirAcerto` (update), `criarContaFromExtrato` (insert), `criarDespesaTerceiro` (insert), `criarDespesaTerceiro` (update), `criarLancamentoDoExtrato` (insert), `deleteDespesa` (delete), `desfazerConciliacao` (update), `duplicateVersion` (insert), `estornarAcerto` (update), `gerarContaPagarPonto` (insert), `importVersionData` (delete), `importVersionData` (insert), `pagarDespesa` (update), `ratearEntreObras` (insert), `reclassificarDespesas` (update), `updateDespesa` (update) |
| `despesa_parcela` | `/despesas`, `/dre` | `addDespesa` (insert), `registrarPagamento` (update) |
| `despesa_terceiro` | — | `addDespesa` (insert), `cancelarRestituicao` (update), `compensarSaldos` (update), `confirmarRestituicaoLote` (update), `criarDespesaTerceiro` (insert), `registrarRestituicao` (update) |
| `document` | `/despesas`, `/projeto` | `addDespesaDocs` (insert), `addDespesa` (insert), `addStakeholder` (insert), `deleteDespesaDoc` (delete), `deleteProjetoDoc` (delete), `extractExtratoPdf` (insert), `uploadClienteDoc` (insert), `uploadDespesaDoc` (insert), `uploadProjetoDoc` (insert) |
| `documento_fiscal` | `/despesas` | `addDespesa` (insert), `salvarDocumentoFiscal` (insert), `salvarDocumentoFiscal` (update) |
| `incc_rate` | `/caixa`, `/consolidado`, `/dre`, `/fluxocaixa`, `/parametros`, `/projecao`, `/simulador` | `createProject` (insert), `importVersionData` (update), `saveIncc` (update) |
| `medicao` | `/clientes`, `/contasreceber`, `/medicao`, `/medicaolanc`, `/permuta/novo`, `/projeto` | `addMedicao` (insert), `deleteMedicao` (delete), `updateMedicao` (update) |
| `medicao_servico` | `/dashboard` | — |
| `membership` | `/acessos`, `/acoes`, `/contabilidade`, `/usuarios` | `changeRole` (update), `removeMember` (delete), `setMemberPermissions` (update) |
| `number_sequence` | — | `updateDespesaSequence` (insert) |
| `pagamento` | — | `pagarDespesa` (insert), `registrarPagamento` (insert) |
| `permuta` | `/caixa`, `/dre`, `/estoque`, `/permuta`, `/resumo` | `addPermuta` (insert), `duplicateVersion` (insert), `importVersionData` (delete), `importVersionData` (insert) |
| `project` | `/balancodia`, `/budget`, `/contaspagar`, `/contasreceber`, `/dashboard`, `/despesas`, `/estoque`, `/fechamento`, `/forecast` | `createProject` (insert), `deleteProject` (delete), `updateObraLocation` (update), `updateProject` (update) |
| `rateio_obra` | — | `ratearEntreObras` (insert) |
| `recebimento_terceiro` | — | `compensarSaldos` (update), `registrarRecebimentoTerceiro` (insert), `registrarRepasse` (update) |
| `reembolso` | `/caixa`, `/projecao`, `/reembolso`, `/resumo` | `addReembolso` (insert), `duplicateVersion` (insert), `importVersionData` (delete), `importVersionData` (insert) |
| `repasse` | — | `registrarRepasse` (insert) |
| `restituicao` | — | `cancelarRestituicao` (delete), `confirmarRestituicaoLote` (insert), `registrarRestituicao` (insert) |
| `restituicao_item` | — | `confirmarRestituicaoLote` (insert) |
| `servico` | `/dashboard` | — |
| `stakeholder` | `/acerto`, `/contaspagar`, `/dashboard`, `/despesas`, `/estoque`, `/fechamento`, `/fornecedores`, `/restituicoes` | `addStakeholder` (insert), `deleteStakeholder` (delete), `setStakeholderAtivo` (update), `updateStakeholder` (update) |
| `stock_item` | `/balancodia`, `/estoque` | `addStockItem` (insert), `deleteStockItem` (delete) |
| `stock_movement` | `/balancodia`, `/estoque` | `addStockMovement` (insert) |
| `tenant` | — | `renameTenant` (update), `salvarDadosFiscais` (update), `uploadLogo` (update) |
| `time_entry` | — | `gerarContaPagarPonto` (update), `registrarPonto` (insert) |
| `unit` | `/caixa`, `/clientes/[id]`, `/clientes/novo`, `/contasreceber`, `/dashboard`, `/fechamento`, `/permuta/novo`, `/projecao`, `/resumo`, `/unidades`, `/unidades/[id]` | `deleteUnit` (delete), `duplicateVersion` (insert), `importUnits` (insert), `importVersionData` (delete), `importVersionData` (insert), `saveUnit` (insert), `saveUnit` (update) |
| `user` | `/acessos`, `/acoes`, `/contabilidade`, `/usuarios` | `changePassword` (update), `confirmMfa` (update), `disableMfa` (update), `getOrCreateMfaSetup` (update), `resetMemberPassword` (update), `updateMemberName` (update) |
| `version` | `/budget`, `/contaspagar`, `/contasreceber`, `/dashboard`, `/despesas`, `/fechamento`, `/fluxocaixa`, `/forecast`, `/medicaolanc`, `/unidades`, `/unidades/[id]` | `createForecastFromBudget` (insert), `createProject` (insert), `deleteVersion` (delete), `duplicateForecast` (insert), `duplicateVersion` (insert), `setDefaultVersion` (update), `setVersionStatus` (update), `toggleVersionLock` (update), `updateVersion` (update) |

---

## 4. Componentes usados por mais de uma tela

| Componente | Nº de telas | Telas |
|---|---|---|
| `page-header.tsx` | 48 | `/acerto`, `/acessos`, `/acoes`, `/backup`, `/balancodia`, `/budget`, `/caixa`, `/clientes`, `/clientes/[id]`, `/clientes/novo`, `/consolidado`, `/contabilidade`, `/contas`, `/contaspagar`, `/contasreceber`, `/dashboard`, `/despesas`, `/diagnostico/categorias-invertidas`, `/diagnostico/planos-recebiveis`, `/diagnosticoia`, `/dre`, `/empresa`, `/estoque`, `/fechamento`, `/fluxocaixa`, `/forecast`, `/fornecedores`, `/medicao`, `/medicaolanc`, `/numeracao`, `/parametros`, `/perfil`, `/permuta`, `/permuta/novo`, `/planocontas`, `/ponto`, `/projecao`, `/projeto`, `/reembolso`, `/reembolso/novo`, `/restituicoes`, `/resumo`, `/simulador`, `/unidades`, `/unidades/[id]`, `/unidades/nova`, `/usuarios`, `/versao` |
| `access-denied.tsx` | 14 | `/acerto`, `/balancodia`, `/budget`, `/contaspagar`, `/contasreceber`, `/diagnostico/categorias-invertidas`, `/diagnostico/planos-recebiveis`, `/estoque`, `/fechamento`, `/forecast`, `/numeracao`, `/ponto`, `/projeto`, `/restituicoes` |
| `date-range-filter.tsx` | 7 | `/caixa`, `/consolidado`, `/dashboard`, `/fluxocaixa`, `/medicao`, `/projecao`, `/resumo` |
| `project-picker.tsx` | 7 | `/contasreceber`, `/dashboard`, `/despesas`, `/fluxocaixa`, `/medicaolanc`, `/projeto`, `/unidades` |
| `version-multiselect.tsx` | 7 | `/caixa`, `/consolidado`, `/dashboard`, `/dre`, `/fluxocaixa`, `/projecao`, `/resumo` |
| `version-compare.tsx` | 4 | `/caixa`, `/consolidado`, `/projecao`, `/resumo` |
| `budget-planning-screen.tsx` | 2 | `/budget`, `/forecast` |
| `cliente-fields.tsx` | 2 | `/clientes/[id]`, `/clientes/novo` |
| `projecao-controls.tsx` | 2 | `/fluxocaixa`, `/projecao` |
| `sortable-th.tsx` | 2 | `/contaspagar`, `/contasreceber` |
| `unit-form.tsx` | 2 | `/unidades/[id]`, `/unidades/nova` |

Componentes usados por uma única tela (48): `access-matrix.tsx`, `acerto-manager.tsx`, `ai-diagnostic-panel.tsx`, `balanco-dia-table.tsx`, `budget-forecast-compare.tsx`, `caixa-entry-form.tsx`, `charts.tsx`, `conciliacao-review.tsx`, `conciliar-toggle.tsx`, `consolidado-controls.tsx`, `conta-corrente-terceiros.tsx`, `contas-manager.tsx`, `contas-pagar-table.tsx`, `contas-receber-manager.tsx`, `despesa-form.tsx`, `despesa-search.tsx`, `despesas-table.tsx`, `diagnostico-categorias.tsx`, `dre-controls.tsx`, `estoque-manager.tsx`, `fechamento-panel.tsx`, `fornecedor-form.tsx`, `fornecedores-table.tsx`, `import-extrato.tsx`, `import-version.tsx`, `incc-editor.tsx`, `indicadores-obra.tsx`, `medicao-manager.tsx`, `member-actions.tsx`, `mfa-setup.tsx`, `numeracao-form.tsx`, `parcelas-editor.tsx`, `parcelas-list.tsx`, `planocontas-manager.tsx`, `ponto-manager.tsx`, `print-button.tsx`, `project-manager.tsx`, `projeto-docs.tsx`, `r2-healthcheck.tsx`, `receita-search.tsx`, `repositorio-table.tsx`, `restituicao-lote.tsx`, `restituicoes-manager.tsx`, `role-select.tsx`, `simulator-form.tsx`, `unidades-import-export.tsx`, `unit-actions.tsx`, `version-identity.tsx`.

---

## 5. Escrita — o que cada tela dispara

| Tela | Server Actions importadas na árvore da página |
|---|---|
| `/acerto` | **acerto.ts** — `concluirAcerto`, `estornarAcerto`, `getAcertos`, `getDespesasAbativeis`, `ratearEntreObras` |
| `/acessos` | **users.ts** — `setMemberPermissions` |
| `/budget` | **planning.ts** — `createForecastFromBudget`, `duplicateForecast`, `saveBudgetPlanning`, `setVersionStatus` |
| `/caixa` | **caixa.ts** — `addCash`, `conciliarContaReceber`, `conciliarDespesa`, `criarContaFromExtrato`, `criarLancamentoDoExtrato`, `desfazerConciliacao`, `extractExtratoPdf`, `importCash`, `matchCandidatosMovimento`, `pairMovimento`, `toggleConciliado` |
| `/clientes/[id]` | **clientes.ts** — `deleteCliente`, `updateCliente`, `uploadClienteDoc` |
| `/clientes/novo` | **clientes.ts** — `addCliente` |
| `/contabilidade` | **users.ts** — `inviteContador` |
| `/contas` | **contas.ts** — `addConta`, `deleteConta`, `updateConta` |
| `/contaspagar` | **restituicoes.ts** — `getObrigacoesTerceiroPendentes` |
| `/contasreceber` | **contas-receber.ts** — `cancelarContaReceber`, `createContaReceber`, `updateContaReceber` |
| `/despesas` | **despesas.ts** — `addDespesa`, `addDespesaDocs`, `cancelarDespesa`, `deleteDespesa`, `deleteDespesaDoc`, `extractDespesaFromDoc`, `pagarDespesa`, `updateDespesa`, `uploadDespesaDoc`; **documento-fiscal.ts** — `buscarDocumentoDuplicado`, `getDocumentosFiscais`, `salvarDocumentoFiscal`; **pagamentos.ts** — `registrarPagamento` |
| `/diagnostico/categorias-invertidas` | **diagnostico.ts** — `getDespesasSuspeitas`, `reclassificarDespesas` |
| `/diagnostico/planos-recebiveis` | **diagnostico.ts** — `getPlanosSuspeitos` |
| `/diagnosticoia` | **ai.ts** — `testAiConnection` |
| `/dre` | **pagamentos.ts** — `getEncargosByVersion` |
| `/empresa` | **empresa.ts** — `renameTenant`, `salvarDadosFiscais`, `uploadLogo` |
| `/estoque` | **estoque.ts** — `addStockItem`, `addStockMovement`, `deleteStockItem` |
| `/fechamento` | **fechamento.ts** — `closeDia` |
| `/forecast` | **planning.ts** — `createForecastFromBudget`, `duplicateForecast`, `saveBudgetPlanning`, `setVersionStatus` |
| `/fornecedores` | **despesas.ts** — `addStakeholder`, `deleteStakeholder`, `extractFornecedorFromDoc`, `setStakeholderAtivo`, `updateStakeholder` |
| `/medicaolanc` | **medicao.ts** — `addMedicao`, `deleteMedicao`, `updateMedicao` |
| `/numeracao` | **numeracao.ts** — `getDespesaSequence`, `updateDespesaSequence` |
| `/parametros` | **incc.ts** — `projectFutureIncc`, `updateInccMonth` |
| `/perfil` | **account.ts** — `changePassword`, `disableMfa` |
| `/permuta/novo` | **receitas.ts** — `addPermuta` |
| `/planocontas` | **planocontas.ts** — `addChartGroup`, `addChartItem`, `deleteChartGroup`, `deleteChartItem`, `renameChartGroup`, `setChartAccountAtivo`, `updateChartItem` |
| `/ponto` | **ponto.ts** — `gerarContaPagarPonto`, `registrarPonto`, `updateObraLocation` |
| `/projeto` | **context.ts** — `setActiveProject`; **projects.ts** — `createProject`, `deleteProject`, `deleteProjetoDoc`, `updateProject`, `uploadProjetoDoc` |
| `/reembolso/novo` | **receitas.ts** — `addReembolso` |
| `/restituicoes` | **recebimento-terceiro.ts** — `getSaldosConsolidadosTerceiros`; **restituicao-lote.ts** — `compensarSaldos`, `confirmarRestituicaoLote`, `previewRestituicaoLote`; **restituicoes.ts** — `buscarDespesasPorPed`, `criarDespesaTerceiro`, `getContaCorrenteTerceiros`, `getDespesaTerceiros`, `registrarRestituicao` |
| `/unidades` | **units.ts** — `deleteUnit`, `importUnits` |
| `/unidades/[id]` | **units.ts** — `deleteUnit`, `saveUnit` |
| `/unidades/nova` | **units.ts** — `deleteUnit`, `saveUnit` |
| `/usuarios` | **users.ts** — `changeRole`, `inviteMember`, `removeMember`, `resetMemberPassword`, `updateMemberName` |
| `/versao` | **version-io.ts** — `importVersionData`; **versions.ts** — `deleteVersion`, `setDefaultVersion`, `toggleVersionLock`, `updateVersion` |

Telas somente-leitura, sem nenhuma Server Action na árvore (13): `/acoes`, `/backup`, `/balancodia`, `/clientes`, `/consolidado`, `/dashboard`, `/fluxocaixa`, `/medicao`, `/permuta`, `/projecao`, `/reembolso`, `/resumo`, `/simulador`.

---

## 6. Rótulos de auditoria por action

Valor do campo `action` passado a `logAudit`. É por ele que a tela
`/acoes` (Log de Auditoria) identifica cada evento.

| Rótulo | Action | Arquivo |
|---|---|---|
| `acerto.create` | `concluirAcerto` | `acerto.ts` |
| `acerto.estorno` | `estornarAcerto` | `acerto.ts` |
| `acerto.rateio` | `ratearEntreObras` | `acerto.ts` |
| `budget.import` | `importBudgetXlsx` | `budget.ts` |
| `budget.importFromBudget` | `importFromBudget` | `budget.ts` |
| `budget.planning.save` | `saveBudgetPlanning` | `planning.ts` |
| `budget.replicateFromAtual` | `replicateFromAtual` | `budget.ts` |
| `budget.save` | `saveBudgetLines` | `budget.ts` |
| `budget.saveDespesaLinhas` | `saveBudgetDespesaLinhas` | `budget.ts` |
| `budget.saveReceita` | `saveBudgetReceita` | `budget.ts` |
| `caixa.fechamento` | `closeDia` | `fechamento.ts` |
| `cash.adjust` | `addCash` | `caixa.ts` |
| `cash.create` | `addCash` | `caixa.ts` |
| `cash.import` | `importCash` | `caixa.ts` |
| `chart.group.create` | `addChartGroup` | `planocontas.ts` |
| `chart.group.delete` | `deleteChartGroup` | `planocontas.ts` |
| `chart.group.update` | `renameChartGroup` | `planocontas.ts` |
| `chart.item.activate` | `setChartAccountAtivo` | `planocontas.ts` |
| `chart.item.create` | `addChartItem` | `planocontas.ts` |
| `chart.item.deactivate` | `setChartAccountAtivo` | `planocontas.ts` |
| `chart.item.delete` | `deleteChartItem` | `planocontas.ts` |
| `chart.item.update` | `updateChartItem` | `planocontas.ts` |
| `cliente.create` | `addCliente` | `clientes.ts` |
| `cliente.delete` | `deleteCliente` | `clientes.ts` |
| `cliente.doc.upload` | `uploadClienteDoc` | `clientes.ts` |
| `cliente.update` | `updateCliente` | `clientes.ts` |
| `compensacao.create` | `compensarSaldos` | `restituicao-lote.ts` |
| `conciliacao.create` | `conciliarDespesa` | `caixa.ts` |
| `conciliacao.receber` | `conciliarContaReceber` | `caixa.ts` |
| `conciliacao.undo` | `desfazerConciliacao` | `caixa.ts` |
| `conta.create` | `addConta` | `contas.ts` |
| `conta.delete` | `deleteConta` | `contas.ts` |
| `conta.update` | `updateConta` | `contas.ts` |
| `contaReceber.cancel` | `cancelarContaReceber` | `contas-receber.ts` |
| `contaReceber.create` | `createContaReceber` | `contas-receber.ts` |
| `contaReceber.update` | `updateContaReceber` | `contas-receber.ts` |
| `despesa.cancel` | `cancelarDespesa` | `despesas.ts` |
| `despesa.create` | `addDespesa` | `despesas.ts` |
| `despesa.delete` | `deleteDespesa` | `despesas.ts` |
| `despesa.pagaPorSocio` | `addDespesa` | `despesas.ts` |
| `despesa.pay` | `pagarDespesa` | `despesas.ts` |
| `despesa.reclassificar` | `reclassificarDespesas` | `diagnostico.ts` |
| `despesa.recorrente` | `addDespesa` | `despesas.ts` |
| `despesa.update` | `updateDespesa` | `despesas.ts` |
| `despesaTerceiro.create` | `criarDespesaTerceiro` | `restituicoes.ts` |
| `document.unlink` | `deleteDespesaDoc` | `despesas.ts` |
| `document.upload` | `addDespesaDocs` | `despesas.ts` |
| `document.upload` | `uploadDespesaDoc` | `despesas.ts` |
| `documentoFiscal.create` | `salvarDocumentoFiscal` | `documento-fiscal.ts` |
| `documentoFiscal.update` | `salvarDocumentoFiscal` | `documento-fiscal.ts` |
| `estoque.item.create` | `addStockItem` | `estoque.ts` |
| `estoque.mov.create` | `addStockMovement` | `estoque.ts` |
| `extrato.criarContaPagar` | `criarContaFromExtrato` | `caixa.ts` |
| `extrato.criarContaReceber` | `criarContaFromExtrato` | `caixa.ts` |
| `extrato.criarContaReceberConciliada` | `criarLancamentoDoExtrato` | `caixa.ts` |
| `extrato.criarDespesaConciliada` | `criarLancamentoDoExtrato` | `caixa.ts` |
| `extrato.readPdf` | `extractExtratoPdf` | `caixa.ts` |
| `forecast.createFromBudget` | `createForecastFromBudget` | `planning.ts` |
| `forecast.duplicate` | `duplicateForecast` | `planning.ts` |
| `incc.project` | `projectFutureIncc` | `incc.ts` |
| `incc.update` | `updateInccMonth` | `incc.ts` |
| `medicao.create` | `addMedicao` | `medicao.ts` |
| `medicao.delete` | `deleteMedicao` | `medicao.ts` |
| `medicao.update` | `updateMedicao` | `medicao.ts` |
| `membership.permissions` | `setMemberPermissions` | `users.ts` |
| `membership.remove` | `removeMember` | `users.ts` |
| `membership.role` | `changeRole` | `users.ts` |
| `numeracao.update` | `updateDespesaSequence` | `numeracao.ts` |
| `obra.location.update` | `updateObraLocation` | `ponto.ts` |
| `pagamento.create` | `registrarPagamento` | `pagamentos.ts` |
| `ponto.gerar_conta` | `gerarContaPagarPonto` | `ponto.ts` |
| `ponto.registrar` | `registrarPonto` | `ponto.ts` |
| `project.create` | `createProject` | `projects.ts` |
| `project.delete` | `deleteProject` | `projects.ts` |
| `project.update` | `updateProject` | `projects.ts` |
| `projeto.doc.delete` | `deleteProjetoDoc` | `projects.ts` |
| `projeto.doc.upload` | `uploadProjetoDoc` | `projects.ts` |
| `recebimentoTerceiro.create` | `registrarRecebimentoTerceiro` | `recebimento-terceiro.ts` |
| `repasse.create` | `registrarRepasse` | `recebimento-terceiro.ts` |
| `restituicao.cancel` | `cancelarRestituicao` | `restituicoes.ts` |
| `restituicao.create` | `registrarRestituicao` | `restituicoes.ts` |
| `restituicao.lote` | `confirmarRestituicaoLote` | `restituicao-lote.ts` |
| `stakeholder.create` | `addStakeholder` | `despesas.ts` |
| `stakeholder.deactivate` | `setStakeholderAtivo` | `despesas.ts` |
| `stakeholder.delete` | `deleteStakeholder` | `despesas.ts` |
| `stakeholder.reactivate` | `setStakeholderAtivo` | `despesas.ts` |
| `stakeholder.update` | `updateStakeholder` | `despesas.ts` |
| `tenant.create` | `createTenantAccount` | `tenants.ts` |
| `tenant.fiscal` | `salvarDadosFiscais` | `empresa.ts` |
| `tenant.logo` | `uploadLogo` | `empresa.ts` |
| `unit.create` | `saveUnit` | `units.ts` |
| `unit.delete` | `deleteUnit` | `units.ts` |
| `unit.import` | `importUnits` | `units.ts` |
| `unit.update` | `saveUnit` | `units.ts` |
| `user.password_reset` | `resetMemberPassword` | `users.ts` |
| `user.rename` | `updateMemberName` | `users.ts` |
| `version.delete` | `deleteVersion` | `versions.ts` |
| `version.duplicate` | `duplicateVersion` | `versions.ts` |
| `version.import` | `importVersionData` | `version-io.ts` |
| `version.lock` | `toggleVersionLock` | `versions.ts` |
| `version.status` | `setVersionStatus` | `planning.ts` |
| `version.update` | `updateVersion` | `versions.ts` |

Total: 102 rótulos distintos de auditoria.

Os rótulos seguem sempre a forma `entidade.verbo`. Quando a action escolhe o
rótulo por condição, os dois ramos aparecem — é o caso de `addCash`, que grava
`cash.create` ou `cash.adjust` conforme o tipo do lançamento.

Actions que gravam e **não** chamam `logAudit` (13):

- `changePassword` — `account.ts`
- `confirmMfa` — `account.ts`
- `disableMfa` — `account.ts`
- `getOrCreateMfaSetup` — `account.ts`
- `pairMovimento` — `caixa.ts`
- `toggleConciliado` — `caixa.ts`
- `addBankAccount` — `despesas.ts`
- `renameTenant` — `empresa.ts`
- `deleteStockItem` — `estoque.ts`
- `saveIncc` — `incc.ts`
- `addPermuta` — `receitas.ts`
- `addReembolso` — `receitas.ts`
- `setDefaultVersion` — `versions.ts`
