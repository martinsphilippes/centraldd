# Central DD — Planejamento de Arquitetura

Sistema de gestão da disponibilidade diária de motoristas que realizam coletas, entregas e
transporte de encomendas do **Mercado Livre** 📦. Substitui as enquetes de WhatsApp por um
fluxo profissional: o motorista responde em segundos, o Dispatcher acompanha em tempo real
e monta a planejamento com poucos cliques.

---

## 1. Visão geral da arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        UI (React + TS)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────┐ │
│  │Dashboard │ │ Chamadas │ │Motoristas│ │Planej. │ │Relat.│ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ └──┬───┘ │
│       └────────────┴─────┬──────┴───────────┴─────────┘     │
│                          ▼                                   │
│              Camada de domínio (core/)                       │
│   tipos • regras de status • agregações • exportação         │
│                          ▼                                   │
│              Camada de dados (core/db.ts)                    │
│   Store reativo + persistência (localStorage hoje,           │
│   API REST / Supabase / Postgres amanhã — mesma interface)   │
└─────────────────────────────────────────────────────────────┘
```

**Princípios**

- **Módulos por domínio** (`src/modules/*`): cada área do negócio é isolada e evolui sozinha.
- **Camada de dados desacoplada**: a UI nunca fala com o armazenamento diretamente; usa o
  store reativo de `core/db.ts`. Trocar localStorage por uma API é alterar um único arquivo.
- **Componentes reutilizáveis** (`src/components`): botões, cards, badges, modais, gráficos.
- **Zero dependências pesadas**: gráficos em SVG próprio, exportações sem bibliotecas externas.
- **Estado reativo com `useSyncExternalStore`**: qualquer alteração reflete em todas as telas
  em tempo real (inclusive entre abas, via evento `storage`).

## 2. Entidades (modelo de dados)

```
Motorista 1 ──── N Resposta N ──── 1 Chamada
    │                                   │
    └──────── N PlanejamentoMotorista N ──────┘
                     │
                  Planejamento
```

### Motorista
| Campo      | Tipo    | Descrição                                  |
|------------|---------|--------------------------------------------|
| id         | string  | identificador único                        |
| nome       | string  | nome completo                              |
| telefone   | string  | usado para WhatsApp (`wa.me`) e ligação    |
| cidade     | string  | base operacional                           |
| equipe     | string  | equipe/turno                               |
| operacao   | string  | operação padrão (Mercado Livre, Coleta...) |
| veiculo    | string  | tipo de veículo (Van, Fiorino, Moto...)    |
| ativo      | boolean | motorista ativo na frota                   |
| criadoEm   | ISO     | data de cadastro                           |

### Chamada (de disponibilidade)
| Campo          | Tipo   | Descrição                                   |
|----------------|--------|---------------------------------------------|
| id             | string | identificador                               |
| titulo         | string | ex.: "Disponibilidade para Entregas"        |
| data           | ISO    | dia da operação                             |
| operacao       | string | ex.: "📦 Mercado Livre"                     |
| horarioInicio  | HH:mm  | início da operação                          |
| horarioFim     | HH:mm  | fim da operação                             |
| qtdNecessaria  | number | quantidade de motoristas necessária         |
| status         | enum   | `aberta` \| `encerrada`                     |
| criadaEm       | ISO    | criação                                     |

### Resposta
| Campo       | Tipo   | Descrição                                                   |
|-------------|--------|-------------------------------------------------------------|
| id          | string | identificador                                               |
| chamadaId   | string | FK → Chamada                                                |
| motoristaId | string | FK → Motorista                                              |
| status      | enum   | ver tabela de status abaixo                                 |
| horario     | HH:mm  | usado em "disponível após horário"                          |
| periodo     | enum   | `manha` \| `tarde` (usado em "meio período")                |
| observacao  | string | texto livre (obrigatório em "outro motivo")                 |
| respondidaEm| ISO    | quando respondeu (mede taxa/tempo de resposta)              |

**Status de resposta** (um toque para o motorista):

| Status         | Ícone | Conta como disponível? |
|----------------|-------|------------------------|
| disponivel     | 🟢    | sim                    |
| apos_horario   | 🟡    | parcial                |
| meio_periodo   | 🔵    | parcial                |
| indisponivel   | 🔴    | não                    |
| folga          | 🏖️    | não                    |
| atestado       | 🤒    | não                    |
| ferias         | ✈️    | não                    |
| outro          | 📝    | não (com observação)   |

### Planejamento
| Campo        | Tipo     | Descrição                                  |
|--------------|----------|--------------------------------------------|
| id           | string   | identificador                              |
| chamadaId    | string   | chamada de origem                          |
| nome         | string   | ex.: "Planejamento Entregas 13/08"               |
| data         | ISO      | dia da operação                            |
| motoristaIds | string[] | motoristas escolhidos                       |
| status       | enum     | `rascunho` \| `publicada` \| `concluida`   |
| criadaEm     | ISO      | criação                                    |

### Banco de dados futuro (SQL)

O modelo acima mapeia 1:1 para Postgres/Supabase:

```sql
create table motoristas (id uuid pk, nome text, telefone text, cidade text,
  equipe text, operacao text, veiculo text, ativo bool, criado_em timestamptz);
create table chamadas (id uuid pk, titulo text, data date, operacao text,
  horario_inicio time, horario_fim time, qtd_necessaria int, status text, criada_em timestamptz);
create table respostas (id uuid pk, chamada_id uuid fk, motorista_id uuid fk,
  status text, horario time, periodo text, observacao text, respondida_em timestamptz,
  unique (chamada_id, motorista_id));
create table planejamentos (id uuid pk, chamada_id uuid fk, nome text, data date, status text, criada_em timestamptz);
create table planejamento_motoristas (planejamento_id uuid fk, motorista_id uuid fk, primary key (planejamento_id, motorista_id));
```

Preparado para multi-tenant: basta acrescentar `transportadora_id` e `centro_distribuicao_id`
às tabelas (já previsto nos tipos como campos opcionais de expansão).

## 3. Perfis e permissões

| Ação                                | Dispatcher | Motorista |
|-------------------------------------|:-----------:|:---------:|
| Ver dashboard completo              | ✅          | —         |
| Criar/encerrar chamadas             | ✅          | —         |
| Ver quem respondeu / cobrar pendentes| ✅         | —         |
| Responder disponibilidade           | —           | ✅        |
| Ver próprias planejamentos                | ✅          | ✅        |
| Montar/publicar planejamentos             | ✅          | —         |
| Cadastro de motoristas              | ✅          | —         |
| Relatórios e exportação             | ✅          | —         |

No app há um **seletor de perfil** (modo demonstração). Na evolução para produção, entra
autenticação real (Supabase Auth / JWT) e as mesmas regras viram RLS/middleware — a UI já
está separada por perfil, então nada muda nas telas.

## 4. Fluxos principais

**Fluxo do Dispatcher**
1. Cria a chamada (data, operação, horário, quantidade necessária) → status `aberta`.
2. Acompanha em tempo real: respondidos × pendentes, disponíveis × indisponíveis,
   filtros por cidade, equipe, horário e operação.
3. Cobra pendentes (WhatsApp/ligação/notificação) direto da lista.
4. Monta a planejamento com poucos cliques (sugestão automática: disponíveis primeiro,
   ordenados por melhor histórico de disponibilidade).
5. Publica a planejamento e envia mensagem em massa aos escolhidos via WhatsApp.

**Fluxo do motorista**
1. Abre o app → vê as chamadas abertas do dia/semana.
2. Toca em um dos 8 status (com horário/observação quando aplicável). Pronto.
3. Pode alterar a resposta enquanto a chamada estiver aberta.
4. Vê as planejamentos em que foi escolhido.

## 5. Navegação e telas

```
/                     Dashboard (indicadores + gráficos + atalhos)
/chamadas             Lista de chamadas (abertas/encerradas)
/chamadas/nova        Criar chamada
/chamadas/:id         Painel da chamada (tempo real, filtros, cobrança, montar planejamento)
/responder            Visão do motorista: responder chamadas abertas
/motoristas           Frota (busca, filtros, contato rápido)
/motoristas/novo      Cadastro
/motoristas/:id       Perfil + histórico individual de disponibilidade
/planejamentos              Lista de planejamentos
/planejamentos/:id          Detalhe (escolhidos, contato, mensagem em massa, exportar)
/relatorios           Relatórios (dia/semana/mês, rankings, taxa de resposta, exportações)
```

Layout: sidebar fixa (desktop) / menu inferior (mobile), tema inspirado no universo
Mercado Livre (amarelo `#FFE600`, azul `#3483FA`), denso em informação e rápido de operar.

## 6. Componentes reutilizáveis

- `ui.tsx`: `Button`, `Card`, `Badge`, `Modal`, `Input`, `Select`, `StatCard`,
  `ProgressBar`, `EmptyState`, `Avatar`, `SegmentedControl`
- `charts.tsx`: `BarChart`, `DonutChart`, `TrendChart` (SVG puro, sem dependências)
- `ContactButtons`: WhatsApp (`wa.me`), ligação (`tel:`), notificação in-app
- `StatusPill`: renderização padronizada dos 8 status de resposta

## 7. Comunicação

- **WhatsApp individual**: `https://wa.me/55<numero>?text=<mensagem>`
- **Ligação**: `tel:+55<numero>`
- **Notificação**: central de notificações in-app (persistida no store); estruturada para
  virar push (FCM/APNs) na versão mobile.
- **Mensagem em massa**: gera a mensagem da planejamento e abre o WhatsApp por motorista
  (fila de envio), ou copia a lista formatada para colar no grupo.

## 8. Relatórios

Agregações calculadas na camada de domínio (`core/stats.ts`):
- disponibilidade diária / semanal / mensal;
- taxa de resposta por chamada e por motorista;
- ranking de mais disponíveis e de maior indisponibilidade;
- histórico individual (linha do tempo por motorista);
- planejamentos realizadas;
- exportação **CSV**, **Excel** e **PDF** (impressão formatada) sem dependências externas.

## 9. Expansões futuras (já estruturado para)

| Expansão                        | Como o projeto está preparado                                       |
|---------------------------------|---------------------------------------------------------------------|
| Múltiplas transportadoras / CDs | campos `transportadoraId`/`cdId` opcionais nos tipos; filtros prontos |
| Outras operações logísticas     | `operacao` é dado, não código — basta cadastrar                     |
| Mapas / geolocalização          | módulo novo em `modules/rotas` consumindo o mesmo store             |
| Check-in/out e jornada          | nova entidade `RegistroJornada` na mesma camada de dados            |
| Controle de veículos            | entidade `Veiculo` (campo `veiculo` já existe no motorista)         |
| Painel web + apps Android/iOS   | domínio/da­dos em TS puro, portável para React Native/Capacitor      |
| Push notifications              | central de notificações já persistida; trocar transporte             |
| Planejamento inteligente              | `sugerirPlanejamento()` já ordena por disponibilidade + histórico; evoluir para score |

## 10. Roadmap de implementação (por módulos)

1. **Fundação**: scaffold, tema, tipos, store reativo, seed de demonstração.
2. **Motoristas**: CRUD, busca, filtros, contato rápido, histórico.
3. **Chamadas**: criação, painel em tempo real, resposta do motorista em um toque.
4. **Planejamentos**: montagem assistida, publicação, comunicação em massa.
5. **Dashboard + Relatórios**: indicadores, gráficos, rankings, exportações.

Cada etapa deixa o aplicativo **funcional de ponta a ponta**.
