# VotoEsporte 12.0 — Mapas leves e análise interligada

Leia [as melhorias, validação e publicação](docs/MELHORIAS-12.0.md).

# VotoEsporte 11.2 — Acesso e recuperação de senha

Leia [a correção de acesso](docs/ACESSO-11.2.md).

# VotoEsporte 11.1 — Correções de operação e dados

Leia [as correções e a atualização de F/M na base](docs/CORRECOES-11.1.md).

# VotoEsporte V11 — Cadastro único e territórios

Leia [a implantação e as alterações da V11](docs/V11-CADASTRO-UNICO-E-TERRITORIO.md). Esta versão exige publicar as regras Firestore antes de liberar o cadastro atualizado. O histórico das versões anteriores está preservado abaixo.

# Censo Esportivo de Votorantim V7

Leia `docs/V7-RECONSTRUCAO-E-OPERACAO.md` antes de publicar. A exclusão administrativa é irreversível e exige referência de backup.

# Votorantim Esporte & Censo+ · Chamada

MVP estático para professores registrarem presença, organizarem turmas e gerarem relatórios de acompanhamento na Rede Esportiva de Votorantim.

O projeto começa intencionalmente sem alunos, turmas ou dados pessoais. Ele pode ser aberto localmente em modo de demonstração, mas o uso real deve ser feito após configurar Firebase Authentication e Cloud Firestore.

A identidade em `assets/votorantim-esporte.svg` é uma ilustração original inspirada nas cores municipais; não é uma reprodução nem uma declaração de uso autorizado do brasão oficial. Quando houver autorização institucional, substitua esse arquivo pelo material oficial fornecido pela Prefeitura.

## O que já funciona

- Login individual com Google via Firebase Authentication.
- Perfil de professor e acesso administrativo provisionado com segurança.
- Cadastro de turmas, alunos, contatos de responsáveis, telefone autorizado do aluno, referência escolar e base Censo+.
- Ações manuais de WhatsApp e ligação após registro explícito do canal autorizado; a plataforma não envia mensagens automaticamente.
- Painel Censo+ e território com os quatro setores preliminares locais (Oeste, Centro, Sul e Leste), filtro no mapa, importação administrativa de GeoJSON e sem exposição de endereço ou pinos individuais. Os setores incluídos são aproximações, não limites oficiais.
- Interface opcional do Google Maps, configurada por chave restrita e com o limite municipal IBGE sobreposto; veja [docs/GOOGLE-MAPS.md](docs/GOOGLE-MAPS.md).
- Importação revisável por CSV, com o modelo oficial de 15 campos, confirmação explícita de revisão e modelo complementar opcional.
- Chamada por turma, data e horário, com presença, falta e observação opcional; o painel mostra o total da última chamada.
- Sincronização em tempo real entre navegadores autorizados pelo Cloud Firestore.
- Histórico por turma e relatórios mensais por turma, professor e evolução individual de presença.
- Exportação CSV e impressão otimizada para **Salvar como PDF**.
- Modo local para teste de interface quando `firebase-config.js` ainda não foi preenchido.

## Publicação no GitHub Pages

1. Crie um repositório vazio no GitHub e envie o conteúdo desta pasta para a raiz dele.
2. Copie `firebase-config.example.js` para `firebase-config.js` e preencha os dados do seu projeto Firebase.
3. Siga [docs/GUIA-FIREBASE.md](docs/GUIA-FIREBASE.md), principalmente a publicação das regras e a inclusão do domínio `SEU_USUARIO.github.io` nos domínios autorizados do Firebase Authentication.
4. No GitHub, abra **Settings → Pages** e escolha **GitHub Actions** como fonte de publicação.
5. Envie para a branch `main`. O workflow `.github/workflows/deploy-pages.yml` publica a versão estática.

O site no GitHub Pages é público por natureza; a lista de alunos continua protegida pelas regras do Firebase e pelo login. Não publique uma configuração com regras de teste abertas.

## Estrutura

```text
.
├── index.html                       # Interface estática, responsiva
├── assets/
│   ├── app.js                       # Firebase, chamadas, relatórios e importação
│   └── styles.css                   # Design responsivo
├── data/MODELO-CADASTRO-CENSO-WILLIAN-VAZIO.csv
├── data/modelo-importacao-complementar-opcional.csv
├── data/setores_votorantim_4_setores_PRELIMINAR.geojson  # camada local automática e não oficial
├── docs/
│   ├── GUIA-FIREBASE.md
│   ├── MANUAL-DE-USO.md
│   ├── POLITICA-DE-IMPORTACAO.md
│   ├── PRIVACIDADE-E-SEGURANCA.md
│   ├── CONSUMO-E-ESCALA.md
│   └── CENSO-E-TERRITORIO.md
├── firebase-config.js               # Preencher antes do uso real
├── firestore.rules                  # Regras de acesso
├── firestore.indexes.json
└── .github/workflows/deploy-pages.yml
```

## Segurança antes de qualquer dado real

1. Publique `firestore.rules` antes de cadastrar alunos.
2. Ative Google como provedor em Firebase Authentication.
3. Crie os administradores apenas pelo Firebase Console ou Admin SDK, em `adminUsers/{UID}`. A interface não permite que um professor se promova.
4. Restrinja os domínios autorizados e revise quem pode usar as contas Google escolhidas.
5. Use somente os dados necessários à operação e à finalidade institucional aprovada.
6. Os quatro setores incluídos no pacote são aproximados e não oficiais. Antes de adotá-los para qualquer finalidade operacional, valide origem, versão, licença e aprovação institucional. Não geocodifique endereços de alunos nem use coordenadas de residência.

Leia também [docs/PRIVACIDADE-E-SEGURANCA.md](docs/PRIVACIDADE-E-SEGURANCA.md) e [docs/CENSO-E-TERRITORIO.md](docs/CENSO-E-TERRITORIO.md). O aplicativo não substitui a validação jurídica, a política de privacidade da instituição ou o controle de responsáveis pelo tratamento de dados.

## Limites e custo

Este projeto evita prometer uso “ilimitado”. O plano sem custo do Cloud Firestore tem cotas diárias e de armazenamento. Para o cenário de 12 professores com até 8 turmas cada, o modelo de uma chamada por turma/data reduz muito o número de gravações e tende a caber com folga em operação normal; os detalhes, suposições e limites estão em [docs/CONSUMO-E-ESCALA.md](docs/CONSUMO-E-ESCALA.md).

## Verificação local

Como é uma aplicação estática, não há dependências para instalar. Use um servidor local simples (por exemplo, a prévia do seu editor) em vez de abrir o arquivo diretamente, pois módulos do Firebase precisam de contexto HTTP. Sem Firebase configurado, escolha **Explorar em modo local** para testar o fluxo vazio e o cadastro.


## V3: Relatório semanal
Selecionar **Semanal** no módulo de relatórios, escolher a semana ISO e gerar. Veja `docs/V3-ESTADO-REAL.md` para escopo e pendências.
