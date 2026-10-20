# Alterações solicitadas — outubro de 2026

Implementadas no código deste pacote:
- Matrícula MAT-000001 em sequência por turma, com contador no Firestore e transação para cadastros simultâneos. Códigos existentes são preservados. Ao abrir uma turma, cadastros sem código recebem numeração; há também o botão Gerar matrículas pendentes. A sequência é por vínculo na turma, não um identificador municipal único.
- Ativar/desativar alunos e turmas. Alunos inativos ficam fora de novas chamadas; marcações históricas continuam visíveis. Turmas inativas preservam histórico e bloqueiam gravação de frequência.
- Relatório Cadastro e quantidade de alunos, independente de chamada, com filtros de turma, bairro, gênero, modalidade, situação e intervalo de idade, agrupamento selecionável, CSV e impressão/PDF. Use Carregar opções de filtros para preencher as listas antes de selecionar.
- Frequência com situação da aula: realizada, falta do professor ou evento. Justificativa opcional. Faltas do professor e eventos são salvos sem marcações dos alunos.
- Exclusão da frequência da turma/data selecionadas por professor autorizado ou administrador, com confirmação.
- Justificativa opcional do aluno: Atestado, Mau-estar, Viagem e Outros. Descrições antigas são preservadas na lista.
- Correção dos caminhos de imagens e layout compacto de presença no celular.
- Mais gráficos do censo: situação de matrículas, matrículas por turma e deficiência informada.
- Importação: F = Feminino, M = Masculino.

## Publicação
Substitua os arquivos do site e publique também firestore.rules no projeto Firebase. As novas funções de contador, exclusão de frequência e justificativa da aula dependem dessas regras.
Nenhuma alteração foi publicada no GitHub ou no Firebase nesta sessão. O ZIP original não contém vínculo Git configurado.

## Validação executada
Sintaxe JavaScript e carregamento das funções em contexto isolado; verificações de conversão F/M, ativação de aluno, justificativa vazia, continuidade sequencial e preservação de matrícula; todos os recursos locais referenciados pelo HTML existem.

## Validação ainda necessária
Teste visual no navegador/celular e teste integrado com login e Firestore reais, incluindo dois cadastros simultâneos. O ambiente não dispõe de navegador automatizado nem emulador Firebase configurado.
