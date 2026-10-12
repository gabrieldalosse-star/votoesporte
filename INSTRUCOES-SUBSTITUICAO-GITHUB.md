# Substituição segura no GitHub

Este pacote contém somente arquivos estáticos do aplicativo e a camada local de setores preliminares. Ele não acessa nem altera dados reais do Firestore, não publica regras e não publica o site por conta própria.

## Antes de substituir

1. No repositório `gabrieldalosse-star/votoesporte`, abra **Code → Download ZIP** ou faça uma cópia/backup da branch `main`.
2. Extraia este pacote em uma pasta nova e confirme que aparecem `index.html`, `assets/`, `data/`, `docs/`, `firestore.rules` e `firebase-config.js`.
3. Preserve o arquivo `firebase-config.js` já configurado no repositório caso ele contenha a configuração real do Firebase. O pacote não deve substituir uma configuração válida sem conferência.
4. Confira `data/setores_votorantim_4_setores_PRELIMINAR.geojson` e o aviso no mapa: a camada é aproximada e não oficial.

## Como substituir o conteúdo

1. No GitHub, abra `gabrieldalosse-star/votoesporte` e selecione a branch desejada, de preferência uma branch de teste.
2. Envie todos os arquivos extraídos para a raiz do repositório, preservando a estrutura de pastas. Substitua os arquivos existentes apenas depois do backup.
3. Confirme a inclusão de `data/setores_votorantim_4_setores_PRELIMINAR.geojson`, `assets/app.js`, `assets/styles.css`, `index.html`, `firestore.rules` e `docs/V7.1-SETORES-PRELIMINARES.md`.
4. Faça o commit no GitHub e aguarde a atualização do GitHub Pages. Acesse o site, entre em modo local ou com uma conta de teste e abra **Censo+ e território**. Os quatro setores devem aparecer sem usar o botão de importação.
5. Verifique o filtro **Todos os setores / Centro / Leste / Oeste / Sul** e o aviso de camada preliminar.

## Firebase: não publicar automaticamente

O arquivo `firestore.rules` foi ajustado para futuras importações de GeoJSON: ele usa `geometryJson` para evitar o erro de arrays aninhados do Firestore. Isso só terá efeito se uma pessoa autorizada publicar as regras no projeto Firebase correto, depois de backup e teste com dados de teste. Enviar o arquivo ao GitHub não aplica regras nem modifica cadastros, turmas ou chamadas.

## Camada territorial

Os setores Oeste, Centro, Sul e Leste incluídos são preliminares e aproximados. Eles não são mapa oficial da Prefeitura, não equivalem a bairros, CEPs ou zoneamento e não devem fundamentar decisão administrativa, jurídica ou de atendimento. Substitua a camada por uma fonte institucional validada quando ela estiver disponível.
