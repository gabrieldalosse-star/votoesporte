# Reduzir leituras repetidas do Firestore e gravações redundantes de catálogo

Branch de origem: `codex/reduce-firestore-reads`  
Branch de destino: `main`  
Commit local: `f0f7be9`  
Estado: pronto para revisão local; branch não publicada e PR não aberto.

## Problema e resultado

Importar alunos e gerar matrículas relia a coleção completa da turma para cada linha/aluno. Alterar turmas também regravava o catálogo inteiro e fazia uma consulta administrativa redundante. Agora esses fluxos reutilizam o roster da operação e reconciliam apenas diferenças do catálogo.

Consultas simultâneas de alunos/base geral compartilham o pedido em andamento. Chamadas e relatórios podem usar a lista da turma com listener ativo confirmado pelo servidor. A abertura duplicada da chamada foi removida, e respostas atrasadas não substituem outra data/sessão.

## Integridade e sincronização

Preserva transações de cadastro único, IDs permanentes, contadores de matrícula e retorno público do salvamento. O roster da importação só é atualizado depois do commit. Não acrescenta limite arbitrário nos cadastros, cache com prazo ou alteração de regras/índices.

Mantém os listeners de turma selecionada e dos indicadores mensais. Reconciliação de catálogo aguarda snapshots de servidor sem gravações pendentes, serializa lotes de até 400 operações e só permite exclusão de órfãos para administrador.

## Validação

* 83 testes passaram: 69 existentes e 14 novos.
* Sintaxe de assets/app.js e diff verificados.
* Testes de transação usam mocks. Firebase Emulator e teste manual com duas contas não foram executados.
* Não foram acessados dados reais ou implantadas alterações.

## Impacto esperado e custos restantes

Exemplo calculado: reimportar 100 alunos numa turma de 100 reduz leituras de documentos nas consultas de listas de aproximadamente 20.100 para 200, excluindo transações, listeners e regras. Editar uma turma de 96 passa de até 96 gravações de catálogo e uma consulta de 96 documentos para uma gravação e nenhuma consulta adicional, quando o restante já está correto.

A carga inicial do censo, listeners mensais, relatórios por período e ferramentas administrativas completas permanecem. Não é possível atribuir todas as 31 mil leituras relatadas a um fluxo sem telemetria. Veja docs/AUDITORIA-FIRESTORE-2026-10-22.md.

## Publicação e revisão

O conector GitHub retornou 403 Resource not accessible by integration ao tentar criar a branch. O Git local não tinha credencial disponível. Por isso não há URL de PR.

O pacote entregue contém:

* alteracoes/: os quatro arquivos adicionados/modificados, com caminhos originais;
* votoesporte-firestore.patch: diff contra o commit-base;
* votoesporte-firestore.bundle: branch Git e histórico necessário para recuperar o commit;
* resultado-testes.txt: resultado da execução local;
* PR-FIRESTORE.md: esta descrição.

Em uma cópia autenticada do repositório no commit-base 2314cc512293e27eb12d8980234395c218800eee, o patch pode ser aplicado em uma nova branch e enviado para um PR destinado a main. Alternativamente, recupere a branch do bundle. Não envie os arquivos diretamente para a branch de produção.

Exemplo usando o bundle após extrair o pacote:

```powershell
git fetch CAMINHO/votoesporte-firestore.bundle refs/heads/codex/reduce-firestore-reads:refs/heads/codex/reduce-firestore-reads
git switch codex/reduce-firestore-reads
git push -u origin codex/reduce-firestore-reads
```

Depois abra um PR para main com este título/descrição e homologue os fluxos descritos na auditoria antes de aprovar.
