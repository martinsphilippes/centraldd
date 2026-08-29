# 🚚 Central DD

Gestão da disponibilidade diária de motoristas que realizam **coletas, entregas e transporte
de encomendas do Mercado Livre** 📦 — substituindo as enquetes de WhatsApp por um sistema
profissional, rápido e intuitivo.

- O **motorista** abre o app e informa a disponibilidade em segundos (um toque).
- O **coordenador** acompanha tudo em tempo real, cobra pendentes, monta a escala com
  poucos cliques e comunica os escalados pelo WhatsApp.

## Funcionalidades

- 📋 **Chamadas de disponibilidade** com data, operação, horário e quantidade necessária
- 🟢🟡🔵🔴🏖️🤒✈️📝 **8 status de resposta** em um toque (com horário/observação quando preciso)
- 📊 **Painel em tempo real**: respondidos, pendentes, disponíveis por horário/cidade/equipe
- 🗓️ **Montagem de escalas** assistida, com sugestão automática por histórico
- 💬 **Comunicação**: WhatsApp, ligação, notificação in-app e mensagem em massa
- 📈 **Dashboard** com indicadores e gráficos por período
- 📑 **Relatórios**: diário/semanal/mensal, taxa de resposta, rankings, histórico individual
- ⬇️ **Exportação** CSV, Excel e PDF

## Acesso

Aplicativo em produção: **https://centraldd.vercel.app** (deploy automático a cada
push neste repositório).

O endereço antigo, **https://mldisponibilidade.vercel.app**, continua ligado ao
mesmo projeto e serve o mesmo app. Ele existe para quem já tinha o atalho na tela
de início não ficar com um ícone quebrado, e sai de cena quando todos os
motoristas tiverem migrado.

## Como rodar

```bash
npm install
npm run dev      # desenvolvimento (http://localhost:5173)
npm run build    # build de produção
npm run preview  # servir o build
```

O app abre com **dados de demonstração** (frota, chamadas e respostas) e um seletor de
perfil no topo para alternar entre a visão do **coordenador** e a do **motorista**.

## Arquitetura

Documentação completa em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): entidades, modelo de
banco, fluxos, permissões, componentes, navegação e roadmap de expansão (multi-transportadora,
geolocalização, jornada, apps mobile, escala inteligente).

Stack: **React 19 + TypeScript + Vite + Tailwind CSS 4**, store reativo próprio com
persistência em `localStorage` (camada de dados desacoplada, pronta para trocar por
API/Supabase sem tocar na UI), gráficos SVG sem dependências externas.
