# Estrutura de referência — Censo 2026

Nenhuma pessoa das planilhas foi importada. Os arquivos serviram somente para identificar campos e entidades.

## Cadastro de alunos (referência Censo Willian)
Turma; Nome; Sexo; Idade; Data Nascimento; Rua; Numero; Bairro; Cidade; CEP; Telefone; PCD; Nome Responsavel; Telefone Responsavel; Data Cadastro.

No formulário do aplicativo, idade é calculada a partir do nascimento para o ano de 2026, sem ser persistida como fonte independente. PCD e data de cadastro foram acrescentados à validação do Firestore. A turma continua sendo o vínculo de cadastro; a estrutura atual ainda não possui cadastro central de pessoas nem matrícula compartilhada entre turmas.

## Estrutura Censo – Teste
Referência de entidades: Locais (ID e endereço), Atividades (ID e descrição), Turmas (local, atividade, faixa etária, dia, horário, vagas e status), Alunos e Matrículas.

## Aplicação e segurança
Publicar `firestore.rules` no Firebase Console antes de usar os novos campos. A alteração de regras não deve abrir leitura pública. O GitHub Pages publica o site, mas não publica regras Firestore automaticamente. Não envie CSVs contendo dados pessoais ao repositório público.

## Limites desta atualização
A separação completa de pessoas e matrículas, o painel municipal de censo e a migração de cadastros entre turmas exigem mudança adicional no modelo de dados e não foram implementados neste pacote. O cadastro e a importação devem ser testados em uma turma de teste antes de uso real.
