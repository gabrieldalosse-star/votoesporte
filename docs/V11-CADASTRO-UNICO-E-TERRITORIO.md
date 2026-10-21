# V11 — Cadastro único, bairros e polos

Atualização preparada em 21/10/2026 sobre o commit `ff7cab9f08f354b84e799011ec5cf7466f4bfdf6` do repositório gabrieldalosse-star/votoesporte.

## Publicação e implantação

Esta entrega contém código e regras, não credenciais administrativas do Firebase. Não confunda uma atualização no GitHub com a publicação das regras do banco.

1. Faça backup do Firestore e homologue em um projeto de teste.
2. Publique `firestore.rules` e os índices no projeto `vtesporte-d3b9d`, com uma conta autorizada. Pelo Firebase Console: Firestore Database → Rules → substituir pelo arquivo desta versão → Publish. Alternativamente, com Firebase CLI autenticado: `firebase deploy --only firestore:rules,firestore:indexes --project vtesporte-d3b9d`.
3. Publique os arquivos estáticos desta versão no GitHub Pages.
4. Entre como administrador e abra **Base geral de alunos → Integrar cadastros antigos**. A operação mantém matrículas existentes, cria os IDs gerais e reutiliza um ID quando nome e nascimento coincidem. Se já houver dois IDs gerais para a mesma identidade, interrompe a integração desse registro para revisão.
5. Confirme a lista geral e a correspondência com as matrículas antes de liberar novos cadastros. O catálogo de atividades é atualizado a partir das turmas ao entrar; somente os campos operacionais permitidos são compartilhados.
6. Homologue com dois navegadores autenticados tentando cadastrar simultaneamente o mesmo nome/nascimento. Confirme também acesso de professor, reatribuição de turma e exportações. Os testes locais usam transações simuladas, não substituem a homologação no Firestore real.

Nenhuma operação desta entrega apagou dados reais, migrou alunos reais ou modificou o projeto Firebase.

## Uma pessoa e várias matrículas

- `studentRegistry/ALU-000001`: ficha geral da pessoa. Não contém modalidade, turma ou número de matrícula. Contém identidade, contato e referência territorial.
- `registryCounters/students`: contador geral, alterado por transação. Nunca é reiniciado pela exclusão em lote.
- `studentIdentityIndex/{sha256}`: índice do nome normalizado e nascimento. Bloqueia a criação de outra pessoa com a mesma combinação, inclusive entre turmas e em importações. Nome sem nascimento também recebe índice; complete o nascimento para distinguir homônimos.
- `classes/{turma}/students/{vinculo}`: matrícula na turma, com `globalStudentId` e seu `enrollmentCode` independente. Matrículas existentes são preservadas; novos números seguem o maior número emitido/reservado daquela turma.

O índice é consultado e criado na mesma transação que grava pessoa e matrícula. Uma disputa simultânea provoca nova leitura do índice e rejeita a segunda criação, sem deixar uma pessoa órfã. As regras protegem acesso e imutabilidade dos IDs; a normalização do nome e a construção do hash são feitas pelo cliente. Uma garantia contra clientes maliciosos que deliberadamente falsifiquem o hash exigiria uma operação em backend confiável; não foi implantada uma Cloud Function nesta entrega.

Para vincular uma pessoa existente, busque nome, ID ou bairro na base geral, escolha a turma e clique **Nova matrícula**. O formulário reaproveita o ID e a ficha. A importação aceita a coluna opcional `aluno_id`; use-a para matricular a mesma pessoa em outra turma. Reimportações na mesma turma localizam matrícula, ID ou nome/nascimento e atualizam o vínculo, sem consumir outro ID.

Professores continuam vendo somente os alunos de suas turmas. A base geral é administrativa. Se um professor encontrar uma identidade já cadastrada por outro responsável, deve solicitar à coordenação a associação correta. Professores não alteram nome/nascimento de IDs existentes; as correções de identidade ficam com a administração. Os vínculos históricos mantêm suas próprias fichas; não há reescrita automática de todas as turmas quando a ficha geral é alterada.

## Exclusão geral

Somente administradores podem usar **Excluir todos os alunos**. Exige digitar `EXCLUIR TODOS OS ALUNOS`, prepara um backup JSON e exige confirmar que ele foi salvo. Registra auditoria antes de excluir fichas gerais, índices de identidade e matrículas. Mantém turmas, contadores, ocorrências e chamadas históricas — estas ainda podem conter nomes e não equivalem à eliminação integral de dados pessoais.

As gravações/exclusões usam lotes de até 400 operações; bases grandes não são excluídas em uma transação única. Se um lote falhar, pode haver exclusão parcial: preserve o backup original e execute novamente após revisar o erro. Faça a operação numa janela sem novos cadastros concorrentes.

## CEP → bairro → zona

A tabela local `data/votorantim-cep-bairros.json` cruza CEP e `DSC_LOCALIDADE` do CNEFE 2022. A busca opcional no ViaCEP complementa rua, cidade e UF.

- Ao sair do campo CEP ou clicar **Buscar CEP e vincular zona**, o formulário preenche o bairro e a referência territorial quando há correspondência segura.
- Quando o CEP tem várias localidades, o bairro fornecido pela consulta é confrontado com as opções do CNEFE. Sem correspondência única, o formulário pede escolher o bairro.
- CEP de outro município não recebe uma zona de Votorantim.
- O resultado é salvo no vínculo e na ficha geral com método `cep-cnefe-2022` ou `cep-reviewed`. A seleção manual continua disponível e identifica seu próprio método.
- Alterar o CEP remove o vínculo territorial anterior enquanto a nova consulta não é concluída. Respostas antigas de uma consulta não sobrescrevem um CEP mais recente.
- A importação também usa a tabela local para completar uma referência segura quando o arquivo não fornece zona.

O CEP e o bairro atribuem uma área de referência, não a posição da residência. O sistema não geocodifica nem exibe endereços de alunos no mapa. A classificação por CEP não transforma um perímetro de referência em limite legal de bairro.

## Bairros no mapa

Os 215 polígonos foram obtidos do WFS oficial IBGE, camada `CGMAT:qg_2022_600_setcensitario__v02`, filtrada por `cd_mun='3557006'`, em EPSG:4326. O cadastro CNEFE tem 58.052 registros para Votorantim: 57.819 foram associados espacialmente à malha definitiva; 233 ficaram fora dela e não foram forçados para um polígono.

Cada polígono recebeu a localidade mais frequente nos endereços nele contidos. A união desses polígonos gera **76 áreas principais**, incluindo uma área sem localidade identificada. O diretório guarda **109 localidades**. As localidades que não predominam em nenhum polígono têm áreas complementares compartilhadas e aparecem quando selecionadas ou vinculadas a um cadastro. A seleção não divide arbitrariamente polígonos por um CEP nem inventa contornos.

A interface abre na camada por bairros; a malha original fica como opção complementar. Uma localidade compartilhada pode usar polígonos que incluem outras localidades. Os arquivos guardam distribuição de localidades, proporção predominante, CEPs e indicação de revisão. Esses agrupamentos são derivados para referência operacional e **não são uma delimitação legal de bairros aprovada pela Prefeitura**. O arquivo de bairros do IBGE consultado para Votorantim retornou vazio.

Reprodução: instale Shapely 2 ou superior e execute `python scripts/build_territory.py /caminho/3557006_VOTORANTIM.csv`. O script valida geometrias, cobertura e preservação dos 215 polígonos. Apenas agregados são incluídos no site; o CSV de endereços e seus pontos não fazem parte do pacote.

Fontes consultadas:

- [Malha de setores do IBGE](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/26565-malhas-de-setores-censitarios-divisoes-intramunicipais.html).
- [CNEFE — arquivo municipal público](https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/35_SP/3557006_VOTORANTIM.zip).
- [Notas metodológicas do CNEFE](https://www.ibge.gov.br/biblioteca/visualizacao/livros/liv102091.pdf).
- [Plano Diretor municipal de 2026 e anexos](https://www.votorantim.sp.gov.br/plano-diretor-lei-vigente-anexos). Zoneamento urbano não foi confundido com limite de bairro.

## Polos e pontos verdes

O arquivo `data/votorantim-polos-esportivos.json` cadastra 19 espaços a partir da [lista oficial da Secretaria, atualizada em 01/09/2026](https://www.votorantim.sp.gov.br/atividades-esportivas-recreativas), e do [endereço da sede](https://www.votorantim.sp.gov.br/portal/secretarias/12/esportes). As coordenadas usam equipamentos/endereços públicos no CNEFE, OpenStreetMap e consulta visual a fichas públicas do Google Maps, com fonte individual registrada. Não foram extraídas informações de alunos.

18 espaços têm ponto verde; a Associação de Amigos de Bairro do Rio Acima foi cadastrada com endereço, mas permanece sem ponto por não haver localização específica confirmada. A administração pode usar **Posicionar no mapa** para cadastrá-la e **Ajustar ponto** nos demais. A localização revisada é persistida em `sportsCenters/{id}`; professores podem consultar, mas não alterar.

Pontos originados de número de endereço têm indicação de entrada a conferir. As divergências de acesso/denominação do Campo Vila Nova e da unidade de saúde Vila Garcia, e a referência antiga da caminhada no Jardim Tatiana, estão anotadas nos respectivos registros. Não se presume que um equipamento esteja aberto apenas porque aparece na fonte esportiva. A oferta publicada em setembro é identificada separadamente das turmas cadastradas no sistema.

Os pontos existem tanto no Leaflet quanto no Google Maps, podem ser ocultados e acompanham o filtro de bairro declarado do polo. O popup exibe endereço, origem e atividades, sem lista de alunos. A consulta à classe para preencher atividades usa `activityCatalogue`, que não compartilha notas internas, contatos ou matrículas.

## Validação

Execute `node --check assets/app.js` e `node --test tests/registry-v11.test.mjs`. A suíte cobre identidade global, duplicidade, reuso entre turmas, sequência após exclusão, transações sem leitura após escrita, CEP compartilhado, município externo, geometrias oficiais e exclusão em lote com cancelamento/backup. Foi feita verificação de interface com dados fictícios locais; faltam homologação de regras e testes com contas reais no Firebase.
