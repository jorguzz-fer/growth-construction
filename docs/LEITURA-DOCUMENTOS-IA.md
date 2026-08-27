# Leitura de documentos por IA (subir arquivo → formulário preenchido)

O documento que sustenta um lançamento chega do jeito que dá: DANFE em PDF,
cupom "SEM VALOR FISCAL" fotografado em cima da caçamba, comprovante de Pix
com o CPF mascarado, boleto, orçamento de WhatsApp. Digitar isso à mão é o
gargalo do dia a dia — e é onde nasce erro de obra, de competência e de valor.

A funcionalidade tem uma regra só, e ela vale para **qualquer tela** do
sistema que aceite subir arquivo:

> Sobe o documento → a IA lê e preenche o que dá.
> **O que ela não achou, ou achou sem certeza, fica marcado com ALERTA.**
> Nada é gravado antes de a pessoa conferir e salvar.

Alerta é sinal, nunca trava: um cupom rasurado continua virando lançamento.

## Onde já está ligado

| Tela | Arquivo | O que preenche |
| --- | --- | --- |
| Despesas → Lançamentos | `src/components/app/despesa-form.tsx` | projeto, fornecedor, documento fiscal (tipo, nº, série, emissão, chave), conta, categoria DRE, competência, vencimento, valor, status, descrição, forma de pagamento |
| Fornecedores → cadastro | `src/components/app/fornecedor-form.tsx` | razão social, fantasia, tipo, CNPJ/CPF, contato, e-mail, telefones, endereço completo, papéis |

Em ambas a leitura dispara **sozinha ao subir o arquivo** — o botão
"Ler novamente" só existe para quem trocou/acrescentou documento.

## Como está montado

```
componente da tela  ──►  Server Action  ──►  *-extract.ts   (server-only, fala com a IA)
   (aplica e desenha)      (monta contexto)        │
        ▲                                          ▼
        └──────────────  *-doc.ts  ◄──── campos.ts (vocabulário comum, puro)
                     (regra pura e testada:
                      o que preencher, o que deduzir,
                      o que marcar com alerta)
```

- **`src/lib/ai/campos.ts`** — vocabulário comum. `CampoLido` (valor +
  `confianca` + `nota`), `Alerta` (`faltando` | `conferir`), `avaliarCampo`,
  conversão ISO → formato interno das telas, normalização de nome e de
  CNPJ/CPF. Puro: roda no servidor e no cliente.
- **`src/lib/ai/despesa-extract.ts` / `fornecedor-extract.ts`** — `server-only`.
  Montam a ferramenta (tool) da API, mandam os arquivos e devolvem os campos.
  Cada campo volta com confiança e uma nota em português explicando de onde
  saiu ou por que há dúvida — é essa nota que o usuário lê na tela.
- **`src/lib/ai/despesa-doc.ts` / `fornecedor-doc.ts`** — a regra. Casam o que
  a IA leu com os cadastros (fornecedor, plano de contas, categoria, obra),
  deduzem o que dá para deduzir e produzem os alertas. **Puros e testados**
  (`*.test.ts`), com os três documentos reais como cenário.
- **`src/components/ui/campo-ia.tsx`** — `CampoIA` (rótulo + selo + moldura +
  motivo) e `ResumoLeituraIA` (placar da leitura no topo do formulário).

### Decisões que valem para qualquer tela

- **Datas sempre em ISO na conversa com a IA.** `20/07/2026` e `07/20/2026`
  são indistinguíveis para quem lê texto solto; a tradução para o formato
  interno (`MM/DD/YYYY`) acontece num lugar só, com validação de calendário —
  data inexistente (31/02) é recusada e vira alerta.
- **Vários arquivos, um lançamento.** A compra chega em partes (a nota E o
  comprovante do Pix). Os arquivos vão juntos na mesma chamada — é o
  cruzamento deles que permite dizer "paga, por PIX, em 20/07". Limite:
  `AI_MAX_DOCS`.
- **A empresa nunca é o fornecedor.** Em comprovante de Pix o fornecedor é o
  *recebedor*; o CNPJ da própria construtora vai no prompt exatamente para não
  ser confundido.
- **Documento mascarado não casa cadastro.** CPF `***.844.476-**` não
  identifica ninguém: o vínculo por documento só acontece com CNPJ/CPF
  completo, o resto vira alerta.
- **Deduzir é permitido, esconder não.** Competência deduzida da emissão,
  vencimento assumido como o dia do pagamento: preenche **e** marca
  "conferir", dizendo de onde veio.
- **O que não dá para aplicar vira alerta.** Fornecedor não cadastrado, conta
  fora do plano, categoria de receita sugerida para despesa (RG-01): nada
  disso entra em silêncio — o campo explica o motivo.
- **A marca some quando a pessoa edita o campo.** Quem mexeu já conferiu.

## Levando para uma tela nova

1. Escreva o contrato e a regra num módulo puro `src/lib/ai/<tela>-doc.ts`
   (campos lidos, o que é essencial, como casa com os cadastros) e teste-o com
   documentos reais em `<tela>-doc.test.ts` — sem rede.
2. Crie `src/lib/ai/<tela>-extract.ts` (`server-only`) com a tool da API,
   reaproveitando `createMessageWithFallback` e `campoSchema`.
3. Exponha uma Server Action que carrega os cadastros do tenant, chama o
   extract e devolve o resultado do módulo puro já pronto para aplicar.
4. Na tela, troque `<div><Label/>…</div>` por `<CampoIA label alerta>` e
   dispare a leitura no `onChange` do input de arquivo. O `ResumoLeituraIA`
   entra no topo.

Candidatos naturais: Contas a Pagar (baixa por comprovante), Caixa/Extrato
(já tem leitura própria, sem alertas por campo), Medição, Reembolso,
Restituições, Contas a Receber e o Repositório de documentos.

## Configuração

Depende de `ANTHROPIC_API_KEY` (e opcionalmente `ANTHROPIC_MODEL`). Sem a
chave, a leitura é desativada e a tela avisa — o upload e o vínculo do arquivo
continuam funcionando normalmente. Diagnóstico ao vivo em
**Config → Diagnóstico de IA**. O armazenamento dos arquivos depende das
variáveis `R2_*`.
