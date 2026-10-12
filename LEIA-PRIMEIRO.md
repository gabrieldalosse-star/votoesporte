# Atualização manual — Censo Esportivo de Votorantim

Este pacote contém somente arquivos de código, regras e modelos vazios. Não contém alunos, chamadas ou exportações da base.

## O que corrige

- Cadastro do participante: abre com **Turma** e **Nome completo**; os outros campos ficam em “Adicionar dados da ficha original (opcional)”.
- Ficha completa: nascimento, idade automática, bairro, endereço, CEP, telefone, responsável, PCD e zona territorial aprovada.
- Importação: modelo CSV oficial com 15 campos, confirmação de revisão, prévia e orientação de permissão.
- Chamada: data e horário; o painel mostra a quantidade presente na última chamada.
- Território: limite municipal oficial do IBGE e catálogo de bairros. O mapa é gratuito com Leaflet + OpenStreetMap; não requer chave do Google.

## Atualização do GitHub Pages

1. Faça download/backup do repositório atual antes de substituir arquivos.
2. Copie os arquivos deste pacote para a raiz do repositório, mantendo as pastas `assets`, `data`, `docs`, `.github` e `tools`.
3. **Não substitua** o seu `firebase-config.js`: este pacote traz somente `firebase-config.example.js`.
4. Envie os arquivos ao GitHub e publique pelo GitHub Pages. Se usar Actions, mantenha `.github/workflows/deploy-pages.yml`.

## Firestore: faça antes de publicar o site

1. Faça um backup autorizado da base no projeto `vtesporte-d3b9d`.
2. Revise e publique **o arquivo `firestore.rules deste pacote inteiro`** no Firebase Console. Esta revisão mantém a posse da turma pelo `teacherId`, mas aceita o cadastro progressivo quando a ficha recebe novos campos.
3. Teste com uma conta de professor: criar turma própria, cadastrar um aluno apenas com nome, complementar o bairro e salvar uma chamada.
4. Só então publique a interface. A nova interface grava o horário da chamada; se as regras antigas continuarem ativas, o Firebase poderá recusar esse registro.

## Mapa e bairros

O arquivo `data/votorantim-limite-municipal-ibge-2024.geojson` é o limite municipal oficial. Ele não é uma malha de bairros.

Os gráficos contam alunos por bairro informado no cadastro, mesmo quando ainda não há polígono. Para desenhar bairros, importe no painel administrativo apenas uma camada GeoJSON/KML/Shapefile autorizada. Não use uma cópia de cartografia do Google Maps como GeoJSON.

Leia `docs/CENSO-E-TERRITORIO.md` e `docs/POLITICA-DE-IMPORTACAO.md` antes de importar dados reais.
