# Guia de configuração do Firebase

Este guia conecta o MVP da **Chamada da Rede Esportiva de Votorantim** ao Firebase. O pacote entregue não traz projeto Firebase, contas, alunos nem dados pessoais: essa etapa deve ser feita pela instituição responsável.

> Importante: este aplicativo pode ser publicado como site estático no GitHub Pages, mas o login, as permissões e os dados continuam no Firebase. Publicar o código não publica automaticamente uma base de alunos.

## Antes de começar

É necessário ter:

- uma conta Google com permissão para criar um projeto Firebase da instituição;
- um repositório GitHub destinado ao aplicativo;
- acesso à conta que administrará os dados e às regras do Firestore;
- uma decisão institucional sobre quem será administrador e quais dados são necessários.

Para testes, use um projeto Firebase separado do projeto de produção. Não use uma planilha real, nomes reais ou dados de contato no ambiente de teste.

## 1. Criar o projeto e o aplicativo web

1. Abra o [Firebase Console](https://console.firebase.google.com/) e crie um projeto novo da instituição.
2. Registre um aplicativo **Web** no projeto.
3. Copie os valores mostrados em “Configuração do SDK”.
4. Abra `firebase-config.js`, na raiz deste pacote, e preencha apenas os campos indicados:

```js
window.FIREBASE_CONFIG = {
  apiKey: "COLE_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};
```

O arquivo `firebase-config.example.js` é um modelo seguro para referência. A configuração web do Firebase identifica o projeto no navegador; ela **não** substitui as regras de acesso. A proteção real dos registros depende do Firebase Authentication, das regras do Firestore e da gestão de contas.

Antes de tornar o repositório público, revise as restrições da chave de API no Google Cloud e permita somente as origens necessárias, como o domínio do GitHub Pages. Faça isso depois de confirmar que o login funciona, para não bloquear o ambiente por engano.

## 2. Habilitar login com Google

1. No Firebase Console, abra **Authentication** e clique em **Começar**.
2. Em **Sign-in method**, habilite **Google**.
3. Informe o e-mail de suporte solicitado pelo Firebase e salve.
4. Em **Settings / Authorized domains**, confira o domínio usado na publicação. Para GitHub Pages, ele normalmente tem o formato `SEU_USUARIO.github.io`; acrescente também um domínio próprio, se houver.
5. Faça um teste com uma conta Google autorizada pela instituição.

O primeiro acesso cria ou atualiza o perfil profissional do professor. Isso não dá poderes administrativos à conta.

## 3. Criar o Cloud Firestore e aplicar as regras

1. Abra **Firestore Database** no Firebase Console e crie o banco em modo de produção.
2. Escolha a localização com cuidado: ela influencia latência, governança e não deve ser trocada depois sem migração. A decisão deve considerar as políticas da instituição e a LGPD.
3. No diretório deste aplicativo, mantenha os arquivos `firestore.rules` e `firestore.indexes.json` incluídos no pacote.
4. Publique as regras antes de cadastrar dados reais.

Com a Firebase CLI instalada e autenticada, execute no diretório raiz do aplicativo:

```bash
firebase login
firebase use SEU_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

Também é possível copiar o conteúdo de `firestore.rules` para o editor de regras no Console e publicá-lo por lá. A CLI é preferível porque deixa a regra versionada junto com o aplicativo.

As regras fornecidas protegem a estrutura abaixo:

```text
users/{uid}                           perfil do próprio usuário
adminUsers/{uid}                      autorização administrativa
classes/{classId}                     turma e seu professor responsável
classes/{classId}/students/{studentId} cadastro do aluno da turma
classes/{classId}/attendance/{YYYY-MM-DD} chamada e histórico da turma
```

Cada documento de chamada usa a data como identificador e guarda `records[studentId]` com o status de presença/falta e uma nota operacional opcional, além das contagens agregadas. Assim, a chamada de uma turma é gravada e sincronizada como uma unidade, em vez de criar um documento por aluno.

Um professor autenticado só pode acessar turmas cujo `teacherId` seja o seu próprio `uid`. Um administrador pode consultar a visão de coordenação. A autorização não é decidida por um campo editável no perfil do usuário.

## 4. Designar a primeira conta administradora

O administrador é provisionado fora do site, pelo Firebase Console ou por um processo institucional com Admin SDK. O navegador não pode conceder esse papel.

1. Peça à pessoa responsável que entre no aplicativo uma vez, para que exista uma conta Firebase Authentication.
2. No Firebase Console, localize o `uid` dessa conta em **Authentication / Users**.
3. Em Firestore, crie o documento `adminUsers/{uid}`. A existência do documento é a autorização; não é necessário inserir dados de alunos ou dados de perfil nele.
4. Peça que a pessoa saia e entre novamente para atualizar a sessão.

Mantenha poucos administradores, registre a aprovação institucional e remova o documento `adminUsers/{uid}` quando a pessoa deixar de exercer essa função.

## 5. Publicar no GitHub Pages

O GitHub Pages hospeda apenas os arquivos estáticos. Não é necessário usar Firebase Hosting para este MVP.

1. Crie um repositório vazio no GitHub e envie o conteúdo da pasta `chamada-esportiva-votorantim` para a raiz do repositório.
2. Preencha `firebase-config.js` com a configuração do projeto que será usado na publicação.
3. No GitHub, abra **Settings / Pages** e selecione **GitHub Actions** como fonte. O arquivo `.github/workflows/deploy-pages.yml` já prepara e publica a raiz estática quando houver envio para `main`.
4. Aguarde o endereço do site informado pelo GitHub e acrescente seu domínio à lista de domínios autorizados do Firebase Authentication, se ele ainda não estiver lá.
5. Abra o endereço publicado, entre com uma conta autorizada e confirme os testes abaixo.

O arquivo `.nojekyll` já está incluído para evitar que o GitHub Pages ignore arquivos ou diretórios que possam ser relevantes ao site estático. Este pacote não foi publicado por quem o entregou: a publicação depende da conta GitHub e das autorizações da instituição.

Não envie ao repositório:

- planilhas de alunos, exports CSV ou PDFs com dados pessoais;
- capturas de tela com listas ou contatos;
- chaves de contas de serviço, arquivos JSON de credenciais ou senhas;
- cópias de bases de produção.

## 6. Teste de aceitação antes da produção

Use contas de teste e registros fictícios aprovados apenas no ambiente de teste. Verifique:

- [ ] O login Google abre e fecha corretamente.
- [ ] Uma conta de professor consegue criar apenas suas próprias turmas.
- [ ] Outra conta de professor não enxerga a turma, os alunos ou as chamadas da primeira conta.
- [ ] A conta administradora enxerga a visão de gestão, mas um professor comum não.
- [ ] Uma chamada salva em um navegador aparece ao recarregar em outro navegador com a mesma conta autorizada.
- [ ] O CSV é revisado antes de gravar e não aceita uma turma inexistente.
- [ ] O relatório mensal e a exportação não expõem dados de outras turmas.
- [ ] Uma tentativa de gravar um campo não previsto é recusada pelas regras; use o Rules Playground ou o Emulator antes de liberar uma nova versão de campos Censo+.
- [ ] As regras foram efetivamente publicadas no Console, não apenas mantidas como arquivo local.

## Operação e manutenção

- Revise mensalmente os usuários no Firebase Authentication e o conjunto `adminUsers`.
- Acompanhe leituras, gravações, armazenamento e tráfego em **Firestore / Usage** no Firebase Console.
- Faça exportações apenas quando houver motivo institucional e mantenha-as em local protegido.
- Antes de mudar campos, regras ou políticas de retenção, teste em projeto separado.
- Em caso de suspeita de acesso indevido, remova imediatamente a autorização administrativa, desabilite a conta afetada, revise as regras e siga o procedimento institucional de incidente.

## Referências oficiais

- [Login Google no Firebase Authentication](https://firebase.google.com/docs/auth/web/google-signin)
- [Regras de segurança do Cloud Firestore](https://firebase.google.com/docs/firestore/security/get-started)
- [Preços e franquias do Cloud Firestore](https://firebase.google.com/docs/firestore/pricing)
- [Limites e cotas do Cloud Firestore](https://firebase.google.com/docs/firestore/quotas)

