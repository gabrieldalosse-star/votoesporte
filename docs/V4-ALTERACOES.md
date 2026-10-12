# V4 — exclusão administrativa e mapa

- Exclusão de turma **somente pelo administrador provisionado** em `adminUsers/{UID}`. Confirmação dupla pelo nome exato.
- A exclusão apaga os documentos de alunos e chamadas **dentro da turma**, antes de excluir o documento da turma. Não apaga pessoas de outras turmas. **Irreversível:** faça backup do Firestore.
- Se ocorrer erro de rede durante a exclusão, alguns documentos podem ter sido removidos. Verifique antes de tentar novamente.
- Mapa real do OpenStreetMap integrado à tela de território (depende de internet), centrado em Votorantim; **não é um mapa de zoneamento**. Link para mapa estatístico oficial do IBGE 2022. Camadas territoriais permanecem opcionais, pois não foi possível obter e validar polígonos locais nesta execução.
- Substituídos os símbolos ilustrativos principais pelo arquivo original do brasão fornecido pelo usuário. Os dois logotipos originais continuam no painel.
- Nenhum dado existente foi apagado ou modificado no Firebase por esta preparação de pacote.
- O arquivo `firestore.rules` deve ser publicado separadamente no console Firebase; upload ao GitHub não o ativa.
- A exclusão deve ser testada em uma turma descartável antes de uso em produção.
