# Prompt M · Parte 2, seção 6 — correções do cadastro de clientes (1ª metade)

## O que entra

| Item | Antes | Agora |
|---|---|---|
| **6.1 · Exclusão** | física, com `return` silencioso sem permissão; o log guardava só o id | exige **digitar o nome** do cliente. Fica **bloqueada** com unidade de contrato ativo, contas a receber, documentos, obra (cliente em Projetos) ou recebimento por terceiro. O log guarda nome, CPF mascarado, unidade e quantidade de documentos |
| **6.1.1 · Posição** | botão "Excluir" no topo, a um clique | cartão próprio no **rodapé**, separado do Salvar, dizendo o que a exclusão exige e **o que hoje a bloqueia** |
| **6.2 · Comparação do status** (parcial) | "distratado" em minúsculas não liberava a unidade | a comparação ignora maiúsculas, acento e espaço. Status em branco continua reservando a unidade, e a tela avisa (6.2.1) |
| **6.3 · Conflito de unidade** | consulta e gravação fora de transação: dois cadastros simultâneos passavam | na mesma transação, com trava pela unidade; o teste confirma que, de dois simultâneos, só um passa |
| **6.4 · Nome** | vazio gravava "Sem nome" | recusado com mensagem, no cadastro e na edição |
| **6.5 · Versão de documento** | contava todas as versões do cliente (um comprovante depois do contrato v1 virava "v2") | conta **por tipo**. Nenhuma versão já gravada muda |
| **6.9.1 · Tipo do documento** | aceitava sem tipo | obrigatório |
| **6.9.2 · Versão explicada** | — | a tela explica: mesmo tipo = nova versão, anterior preservada |
| **6.9.4 · Limite** | 15 MB em Clientes e 20 MB em Projetos, mas o servidor corta o corpo em **12 MB** | **10 MB** nas duas telas e nas duas actions |
| **6.10 · Retorno** | `addCliente`, `updateCliente`, `deleteCliente` e `uploadClienteDoc` lançavam erro ou retornavam em silêncio | devolvem `{ ok, error }`, e a tela mostra a mensagem |

### Achado — exclusão apagava documentos

A FK `document.cliente_id` é `ON DELETE CASCADE`: excluir um cliente **apagava
os registros dos documentos dele**. Os arquivos continuavam no R2, mas sem
vínculo. A trava da 6.1 impede isso. As outras três FKs (`project`,
`conta_receber`, `recebimento_terceiro`) são `SET NULL`, e o vínculo sumia sem
aviso; por isso também bloqueiam.

### De passagem (Prompt A, 38)

`uploadClienteDoc` gravava o `projectId` do formulário sem conferir a empresa.
Agora confere.

## Fica para a 2ª metade — precisa de decisão

- **6.2 · Fechar o domínio de "Status do contrato":** hoje o campo é texto
  livre. Para virar lista fechada, é preciso saber **quais valores existem em
  produção** e quais serão aceitos. Levantamento em
  `docs/sql/v2-status-contrato.sql`.
- 6.6 (unidade de outro projeto), 6.7 (interesse de 1 a 5) e 6.8 (busca,
  filtro e paginação).
- 6.9.3: não há ação de remover documento de cliente na tela. Fica registrado.

## Verificação

- `clientes-regras.test.ts` (regras puras) e `clientes-correcoes.test.ts`
  (Postgres):
  - sem nome é recusado;
  - "distratado" em minúsculas libera a unidade;
  - de dois cadastros simultâneos da mesma unidade, só um passa;
  - apagar o nome na edição é recusado;
  - exclusão sem o nome certo é recusada;
  - cliente com documento não é excluído, e o documento fica;
  - unidade com contrato ativo bloqueia a exclusão;
  - exclusão livre grava o log completo, com o CPF mascarado.
- Suíte inteira: 881 passando. `typecheck`, `lint` e `next build` limpos.
- Navegador:
  1. a ajuda do status aparece;
  2. a exclusão fica no rodapé, sem botão no topo;
  3. confirmação errada → mensagem;
  4. confirmação certa → volta à lista e o cliente saiu;
  5. nenhum erro de JavaScript.
