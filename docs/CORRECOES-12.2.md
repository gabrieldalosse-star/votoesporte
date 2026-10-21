# 12.2 — preenchimento de ficha e correção na Frequência

Implementação local; publicação pendente. Confirme **Versão 12.2.0** no acesso depois de publicar os arquivos. A versão disponível online não recebe alterações apenas pelo download do pacote.

- **Base geral → Verificar e corrigir turmas**: botão no topo, ao lado das ações de integração/exportação. Abre a Gestão e executa a revisão administrativa já implementada na 12.1. Continua disponível na própria Gestão.
- **Base geral → selecionar turma → Nova matrícula**: busca o cadastro atual do Aluno ID e preenche a ficha completa. Contato, permissão, telefones, endereço, PCD, escola e referências territoriais/do censo são extraídos também dos objetos internos do cadastro. Campos ausentes na base geral são complementados por matrículas acessíveis do mesmo Aluno ID.
- **Cadastrar aluno → Aluno ID existente**: informar ou selecionar o ID dispara o preenchimento ao confirmar o campo. O botão **Preencher ficha pelo Aluno ID** permite disparar a consulta explicitamente.
- Matrícula, situação do vínculo, turma e ID interno da matrícula não são copiados de outro vínculo. O Aluno ID permanente é preservado. Se a pessoa já está na turma selecionada, abre a matrícula existente para correção em vez de criar outra.
- Durante a busca o salvamento fica bloqueado. Trocar o ID limpa os dados da pessoa anterior. Busca atrasada ou de sessão encerrada não preenche outra ficha.
- **Frequência → Corrigir cadastro do aluno**: botão abaixo do nome em cada linha. Abre a ficha daquele aluno na turma da chamada. Corrigir ou cancelar mantém as marcações P/J/F ainda não salvas. Professores continuam limitados às turmas autorizadas pelas regras existentes.

60 testes passaram, incluindo sete novos para campos internos, preenchimento completo, prioridade do cadastro geral, preservação dos identificadores, troca de ID durante a busca e correção na turma da Frequência. Sintaxe e diferenças de arquivos verificadas. Testes de interface usam DOM simulado; não houve teste visual em navegador nem modificação da base Firebase real.

Pacote completo inclui as melhorias anteriores. Preserve a configuração `firebase-config.js` existente. Esta revisão não exige regras Firestore novas além das já utilizadas na V11. O conector GitHub recusou escrita anteriormente, por isso não foi possível publicar automaticamente.
