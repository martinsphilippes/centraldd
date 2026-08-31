# 🚚 Central DD

Gestão da disponibilidade diária de motoristas que realizam **coletas, entregas e transporte
de encomendas do Mercado Livre** 📦 — substituindo as enquetes de WhatsApp por um sistema
profissional, rápido e intuitivo.

- O **motorista** abre o app e informa a disponibilidade em segundos (um toque).
- O **Dispatcher** acompanha tudo em tempo real, cobra pendentes, monta o planejamento
  com poucos cliques e comunica os escolhidos pelo WhatsApp.

## Funcionalidades

- 📋 **Chamadas de disponibilidade** com data, operação, horário e quantidade necessária
- 🟢🟡🔵🔴🏖️🤒✈️📝 **8 status de resposta** em um toque (com horário/observação quando preciso)
- 📊 **Painel em tempo real**: respondidos, pendentes, disponíveis por horário e cidade
- 🗓️ **Montagem do planejamento** assistida, com sugestão automática por histórico
- 💬 **Comunicação**: WhatsApp, ligação, notificação in-app e mensagem em massa
- 📈 **Dashboard** com indicadores e gráficos por período
- 📑 **Relatórios**: diário/semanal/mensal, taxa de resposta, rankings, histórico individual
- ⬇️ **Exportação** CSV, Excel e PDF

## Acesso

Aplicativo em produção: **https://centraldd.vercel.app** (deploy automático a cada
push neste repositório).

O endereço anterior (`mldisponibilidade.vercel.app`) segue ligado ao mesmo
projeto, para não quebrar o atalho de quem instalou o app antes da mudança de
nome. Sai de cena quando todos tiverem migrado.

## Como rodar

```bash
npm install
npm run dev      # desenvolvimento (http://localhost:5173)
npm run build    # build de produção
npm run preview  # servir o build
```

O app abre com **dados de demonstração** (frota, chamadas e respostas) e um seletor de
perfil no topo para alternar entre a visão do **Dispatcher** e a do **motorista**.

## Arquitetura

Documentação completa em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): entidades, modelo de
banco, fluxos, permissões, componentes, navegação e roadmap de expansão (multi-transportadora,
geolocalização, jornada, apps mobile, planejamento inteligente).

Stack: **React 19 + TypeScript + Vite + Tailwind CSS 4**, store reativo próprio com
persistência em `localStorage` (camada de dados desacoplada, pronta para trocar por
API/Supabase sem tocar na UI), gráficos SVG sem dependências externas.
