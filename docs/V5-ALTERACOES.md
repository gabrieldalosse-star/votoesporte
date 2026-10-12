# V5 — Censo Esportivo unificado

- O censo municipal é a identidade principal; frequência é um módulo integrado, não um sistema escolar separado.
- Página inicial apresenta gráficos por bairro, atividade, faixa etária e sexo a partir de registros realmente carregados.
- Filtro de bairro atualiza os quatro gráficos; bairros surgem conforme os cadastros.
- Os gráficos respeitam a visibilidade do perfil autenticado e não exibem dados pessoais individuais.
- Não houve exclusão nem migração automática de dados do Firestore.
- As imagens institucionais originais do pacote V4 foram preservadas sem redesenho.
- Contagem de pessoas únicas continua aproximada por nome e data de nascimento, pois a estrutura legada ainda não possui identificador global.
- As regras do Firestore seguem no ZIP; implantação em Firebase Console é manual.
- A V5 não foi testada em conta real do Firebase; é necessária homologação antes da substituição de produção.
