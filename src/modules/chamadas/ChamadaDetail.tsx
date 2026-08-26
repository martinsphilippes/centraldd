import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { removerChamada, salvarChamada, salvarPlanejamento, uid, useDB, enviarNotificacao } from '../../core/db'
import { formatarData, formatarQuando, rotuloDia } from '../../core/dates'
import { respostasDaChamada, resumoChamada, sugerirPlanejamento, veioDaDisponibilidade } from '../../core/stats'
import { ORDEM_STATUS, STATUS_DISPONIVEIS, STATUS_RESPOSTA } from '../../core/constants'
import type { Motorista, Resposta } from '../../core/types'
import { mensagemCobranca, formatarTelefone } from '../../core/comunicacao'
import { exportarCSV, exportarExcel, exportarPDF, type Tabela } from '../../core/export'
import { Avatar, Badge, Button, Card, EmptyState, Modal, ProgressBar, Select, StatCard } from '../../components/ui'
import { DonutChart } from '../../components/charts'
import { StatusPill } from '../../components/StatusPill'
import { ContactButtons } from '../../components/ContactButtons'

type Filtro = { cidade: string; equipe: string; status: string }

export function ChamadaDetail() {
  const { id } = useParams()
  const db = useDB()
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>({ cidade: '', equipe: '', status: '' })
  const [modalPlanejamento, setModalPlanejamento] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  const chamada = db.chamadas.find((c) => c.id === id)
  const resumo = useMemo(() => (chamada ? resumoChamada(db, chamada) : null), [db, chamada])

  if (!chamada || !resumo) {
    return <EmptyState icone="🔍" titulo="Chamada não encontrada" />
  }

  // Cada chamada gera UMA planejamento: montada, o botão vira o atalho para ela.
  const planejamentoExistente = db.planejamento.find((e) => e.chamadaId === chamada.id)

  // Só entra na planejamento quem FINALIZOU as rotas: pendência segura o motorista
  // mesmo que ele esteja disponível na chamada.
  const comRotaPendente = new Set(
    db.rotas.filter((r) => r.motoristaId && !r.finalizadaEm).map((r) => r.motoristaId as string),
  )

  const porId = new Map(db.motoristas.map((m) => [m.id, m]))
  // Inclui o que o motorista marcou na disponibilidade do dia (conta como resposta).
  const respostas = respostasDaChamada(db, chamada.id).sort((a, b) =>
    b.respondidaEm.localeCompare(a.respondidaEm),
  )

  const cidades = [...new Set(db.motoristas.map((m) => m.cidade))].sort()
  const equipes = [...new Set(db.motoristas.map((m) => m.equipe))].sort()

  const aplicaFiltro = (m: Motorista | undefined, r?: Resposta) => {
    if (!m) return false
    if (filtro.cidade && m.cidade !== filtro.cidade) return false
    if (filtro.equipe && m.equipe !== filtro.equipe) return false
    if (filtro.status && r?.status !== filtro.status) return false
    return true
  }

  const respostasFiltradas = respostas.filter((r) => aplicaFiltro(porId.get(r.motoristaId), r))
  const pendentesFiltrados = filtro.status ? [] : resumo.pendentes.filter((m) => aplicaFiltro(m))
  const disponiveis = respostasFiltradas.filter((r) => STATUS_DISPONIVEIS.includes(r.status))
  const indisponiveis = respostasFiltradas.filter((r) => !STATUS_DISPONIVEIS.includes(r.status))

  const abrirMontagem = () => {
    setSelecionados(
      new Set(
        sugerirPlanejamento(db, chamada)
          .map((m) => m.id)
          .filter((mid) => !comRotaPendente.has(mid)),
      ),
    )
    setModalPlanejamento(true)
  }

  const criarPlanejamento = () => {
    const idPlanejamento = uid()
    salvarPlanejamento({
      id: idPlanejamento,
      chamadaId: chamada.id,
      nome: `Planejamento ${chamada.titulo.replace('Disponibilidade para ', '')} ${formatarData(chamada.data)}`,
      data: chamada.data,
      motoristaIds: [...selecionados],
      status: 'rascunho',
      criadaEm: new Date().toISOString(),
    })
    setModalPlanejamento(false)
    navigate(`/planejamento/${idPlanejamento}`)
  }

  const tabelaExport = (): Tabela => ({
    titulo: `Chamada ${formatarData(chamada.data)} - ${chamada.titulo}`,
    colunas: ['Motorista', 'Telefone', 'Cidade', 'Equipe', 'Veículo', 'Status', 'Detalhe', 'Respondida em'],
    linhas: [
      ...respostas.map((r) => {
        const m = porId.get(r.motoristaId)
        const info = STATUS_RESPOSTA[r.status]
        const detalhe =
          r.status === 'apos_horario'
            ? `Após ${r.horario ?? ''}`
            : r.status === 'meio_periodo'
              ? r.periodo === 'manha'
                ? 'Manhã'
                : 'Tarde'
              : (r.observacao ?? '')
        return [
          m?.nome ?? '—',
          m ? formatarTelefone(m.telefone) : '—',
          m?.cidade ?? '—',
          m?.equipe ?? '—',
          m?.veiculo ?? '—',
          info.label,
          detalhe,
          new Date(r.respondidaEm).toLocaleString('pt-BR'),
        ]
      }),
      ...resumo.pendentes.map((m) => [
        m.nome,
        formatarTelefone(m.telefone),
        m.cidade,
        m.equipe,
        m.veiculo,
        'Sem resposta',
        '',
        '',
      ]),
    ],
  })

  const LinhaMotorista = ({ m, r }: { m: Motorista; r?: Resposta }) => (
    <li className="rounded-lg border border-slate-200 p-2.5">
      <div className="flex items-center gap-2">
        <Avatar nome={m.nome} tamanho="sm" />
        <div className="min-w-0 flex-1">
          <Link to={`/motoristas/${m.id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-ml-azul">
            {m.nome}
          </Link>
          <p className="truncate text-[11px] text-slate-500">
            {m.cidade} • {m.equipe} • {m.veiculo}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {r ? (
          <>
            <StatusPill resposta={r} />
            {veioDaDisponibilidade(r) && (
              <Badge className="border-sky-200 bg-sky-50 text-sky-700">📅 pela disponibilidade</Badge>
            )}
          </>
        ) : (
          <Badge className="border-slate-200 bg-slate-100 text-slate-500">⏳ Sem resposta</Badge>
        )}
        <span className="ml-auto" />
        <ContactButtons motorista={m} mensagem={r ? undefined : mensagemCobranca(m, chamada)} compacto />
      </div>
      {r && (
        <p className="mt-1 text-[11px] text-slate-500">
          {veioDaDisponibilidade(r) ? '📅 marcou na disponibilidade em ' : '✋ respondeu em '}
          <strong>{formatarQuando(r.respondidaEm)}</strong>
        </p>
      )}
      {r?.observacao && <p className="mt-1 text-[11px] italic text-slate-500">“{r.observacao}”</p>}
    </li>
  )

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{chamada.titulo}</h1>
            {chamada.status === 'aberta' ? (
              <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">● Aberta</Badge>
            ) : (
              <Badge className="border-slate-200 bg-slate-100 text-slate-600">Encerrada</Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            📅 {rotuloDia(chamada.data)} • 📦 {chamada.operacao} • 🕖 {chamada.horarioInicio} às {chamada.horarioFim} • 🚚{' '}
            {chamada.qtdNecessaria} motoristas necessários
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" onClick={() => exportarCSV(tabelaExport())}>⬇️ CSV</Button>
          <Button variante="secundario" onClick={() => exportarExcel(tabelaExport())}>⬇️ Excel</Button>
          <Button variante="secundario" onClick={() => exportarPDF(tabelaExport(), `${chamada.titulo} • ${rotuloDia(chamada.data)}`)}>
            🖨️ PDF
          </Button>
          {chamada.status === 'aberta' && (
            <Button
              variante="secundario"
              onClick={() => salvarChamada({ ...chamada, status: 'encerrada' })}
            >
              🔒 Encerrar
            </Button>
          )}
          {chamada.status === 'encerrada' && (
            <Button
              variante="secundario"
              onClick={() => {
                const extras = planejamentoExistente ? ' A planejamento vinculada e as respostas também serão excluídas.' : ' As respostas também serão excluídas.'
                if (confirm(`Excluir a chamada de ${formatarData(chamada.data)}?${extras}`)) {
                  removerChamada(chamada.id)
                  navigate('/chamadas')
                }
              }}
            >
              🗑️ Excluir
            </Button>
          )}
          {planejamentoExistente ? (
            <Link
              to={`/planejamento/${planejamentoExistente.id}`}
              className="rounded-lg bg-ml-amarelo px-4 py-2 text-sm font-bold text-slate-900 hover:opacity-90"
            >
              📋 Ver planejamento →
            </Link>
          ) : (
            <Button variante="ml" onClick={abrirMontagem}>
              📋 Montar planejamento
            </Button>
          )}
        </div>
      </div>

      {/* Indicadores em tempo real */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icone="✅" valor={`${resumo.disponiveis}/${chamada.qtdNecessaria}`} rotulo="Disponíveis × meta" destaque />
        <StatCard icone="💬" valor={`${resumo.respondidos}/${resumo.total}`} rotulo="Já responderam" />
        <StatCard icone="❌" valor={resumo.indisponiveis} rotulo="Indisponíveis" />
        <StatCard icone="⏳" valor={resumo.pendentes.length} rotulo="Pendentes" />
      </div>

      {/* De onde vem cada número — o painel nunca mostra disponível sem lastro. */}
      <p className="-mt-2 text-xs text-slate-500">
        {(() => {
          const daDisponibilidade = respostas.filter(veioDaDisponibilidade).length
          const naChamada = respostas.length - daDisponibilidade
          if (respostas.length === 0)
            return '⏳ Ninguém respondeu ainda e ninguém marcou este dia na disponibilidade — todos constam como pendentes.'
          return (
            <>
              📊 <strong>{naChamada}</strong> responderam à chamada
              {daDisponibilidade > 0 && (
                <>
                  {' '}
                  • <strong>{daDisponibilidade}</strong> vieram da disponibilidade que o motorista já tinha marcado para{' '}
                  {formatarData(chamada.data)} (marcados com 📅 na lista)
                </>
              )}
              .
            </>
          )
        })()}
      </p>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-6">
          <DonutChart
            fatias={ORDEM_STATUS.map((s) => ({
              rotulo: `${STATUS_RESPOSTA[s].emoji} ${STATUS_RESPOSTA[s].label}`,
              valor: resumo.porStatus[s] ?? 0,
              cor: STATUS_RESPOSTA[s].dot,
            })).filter((f) => f.valor > 0)}
          />
          <div className="min-w-48 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Progresso das respostas</p>
            <ProgressBar valor={resumo.respondidos} total={resumo.total} cor="bg-emerald-500" />
            <p className="mt-1 text-xs text-slate-500">
              {resumo.respondidos} de {resumo.total} motoristas ({resumo.total ? Math.round((resumo.respondidos / resumo.total) * 100) : 0}%)
            </p>
            <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Meta de motoristas</p>
            <ProgressBar valor={resumo.disponiveis} total={chamada.qtdNecessaria} cor="bg-ml-azul" />
            <p className="mt-1 text-xs text-slate-500">
              {resumo.disponiveis} disponíveis de {chamada.qtdNecessaria} necessários
            </p>
          </div>
        </div>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Filtrar:</span>
        <Select value={filtro.cidade} onChange={(e) => setFiltro({ ...filtro, cidade: e.target.value })} style={{ width: 'auto' }}>
          <option value="">📍 Todas as cidades</option>
          {cidades.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select value={filtro.equipe} onChange={(e) => setFiltro({ ...filtro, equipe: e.target.value })} style={{ width: 'auto' }}>
          <option value="">👥 Todas as equipes</option>
          {equipes.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </Select>
        <Select value={filtro.status} onChange={(e) => setFiltro({ ...filtro, status: e.target.value })} style={{ width: 'auto' }}>
          <option value="">🏷️ Todos os status</option>
          {ORDEM_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS_RESPOSTA[s].emoji} {STATUS_RESPOSTA[s].label}
            </option>
          ))}
        </Select>
        {(filtro.cidade || filtro.equipe || filtro.status) && (
          <Button variante="fantasma" onClick={() => setFiltro({ cidade: '', equipe: '', status: '' })}>
            Limpar
          </Button>
        )}
      </div>

      {/* Listas */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-emerald-700">✅ Disponíveis ({disponiveis.length})</h2>
          {disponiveis.length === 0 ? (
            <EmptyState icone="🕐" titulo="Ninguém disponível ainda" />
          ) : (
            <ul className="space-y-2">
              {disponiveis.map((r) => {
                const m = porId.get(r.motoristaId)
                return m ? <LinhaMotorista key={r.id} m={m} r={r} /> : null
              })}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-red-600">❌ Indisponíveis ({indisponiveis.length})</h2>
          {indisponiveis.length === 0 ? (
            <EmptyState icone="🎉" titulo="Nenhuma indisponibilidade" />
          ) : (
            <ul className="space-y-2">
              {indisponiveis.map((r) => {
                const m = porId.get(r.motoristaId)
                return m ? <LinhaMotorista key={r.id} m={m} r={r} /> : null
              })}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-600">⏳ Pendentes ({pendentesFiltrados.length})</h2>
            {pendentesFiltrados.length > 0 && (
              <Button
                variante="fantasma"
                onClick={() => {
                  for (const m of pendentesFiltrados) {
                    enviarNotificacao({
                      motoristaId: m.id,
                      chamadaId: chamada.id,
                      titulo: 'Responda a chamada de disponibilidade',
                      mensagem: mensagemCobranca(m, chamada),
                    })
                  }
                }}
                title="Enviar notificação in-app para todos os pendentes"
              >
                🔔 Cobrar todos
              </Button>
            )}
          </div>
          {pendentesFiltrados.length === 0 ? (
            <EmptyState icone="✅" titulo="Todos responderam!" />
          ) : (
            <ul className="space-y-2">
              {pendentesFiltrados.map((m) => (
                <LinhaMotorista key={m.id} m={m} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Modal de montagem de planejamento */}
      <Modal aberto={modalPlanejamento} titulo="📋 Montar planejamento" onFechar={() => setModalPlanejamento(false)}>
        <p className="mb-3 text-sm text-slate-500">
          Sugestão automática: disponíveis primeiro, ordenados pelo melhor histórico. Ajuste como quiser.
        </p>
        <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="font-semibold text-slate-700">
            {selecionados.size} selecionado(s) / meta {chamada.qtdNecessaria}
          </span>
          <ProgressBar valor={selecionados.size} total={chamada.qtdNecessaria} />
        </div>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {respostas
            .filter((r) => STATUS_DISPONIVEIS.includes(r.status))
            .map((r) => {
              const m = porId.get(r.motoristaId)
              if (!m) return null
              const ativo = selecionados.has(m.id)
              const pendente = comRotaPendente.has(m.id)
              return (
                <li key={r.id}>
                  <button
                    disabled={pendente}
                    onClick={() => {
                      const novo = new Set(selecionados)
                      if (ativo) novo.delete(m.id)
                      else novo.add(m.id)
                      setSelecionados(novo)
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                      pendente
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                        : ativo
                          ? 'border-ml-azul bg-blue-50'
                          : 'border-slate-200 hover:bg-slate-50'
                    }`}
                    title={pendente ? 'Só entra no planejamento depois de finalizar a(s) rota(s) em andamento.' : undefined}
                  >
                    <span className="text-base">{pendente ? '🚧' : ativo ? '☑️' : '⬜'}</span>
                    <Avatar nome={m.nome} tamanho="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{m.nome}</span>
                      <span className="text-[11px] text-slate-500">
                        {pendente ? '🚧 rota em andamento — finalize para entrar' : `${m.cidade} • ${m.veiculo}`}
                      </span>
                    </span>
                    <StatusPill resposta={r} />
                  </button>
                </li>
              )
            })}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button variante="secundario" onClick={() => setModalPlanejamento(false)}>
            Cancelar
          </Button>
          <Button variante="ml" onClick={criarPlanejamento} disabled={selecionados.size === 0}>
            📋 Criar planejamento com {selecionados.size}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
