import { Link, useNavigate, useParams } from 'react-router-dom'
import { removerMotorista, useDB } from '../../core/db'
import { formatarDataHora, formatarDataLonga, hojeISO, rotuloDia } from '../../core/dates'
import { STATUS_RESPOSTA } from '../../core/constants'
import { estatisticasMotoristas } from '../../core/stats'
import { formatarTelefone } from '../../core/comunicacao'
import { Avatar, Badge, Button, Card, EmptyState, StatCard } from '../../components/ui'
import { ContactButtons } from '../../components/ContactButtons'
import { StatusPill } from '../../components/StatusPill'

export function MotoristaDetail() {
  const { id } = useParams()
  const db = useDB()
  const navigate = useNavigate()
  const motorista = db.motoristas.find((m) => m.id === id)

  if (!motorista) return <EmptyState icone="🔍" titulo="Motorista não encontrado" />

  const estat = estatisticasMotoristas(db, '0000-01-01', '9999-12-31').find(
    (e) => e.motorista.id === motorista.id,
  )
  const porChamada = new Map(db.chamadas.map((c) => [c.id, c]))
  const historico = db.respostas
    .filter((r) => r.motoristaId === motorista.id)
    .sort((a, b) => b.respondidaEm.localeCompare(a.respondidaEm))
  const planejamento = db.planejamento.filter((e) => e.motoristaIds.includes(motorista.id))
  const disponibilidadeFutura = db.disponibilidade
    .filter((a) => a.motoristaId === motorista.id && a.data >= hojeISO())
    .sort((a, b) => a.data.localeCompare(b.data))

  const excluir = () => {
    if (confirm(`Remover ${motorista.nome} da frota? O histórico de respostas será mantido.`)) {
      removerMotorista(motorista.id)
      navigate('/motoristas')
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar nome={motorista.nome} tamanho="lg" />
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                {motorista.nome}
                {!motorista.ativo && <Badge className="border-red-200 bg-red-50 text-red-600">Inativo</Badge>}
              </h1>
              <p className="text-sm text-slate-500">
                📱 {formatarTelefone(motorista.telefone)} • 📍 {motorista.cidade} • 🚐{' '}
                {motorista.veiculo} • {motorista.operacao}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/motoristas/${motorista.id}/editar`}>
              <Button variante="secundario">✏️ Editar</Button>
            </Link>
            <Button variante="perigo" onClick={excluir}>
              🗑️ Remover
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <ContactButtons motorista={motorista} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icone="💬" valor={`${Math.round((estat?.taxaResposta ?? 0) * 100)}%`} rotulo="Taxa de resposta" />
        <StatCard icone="✅" valor={`${Math.round((estat?.taxaDisponibilidade ?? 0) * 100)}%`} rotulo="Disponibilidade" />
        <StatCard icone="🗓️" valor={estat?.respondidas ?? 0} rotulo="Chamadas respondidas" />
        <StatCard icone="📋" valor={planejamento.length} rotulo="Escalas participadas" />
      </div>

      {disponibilidadeFutura.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 font-bold text-slate-900">📅 Disponibilidade marcada pelo motorista</h2>
          <p className="mb-3 text-xs text-slate-500">Disponibilidade que ele mesmo marcou para os próximos dias.</p>
          <ul className="flex flex-wrap gap-2">
            {disponibilidadeFutura.map((a) => {
              const info = STATUS_RESPOSTA[a.status]
              let detalhe = ''
              if (a.status === 'apos_horario' && a.horario) detalhe = ` após ${a.horario}`
              if (a.status === 'meio_periodo' && a.periodo) detalhe = ` (${a.periodo === 'manha' ? 'manhã' : 'tarde'})`
              return (
                <li key={a.id} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${info.cor}`}>
                  <span className="mr-1 font-bold">{rotuloDia(a.data)}:</span>
                  {info.emoji} {info.label}
                  {detalhe}
                  {a.observacao && <span className="italic"> — “{a.observacao}”</span>}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-slate-900">🕓 Histórico de disponibilidade</h2>
          {historico.length === 0 ? (
            <EmptyState icone="🕓" titulo="Sem respostas registradas" />
          ) : (
            <ul className="space-y-2">
              {historico.map((r) => {
                const c = porChamada.get(r.chamadaId)
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{c?.titulo ?? 'Chamada'}</p>
                      <p className="text-[11px] text-slate-500">
                        {c ? formatarDataLonga(c.data) : ''} • respondido em {formatarDataHora(r.respondidaEm)}
                      </p>
                      {r.observacao && <p className="text-[11px] italic text-slate-500">“{r.observacao}”</p>}
                    </div>
                    <StatusPill resposta={r} />
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-bold text-slate-900">📋 Escalas</h2>
          {planejamento.length === 0 ? (
            <EmptyState icone="📋" titulo="Nenhuma planejamento até agora" />
          ) : (
            <ul className="space-y-2">
              {planejamento.map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/planejamento/${e.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 hover:border-ml-azul"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{e.nome}</p>
                      <p className="text-[11px] text-slate-500">{formatarDataLonga(e.data)}</p>
                    </div>
                    <Badge
                      className={
                        e.status === 'concluida'
                          ? 'border-slate-200 bg-slate-100 text-slate-600'
                          : e.status === 'publicada'
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                            : 'border-amber-200 bg-amber-100 text-amber-800'
                      }
                    >
                      {e.status === 'concluida' ? '✔️ Concluída' : e.status === 'publicada' ? '✅ Publicada' : '✏️ Rascunho'}
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
