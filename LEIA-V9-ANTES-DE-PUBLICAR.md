# VotoEsporte V9.0.0-rc1 — revisão técnica de pré-produção

**Status:** versão candidata a piloto supervisionado. **NÃO certificada para produção oficial.**
A aplicação passou em testes automatizados de interface no **modo demonstração** e inspeção sintática do JavaScript. **Não foi testada contra o Firebase real nem em múltiplos perfis autenticados no projeto do usuário.**

## Principais correções desde a V8

1. Removidas 29 funções JavaScript duplicadas e mantidas as implementações mais recentes.
2. Chamada P (presença), J (falta justificada), F (falta). A interface exige texto para J; a gravação reporta 3 contadores. Relatórios/CSV e dashboard passam a considerar J, sem transformá-lo em presença.
3. Nova aba Modalidades e núcleos, com turma, local, horário, zona e pesquisa.
4. Aba Ocorrências: turma, aluno opcional, data, hora, tipo e descrição. Dados protegidos pelas regras Firestore fornecidas.
5. Professor pode ser atribuído a turma pré-existente pelo administrador. A transferência atualiza ocorrências relacionadas e turma em um único lote, quando há menos de 400 ocorrências.
6. Acesso Google sem registro em `adminUsers/{uid}` é recusado. Regras Firestore exigem login por senha para o papel de professor; os administradores são explicitamente provisionados. **A mera opção de login Google não outorga privilégios.**
7. Exclusão de turma usa confirmação Sim/Não e mantém auditoria automática. Ocorrências relacionadas também são excluídas.
8. Tema claro/escuro, dashboard com mais indicadores e atualização em tempo real das chamadas do mês por turma. Recarregamento completo dos alunos de outras turmas pode ser solicitado em “Atualizar indicadores”.
9. O mapa foi identificado como **contorno ilustrativo não verificado**. Não se afirma mais falsamente que é uma delimitação oficial do IBGE. Bairros sem geometria não são inventados.
10. Consultas em lote limitado de 6 para cadastros auxiliares de outras turmas, reduzindo picos de leitura.

## Implantação — passos obrigatórios

1. **Faça backup/exportação** de seus dados do Firestore, do conteúdo existente do GitHub e das regras antes de substituir. Não teste exclusão de turma com registros reais.
2. Coloque a aplicação em manutenção e extraia o ZIP. **Publique o conteúdo da pasta `votoesporte-main` na raiz** do repositório GitHub Pages. Não envie apenas o ZIP sem extraí-lo.
3. Firebase Console → **Authentication → Sign-in method**: habilite **Email/Password** e **Google**. Confirme o domínio do GitHub Pages em **Authorized domains**.
4. No Firestore → **Rules**, revise e publique o `firestore.rules` da V9. Código V8 + regras V9 ou código V9 + regras V8 podem rejeitar escritas; planeje a troca coordenada.
5. Garanta que **sua conta administradora** esteja registrada por UID em `adminUsers/{uid}`. Esse documento deve ser provisionado pelo Firebase Console ou Admin SDK (nunca pela interface do professor).
6. Professores podem criar conta com e-mail e senha e completar perfil. Na aba **Gestão**, a administração pode associar as turmas após o primeiro cadastro do professor.
7. Teste com **uma conta admin Google** e **uma conta professor Email/Password**: login, consulta apenas turmas próprias, gravação P/J/F, relatório, ocorrência, associação/reassociação e revogação da visibilidade da turma antiga.
8. Faça um teste com **dados fictícios**, em dispositivo móvel e desktop, antes de operar com dados reais de menores.
9. Verifique se seu domínio está correto no `firebase-config.js`. **Não é necessário alterar chaves do projeto apenas para adicionar Email/Password**, desde que a configuração existente permaneça válida.

## Limitações que impedem atestar produção definitiva

- **Autenticação e regras em ambiente real não verificadas**: é indispensável testar segurança com Firebase Emulator Suite ou um projeto de homologação, principalmente transferência de responsáveis e suas ocorrências.
- **Geometria territorial**: o arquivo original tinha um contorno pouco detalhado rotulado como IBGE e não continha os polígonos prometidos dos quatro setores; a V9 o renomeia como ilustrativo. O arquivo `data/votorantim_bairros_base.geojson` tem registros de bairros **sem geometria**. Para identificar bairro/setor automaticamente, obtenha uma malha confiável e validada, e confira localização por núcleo.
- **Não há geocodificação confiável de cada núcleo**, pois o cadastro atualmente salva um nome de local, não coordenadas validadas; portanto, não coloque marcadores inferidos como fatos.
- **Dashboard:** dados de frequência do mês são acompanhados via um listener por turma. Muitas turmas podem aumentar leituras e custos Firestore. Cadastros de alunos não selecionados são atualizados sob demanda pelo botão de indicadores ou quando uma turma passa a ficar disponível; não há contador central materializado.
- **Autocadastro de professores é público** enquanto o Email/Password estiver habilitado. Acesso a turmas de terceiros está condicionado às rules, mas contas novas podem criar turmas próprias segundo as regras atuais. Se a Prefeitura exigir aprovação administrativa antes do primeiro uso, será necessária uma etapa de convite/aprovação.
- **Validação de justificativas** é obrigatória na interface; as rules validam os totais, mas não cada motivo individual dentro do mapa dinâmico de registros. Uma Cloud Function ou um modelo de registros por aluno seria indicado para validação integral no servidor.
- **Exclusão de turma é permanente e não transacional entre várias coleções**: grandes exclusões podem executar em vários lotes. Mantenha backup e política institucional de retenção.
- A versão mantém logotipos originais incluídos pelo usuário; **não cria novo brasão oficial nem reivindica endosso da Prefeitura**.

## Resultado dos testes locais

Testes automatizados de UI em navegador Chromium headless, carregando módulos Firebase simulados e armazenamento de demonstração:
- login em demo, abertura do ambiente;
- cadastrar turma e aluno;
- J sem motivo bloqueado;
- J com motivo salvo;
- ocorrência salva;
- alteração para tema escuro;
- visão de modalidades carregada;
- cancelamento da exclusão preserva turma;
- dashboard atualizado;
- zero erros JavaScript no cenário testado.

**Não equivalem a um teste do Firebase de produção nem comprovam compatibilidade completa com todas as bases reais.**
