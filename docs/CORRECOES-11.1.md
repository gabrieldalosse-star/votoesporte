# Correções 11.1 — 21/10/2026

## O que foi corrigido

- Clique nos polígonos: um seletor de elemento único era tratado como uma lista e provocava `forEach is not a function`. A seleção agora percorre todos os botões correspondentes.
- Botão “Ver no mapa”: aguarda o mapa novo e abre o ponto no primeiro clique, inclusive após mudar o filtro.
- Inicialização: os seis arquivos territoriais carregam de forma independente e têm limite de espera. Uma falha territorial não impede o login. A tela de espera oferece recuperação quando os módulos não carregam, e a falha de inicialização do Firebase volta à tela de acesso.
- Google Maps: falhas e limite de espera liberam o mapa alternativo. Atualizações antigas do mapa não montam componentes em elementos removidos.
- Envios de formulários: bloqueio de cliques repetidos durante o salvamento, com liberação dos botões no sucesso ou erro. Ações assíncronas de exclusão e reatribuição exibem os erros.
- Catálogo: locais de todas as turmas autorizadas e do catálogo público entram na lista territorial, mesmo sem coordenadas. Há busca por nome, bairro ou endereço e o botão “Mostrar todos os locais”. O Ginásio João Carlos de Camargo aparece associado a Altos de Votorantim.
- Atividades de professores: consulta usa a união do catálogo com as turmas acessíveis. Um catálogo vazio não esconde as próprias turmas. As permissões de alunos não foram ampliadas.
- Contador do censo e gráficos: a mesma identificação de pessoa é utilizada em todo o painel e nos totais territoriais. Matrículas antigas e novas são conciliadas pelo Aluno ID ou por nome completo normalizado e nascimento completo. Registros com o mesmo nome sem nascimento e IDs distintos permanecem separados. A consolidação é somente de visualização; não exclui nem funde documentos.
- Gênero: cadastro, importação, edição, filtros e gráficos padronizam F/M como Feminino/Masculino. Outras categorias são preservadas.

## Publicar os arquivos

Substitua os arquivos do site pelo conteúdo do ZIP completo, preservando a estrutura das pastas. A nova dependência `assets/data-integrity.mjs` deve acompanhar `assets/app.js`; omitir esse arquivo impede a inicialização.

As regras e os índices do Firebase são os mesmos da entrega V11. A implantação inicial da V11 continua documentada em `V11-CADASTRO-UNICO-E-TERRITORIO.md`. As correções 11.1 não publicam regras automaticamente.

## Atualizar F/M nos registros existentes

1. Entre no site atualizado com uma conta administradora.
2. Abra **Gestão → Padronizar F/M na base**.
3. A operação lê a base geral e todas as matrículas antes da primeira escrita, prepara o download de um backup dos campos que serão alterados e mostra a quantidade atualizada.
4. Cada lote relê o valor dentro de uma transação e grava somente `gender`. Uma correção mais recente de outro operador é respeitada. IDs, matrículas, nomes e históricos não são reescritos.
5. Se houver interrupção, a mensagem informa quantos registros foram concluídos. É possível executar novamente: valores já padronizados não são regravados.

Não foi possível acessar a aba autenticada nem abrir a prévia local nesta revisão: o navegador recusou as duas autorizações. Nenhum registro real foi consultado ou atualizado, e nenhuma publicação no GitHub/Firebase foi realizada por esta revisão. O número real de duplicidades e de gêneros a corrigir só pode ser confirmado na conta administradora.

## Verificação

22 testes automatizados passaram: cadastro único local e transações simuladas, continuidade das matrículas, duplicidade entre turmas, vinculação por CEP, integridade dos 215 polígonos, catálogo completo com Altos de Votorantim, identidade dos contadores, padronização de gênero, execução repetida sem novas alterações e proteção contra envio repetido de formulários. A sintaxe JavaScript também foi conferida.

Os testes de Firestore usam simulações. A conferência visual e a homologação com o banco real permanecem pendentes.
