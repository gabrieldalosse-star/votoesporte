# Censo Esportivo V2 — versão de transição segura

Esta versão preserva as coleções existentes do Firestore e as regras atuais, e altera a apresentação do sistema para priorizar o Censo.

## Entregue
- Identidade visual com as duas imagens originais recebidas, copiadas sem alteração.
- Painel orientado ao Censo com participantes identificados (estimativa), matrículas carregadas, atividades, locais, turmas e frequência.
- Formulário principal de cadastro com 15 campos na ordem pedida (incluindo turma de referência e idade calculada).
- Listas locais e atividades baseadas nos prints, sem importação automática para Firestore.
- Seleção de dias e horários de início/fim separados; persiste no campo `schedule` legado para não exigir migração.
- Consulta de CEP por ViaCEP com preenchimento manual e sem substituir valores já digitados.
- Relatório mensal, CSV e impressão/PDF mantidos do sistema anterior.

## Não concluído nesta etapa
- Cadastro global único de participantes e matrícula relacional (exige migração e revisão de regras, sem tocar na base atual).
- Relatórios semanais e importação XLSX.
- Malhas de setores censitários e zoneamento verificadas; não inferir setores por endereço.
- Provisionamento real da conta administradora (deve ser feito por UID no Console).
- Validação real de permissões, login e gravação no Firebase em produção (requer acesso autenticado).
- Criação/edição dos catálogos pelo administrador: listas iniciais estão no front-end, sem persistência no banco.

## Implantação
Faça backup do repositório atual. Teste a V2 em uma branch ou repositório separado, antes de substituir a versão em produção. O arquivo `firestore.rules` está incluído no pacote, mas **publicar no GitHub não aplica as regras ao Firebase**. Não altere as regras sem testar no emulador e verificar o UID.

## Privacidade
Nenhum aluno foi importado. Não inclua planilhas com dados pessoais em repositórios públicos.
