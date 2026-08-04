# Medição, BDI e provisionamento — modelo derivado da planilha de referência

Documento de **especificação**, ainda não implementado. Registra o modelo de
cálculo extraído da planilha enviada pelo cliente
(`Provisionamento_de_receita_obra_25_1.xlsx`, aba `Calculo de medição obra 32`),
para que a implementação não dependa de suposições.

> **Identificação divergente:** o arquivo cita "obra 25" e a aba cita "obra 32".
> Conforme orientação do cliente, **essas identificações não são regra de
> sistema** — o cálculo deve ser genérico por projeto. Nenhum valor abaixo pode
> ser fixado em código (hardcode); todos são exemplos de validação.

## 1. Parâmetros do projeto (entradas)

| Parâmetro | Exemplo na planilha |
|---|---|
| Construção financiada | R$ 198.583,00 |
| Terreno financiado | R$ 112.000,00 |
| Entrada paga na assinatura | R$ 30.000,00 |
| Entrada parcelada | R$ 39.417,00 |
| **Total da aquisição** | **R$ 380.000,00** |
| CUB | R$ 2.605,71 |
| Metragem | 72,25 m² |
| **Custo referencial** (= CUB × metragem) | **R$ 188.262,55** |
| Parcela referência caixa | R$ 3.185,09 |
| Tipo de executor da obra | Profissional Autônomo |
| % BDI | 6,00 % |

**Total financiado** = construção financiada + terreno financiado
= 198.583 + 112.000 = **R$ 310.583,00** (base do % recebido).

Custos pagos antes do alvará (ITBI, registro, taxa Caixa, projeto/arquitetura,
vistoria) são listados à parte — na planilha somam R$ 15.914,58.

## 2. Serviços e incidência

Cada serviço (20 na planilha, do "Barracão" a "Outros") tem:

```
incidência_%  = custo_do_serviço / custo_total_dos_serviços × 100
```

Exemplo: Paredes e Painéis = 26.000 / 286.500 = **9,075 %**.

Colunas por serviço: descrição, custo proposto, incidência, % acumulado,
**limite mínimo [%]**, **limite máximo [%]** e status.

```
status = "OK"                 se  mínimo ≤ incidência ≤ máximo
         "Abaixo do mínimo"   se  incidência < mínimo
         "Acima do máximo"    se  incidência > máximo
```

Validado na planilha: Supraestrutura (incidência 11,52 % com mínimo 12,17 %) e
Instalações Hidráulicas (3,49 % com mínimo 3,63 %) aparecem como
*Abaixo do mínimo*; os demais como *OK*.

## 3. BDI

```
valor_do_BDI       = custo_total_dos_serviços × %BDI
custo_total_c_BDI  = custo_total_dos_serviços + valor_do_BDI
```

Exemplo: 286.500,00 × 6 % = **17.190,00** → total com BDI **303.690,00**.

> **Regra pendente de confirmação:** na planilha o %BDI (6 %) aparece ao lado do
> campo **"Executor obra: Profissional Autônomo"**, indicando que a alíquota
> depende do **tipo de executor** (construtora × profissional autônomo). A
> planilha só traz o caso do autônomo. **Não presumir a alíquota de construtora**
> — o %BDI deve ser configurável por projeto, com o tipo de executor registrado,
> e a regra confirmada com o cliente antes de qualquer validação automática.

## 4. Medição mensal por serviço

O usuário informa o **percentual executado acumulado** de cada serviço ao final
de cada mês. O sistema calcula o resto:

```
execução_acumulada_%  = incidência_% × %executado_do_serviço
variação_mensal_%     = execução_acumulada_atual − execução_acumulada_anterior
valor_medido          = variação_mensal_% × construção_financiada
```

Exemplo (Barracão, incidência 2,4432 %):
- Julho, 80 % executado → acumulado 1,9546 % → variação 1,9546 % →
  1,9546 % × 198.583 = **R$ 3.881,55**
- Agosto, 100 % executado → acumulado 2,4432 % → variação 0,4886 % →
  **R$ 970,39**

**Mensurado acumulado da obra** = soma das execuções acumuladas de todos os
serviços. Na planilha: jul 19,93 · ago 42,37 · set 58,78 · out 77,03 ·
nov 95,95 · dez 100,00 — com variações de 22,44 · 16,40 · 18,25 · 18,92 · 4,05,
confirmando `variação = acumulado_atual − acumulado_anterior`.

## 5. Liberação, custo e geração de caixa (quadro mensal)

Para cada mês de medição:

```
liberação_do_mês      = variação_mensal_% × construção_financiada
custo_estimado_do_mês = variação_mensal_% × custo_referencial(CUB × metragem)
geração_de_caixa      = liberação_do_mês − custo_estimado_do_mês
liberação_acumulada   = liberação_acumulada_anterior + liberação_do_mês
%_recebido            = liberação_acumulada / total_financiado
E.V.O                 = parcela_referência_caixa × %_recebido
taxa_1,5%             = 1,5 % × liberação_do_mês
soma_do_mês           = E.V.O + taxa_1,5%
```

Validação com julho/2026 (variação 19,93 %):
- liberação = 19,93 % × 198.583 = **R$ 39.577,97** ✔
- custo estimado = 19,93 % × 188.262,55 = **R$ 37.521,09** ✔
- caixa = 39.577,97 − 37.521,09 = **R$ 2.056,89** ✔
- acumulado = 112.000 + 39.577,97 = **R$ 151.577,97** ✔
- % recebido = 151.577,97 / 310.583 = **48,80 %** ✔
- E.V.O = 3.185,09 × 48,80 % = **R$ 1.554,46** ✔
- taxa = 1,5 % × 39.577,97 = **R$ 593,67** ✔
- soma = **R$ 2.148,13** ✔

A primeira linha do quadro é a **liberação do terreno** (R$ 112.000,00 em
12/03/2026), que entra no acumulado sem custo nem variação de obra associados.

`saldo de financiamento disponível` = total_financiado − liberação_acumulada.

## 6. Lacunas em relação ao sistema atual

A tabela `medicao` guarda hoje apenas `(versão, competência, grupo CEF, valor)` —
um valor medido por mês, sem percentuais. Para atender ao modelo acima serão
necessários (em migração **aditiva**, sem alterar os dados existentes):

- parâmetros por projeto: construção financiada, terreno financiado, CUB,
  metragem, parcela de referência, %BDI, tipo de executor;
- catálogo de **serviços** por projeto com custo proposto e limites mín./máx.;
- medição por **serviço × competência** com o **% executado acumulado**
  informado pelo usuário (a variação é derivada, nunca digitada).

Os registros de `medicao` já existentes continuam válidos e não devem ser
convertidos automaticamente — o novo modelo convive com o atual até que o
cliente valide a migração dos dados históricos.

## 7. Tipos de obra

O cliente pediu para diferenciar **construção individual** de **empreendimento**,
sem reaproveitar automaticamente a estrutura de um para o outro. O modelo acima
foi extraído de uma **construção individual financiada** (unidade única, CUB ×
metragem, financiamento Caixa). A estrutura para empreendimento **ainda não foi
especificada** e depende de confirmação do cliente.
