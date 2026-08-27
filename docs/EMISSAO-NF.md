# Emissão de nota fiscal (NFS-e)

Como o app **emite** nota — em oposição ao que já existia, que é **registrar** a
nota recebida do fornecedor (`documento_fiscal`, filha de `despesa`). São coisas
diferentes e nenhuma substitui a outra.

## 1. O que se emite aqui (e o que não se emite)

**Venda de unidade não gera nota fiscal.** Incorporação imobiliária é operação
de contrato e escritura, não de circulação de mercadoria nem de prestação de
serviço. Um título de `conta_receber` originado da venda de uma unidade **não**
deve oferecer botão de emissão: oferecer induz erro fiscal.

O caso real é a **NFS-e de serviço**: empreitada e administração de obra
faturadas contra o cliente do projeto (`project.cliente_id`), taxa de
administração e serviços correlatos. O gatilho natural é a **medição** — medição
aprovada → NFS-e → conta a receber.

## 2. A decisão que mais erra nota de construtora

Na construção civil o ISS é devido **no município da obra** (LC 116/2003, art.
3º, III), que frequentemente não é o da sede. Por isso:

- `tenant.codigo_municipio` → município do **prestador** (sede);
- `project.codigo_municipio_obra` → município da **prestação** (a obra);
- a natureza da operação (`1` = tributação no município, `2` = fora) é
  **derivada** da comparação entre os dois, nunca escolhida na tela.

Isso está em `naturezaPorMunicipio` (`src/lib/calc/nfse.ts`) e é aplicado em
`montarPayloadNfse` (`src/lib/fiscal/nfse-payload.ts`).

## 3. Bruto ≠ líquido

Nota de R$ 100.000 com ISS retido e INSS não deposita R$ 100.000 na conta.
`calcularNfse` devolve os dois números juntos (`valorIss`, `totalRetencoes`,
`valorLiquido`) justamente para que o Contas a Receber e a conciliação de caixa
não usem o valor errado.

**Nenhuma incidência é presumida.** Retenção federal em serviço de construção
civil depende do tipo de contrato (empreitada global × cessão de mão de obra),
do regime do prestador e da natureza do tomador — regra que a contabilidade do
cliente define, não o software. Cada retenção é informada explicitamente
(alíquota e, quando for o caso, base própria); o módulo só faz a conta. Um
padrão embutido produziria nota errada com aparência de nota certa.

## 4. Provedor: Focus NFe

Integração direta com prefeitura foi descartada: são milhares de municípios, o
padrão nacional (NFS-e Nacional) ainda convive com padrões próprios, e a
integração direta exigiria custodiar o certificado A1 e-CNPJ dentro do app.

O que a [documentação da API v2](https://doc.focusnfe.com.br/reference/introducao)
define e o código respeita:

| Item | Contrato |
|---|---|
| Ambientes | `https://homologacao.focusnfe.com.br/v2` e `https://api.focusnfe.com.br/v2` |
| Autenticação | HTTP Basic — **token como usuário, senha vazia** (`Basic base64("token:")`) |
| Referência (`ref`) | obrigatória na query string, única por token, **apenas letras e números** |
| Emissão | `POST /nfse?ref=…` — **assíncrona**: devolve `processando_autorizacao` |
| Consulta | `GET /nfse/{ref}` — `autorizado`, `cancelado`, `erro_autorizacao` |
| Cancelamento | `DELETE /nfse/{ref}` — prazo é da prefeitura e varia por município |
| Webhook | `POST /hooks` com `event: "nfse"`, `url`, `cnpj` e cabeçalho de autorização à escolha; reenvia em 1min, 30min, 1h, 3h e 24h e depois desiste |
| Construção civil | campos `codigo_obra` (CNO/CEI) e `art` no corpo da nota |

Consequências de projeto:

- **`ref` não pode conter hífen** — como as chaves são UUID, a conversão é
  explícita e estável em `refDaNota` (`src/lib/fiscal/tipos.ts`). O mesmo
  registro sempre produz a mesma `ref`, senão reemitir viraria nota duplicada.
- **`ref` autorizada é definitiva**: depois que a nota é autorizada (mesmo que
  depois cancelada) aquela referência não serve para uma nova emissão. Corrigir
  e reenviar só funciona enquanto o status for de erro.
- **Numeração do RPS é do provedor** (`serie_nfse_producao`,
  `proximo_numero_nfse_producao` no cadastro da empresa). Não usar
  `number_sequence` para isso — ela continua sendo do PED interno.
- **O token é da empresa e vale dinheiro**: fica em variável de ambiente
  (`FOCUS_NFE_TOKEN*`), nunca em coluna de banco lida por toda query de tenant.
- **Homologação é o padrão** de todo tenant (`fiscal_ambiente`): nota de teste
  não tem validade fiscal, e o padrão inverso emitiria nota real por acidente na
  primeira tentativa de integração.
- **Reforma tributária**: a API já expõe campos de IBS/CBS e municípios estão
  migrando para a NFS-e Nacional (`habilita_nfsen_*`, que não pode conviver com
  `habilita_nfse` em produção). O adaptador é isolado justamente para essa troca
  não vazar para as telas nem para o banco.

## 5. Estado da implementação

Fases 1 e 2 estão prontas. As demais dependem de credencial no painel do
provedor (empresa cadastrada, certificado A1 vinculado, município habilitado).

| Fase | O que é | Estado |
|---|---|---|
| 1 | Cadastro fiscal do emitente (`tenant`) + dados fiscais da obra (`project`) + tela em Config › Empresa com checklist de prontidão | ✅ |
| 2 | Motor de cálculo (`calc/nfse.ts`) e validação do emitente (`calc/emitente-fiscal.ts`), com testes | ✅ |
| 3 | Adaptador do provedor: montagem do payload e cliente HTTP (`lib/fiscal/`) | ✅ payload e cliente; falta exercitar contra o sandbox |
| 4 | Tabelas `nota_servico` e `nota_servico_evento`, rota de webhook, tela `/notas`, permissão no RBAC | pendente |
| 5 | Gatilho na medição, vínculo com `conta_receber` pelo valor **líquido**, cancelamento e substituição | pendente |

### O que a Fase 4 precisa resolver

- **Estados**: `RASCUNHO → ENFILEIRADA → PROCESSANDO → AUTORIZADA →
  (CANCELADA | SUBSTITUIDA)`, com `REJEITADA` como ramo reprocessável.
- **Idempotência do webhook**: o provedor reenvia até cinco vezes; o handler
  precisa ser idempotente e responder 2xx, senão a notificação se perde de vez.
- **Autorização do webhook**: cadastrar o hook com `authorization` /
  `authorization_header` e conferir o segredo na entrada — a rota é pública.
- **Log de eventos**: guardar o corpo cru de cada resposta. Rejeição de
  prefeitura vem com mensagem obscura e específica do município; sem o original,
  diagnosticar depois vira adivinhação.
- **Sem receita em dobro**: se a medição já reconheceu a receita, a NF é
  documento do fato existente, não um novo fato contábil.

## 6. Arquivos

```
src/lib/calc/emitente-fiscal.ts   validação do emitente + checklist (CNPJ alfanumérico)
src/lib/calc/nfse.ts              base de cálculo, ISS, retenções, líquido, natureza
src/lib/fiscal/tipos.ts           contrato neutro (status, resultado, ref)
src/lib/fiscal/nfse-payload.ts    montagem do payload (pura, testável)
src/lib/fiscal/focus.ts           cliente HTTP — a única parte que conhece o provedor
src/lib/actions/empresa.ts        salvarDadosFiscais
src/app/(app)/empresa/page.tsx    cadastro fiscal + checklist
```
