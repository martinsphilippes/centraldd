import { Link } from 'react-router-dom'
import { ehPapelDispatcher } from '../../core/papel'
import { useDB } from '../../core/db'
import { hojeISO, rotuloDia, parseISODate } from '../../core/dates'
import { MelhoresMotoristas } from './MelhoresMotoristas'
import { SatisfacaoClientes, TaxaSucessoRotas } from './SucessoESatisfacao'
import { resumoChamada, serieDisponibilidade } from '../../core/stats'
import { Badge, Button, Card, ProgressBar, StatCard, EmptyState } from '../../components/ui'
import { BarChart, Legenda } from '../../components/charts'

export function Dashboard() {
  const db = useDB()
  const hoje = hojeISO()

  const chamadasHoje = db.chamadas.filter((c) => c.data === hoje)
  const resumosHoje = chamadasHoje.map((c) => resumoChamada(db, c))
  const abertas = db.chamadas.filter((c) => c.status === 'aberta')
  const disponiveisHoje = resumosHoje.reduce((s, r) => s + r.disponiveis, 0)
  const indisponiveisHoje = resumosHoje.reduce((s, r) => s + r.indisponiveis, 0)
  const pendentesHoje = resumosHoje.reduce((s, r) => s + r.pendentes.length, 0)
  const planejamentosConcluidos = db.planejamento.filter((e) => e.status === 'concluida').length
  const planejamentosAbertos = db.planejamento.filter((e) => e.status !== 'concluida')
  const entregasHoje = chamadasHoje.reduce((s, c) => s + c.qtdNecessaria, 0)

  const serie = serieDisponibilidade(db, hojeISO(-6), hojeISO(1))
  const preCadastros = db.motoristas.filter((m) => m.aprovado === false).length

  return (
    <div className="space-y-5">
      {preCadastros > 0 && (
        <Link
          to="/motoristas"
          className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100"
        >
          <span className="text-sm font-semibold text-slate-800">
            ⏳ {preCadastros} pré-cadastro{preCadastros > 1 ? 's' : ''} de motorista aguardando sua aprovação
          </span>
          <span className="text-sm font-bold text-ml-azul">Revisar →</span>
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">📊 Painel da operação</h1>
          <p className="text-sm text-slate-500">{rotuloDia(hoje)}</p>
        </div>
        <Link to="/programacao">
          <Button variante="ml">📆 Programar o dia →</Button>
        </Link>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icone="📦" valor={entregasHoje} rotulo="Vagas de rota hoje" destaque />
        <StatCard icone="🚚" valor={db.motoristas.filter((m) => m.ativo).length} rotulo="Motoristas cadastrados" />
        <StatCard
          icone="🧑"
          valor={db.perfis.filter((p) => ehPapelDispatcher(p.papel)).length}
          rotulo="Dispatchers cadastrados"
        />
        <StatCard icone="✅" valor={disponiveisHoje} rotulo="Disponíveis hoje" />
        <StatCard icone="❌" valor={indisponiveisHoje} rotulo="Indisponíveis hoje" />
        <StatCard icone="⏳" valor={pendentesHoje} rotulo="Pendentes de resposta" />
        <StatCard icone="📋" valor={planejamentosConcluidos} rotulo="Escalas concluídas" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TaxaSucessoRotas />
        <SatisfacaoClientes />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MelhoresMotoristas />

        {/* Gráfico da semana */}
        <Card className="p-4">
          <h2 className="mb-1 font-bold text-slate-900">📈 Disponibilidade — últimos 7 dias</h2>
          <p className="mb-3 text-xs text-slate-500">Comparativo por chamada: disponíveis, indisponíveis e pendentes.</p>
          {serie.length === 0 ? (
            <EmptyState icone="📈" titulo="Sem dados no período" />
          ) : (
            <>
              <BarChart
                barras={serie.map((p) => ({
                  rotulo: parseISODate(p.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                  valores: [
                    { valor: p.disponiveis, cor: '#10b981' },
                    { valor: p.indisponiveis, cor: '#ef4444' },
                    { valor: p.pendentes, cor: '#94a3b8' },
                  ],
                }))}
              />
              <div className="mt-2">
                <Legenda
                  itens={[
                    { rotulo: 'Disponíveis', cor: '#10b981' },
                    { rotulo: 'Indisponíveis', cor: '#ef4444' },
                    { rotulo: 'Pendentes', cor: '#94a3b8' },
                  ]}
                />
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Chamadas abertas */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">⏰ Chamadas abertas</h2>
            <Link to="/chamadas" className="text-xs font-semibold text-ml-azul hover:underline">
              Ver todas →
            </Link>
          </div>
          {abertas.length === 0 ? (
            <EmptyState icone="🎉" titulo="Nenhuma chamada aberta" descricao="Crie uma chamada para consultar a disponibilidade da frota." />
          ) : (
            <ul className="space-y-3">
              {abertas.slice(0, 4).map((c) => {
                const r = resumoChamada(db, c)
                return (
                  <li key={c.id}>
                    <Link
                      to={`/chamadas/${c.id}`}
                      className="block rounded-lg border border-slate-200 p-3 transition-colors hover:border-ml-azul hover:bg-blue-50/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{c.titulo}</span>
                        <Badge className="border-yellow-300 bg-ml-amarelo/60 text-slate-800">
                          🚚 {r.disponiveis}/{c.qtdNecessaria}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        📅 {rotuloDia(c.data)} • {c.operacao} • 🕖 {c.horarioInicio}–{c.horarioFim}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar valor={r.respondidos} total={r.total} />
                        <span className="whitespace-nowrap text-[11px] font-medium text-slate-500">
                          {r.respondidos}/{r.total} responderam
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Escalas em andamento */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">📍 Rotas e planejamento em andamento</h2>
            <Link to="/planejamento" className="text-xs font-semibold text-ml-azul hover:underline">
              Ver todas →
            </Link>
          </div>
          {planejamentosAbertos.length === 0 ? (
            <EmptyState icone="📋" titulo="Nenhuma planejamento em andamento" descricao="Monte a planejamento a partir do painel de uma chamada." />
          ) : (
            <ul className="space-y-3">
              {planejamentosAbertos.slice(0, 4).map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/planejamento/${e.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3 transition-colors hover:border-ml-azul hover:bg-blue-50/50"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{e.nome}</span>
                      <p className="text-xs text-slate-500">📅 {rotuloDia(e.data)} • 🚚 {e.motoristaIds.length} no planejamento</p>
                    </div>
                    <Badge
                      className={
                        e.status === 'publicada'
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }
                    >
                      {e.status === 'publicada' ? '✅ Publicada' : '✏️ Rascunho'}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

    </div>
  )
}
