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

A branch é `main`, e é ela que a Vercel publica em `centraldd.vercel.app`
(Project Settings → Environments → Production → Branch Tracking). `git push`
nela dispara o deploy automático. Para confirmar que subiu, comparar o hash do
bundle: `curl -s https://centraldd.vercel.app/
| grep -o 'index-[A-Za-z0-9_-]*\.js'` — muda quando o deploy termina.

O projeto na Vercel se chama `centraldd` e o endereço é `centraldd.vercel.app`.
O repositório no GitHub é `martinsphilippes/centraldd`. O nome antigo ainda
funciona porque o GitHub redireciona, mas o certo é usar o novo.

O hash do bundle publicado pela Vercel nem sempre bate com o do build local —
ela compila em máquina própria. Quando não bater, conferir pelo CONTEÚDO:
baixar o `index-*.js` do ar e procurar um trecho da mudança.

No Firebase, o NOME do projeto é Central DD e o `projectId` é
`centraldispatcherdriver` — o Google não permite renomear o ID depois de
criado, e o ID gerado na criação foi esse. As linhas do firebase-config.ts
(`projectId`, `authDomain`, `storageBucket`) são o ENDEREÇO do banco, não um
rótulo: trocar de novo exigiria criar outro projeto e migrar contas e dados.
Não mexer.

O projeto anterior (`mldisponibilidade`) foi abandonado e APAGADO em
01/09/2026 — a base estava vazia, então a mudança de casa não custou dado
nenhum. O Google guarda projeto apagado por cerca de 30 dias antes de destruir
de vez, mas não devolve o ID nem depois disso.
