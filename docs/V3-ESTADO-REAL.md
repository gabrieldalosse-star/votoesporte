# Censo V3 — escopo implementado e pendências

## Implementado e verificado estaticamente
- Preservação da base V2, autenticação e estrutura Firebase sem migração automática.
- Relatório **semanal** com seleção ISO de semana, além do relatório mensal anterior; exportação CSV e impressão via navegador.
- Listas de locais e atividades, formulário em ordem da planilha, identidade visual original, consulta ViaCEP e preenchimento manual (herdados da V2).
- Nenhum aluno importado automaticamente. Nenhuma gravação ou exclusão em produção executada.

## Não concluído / depende de infraestrutura e homologação
- Migração para pessoas únicas e matrículas relacionais; exige inventário e backup dos documentos existentes.
- Provisionamento do administrador no Firebase: criar `adminUsers/{UID}` de modo confiável, após confirmar UID do Google autenticado.
- Gestão persistente de catálogos, importações de todas as entidades, mapas e malhas oficiais, lista completa de CEPs.
- Homologação de login, escrita, leitura, regras Firestore e relatórios no ambiente real.
- Relatórios XLSX nativos e PDF com geração própria (impressão do navegador está disponível).

## Implantação segura
1. Faça backup/exportação do Firestore antes de alterar regras ou estrutura.
2. Publique preferencialmente em um repositório de homologação, usando o mesmo Firebase apenas com dados de teste isolados.
3. Para substituir o site atual, copie todo o conteúdo do ZIP na raiz do repositório. O ZIP inclui `firestore.rules`, mas a publicação de regras no Firebase é uma ação **separada**.
4. Teste autenticação, edição de turma existente, gravação de aluno, chamada e relatórios semanal/mensal com permissões reais.
5. Não altere o esquema de produção para cadastro global até executar migração revisada com rollback.
