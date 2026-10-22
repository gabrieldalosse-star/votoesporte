# Auditoria de leituras do Firestore — 22/10/2026

Base examinada: commit `2314cc512293e27eb12d8980234395c218800eee`, branch principal de `gabrieldalosse-star/votoesporte`.

## Conclusão

Há multiplicação de leituras no código, especialmente em importação e numeração de matrículas. O PR elimina essas releituras e a consulta redundante de catálogo, compartilha consultas simultâneas e reaproveita o roster da turma com listener ativo em chamadas e relatórios. Não muda regras, índices, modelo de documentos ou infraestrutura.

O usuário informou aproximadamente 31 mil leituras (61,5% da franquia de 50 mil), 2,6 mil gravações e 13 exclusões. Esses valores são agregados: sem telemetria por operação, não é possível dizer quantas das leituras vieram de cada fluxo nem prometer uma redução percentual diária. O arredondamento de 31 mil também explica por que a porcentagem não é exatamente 62%.

Não foram acessados dados de produção, realizados testes contra o projeto Firebase real, publicados arquivos em hospedagem, implantadas regras ou feita migração de banco.

## Causas verificadas e alterações

| Fluxo em assets/app.js | Antes | Depois |
| --- | --- | --- |
| repository.importStudents + saveRegisteredStudent | Cada linha consulta a turma; o salvamento consulta a turma novamente. A lista cresce a cada inserção. | Uma lista inicial, atualizada com o resultado de cada transação confirmada; uma atualização final. Mantém retorno do salvamento como ID string. |
| assignEnrollmentCode + migrateEnrollments + number-students | Consulta toda a turma para cada aluno sem código; migração relê mesmo quando ninguém precisa de código. | Compartilha roster com a operação inteira; só atualiza ao final se houve matrículas pendentes. Preserva transações e contador por turma. |
| afterClassesChanged → syncActivityCatalogue | Regrava todas as turmas acessíveis em cada snapshot de turmas. Administrador também consulta todo o catálogo para encontrar órfãos. | Compara apenas campos públicos com o catálogo já observado; grava somente diferenças e remove órfãos somente como administrador. Nenhum getDocs extra. |
| syncActivityCatalogue concorrente | Chamadas podem sobrepor lotes. | Serializa e reavalia alterações recebidas enquanto um lote estava pendente; lotes de até 400 operações. |
| loadStudents | Consultas iguais simultâneas de hidratação, migração, chamada e relatórios são independentes. | Uma consulta em andamento por sessão/turma. A entrada sai do mapa ao terminar ou falhar; consultas posteriores continuam buscando dados atuais. |
| ensureAttendanceReady / buildReport | Sempre consultam alunos, mesmo com listener ativo já abastecido pelo servidor. | Podem usar exclusivamente a turma com listener ativo confirmado pelo servidor. Outras turmas continuam com consulta atual. |
| openAttendanceFor | setActiveView já prepara a chamada e a função a prepara novamente. | Um único preparo, iniciado ao trocar de tela. |
| readRegistry | Duas aberturas/renderizações simultâneas da base podem disparar duas consultas completas. | Compartilha somente o pedido em andamento e descarta resposta após troca de sessão/perda de acesso administrativo. |
| loadAttendance | Resposta lenta de uma data pode substituir a chamada de outra data ou sessão. | Verifica sessão, turma, data e ordem do pedido antes de aplicar resposta. |

O roster da importação só recebe IDs e matrículas depois da confirmação da transação. As leituras transacionais de identidade, ficha, cadastro global e contadores continuam necessárias para integridade. Linhas repetidas no mesmo CSV passam a encontrar o vínculo recém-gravado. Falhas não publicam resultado no roster.

A reconciliação de catálogo aguarda snapshots de servidor sem gravações pendentes tanto de turmas quanto do catálogo. Isso evita usar um cache vazio/incompleto como prova de que uma turma foi excluída. Mudanças de metadados também são observadas para saber quando essa confirmação chegou. Professores não excluem entradas de turmas de outros professores.

## Custos: exemplos calculáveis, não medições de produção

Considere N matrículas existentes, R linhas importadas, T turmas e M alunos sem matrícula.

* Reimportar R alunos já existentes: aproximadamente `2 × R × N + N` documentos de listas antes, contra `2 × N` depois, fora transações, regras e listeners. Com N=R=100: **20.100 → 200** leituras de documentos nessas consultas de lista.
* Inserir 100 alunos em turma vazia: as duas varreduras por linha somam `2 × (0+1+...+99)`, mais a atualização final: aproximadamente 10 mil documentos lidos antes. Depois, consulta inicial vazia e lista final de 100. Consultas vazias têm cobrança mínima.
* Gerar M matrículas: elimina M varreduras adicionais de N documentos. As duas leituras transacionais por tentativa, aluno e contador, permanecem, assim como possíveis retries.
* Editar uma turma entre T=96: antes, até 96 gravações de catálogo e uma consulta administrativa de 96 documentos; depois, **uma gravação e zero consultas adicionais de catálogo**, supondo outras entradas já corretas.
* Abrir chamada da turma com roster vivo pronto: elimina a consulta repetida de alunos e uma segunda preparação da mesma chamada. Primeira abertura antes do snapshot vivo ainda pode precisar de consulta.

Não foi acrescentada gravação de métricas no Firestore. Não foi introduzido custo de Cloud Functions, nova infraestrutura, agregados ou migração. O PR não requer novos índices nem alteração de regras. Como a configuração regional e o plano efetivo não foram auditados, não há estimativa monetária inventada.

## Listeners, renderizações e paginação

* `classes`: listener global para administrador, filtrado por teacherId para professor. Reassinar ocorre no preparo da sessão e em ações explícitas, não a cada renderização.
* `selectedStudents`: somente uma turma selecionada; anterior cancelado ao trocar. Reuso de dados vivos é desabilitado em cache, erro e troca de assinatura/sessão.
* `syncMonthlyAttendance`: um listener por turma acessível, limitado ao mês corrente. Esse é um custo inicial real: por exemplo, 96 turmas × 20 chamadas = 1.920 documentos por sessão administrativa, além das atualizações. Foi preservado para manter os indicadores mensais sincronizados.
* `hydrateCensusStudents`: carrega inicialmente alunos de todas as turmas acessíveis para os totais, gráficos e mapa. 96 × 30 = 2.880 documentos por sessão, antes dos demais dados. O custo cresce com cada navegador, aba e novo acesso. Esta carga completa foi preservada para não transformar totais em contagens parciais silenciosamente.
* Outros listeners: catálogo, zonas e centros esportivos; usuários para administrador; ocorrências limitadas a 80, filtradas por professor quando aplicável. Cancelamento geral existe no encerramento da sessão.
* Histórico de turma: até 30 chamadas. Relatórios de presença consultam o intervalo escolhido e continuam atualizados a cada geração. Eles ainda podem ler documentos também presentes nos listeners mensais; isso está documentado como custo residual.
* A paginação de 30 alunos em `assets/insights.mjs` é visual, sobre dados já carregados; mudar a página não consulta Firestore. Ela não reduz o custo de hidratação inicial.
* Busca na base geral filtra em memória; digitar não relê Firestore. Reabrir a base em outro momento faz nova consulta, para manter atualização.
* `renderDashboard`, gráficos e filtros redesenham dados em memória. Uma renderização DOM não equivale automaticamente a leitura Firestore. Foram removidos pedidos duplicados reais, sem tratar toda renderização como consulta.
* Correções administrativas, auditoria integral, backups e exclusões continuam com consultas completas explícitas. Não foram escondidas atrás de cache para reduzir números à custa de consistência.
* As regras usam `exists(adminUsers/...)` e `get(classes/...)`; leituras de dependências das regras também podem ser cobradas. Chamadas repetidas podem se beneficiar do cache de avaliação, mas não se deve multiplicar automaticamente cada chamada textual de regra por documentos retornados.

Não foi introduzido `limit` arbitrário nos alunos/base geral: isso quebraria relatórios, detecção de vínculos, maior matrícula e contagens. Uma próxima etapa de escala deve separar busca paginada por cursor de agregados de totais e relatórios processados no servidor. Paginar uma lista e continuar carregando tudo para os gráficos não resolve a origem do custo.

O aplicativo usa leituras pontuais para abrir o documento de chamada, não um listener desse documento. O PR preserva esse comportamento e os listeners mensais existentes; não afirma adicionar edição colaborativa em tempo real à chamada aberta.

## Validação e limites

Execução local: `node --test tests/*.test.mjs`, incluindo regressões de cadastro único, transações simuladas, IDs permanentes, matrículas, relatórios, permissões, CEP, território e contatos, além dos testes novos de consumo. Validação sintática de `assets/app.js` e `git diff --check`.

Os novos testes verificam: deduplicação somente em andamento; retry; isolamento de sessão; uso de roster vivo; catálogo sem diferenças; atualização unitária; ausência de exclusão por professor; espera por snapshots autoritativos; filas concorrentes; limites de lote; falha/retry; interrupção entre lotes na troca de sessão; importação com linhas repetidas; retorno de ID/código após commit; numeração crescente e resposta tardia da chamada.

Não foi executado Firebase Emulator nem teste manual com duas contas em navegadores. Os testes de transação usam mocks; não comprovam regras publicadas, índices implantados ou redução efetiva da fatura.

Para homologar o PR antes de produção: em projeto de teste, importar/reimportar um CSV conhecido e conferir IDs/códigos; abrir a mesma turma em duas contas autorizadas e editar cadastro; trocar rapidamente turma/data; gerar relatórios mensal e semanal; editar turma e conferir catálogo; validar exclusão administrativa e troca de conta. Comparar leituras/gravações para a mesma sequência antes/depois. Medir em janela sem outros usuários e considerar dependências das regras e consultas vazias.

## Banco gratuito e crescimento

**Recomendação para este sistema: PostgreSQL, começando pelo Supabase se quiser hospedagem gratuita com recursos de aplicação.** O modelo relacional combina com alunos, matrículas, turmas e presença. É uma recomendação arquitetural; este PR continua usando Firestore.

| Opção | Franquia consultada em 22/10/2026 | Limite relevante |
| --- | --- | --- |
| Supabase Free / PostgreSQL | 500 MB de banco, 50 mil usuários ativos/mês, requisições de API ilimitadas, 5 GB de saída | CPU/RAM compartilhadas, pausa após uma semana sem atividade; requisições ilimitadas não são capacidade ilimitada. |
| Neon Free / PostgreSQL | 1 GB por projeto, 100 CU-horas/mês por projeto | Computação, armazenamento e transferência limitam a operação; avaliar também requisitos de sincronização. |
| Cloudflare D1 Free | 5 milhões de linhas lidas/dia, 100 mil escritas/dia, 5 GB totais | 500 MB por banco e limites de Workers; leituras contam linhas examinadas, não apenas retornadas. Não é substituição direta do SDK Firestore. |
| PostgreSQL em servidor próprio/institucional | Software sem licença paga e sem franquia diária imposta pelo software | Servidor, discos, backup, disponibilidade e operação têm custo ou usam recursos já existentes. |

Para grande escala, a licença do PostgreSQL pode continuar gratuita; hospedagem gerenciada gratuita não garante escala ilimitada. Eu começaria com a otimização atual e só migraria após medir volume e orçamento. Uma migração exigiria traduzir permissões para RLS/backend, preservar IDs e contadores, migrar autenticação ou integrá-la e reconstruir a sincronização; trocar apenas a configuração não funciona.

Fontes oficiais:

* Firestore cobrança e franquia: https://firebase.google.com/docs/firestore/pricing
* Supabase: https://supabase.com/pricing
* Neon: https://neon.com/pricing
* D1 cobrança: https://developers.cloudflare.com/d1/platform/pricing/
* D1 limites: https://developers.cloudflare.com/d1/platform/limits/
* Licença PostgreSQL: https://www.postgresql.org/about/licence/
