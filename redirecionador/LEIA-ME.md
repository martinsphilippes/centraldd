# Aviso de mudança de endereço

Esta pasta **não faz parte do aplicativo**. Ela é um site de uma página só,
para ser publicado num **projeto separado na Vercel**, chamado
`mldisponibilidade`.

## Para que serve

Quando o projeto principal foi renomeado para `centraldd`, o endereço
`mldisponibilidade.vercel.app` foi devolvido para a Vercel e parou de
funcionar. Todo motorista que já tinha o app na tela de início ficou com um
ícone que não abre mais.

Publicando esta pasta num projeto chamado `mldisponibilidade`, aquele endereço
volta a existir e passa a mostrar um aviso com o caminho novo, em vez de erro.

Ela também **desliga o service worker antigo** que ficou instalado no
aparelho. Sem isso, o celular pode continuar servindo a versão velha do app,
guardada no próprio aparelho, e o motorista nunca ver o aviso.

## Como publicar

1. Vercel → **Add New… → Project**
2. Escolha este mesmo repositório
3. Em **Root Directory**, aponte para `redirecionador`
4. Em **Project Name**, escreva `mldisponibilidade`
5. Deploy

Vale conferir depois se `https://mldisponibilidade.vercel.app` abre o aviso.

## Quando apagar

Depois que todos os motoristas estiverem usando o endereço novo — dá para
confirmar quando ninguém mais reclamar de ícone quebrado. Aí é só apagar o
projeto na Vercel e remover esta pasta.
