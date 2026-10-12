# Privacidade e segurança

## Compromisso deste MVP

O aplicativo foi preparado para não trazer listas, planilhas, nomes ou contatos de alunos. A base começa vazia e os dados só podem ser inseridos pela instituição após definir finalidade, responsáveis, permissões e base legal adequadas.

O código hospedado no GitHub Pages é público ou acessível a quem tiver acesso ao repositório, conforme a configuração do GitHub. Ele deve conter somente o aplicativo estático. Dados de alunos ficam no Cloud Firestore, protegidos por autenticação e regras de segurança — nunca dentro do repositório, de um arquivo CSV versionado, de uma captura de tela ou de um exemplo demonstrativo.

Este documento é orientação operacional, não parecer jurídico. A instituição responsável deve validar o tratamento com sua área jurídica, encarregado(a) de dados/DPO e políticas públicas aplicáveis, especialmente sob a LGPD.

## Quais dados o formulário pode receber

| Finalidade | Campos possíveis | Regra de minimização |
| --- | --- | --- |
| Identificar a matrícula | nome completo, nome social, código de matrícula, data de nascimento | O nome completo é o mínimo para identificar o registro. Solicite os demais somente quando necessários. |
| Comunicar responsáveis | nome, telefone e e-mail de responsável; telefone do aluno quando autorizado | Registre contato preferencial, canal autorizado e data da autorização. Não exponha números em relatórios de rotina. |
| Organização territorial | CEP, endereço, bairro, cidade e UF | Só registre se houver finalidade documentada; endereço completo deve ser exceção, não padrão. |
| Referência educacional | escola, turno, código externo/censo e situação de matrícula | Use apenas códigos oficiais ou já validados pela gestão. Não deduza códigos nem faça cruzamentos não autorizados. |
| Frequência | presenças, faltas e nota operacional de chamada | Registre somente o necessário para comprovar a frequência. |
| Território agregado | zona, setor, fonte e versão da camada | Use zonas aprovadas; não armazene pino, coordenada residencial ou resultado de geocodificação de endereço. |

Não inclua em observações, CSVs ou qualquer campo livre: laudos, diagnósticos, condições de saúde, deficiência, medicação, documentos, informações disciplinares, senhas, dados de familiares além do contato necessário, ou outros dados sensíveis. Se um atendimento realmente exigir informação sensível, ele deve seguir um processo institucional específico, fora de um campo de observação genérico.

## Censo+ e planilhas antigas

A planilha consolidada do Censo+ citada no contexto anterior não está disponível neste ambiente. O aplicativo não tenta acessar, copiar nem completar dados a partir dela. O campo `codigo_censo` e o modelo CSV servem somente como uma estrutura adaptável para referências que a instituição já esteja autorizada a usar.

Antes de qualquer migração, a instituição deve confirmar origem, atualização, finalidade, permissão e qualidade de cada linha. Não envie uma planilha integral para um repositório, um chat ou um ambiente de teste. O processo recomendado é migrar de modo controlado, aluno a aluno ou por arquivo revisado para uma turma específica.

Os campos-base Censo+ desta versão são apenas identificador de integração, referência de coleta e status de revisão. A ordem e os campos específicos devem ser incluídos somente após a gestão enviar a sequência, finalidade e dicionário de dados. Veja também [CENSO-E-TERRITORIO.md](CENSO-E-TERRITORIO.md).

## Controles implementados

O MVP usa os controles abaixo quando a configuração do [Firebase](GUIA-FIREBASE.md) está concluída:

- **Firebase Authentication com Google:** identifica a pessoa que acessa o sistema.
- **Perfis individuais:** cada professor mantém apenas seu perfil profissional.
- **Regras do Cloud Firestore:** um professor autenticado acessa somente as turmas em que é responsável e suas subcoleções de alunos e chamadas.
- **Papel administrativo separado:** a autorização administrativa depende de um documento `adminUsers/{uid}` criado fora do navegador. Um usuário não pode tornar a si próprio administrador pela tela de perfil.
- **Separação de dados:** alunos e chamadas ficam abaixo da turma, e a turma carrega o identificador do professor responsável.
- **Camada territorial separada:** `territoryZones` não recebe dados de alunos e só pode ser alterada por administrador provisionado.
- **Validação de formato no Firestore:** as regras aceitam somente os campos previstos, seus tipos, limites de texto e valores controlados do MVP. Uma alteração no formulário exige revisão e nova publicação das regras.
- **Transporte seguro:** GitHub Pages e Firebase usam HTTPS quando publicados corretamente.

Esses controles só protegem a operação se as regras presentes em `firestore.rules` forem publicadas no projeto Firebase correto. Criar um banco em modo de teste ou deixar regras abertas anula essa proteção. Faça o teste de acesso cruzado com duas contas de professor antes de usar dados reais.

## Responsabilidades da instituição

Antes de entrar em produção, defina e registre:

1. quem é o controlador dos dados e quem atua como operador;
2. a finalidade de cada campo e a base legal aplicável;
3. quais pessoas terão perfil de professor e de administrador;
4. prazo de retenção para cadastros, chamadas e relatórios;
5. procedimento para corrigir, exportar, restringir ou eliminar dados quando cabível;
6. canal de contato para responsáveis e titulares de dados;
7. procedimento de resposta a incidentes e comunicação às autoridades/titulares quando aplicável.

Em especial, a instituição deve decidir se endereço, data de nascimento, gênero, contato alternativo e código externo são realmente necessários. Deixar um campo disponível não obriga seu preenchimento.

## Regras para importação e exportação

### Importação

- Baixe o modelo e trabalhe em uma cópia protegida.
- Selecione a turma antes de enviar o CSV; não misture alunos de grupos diferentes.
- Mantenha apenas colunas necessárias e apague cópias temporárias após a validação institucional.
- Revise a prévia antes de confirmar a gravação.
- Para contatos, confirme que a coluna `canal_contato_autorizado` corresponde à autorização realmente registrada; ela não deve ser presumida.
- Para território, use apenas zona/setor aprovado. Não importe latitude, longitude, endereço geocodificado ou ponto residencial.
- Nunca use o próprio arquivo-modelo para guardar dados reais nem o envie em serviços públicos.

### Exportação

- Gere CSV ou PDF somente para uma finalidade de trabalho identificada.
- Guarde o arquivo em ambiente institucional com acesso restrito.
- Não envie listas por redes sociais, grupos de mensagens, e-mail pessoal ou links públicos.
- Ao terminar a finalidade, descarte cópias locais segundo a política de retenção da instituição.
- Ao compartilhar um relatório, prefira totais agregados e remova identificadores pessoais sempre que possível.

## Segurança de contas e dispositivos

- Use uma conta Google individual, com senha forte e verificação em duas etapas.
- Nunca compartilhe senha, sessão do navegador ou dispositivo desbloqueado.
- Saia da plataforma em computadores compartilhados.
- Esta versão usa cache de memória para o Firebase em produção; ao fechar a aba, ela não mantém uma cópia offline planejada da base no navegador. O modo local de demonstração usa `localStorage`: nunca insira dados reais nele e limpe os dados do site ao terminar um teste em computador compartilhado.
- Mantenha navegador e sistema operacional atualizados.
- Não instale extensões desconhecidas no navegador usado para acessar o sistema.
- Restrinja a chave de API web por origem, mas não a trate como segredo. A segurança dos dados deve estar nas regras do Firestore e no controle de acesso.
- A conta de serviço do Firebase Admin SDK, caso exista, deve ficar exclusivamente em infraestrutura administrativa protegida; ela jamais deve ser enviada ao GitHub Pages ou ao navegador.

## Retenção, revisão e eliminação

Dados de frequência podem ter obrigações de guarda diferentes de dados de contato. Por isso, não use uma exclusão automática sem uma política aprovada. Revise periodicamente:

- matrículas inativas ou duplicadas;
- contatos desatualizados;
- professores e administradores que não atuam mais;
- relatórios exportados fora do Firestore;
- necessidade de manter históricos de chamadas por período.

Para atender um pedido de correção ou exclusão, primeiro confirme a identidade e avalie se há obrigação legal, administrativa ou de prestação de contas que imponha retenção. Documente a decisão e limite o acesso enquanto o pedido é tratado.

## Se houver suspeita de incidente

1. Suspenda ou desabilite a conta suspeita e remova o acesso administrativo, se necessário.
2. Preserve evidências e registre horário, contas afetadas e tipo de dado envolvido.
3. Revise imediatamente regras Firestore, domínios autorizados e permissões do projeto.
4. Informe a coordenação, a área de segurança e o encarregado de dados da instituição.
5. Avalie notificações a titulares e autoridades conforme a legislação e as políticas aplicáveis.
6. Corrija a causa, teste novamente com contas separadas e documente as medidas tomadas.

Não tente resolver um incidente copiando a base para outro serviço ou enviando planilhas por canais pessoais: isso pode ampliar a exposição.

## Checklist antes de usar dados reais

- [ ] Regras `firestore.rules` publicadas e testadas com duas contas de professor.
- [ ] Domínio do site autorizado no Firebase Authentication.
- [ ] Administradores provisionados por procedimento institucional, não pela interface do site.
- [ ] Finalidade e base legal de cada campo aprovadas.
- [ ] Política de retenção e descarte definida.
- [ ] Procedimento de importação, exportação e resposta a incidente comunicado à equipe.
- [ ] Autorização e canal de contato revisados antes de usar WhatsApp ou ligação.
- [ ] Camada territorial aprovada, com fonte, versão e uso permitido documentados.
- [ ] Qualquer novo campo da sequência Censo+ foi incluído também na validação de `firestore.rules` e testado antes da publicação.
- [ ] Nenhum arquivo com dados reais está no repositório GitHub, no manual, no CSV-modelo ou em capturas de tela públicas.

