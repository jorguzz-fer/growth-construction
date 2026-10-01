# Decisões do dono — 01/10/2026

As respostas de 01/10 às perguntas em aberto dos Prompts B, D, F, H, V, AH,
E (BE-2), AE (BAE-1) e às quatro chaves. Cada item diz o que foi feito e em
qual PR. Nada aqui altera dado gravado.

## Medição e os indicadores da obra (BV-1, BV-3, BV-4, 3.5)

- **BV-1 · PLS existe; medição por percentual de cada serviço.** Não migra
  agora. A estrutura fica (`servico`, `medicao_servico`,
  `calc/medicao-bdi`) e os **indicadores de evolução física foram
  desligados** no Dashboard: evolução acumulada e do mês, liberação do mês,
  custo estimado e geração de caixa do mês. No lugar, uma nota diz que
  voltam com o cadastro da PLS por obra.
- **"Liberação acumulada" e "Saldo de financiamento" saíram de vez**, sem
  depender de chave: sem medição, mostravam o financiamento do cadastro como
  se já tivesse acontecido. Saíram também da prévia da chave do Dashboard e
  do texto dela.
- Ficam: financiamento (construção, terreno, total), custo e BDI dos
  serviços, custo referencial e serviços fora dos limites — todos de
  cadastro, com "—" quando falta.
- **BV-4 · sem layout de impressão.** O rodapé do relatório de medição
  passou a dizer que o documento oficial é o formulário da Caixa (PLS /
  RAE), assinado pelo responsável técnico, e que o sistema fornece os
  números.
- **3.5 · a coluna fica fora.** Nada a fazer.
- **BV-3 · sem preencher autor pelo log.** Já está assim desde o Prompt V:
  medição sem autor aparece para todos, marcada "autor não registrado".
