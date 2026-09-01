# Ferramentas de manutenção

Scripts que rodam **na máquina do dono**, com a chave dele. Nada aqui é usado
pelo aplicativo — e nenhuma chave é guardada neste repositório.

## limpar-cadastros.mjs

Apaga os cadastros de teste: contas de login, perfis, cadastros de motorista e
o histórico que aponta para eles.

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

Acrescente `--tudo` para levar junto os dados do dia (chamadas, rotas,
programação, resumos, limites).

### O que ele nunca apaga

- A conta do dono e o perfil dela.
- `config` (parâmetros), `cidades` e `tipos` — é a configuração da operação,
  não dado de teste.

### Depois de rodar

**Apague o `chave.json`.** Ele é acesso total e irrestrito ao projeto: todos os
dados e todas as contas, sem passar por regra nenhuma. Se vazar, o projeto
inteiro vaza junto. No Console dá para revogar a chave em Contas de serviço.

O `.gitignore` já impede que ele seja enviado por engano — mas apagar é melhor
que confiar no .gitignore.
