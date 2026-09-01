# Central DD

App que substitui a enquete de WhatsApp na gestão da disponibilidade diária
dos motoristas do Mercado Livre.

## Como o dono quer receber o trabalho

- **Código sempre INTEIRO.** Quando o arquivo é para ele colar em algum lugar
  (principalmente `firestore.rules` no Console do Firebase), mandar o conteúdo
  completo, pronto para substituir tudo — nunca só o trecho que mudou.
- Conversa em **português do Brasil**.
- Ele publica as regras do Firestore **à mão** no Console. Toda mudança em
  `firestore.rules` precisa ser avisada, com o arquivo inteiro no chat.

## Vocabulário (usar sempre estes nomes)

| Certo | Nunca usar |
| --- | --- |
| Dispatcher | coordenador, coordenação |
| Disponibilidade | agenda |
| Planejamento | escala |

Valem para telas, código, comentários e conversa. No Firestore, `papel:
'coordenador'` ainda existe em perfis antigos e é aceito na leitura
(`core/papel.ts`), mas só se grava `'dispatcher'`.

## Decisões de produto já tomadas

- **Equipe** não existe — removido do app e do banco.
- **Cidade bloqueada** não existe — nenhum motorista fica impedido de cidade
  nenhuma. Preferência de cidade decide ORDEM, nunca quem pode.
- Cidades preferidas: **uma** cidade "Prefiro", quantas quiser em "Posso", e
  "Não tenho preferência" é o padrão neutro.
- Cadastro novo precisa de aprovação; quem vira Dispatcher só o DONO aprova
  (`martinsphilippes@gmail.com`).

## Publicação

`git push` na branch dispara deploy automático na Vercel. Para confirmar que
subiu, comparar o hash do bundle: `curl -s https://centraldd.vercel.app/
| grep -o 'index-[A-Za-z0-9_-]*\.js'` — muda quando o deploy termina.

O projeto na Vercel se chama `centraldd` e o endereço é `centraldd.vercel.app`.

No Firebase, o NOME do projeto é Central DD, mas o `projectId` é e será sempre
`mldisponibilidade` — o Google não permite renomear o ID depois de criado.
Daí as três linhas do firebase-config.ts (`projectId`, `authDomain`,
`storageBucket`) ficarem com o nome antigo: elas são o ENDEREÇO do banco, não
um rótulo. Trocar exigiria criar outro projeto e migrar contas e dados, e
ninguém que usa o app vê esse nome em lugar nenhum. Não mexer.
