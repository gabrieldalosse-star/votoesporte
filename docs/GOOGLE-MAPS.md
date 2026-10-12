# Google Maps no Censo Esportivo

## O que a integração faz

Quando `window.GOOGLE_MAPS_CONFIG.apiKey` estiver preenchida, o módulo **Território** usa a interface do Google Maps como mapa-base. Sobre ela, o aplicativo desenha apenas:

- o limite municipal de Votorantim da Malha Municipal 2024 do IBGE;
- zonas ou bairros que a gestão tiver importado em GeoJSON e identificado com fonte e versão;
- totais agregados, sem endereços, pontos de residência ou nomes no mapa.

O Google Maps é uma boa referência visual para conferir nomes de bairros e CEPs, mas a API não garante que “bairro” esteja disponível como polígono. Seus recursos oficiais de limites atendem tipos administrativos e CEP quando houver cobertura. Não extraia ou copie a cartografia do Google para gerar GeoJSON.

## Configuração de produção

1. Crie ou escolha um projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Ative **Maps JavaScript API** e associe uma conta de faturamento ao projeto.
3. Crie uma chave de API para navegador.
4. Em **Restrições de aplicativo**, selecione **Referenciadores HTTP** e permita somente:
   - `https://gabrieldalosse-star.github.io/votoesporte/*`
   - o domínio institucional definitivo, se houver;
   - `http://localhost/*` apenas durante desenvolvimento local.
5. Em **Restrições de API**, permita no mínimo **Maps JavaScript API**. Para busca de lugares/CEP ou limites administrativos via API, ative apenas as APIs adicionais que forem realmente usadas e revise custo/quota.
6. Se quiser usar os limites administrativos da API, crie um **Map ID** de mapa JavaScript vetorial, crie um estilo e habilite somente as camadas necessárias. Esse Map ID é opcional para o mapa-base e para as zonas GeoJSON próprias.
7. Adicione ao final de `firebase-config.js`, sem colocar chaves de serviço ou credenciais privadas no site:

```js
window.GOOGLE_MAPS_CONFIG = {
  apiKey: "SUA_CHAVE_RESTRITA_POR_REFERENCIADOR",
  mapId: "SEU_MAP_ID_OPCIONAL"
};
```

8. Publique somente depois de testar no domínio final: abra **Território**, confira que Votorantim aparece, que a chave não aceita outro domínio e monitore uso/cota no Google Cloud.

## CEP e bairros

O formulário oferece consulta opcional de CEP para sugerir rua, bairro, cidade e UF. A equipe deve confirmar o resultado antes de gravar. O bairro informado alimenta os gráficos do censo mesmo quando ainda não existe polígono de bairro.

Para desenhar bairros, solicite à Prefeitura uma camada GeoJSON, Shapefile ou KML com sistema de referência, versão, licença e responsável. Converta para GeoJSON somente quando a licença permitir; importe no painel administrativo e registre a fonte exatamente como fornecida.

## Segurança e custo

A chave de JavaScript é pública por natureza, por isso a segurança depende de restrição por referenciador e por API. Não use uma chave sem restrições, não exponha chave de conta de serviço e não habilite Geocoding/Places por padrão. O Google cobra pelo uso conforme API e volume; defina orçamento, alertas e limites antes de liberar para usuários reais.

Fontes oficiais: [configurar Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/get-api-key), [limites orientados por dados](https://developers.google.com/maps/documentation/javascript/dds-boundaries/start) e [uso/faturamento](https://developers.google.com/maps/documentation/javascript/usage-and-billing).
