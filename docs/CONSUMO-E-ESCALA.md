# Consumo, escala e limites do plano gratuito

## Resumo honesto

O cenário de **12 professores × até 8 turmas = 96 turmas** é viável como MVP no Cloud Firestore Standard com uso disciplinado. Não é correto chamá-lo de ilimitado: o plano sem custo tem cotas diárias, limite de armazenamento e limite mensal de tráfego. A instituição deve acompanhar o consumo e planejar o crescimento antes de depender do sistema em larga escala.

Esta análise usa a estrutura deste aplicativo:

```text
classes/{classId}/students/{studentId}
classes/{classId}/attendance/{YYYY-MM-DD}
```

Uma chamada é **um documento por turma e por data**. Os status dos alunos são gravados no mapa `records[studentId]`, junto com contagens agregadas. Isso é muito mais econômico que gravar um documento separado para cada aluno em cada chamada.

## Franquia atual do Cloud Firestore Standard

Consulta de referência: **11 de outubro de 2026**. A documentação oficial do Firebase informa, para uma base Cloud Firestore Standard elegível à franquia sem custo:

| Recurso | Franquia | Janela |
| --- | ---: | --- |
| Leituras de documentos | 50.000 | por dia |
| Gravações de documentos | 20.000 | por dia |
| Exclusões de documentos | 20.000 | por dia |
| Dados armazenados | 1 GiB | total armazenado |
| Transferência de saída | 10 GiB | por mês |

As cotas diárias são reiniciadas aproximadamente à meia-noite do horário do Pacífico, não à meia-noite de Votorantim. Apenas **um banco Firestore por projeto** recebe a franquia. Recursos como TTL, PITR, backup, restauração e clonagem não estão cobertos pela franquia gratuita padrão e exigem faturamento habilitado.

Fonte: [preços do Cloud Firestore](https://firebase.google.com/docs/firestore/pricing) e [cotas do Cloud Firestore](https://firebase.google.com/docs/firestore/quotas).

Para o login, 12 professores também ficam muito abaixo do limite informado para a maioria dos provedores no Firebase Authentication Spark: 3.000 usuários ativos por dia. Esse número deve ser conferido novamente quando o projeto entrar em produção, pois cotas e preços podem mudar. Fonte: [limites do Firebase Authentication](https://firebase.google.com/docs/auth/limits).

## Premissas do cálculo

Como não há dados de alunos fornecidos neste pacote, o cálculo usa somente hipóteses explícitas. Não representa cadastros reais.

| Variável | Cenário-base |
| --- | ---: |
| Professores | 12 |
| Turmas por professor | 8 |
| Turmas totais (`T`) | 96 |
| Alunos ativos por turma (`A`) | 30 |
| Alunos ativos totais | 2.880 |
| Chamadas por turma por dia | 1 |
| Dias letivos no mês (`D`) | 20 |
| Sessões/chamadas mensais | 1.920 |
| Salvamentos por chamada | 1 a 2 |

Para adaptar: substitua `A` pela média real de alunos e `D` pelos dias em que as turmas efetivamente se encontram.

## Estimativa de leituras

Em um dia extremo, supondo que as 96 turmas façam chamada, o carregamento básico de cada turma precisa ler a lista de alunos e, quando houver, o registro da chamada daquela data. Uma estimativa conservadora é:

```text
leituras-base/dia ≈ T × (A + 2)
```

Os dois documentos adicionais representam, de maneira simplificada, a turma e a chamada. Para `T = 96` e `A = 30`:

```text
96 × (30 + 2) = 3.072 leituras-base/dia
```

Se todos os 12 professores também gerarem um relatório mensal em um mesmo dia, cada relatório poderá examinar até 8 × 20 = 160 chamadas e reler até 8 × 30 = 240 cadastros para montar a visão individual. Os 12 relatórios juntos acrescentariam aproximadamente 4.800 leituras. Nesse pico ilustrativo:

```text
3.072 + 4.800 = 7.872 leituras/dia
```

Isso equivale a cerca de **16% das 50.000 leituras/dia**, antes de dashboards, consultas repetidas, recarregamentos, alterações em tempo real e outras telas. Uma meta operacional prudente é manter esse cenário abaixo de 10.000 leituras/dia, preservando margem para os usos reais.

### E se cada turma tiver 50 alunos?

```text
96 × (50 + 2) = 4.992 leituras-base/dia
12 professores × [8 turmas × (50 cadastros + 20 chamadas)] = 6.720 leituras de relatórios
4.992 + 6.720 = 11.712 leituras estimadas
```

Ainda há margem teórica, mas ela diminui se professores atualizarem a página repetidamente, manterem várias abas abertas ou consultarem históricos inteiros em tempo real. Nesse tamanho de turma, o monitoramento deixa de ser opcional e relatórios devem ser usados somente quando necessários.

Leituras em listeners de tempo real também contam. Uma consulta ou listener faz uma leitura para cada documento retornado e, em geral, uma leitura quando um documento daquela consulta muda. Por isso, o aplicativo deve manter sincronização apenas nas turmas e períodos ativos, evitando assinar todo o histórico de todas as turmas ao mesmo tempo.

## Estimativa de gravações

Com o formato do MVP, uma chamada salva é um documento de sessão. Portanto:

```text
gravações de chamada/dia ≈ T × salvamentos por chamada
```

| Operação no cenário-base | Estimativa | Parcela de 20.000 gravações/dia |
| --- | ---: | ---: |
| Um salvamento por chamada | 96 gravações/dia | 0,48% |
| Dois salvamentos por chamada (correção) | 192 gravações/dia | 0,96% |
| Importação inicial de 2.880 alunos | 2.880 gravações, uma única vez | 14,4% no dia da importação |

O ponto decisivo é não gravar presença como documento independente por aluno a cada aula. Nesse desenho alternativo, só as chamadas de 30 alunos seriam:

```text
96 turmas × 30 alunos = 2.880 gravações/dia
```

Ainda caberia na quota no cenário-base, mas gastaria quatorze vezes mais que o documento de sessão e cresceria rapidamente. Com 200 alunos por turma, esse desenho chegaria a 19.200 gravações/dia e deixaria quase nenhuma margem para cadastros ou correções. O modelo adotado — uma sessão com mapa de registros — é a escolha adequada para esse caso de uso, desde que o documento fique bem abaixo do limite de 1 MiB do Firestore.

Importações grandes devem ser feitas fora do horário de maior uso, revisadas por turma e acompanhadas no Console. Não misture uma migração de base inteira com um dia normal de chamadas.

## Estimativa de armazenamento e tráfego

Armazenamento depende do tamanho dos textos, contatos e índices; não é possível prometer uma capacidade exata sem medir dados reais. A tabela abaixo usa somente uma aproximação de tamanho do documento de chamada, sem contar completamente o efeito de índices e metadados.

| Tamanho médio de uma chamada | 1.920 chamadas/mês | Aproximação mensal de novos registros de chamada |
| --- | ---: | ---: |
| 2 KiB | 1.920 | 3,75 MiB |
| 5 KiB | 1.920 | 9,38 MiB |
| 20 KiB | 1.920 | 37,50 MiB |

Como referência, 2.880 cadastros de aluno com 2 KiB cada representariam cerca de 5,63 MiB de conteúdo antes de índices. No cenário de 5 KiB por sessão, um ano de novas chamadas seria aproximadamente 112,5 MiB de conteúdo bruto; armazenamento de índices, documentos maiores, revisões e qualquer outro uso reduzem a margem de 1 GiB. Acompanhe a aba **Usage** do Firestore desde o primeiro mês e planeje arquivamento/retenção institucional antes de se aproximar do limite.

Para tráfego, se cada perfil de aluno transferido tiver em média 2 KiB, carregar 2.880 alunos em um dia extremo corresponde a cerca de 5,6 MiB de saída. Em 20 dias, seria cerca de 112,5 MiB, bem abaixo de 10 GiB/mês em tese. Mas abrir listas repetidas, imprimir relatórios, usar dispositivos diferentes e documentos maiores multiplicam esse valor. A franquia não deve ser tratada como reserva garantida para crescimento indefinido.

## Recursos que não aumentam o consumo de Firestore diretamente

- O PDF é produzido pela janela de impressão do navegador; não cria um arquivo no Firestore por si só.
- A exportação CSV é gerada a partir dos dados já lidos para o relatório; a consulta necessária para montar o relatório continua contando leituras.
- GitHub Pages hospeda os arquivos do site, mas sua disponibilidade e regras de uso são separadas das cotas do Firebase.

## Recomendação de operação

Para 12 professores e 96 turmas, o MVP pode começar no plano sem custo se seguir estas regras:

1. mantenha uma chamada por turma/data, sem registros separados por aluno;
2. consulte somente turmas do professor atual e o mês selecionado;
3. evite listeners de histórico inteiro e atualizações automáticas desnecessárias;
4. faça importações por turma, com prévia e fora de picos;
5. monitore semanalmente leituras, gravações, armazenamento e transferência no Firebase Console;
6. defina alertas orçamentários e um responsável por decidir se/ quando migrar para Blaze;
7. revise retenção de históricos e a necessidade de manter campos de endereço e contato.

O Firebase/Firestore não é “gratuito e ilimitado”. O cenário estimado é confortável para uma fase inicial com chamadas diárias e turmas de tamanho usual, mas não substitui monitoramento. Se a instituição exigir histórico muito longo, sincronização em tempo real ampla, muitos relatórios detalhados, backups gerenciados ou volume maior que o previsto, o plano Blaze e uma avaliação de custos passam a ser necessários.

