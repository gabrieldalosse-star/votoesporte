# 12.3 — vínculo confirmado entre CEP, bairro e zona

Implementação local; publicação pendente. Confirme **Versão 12.3.0** na tela de acesso depois de atualizar o site.

## Regras de correspondência

O CEP deve constar na referência municipal CNEFE 2022. Se o bairro estiver preenchido, deve corresponder a uma das localidades daquele CEP. São normalizados acentos, pontuação e abreviações JD/JDM, PQ e VL. Não se deduz que bairros com nomes diferentes são a mesma localidade.

Um CEP compartilhado usa o bairro declarado para escolher a zona. Sem bairro e com várias localidades, exige confirmação. Sem bairro e com uma única localidade, pode preencher o bairro automaticamente. Bairro conhecido com CEP desconhecido não recebe classificação automática.

A busca de CEP preserva o bairro já informado e o confronta com a referência; não o substitui silenciosamente pelo bairro retornado pelo serviço externo. Ao alterar o bairro, o sistema reconfere o CEP. Ao salvar, uma correspondência confirmada tem prioridade sobre a zona automática antiga.

Essas regras ajustam os vínculos cadastrais. As geometrias de referência são preservadas; não foram criados novos limites legais de bairros.

## Gestão → Corrigir zonas por CEP e bairro

1. Confere se as referências de bairros, zonas e CEP carregaram integralmente.
2. Lê a base geral e todas as matrículas antes de iniciar qualquer gravação.
3. Baixa JSON com valores anteriores, alterações planejadas e pendências.
4. Atualiza zona, nome, setor, fonte e `geo` nos registros com correspondência segura. As matrículas também recebem o método de classificação no campo correspondente. Aluno ID e matrícula são preservados.
5. Remove vínculos automáticos antigos quando o CEP/bairro não puder mais confirmá-los. Seleções manuais sem correspondência permanecem para revisão. Pessoas de outro município são sinalizadas para revisão e não recebem uma zona de Votorantim.
6. Exibe quantos registros foram corrigidos, alterações concorrentes preservadas e pendências. A contagem é de registros (base geral e matrículas), não de pessoas distintas.

Cada registro é avaliado pelo seu endereço atual. A ação não substitui o CEP ou um bairro já preenchido, não escolhe a localidade majoritária em CEP compartilhado e não muda endereços de matrículas para os da base geral. Divergências precisam de revisão cadastral.

Transações releem endereço e vínculo territorial antes da atualização. Se houver mudança concorrente, preservam a edição. É possível repetir a operação; registros já corretos não recebem nova alteração. Se uma leitura inicial falhar, não há gravações; se uma etapa de gravação falhar, o resultado informa as atualizações já concluídas para permitir retomada.

O JSON contém dados pessoais e deve ficar guardado como backup local. A ação é exclusiva da administração. Nenhum dado real foi alterado nesta entrega.

## Validação e publicação

69 testes passaram (60 anteriores e nove novos): CEP compartilhado, abreviações, conflito entre CEP e bairro, CEP desconhecido, município externo, preservação de IDs, retirada de vínculo automático desatualizado, regra de campos da base geral, repetição da correção, backup antes das gravações e concorrência. Todas as combinações CEP/localidade da referência CNEFE atual encontraram uma zona correspondente sem ambiguidade quando o bairro foi informado.

Validação de sintaxe e `git diff --check` concluídas. Testes de interface usam DOM simulado; não houve validação visual em navegador ou acesso à base Firebase real. Esta revisão não exige novas regras além das regras V11 existentes.

O ZIP é o site completo. Preserve a configuração do seu `firebase-config.js`, publique mantendo `assets`, `data` e `docs` nas mesmas pastas e confirme Versão 12.3.0. Publicação automática continua indisponível porque o conector GitHub recusou permissão de escrita anteriormente.
