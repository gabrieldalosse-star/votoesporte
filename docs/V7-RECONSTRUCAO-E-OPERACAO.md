# V7 — Reconstrução operacional do Censo Esportivo

## Diagnóstico das versões anteriores

- A árvore `main` continha alterações de interface até a V5, mas não continha artefatos, tags, branches ou deploys V6/V7. Portanto, não havia uma V6 ou V7 que o GitHub Pages pudesse apresentar.
- O repositório também não possuía `.github/workflows/deploy-pages.yml`. Sem esse workflow, um push para `main` não atualizava o Pages quando a fonte estava configurada como GitHub Actions.
- O envio de `firestore.rules` ao GitHub nunca publica regras no Firebase. Regras, índices e a conta administrativa precisam ser aplicados em um ambiente Firebase autorizado.

## O que a V7 entrega

- Censo Esportivo como interface principal, com matrículas, turmas, frequência e relatórios semanal/mensal no mesmo fluxo.
- Dashboard que completa a carga de matrículas de todas as turmas visíveis antes de consolidar bairro, atividade, faixa etária e sexo. Os gráficos não usam dados inventados.
- Mapa real com base OpenStreetMap e contorno municipal verificável do IBGE, Malha Municipal 2024, geocódigo `3557006`. Nenhum endereço ou ponto de participante é exibido.
- Formulário na ordem dos 15 campos do modelo original, incluindo Nome e Data de Nascimento, com idade exata em anos, meses e dias.
- Exclusões restritas à administração, confirmação explícita por texto, referência de backup para turma e trilha imutável em `deletionAudit`.
- Workflow de GitHub Pages e arquivo `.nojekyll` para uma publicação repetível.

## Operação segura antes da primeira publicação

1. No Firebase, exporte ou gere um backup administrado do Firestore e registre a referência. Nenhuma migração automática foi incluída nesta versão.
2. Publique `firestore.rules` e `firestore.indexes.json` no projeto `vtesporte-d3b9d` a partir de uma conta autorizada; o GitHub Pages não executa essa etapa.
3. Autentique `gabrieldalosse@gmail.com` uma vez com Google, anote o UID em Firebase Authentication e execute o procedimento de provisionamento administrativo em ambiente confiável. Nunca inclua conta de serviço ou chave privada neste repositório.
4. Em Firebase Authentication, confira se `gabrieldalosse-star.github.io` está em **Authorized domains** e teste uma conta comum antes da conta administradora.
5. No GitHub, selecione **Settings → Pages → Source: GitHub Actions**. O workflow incluído publica somente após um push autorizado para `main`.

## Verificação de aceite

- Conta comum cria/edita apenas as próprias turmas e matrículas; não recebe botões nem permissão para excluir.
- Conta administradora vê todas as turmas, importa uma camada GeoJSON aprovada e pode excluir somente após as três confirmações exigidas.
- Cadastre uma matrícula em duas turmas e confira que o painel conta uma pessoa única, mas dois vínculos.
- Salve uma chamada, gere um relatório semanal e outro mensal e confirme que as contagens correspondem apenas às datas salvas.
