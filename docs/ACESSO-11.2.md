# Correção de acesso 11.2

## Conta existente e primeiro acesso

“Este e-mail já possui uma conta” é uma resposta da criação de conta, não uma confirmação de que o login com a senha informada funciona. Quem já tem cadastro deve utilizar **Entrar na plataforma**. Se não lembrar a senha, pode preencher somente o e-mail e clicar em **Esqueci minha senha**.

A versão 11.2 adiciona a recuperação pelo Firebase, orienta melhor o usuário quando o cadastro já existe, preserva a senha exatamente como digitada e impede operações simultâneas de login, cadastro e recuperação. Erros de conta desativada, excesso de tentativas e senha incorreta recebem mensagens específicas. A recuperação não envia e-mails automaticamente ao abrir a página ou ao tentar criar uma conta existente; depende do clique do próprio usuário.

## Conferência administrativa da conta

No projeto Firebase `vtesporte-d3b9d`, abra **Authentication → Users** e procure o e-mail completo informado pelo professor. Confira:

1. Se o e-mail coincide exatamente com o informado e se a conta não está desativada.
2. O provedor de acesso cadastrado. O login Google continua reservado à administração; professores usam e-mail e senha.
3. Se a pessoa possui a senha atual. Quando necessário, a pessoa solicita a recuperação pela tela de acesso ou a administração utiliza a opção de recuperação disponível no console.
4. Depois do login, a coordenação confere a atribuição das turmas ao UID da conta em **Gestão**. Uma conta de autenticação e um cadastro de aluno são registros diferentes.

A falta de um perfil profissional no Firestore não significa que a conta de autenticação inexista: a aplicação já solicita o preenchimento do perfil após o login. Preserve o UID da conta ao resolver o acesso para manter as associações existentes.

## Publicação e validação

O ZIP completo contém esta atualização junto às correções 11.1. A alteração de acesso está em `index.html` e `assets/app.js`; não exige ampliar as permissões do Firestore. Substitua os arquivos estáticos preservando as pastas e publique no GitHub Pages.

28 testes automatizados passaram, incluindo seis testes específicos de autenticação com chamadas simuladas. A recuperação com envio real, o estado da conta específica e o acesso pelo navegador não foram verificados nesta entrega. Nenhuma senha foi alterada e nenhum e-mail real foi enviado.

Referência: [Firebase — gerenciamento de usuários e recuperação de senha](https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email).
