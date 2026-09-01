# Ferramentas de manutenção

Scripts que rodam **na máquina do dono**, com a chave dele. Nada aqui é usado
pelo aplicativo — e nenhuma chave é guardada neste repositório.

## limpar-cadastros.mjs

Apaga os **motoristas** de teste: contas de login, perfis, cadastros e o
histórico que aponta para eles.

**Dispatchers não são tocados.** Quem decide é o campo `papel` do documento em
`perfis/{uid}` — `dispatcher` (e o nome antigo `coordenador`) ficam,
`motorista` sai. E-mail não serve para essa separação: o cadastro de motorista
pode existir para alguém que virou dispatcher depois.

Conta **sem perfil nenhum** também fica por padrão. Pode ser um dispatcher
criado no Console que ainda não entrou pela primeira vez, e apagar um desses
tranca alguém para fora. Use `--sem-perfil` para incluí-las, depois de olhar a
lista que a prévia mostra.

### Por que precisa de chave de serviço

Apagar a conta de login de OUTRA pessoa não é permitido a nenhum usuário, nem
ao dono. Só o Admin SDK faz isso, e ele exige a chave de serviço do projeto.
Por isso este passo nunca sai de dentro do app.

### Passo a passo

1. Firebase Console → ⚙️ **Configurações do projeto** → **Contas de serviço**
   → **Gerar nova chave privada**. Salve como `chave.json` nesta pasta.
2. `npm install firebase-admin`
3. `node limpar-cadastros.mjs` — só MOSTRA o que faria, não apaga nada.
4. `node limpar-cadastros.mjs --apagar` — grava um backup, pede para você
   escrever `APAGAR` e então apaga.

Parâmetros extras:

- `--tudo` leva junto os dados do dia (chamadas, rotas, programação, resumos,
  limites).
- `--sem-perfil` inclui as contas que não têm perfil nenhum.

### O que ele nunca apaga

- A conta do dono e o perfil dela.
- **Todos os dispatchers**: conta, perfil e acesso.
- `config` (parâmetros), `cidades` e `tipos` — é a configuração da operação,
  não dado de teste.

### Depois de rodar

**Apague o `chave.json`.** Ele é acesso total e irrestrito ao projeto: todos os
dados e todas as contas, sem passar por regra nenhuma. Se vazar, o projeto
inteiro vaza junto. No Console dá para revogar a chave em Contas de serviço.

O `.gitignore` já impede que ele seja enviado por engano — mas apagar é melhor
que confiar no .gitignore.
