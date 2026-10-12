# Manual de uso

## O que esta plataforma faz

Este MVP organiza turmas, cadastro de alunos, chamadas e relatórios para professores da Rede Esportiva de Votorantim. Ele foi desenhado para uso em celular ou computador, com cada conta acessando somente o que lhe cabe.

O sistema começa vazio de propósito: não há alunos, turmas ou nomes pré-cadastrados. Cada professor cria suas próprias turmas após entrar com uma conta Google autorizada.

Enquanto `firebase-config.js` estiver vazio, a tela inicial oferece **Explorar em modo local** apenas para testar a interface. Esse modo guarda o que foi digitado somente no navegador atual; ele não é uma base institucional e não sincroniza dados entre navegadores.

## Tour guiado no próprio site

No menu lateral, abra **Guia interativo** e selecione **Iniciar tour guiado**. O tour apresenta a sequência de trabalho dentro do aplicativo:

1. confirmar o perfil profissional;
2. criar uma turma;
3. cadastrar ou importar alunos;
4. registrar a chamada e acompanhar relatórios.

Use este manual quando precisar de mais contexto sobre uma tela ou uma decisão de cadastro.

## Primeiro acesso

1. Abra o endereço oficial da plataforma.
2. Escolha **Continuar com Google**.
3. Entre com a conta que a coordenação autorizou.
4. No primeiro acesso, complete o perfil profissional: nome de uso profissional, telefone profissional, modalidade e unidade/polo de referência.
5. Salve. O painel estará vazio até que uma turma seja criada.

Se o login não abrir, confira a seção “Problemas comuns” ao fim deste manual ou peça à coordenação que verifique os domínios autorizados no Firebase.

## Papéis de acesso

| Papel | Pode fazer |
| --- | --- |
| Professor | Criar e editar as próprias turmas, cadastrar/importar alunos dessas turmas, fazer chamadas e consultar seus relatórios. |
| Administrador | Consultar a visão de gestão além das funções permitidas ao professor. |

O papel de administrador não é atribuído pelo site. Ele é liberado pela instituição no Firebase, conforme o [Guia de configuração](GUIA-FIREBASE.md). Não compartilhe a conta Google e não solicite que outro professor registre chamada em seu lugar.

## Criar uma turma

1. Abra **Minhas turmas** ou use **Cadastrar turma** no painel inicial.
2. Preencha o nome de identificação interna da turma e a modalidade.
3. Complete, quando útil, faixa etária, local/polo, dias e horário.
4. Use a observação apenas para informação operacional da turma; não escreva dados de saúde, laudos ou situações pessoais de alunos.
5. Salve a turma.

Uma turma pertence ao professor que a criou. Para transferir responsabilidade entre contas, peça apoio ao administrador; não tente resolver compartilhando senha ou duplicando uma lista de alunos.

## Cadastrar um aluno individualmente

Dentro de uma turma, escolha a opção para adicionar aluno. O cadastro foi organizado por blocos para evitar esquecer informações necessárias e, ao mesmo tempo, não exigir dados em excesso.

| Bloco | Informações disponíveis | Como usar com responsabilidade |
| --- | --- | --- |
| Identificação | nome completo, nome social, data de nascimento, matrícula, gênero opcional | Registre apenas o necessário para identificar a matrícula e conduzir a atividade. |
| Responsável e contato | nome, telefone, telefone alternativo, e-mail | Use somente contatos institucionais ou autorizados. Revise antes de salvar. |
| Endereço | CEP, UF, logradouro, número, complemento, bairro e cidade | Preencha somente se houver necessidade definida pela instituição. |
| Referência escolar e Censo+ | escola, turno, código externo/censo, situação de matrícula | Use códigos já autorizados pela gestão; não deduza nem invente códigos. |
| Observações | nota operacional curta | Nunca use para saúde, deficiência, diagnóstico, documentos, senhas ou informações sensíveis. |

O nome completo é a informação essencial para criar o registro. Os demais campos devem ser preenchidos conforme a necessidade institucional e a base legal aplicável. Consulte [Privacidade e segurança](PRIVACIDADE-E-SEGURANCA.md) antes de incluir endereço, telefone ou dados de referência escolar.

## Importar alunos por CSV

### Antes de importar

1. Crie a turma de destino.
2. Abra **Importar alunos** no menu.
3. Escolha a turma correta.
4. Baixe **Baixar modelo CSV** ou abra o arquivo `data/modelo-importacao-alunos.csv`.
5. Preencha a sua cópia e salve-a em formato **CSV UTF-8**.

O modelo contém somente o cabeçalho, sem linhas de pessoas. Não altere os nomes das colunas e não acrescente dados no arquivo-modelo original; trabalhe sempre em uma cópia.

### Colunas aceitas

```text
nome_completo,nome_social,data_nascimento,matricula_codigo,responsavel_nome,
telefone_responsavel,telefone_aluno,telefone_alternativo,email_responsavel,
contato_preferencial,canal_contato_autorizado,data_consentimento,cep,uf,
logradouro,numero,complemento,bairro,cidade,escola,turno,codigo_censo,
identificador_censo,referencia_coleta_censo,status_revisao_censo,
zona_territorial,setor_territorial,fonte_territorial,situacao_matricula,observacoes
```

Regras práticas:

- uma linha representa um aluno e a importação deve conter somente alunos da turma selecionada;
- use data no formato `AAAA-MM-DD` quando preencher `data_nascimento`;
- mantenha CEP, telefone, matrícula e código externo como texto para preservar zeros iniciais;
- use `Ativa`, `Pendente` ou `Inativa` em `situacao_matricula`;
- use `whatsapp`, `call`, `both`, `no_contact` ou `not_informed` em `canal_contato_autorizado`;
- não preencha telefone do aluno, canal de contato ou data de consentimento sem confirmação institucional;
- revise duplicidades de matrícula e de nome antes de enviar;
- não use a coluna `observacoes` para conteúdo sensível.

Após selecionar o arquivo, o sistema mostra uma prévia. Confira a quantidade de linhas, a turma de destino e os campos antes de selecionar **Importar alunos revisados**. Se houver dúvida, cancele a importação, corrija a cópia do CSV e envie de novo.

### Sobre a planilha consolidada e o Censo+

A planilha consolidada mencionada no projeto anterior **não está acessível neste ambiente**. Por privacidade, este MVP também não tenta copiar, inferir ou pré-preencher seus dados. O CSV entregue é uma **estrutura adaptável**, inspirada em necessidades usuais de identificação, contato, endereço e referência escolar; ele não é uma réplica da planilha anterior nem um modelo oficial de Censo+.

A migração deve ser feita aluno a aluno ou por CSV somente após validação da instituição. O campo `codigo_censo` serve para guardar uma referência externa já autorizada; não cria integração automática com uma base Censo+ e não substitui os processos oficiais.

### Contatos autorizados e território

No cadastro individual, escolha o contato preferencial e o canal autorizado. Os botões **WhatsApp** e **Ligar** não aparecem ativos sem autorização e nunca enviam mensagem automaticamente. Para menores, use o responsável como padrão.

Abra **Censo+ e território** para consultar o mapa agregado. Apenas administradores podem importar uma camada GeoJSON aprovada; ela deve conter zonas ou setores, não endereços ou pinos de residência. A associação do aluno a uma zona é manual e pode ser revisada no cadastro. Leia [CENSO-E-TERRITORIO.md](CENSO-E-TERRITORIO.md) antes de importar a primeira camada.

## Fazer chamada

1. Abra **Fazer chamada**.
2. Selecione a turma e confirme a data. A data pode ser ajustada para corrigir uma chamada passada, se a política da instituição permitir.
3. Revise a lista. Marque presença ou falta de cada aluno, ou use **Todos presentes** como ponto de partida e ajuste as exceções.
4. Confira o indicador de alunos marcados.
5. Escolha **Salvar chamada** e aguarde a confirmação.

Uma chamada fica associada à turma e à data. Antes de fechar a página, confirme que o estado indica que a gravação foi concluída. Se a conexão cair, não suponha que a alteração foi sincronizada; recarregue depois de recuperar a internet e confira a data escolhida.

## Consultar histórico e evolução de frequência

Na área da turma, o histórico permite revisar os registros já salvos. O relatório mensal consolida as chamadas e apresenta, conforme houver dados:

- número de aulas/chamadas no período;
- presença e falta por turma;
- taxa de presença;
- comparativo por professor ou turma no escopo autorizado;
- evolução individual de frequência ao longo das chamadas existentes.

“Evolução” neste MVP significa evolução de **frequência**. Ela não mede desempenho esportivo, condição física, comportamento, saúde ou qualquer atributo sensível. Use os indicadores como apoio pedagógico e administrativo, nunca como decisão automática sobre um aluno.

## Gerar e exportar relatórios

1. Abra **Relatórios**.
2. Selecione o mês e a turma desejada, ou mantenha todas as suas turmas.
3. Clique em **Gerar relatório**.
4. Para uma planilha, use **Exportar CSV**.
5. Para um documento, use **Salvar em PDF**. O navegador abrirá a janela de impressão; escolha “Salvar como PDF”.

CSV e PDF podem conter dados pessoais. Baixe apenas quando necessário, guarde em local institucional protegido e não envie por grupos, redes sociais ou repositórios públicos. Os PDFs são produzidos pelo navegador; a disponibilidade e o layout dependem do dispositivo e do navegador em uso.

## Boa rotina de trabalho

- Faça a chamada na data correta e salve antes de sair.
- Prefira uma turma bem organizada a criar duplicatas por pequenos ajustes de nome.
- Revise importações antes de confirmar e mantenha a planilha de trabalho em ambiente protegido.
- Verifique o relatório ao fim do mês para identificar falta de registros, não para tirar conclusões sem contexto.
- Peça à coordenação para desativar acessos de pessoas que não atuam mais no projeto.

## Problemas comuns

| Situação | O que verificar |
| --- | --- |
| “Configuração Firebase pendente” | `firebase-config.js` não foi preenchido ou não chegou à publicação do GitHub Pages. |
| A janela Google fecha sem entrar | A conta pode não estar autorizada, o provedor Google pode estar desabilitado ou o domínio do site pode não constar no Firebase Authentication. |
| Não vejo a turma de outro professor | Isso é esperado: o acesso é separado por conta. Procure a coordenação se for uma necessidade administrativa legítima. |
| Não consigo salvar uma chamada | Confira a conexão, se a turma é sua e se as regras do Firestore foram publicadas. Não tente contornar a regra usando outra conta. |
| O CSV não aparece na prévia | Confirme que o arquivo é CSV UTF-8, que os cabeçalhos não foram alterados e que uma turma foi selecionada. |
| O relatório está vazio | Confira o mês, a turma e se as chamadas daquele período foram realmente salvas. |

Para questões de permissões e implantação, veja o [Guia de configuração Firebase](GUIA-FIREBASE.md). Para tratamento de dados, veja [Privacidade e segurança](PRIVACIDADE-E-SEGURANCA.md).

