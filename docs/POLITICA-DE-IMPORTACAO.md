# Política de importação e revisão

## Modelo principal

O modelo principal é `data/MODELO-CADASTRO-CENSO-WILLIAN-VAZIO.csv`. Ele preserva os 15 campos da ficha original, nesta ordem:

```text
turma;nome;sexo;idade;data_nascimento;rua;numero;bairro;cidade;cep;telefone;pcd;nome_responsavel;telefone_responsavel;data_cadastro
```

O aplicativo importa a turma escolhida na tela; a coluna `turma` é preservada como referência de revisão e não muda o destino selecionado. A coluna `idade` não é gravada como dado manual: quando houver data de nascimento válida, a idade é calculada pelo sistema em anos, meses e dias.

Para cadastro inicial, `nome` é o único campo indispensável. Os demais campos podem ficar vazios e ser completados depois na edição do participante. Para território, informe `bairro` e `cidade` quando a finalidade institucional justificar; a ausência desses campos entra no censo como “Bairro não informado”, sem excluir a matrícula dos totais.

Na ficha individual, a equipe pode solicitar uma sugestão de bairro pelo CEP. A consulta é opcional, não obtém coordenadas nem cria ponto residencial; confirme o resultado antes de salvar e use o Google Maps apenas como referência visual complementar de nomes e área, não como origem de geometria para importação.

## Antes de confirmar

1. Escolha a turma de destino.
2. Use uma cópia do modelo, nunca o arquivo-modelo para guardar pessoas reais.
3. Confira nomes completos, linhas em branco, duplicidades e a turma selecionada.
4. Verifique as datas em `AAAA-MM-DD` ou `DD/MM/AAAA`.
5. Marque a confirmação de revisão na própria tela. Sem ela, o botão permanece bloqueado.

Cada arquivo comporta até 400 linhas, abaixo do limite de escrita em lote do Firestore. O sistema aceita CSV separado por ponto e vírgula ou vírgula, com codificação UTF-8.

## Arquivo complementar

`data/modelo-importacao-complementar-opcional.csv` contém colunas opcionais reconhecidas para matrículas, escola, referência de censo e observações. Use-o somente quando esses dados tiverem finalidade aprovada. Não use observações para saúde, laudos, documentos ou qualquer dado sensível.

## Permissões e falhas

O professor só pode importar em turmas de sua responsabilidade. A administração pode gerir turmas autorizadas, mas a conta não é criada pela interface. Se o Firebase recusar a importação, a tela mantém o CSV e explica que é preciso conferir a conta responsável pela turma e a publicação de `firestore.rules`.

Antes da primeira migração real, faça backup autorizado da base, teste com uma turma sem dados pessoais e confirme a escrita e leitura com uma conta de professor. Não apague dados para “corrigir” uma importação sem seguir o procedimento de exclusão controlada.
