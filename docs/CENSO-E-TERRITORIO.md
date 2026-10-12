# Censo+ e território

## O que esta versão faz agora

- Mantém a chamada por turma e data como registro independente.
- Amplia o cadastro de aluno sem remover os campos já existentes.
- Guarda contato, Censo+ e território em grupos adicionais no mesmo documento do aluno.
- Oferece botões de WhatsApp e ligação somente depois que o canal autorizado for registrado; a ação sempre exige clique manual e não envia mensagem automática.
- Exibe um mapa de zonas agregadas, sem endereço, rua, número, coordenada residencial ou marcador individual.

## Estrutura aditiva do aluno

Os campos antigos continuam válidos. Os novos grupos são:

```text
contact.target
contact.permission
contact.consentDate
contact.guardianPhone
contact.studentPhone
contact.alternatePhone

census.version
census.integrationId
census.referenceDate
census.reviewStatus
census.externalCode

geo.zoneId
geo.zoneLabel
geo.sector
geo.sourceVersion
geo.matchMethod
```

Antes de preencher campos específicos do Censo+, confirme a sequência enviada pela gestão, a finalidade de cada campo e a base institucional aplicável. Esta versão não inventa perguntas demográficas, socioeconômicas ou de saúde.

Quando a sequência oficial chegar, acrescente cada novo campo ao formulário, ao modelo CSV, à documentação e à lista permitida em `validStudent` dentro de `firestore.rules`, então teste e publique as regras antes de importar registros. Essa etapa evita que a interface e a proteção do banco fiquem desalinhadas.

## WhatsApp e ligação

1. Cadastre o telefone do responsável, do aluno (quando autorizado) ou um telefone alternativo.
2. Escolha o contato preferencial e registre o canal autorizado.
3. Registre a data do consentimento ou a referência institucional correspondente.
4. Use o botão WhatsApp ou Ligar apenas quando necessário. O sistema pede confirmação e não preenche mensagem automática.

Para menores, a opção padrão deve ser o responsável. Não registre autorização inexistente.

## Camada territorial

O painel aceita um GeoJSON `FeatureCollection` com polígonos de bairros, setores ou zonas aprovadas. Cada item precisa ter, no mínimo:

```json
{
  "type": "Feature",
  "properties": { "name": "Nome da zona", "sector": "Setor opcional" },
  "geometry": { "type": "Polygon", "coordinates": [] }
}
```

Use o arquivo `data/votorantim-zonas.example.geojson` como modelo. A importação é permitida apenas para administrador e atualiza zonas por nome; ela não apaga a camada anterior automaticamente.

Não envie o endereço de aluno a geocodificadores externos e não importe pontos de moradia. A associação do aluno à zona é manual até haver uma regra territorial formalmente validada.

## Fontes e validação

O portal de Dados Abertos de Votorantim não disponibiliza, neste momento, uma malha pública de bairros ou setores pronta em GeoJSON. O Município divulga mapas de zoneamento em PDF, que não devem ser vetorizados ou tratados como setor de atendimento sem validação.

- [Dados Abertos de Votorantim](https://www.votorantim.sp.gov.br/portal/dados-abertos)
- [Mapas do Plano Diretor de Votorantim](https://www.votorantim.sp.gov.br/portal/arquivos/2/0/0/0/0/0/0/0)
- [Malhas de bairros do Censo 2022 — IBGE](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/26565-malhas-de-setores-censitarios-divisoes-intramunicipais.html?=&t=downloads)
- [Serviço de Informação ao Cidadão de Votorantim](https://www.votorantim.sp.gov.br/portal/sic)

Uma malha do IBGE pode apoiar a análise do Censo, mas não substitui setores municipais de atendimento. Antes de publicar a camada, registre fonte, versão, sistema de referência, data, licença e aprovação da gestão.

## Regras do Firestore

Publique `firestore.rules` depois de revisar. A coleção `territoryZones` é legível apenas por pessoas autenticadas e gravável apenas por administradores provisionados em `adminUsers`. Cadastros de alunos seguem protegidos dentro de cada turma.
