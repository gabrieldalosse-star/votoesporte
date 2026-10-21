# Versão 12.1 — ficha completa, contatos e revisão das turmas

## Base geral → Ficha completa

Cada aluno possui uma ficha com identificação, Aluno ID, nascimento, sexo, PCD, endereço completo, CEP, bairro, zona territorial, responsável, telefones, e-mail, informações escolares, observações e referências do censo. Campos ausentes aparecem como “Não informado”.

Os dados da base geral têm prioridade. Campos vazios são complementados pelas matrículas vinculadas ao mesmo Aluno ID; isso é informado na própria ficha. A seção de matrículas exibe turma, atividade, local, horário, código e situação de cada vínculo, com acesso ao formulário já existente de edição. A ficha funciona também para pessoas sem matrícula. Não adiciona modalidade ao cadastro geral.

## Contatos

Telefones do responsável, do aluno e alternativos aparecem com links próprios para WhatsApp e ligação. Repetições do mesmo número são agrupadas. O formato brasileiro, +55, 0055, prefixo 0 e código de operadora são tratados. Números antigos separados por barra, vírgula, ponto e vírgula ou “ou” são reconhecidos para exibição.

DDD ausente e números inválidos não recebem links artificiais. Não é possível confirmar se um número possui WhatsApp sem verificá-lo no próprio serviço. Números registrados com contato não autorizado continuam bloqueados; permissões de canal explícitas são respeitadas. “Não informado” permite abrir os links por iniciativa do usuário. Nenhuma mensagem ou ligação é enviada automaticamente.

## Gestão → Verificar e corrigir turmas

Restrito a administradores, tanto no botão quanto na função. Antes de qualquer correção, lê turmas, alunos, base geral, usuários e catálogo; se uma leitura falhar, interrompe sem iniciar as correções.

Correções determinísticas:

- Remove espaços no início e no fim de campos de turma sem esvaziar nomes ou modalidades.
- Atualiza o nome exibido do professor quando o UID já está vinculado a um usuário com nome confirmado.
- Padroniza F/M nas matrículas como Feminino/Masculino.
- Atualiza atividades do catálogo a partir da turma atual, preservando a separação entre catálogo público e alunos privados.

São apenas sinalizados: identidade divergente da base geral, Aluno ID ausente/inexistente, matrícula repetida, turma sem nome/modalidade/professor, dias ausentes ou não reconhecidos, bairro não localizado e catálogo sem turma correspondente. Não exclui alunos nem turmas, não altera matrículas/IDs, não adivinha dias, professor ou identidade.

O navegador baixa JSON com diagnóstico e valores anteriores das correções planejadas. Contém dados pessoais: guarde como backup local. Alterações concorrentes são preservadas e informadas. A operação usa transações, pode ser executada novamente e informa correções concluídas em caso de interrupção. O catálogo é relido junto da turma em cada transação para evitar publicar uma edição antiga.

## Validação e entrega

53 testes passaram: os 43 anteriores e 10 novos cobrindo telefones, links, restrições, ficha, encerramento de sessão, revisão exclusiva de administrador, duplicidade, catálogo sem dados pessoais e edições concorrentes. Verificação de sintaxe e `git diff --check` concluídas. Testes de interface usam DOM simulado; navegador e Firebase real não foram acessados nesta entrega.

Pacote completo do site, com as melhorias 12.0. Esta mudança não exige novas regras além das regras V11 já necessárias ao cadastro único. Preserve `firebase-config.js` do seu projeto ao publicar. Após atualizar, confirme **Versão 12.1.0** na tela de acesso. Publicação automática indisponível: o conector GitHub recusou permissão de escrita anteriormente.
