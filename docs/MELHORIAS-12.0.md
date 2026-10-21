# VotoEsporte 12.0 — censo interligado e mapas leves

Implementação local em 21/10/2026. A publicação e o acesso real ao Firebase não foram realizados nesta revisão.

## Usar a nova versão

- Visão geral: escolha um dia, bairro, modalidade ou sexo. As legendas dos sete gráficos também filtram a análise. Os filtros se combinam; use os marcadores ou Limpar filtros para removê-los.
- Até sete categorias: gráfico de rosca com total e legenda com valores e porcentagens. Acima disso: lista comparativa completa com rolagem, sem ocultar categorias nem alterar o denominador.
- A lista abaixo dos gráficos mostra os alunos encontrados, com busca por nome, ID ou CEP e páginas de 30. A coluna de turma mostra um dos vínculos incluídos no filtro. A contagem de pessoas elimina matrículas repetidas da mesma pessoa.
- Dia da semana usa o horário cadastrado na turma. Não significa presença registrada naquele dia. Horários sem dia reconhecível entram no total geral, mas ficam fora da seleção de um dia específico.
- Mapa de calor: os mesmos filtros da visão geral. Alterne entre densidade e pontos. Cada pessoa tem uma contribuição, mesmo quando possui várias matrículas.
- A referência de CEP é aproximada: média das coordenadas de endereços públicos do CNEFE 2022 dentro do município, arredondada a quatro casas. Não representa uma residência. Pessoas com o mesmo CEP se sobrepõem. Não há deslocamento artificial de pontos.
- 981 CEPs possuem referência. CEPs sem coordenadas confiáveis permanecem pendentes e são contados e listados. Não há consulta ou envio de cadastros a um serviço de geocodificação externo.
- Professores continuam limitados aos alunos de suas turmas, segundo o acesso já aplicado na consulta. O mapa usa as turmas carregadas, não inclui alunos sem matrícula na base geral. Totais parciais são sinalizados durante o carregamento.

## Desempenho e território

- O login não espera a carga dos arquivos territoriais.
- Leaflet só é baixado na primeira abertura de mapa, com timeout, compartilhamento da requisição e possibilidade de nova tentativa.
- Uma base OpenStreetMap; sem inicializar Google Maps em paralelo. Camada de setores originais removida do seletor; bairros e modo somente polos permanecem.
- Geometrias de exibição simplificadas com preservação topológica individual. Os arquivos originais permanecem intactos. São áreas de referência, não perímetros legais, e a simplificação não redefine o vínculo dos cadastros.
- Arquivos solicitados pelo carregador territorial: 1.990.261 → 574.009 bytes (71,2% menos). Isso mede os arquivos estáticos, não a latência real do Firebase nem o tempo total de abertura.
- Polígonos e pontos usam Canvas. A pintura da densidade agrupa contribuições coincidentes na tela; cada pessoa continua participando do total.
- Diretório de bairros calcula as pessoas únicas uma vez por atualização, em vez de repetir a deduplicação para cada bairro.
- Troca de aba libera o mapa territorial. Requisições antigas não montam mapas após sair da aba ou encerrar a conta. Pontos de polos antigos são descartados antes de uma nova montagem; falha de mapa não tenta focar instância inexistente.
- A lista de bairros acompanha novas cargas de alunos; atualização das referências preserva posições dos polos já recebidas do sistema.

## Validação e publicação

`node --test tests/*.test.mjs`: 43 testes, incluindo os 29 anteriores e 14 novos. Cobertura: filtros interligados, dias legados, denominadores, duplicidade, CEP pendente, erro de rede, encerramento da sessão e escape de HTML. `node --check assets/app.js` e `git diff --check` passaram.

As interações foram verificadas em testes de DOM simulado. A verificação visual em navegador e a validação com Firebase real continuam pendentes porque o acesso ao navegador foi recusado anteriormente; não foi contornado.

O pacote contém o site completo. Substitua os arquivos mantendo as pastas `assets`, `data` e `docs` na raiz servida pelo GitHub Pages. Preserve a configuração do projeto em `firebase-config.js`. Esta revisão não requer novas regras do Firestore nem altera dados; as regras V11 já necessárias ao cadastro único permanecem no pacote.

Após publicar, recarregue e confirme **Versão 12.0.0** no acesso. Verifique a visão geral com um dia, o retorno por Limpar filtros, os polos de Altos de Votorantim e a alternância densidade/pontos. O conector GitHub não possui permissão de escrita, portanto este pacote não foi publicado automaticamente.

## Referências

- IBM Carbon, anatomia e seleção de gráficos: https://www.carbondesignsystem.com/building-blocks/data-visualization/simple-charts
- Leaflet, Canvas e simplificação por zoom: https://leafletjs.com/reference
- IBGE CNEFE 2022: base pública municipal já usada no projeto. O script `scripts/build_light_maps.py` reproduz os agregados a partir do CSV público. O CSV de endereços não integra a distribuição.

A apresentação usa hierarquia de títulos, filtros visíveis, legendas selecionáveis por teclado, sombras discretas, layout adaptável e redução de movimentos conforme a preferência do dispositivo.
