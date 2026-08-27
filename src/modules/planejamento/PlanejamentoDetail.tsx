import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { enviarNotificacao, removerPlanejamento, salvarPlanejamento, useDB } from '../../core/db'
import { rotuloDia } from '../../core/dates'
import {
  linkWhatsApp,
  mensagemPlanejamento,
  textoPlanejamentoParaGrupo,
  formatarTelefone,
} from '../../core/comunicacao'
import { exportarCSV, exportarExcel, exportarPDF, type Tabela } from '../../core/export'
import { STATUS_DISPONIVEIS } from '../../core/constants'
import { Avatar, Badge, Button, Card, EmptyState, Modal } from '../../components/ui'
import { ContactButtons } from '../../components/ContactButtons'

export function PlanejamentoDetail() {
  const { id } = useParams()
  const db = useDB()
  const navigate = useNavigate()
  const [modalMassa, setModalMassa] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const planejamento = db.planejamento.find((e) => e.id === id)
  if (!planejamento) return <EmptyState icone="🔍" titulo="Planejamento não encontrada" />

  const chamada = db.chamadas.find((c) => c.id === planejamento.chamadaId)
  const porId = new Map(db.motoristas.map((m) => [m.id, m]))
  const incluidos = planejamento.motoristaIds
    .map((mid) => porId.get(mid))
    .filter((m): m is NonNullable<typeof m> => !!m)

  // Disponíveis na chamada que ainda não estão na planejamento (para incluir).
  const foraDoPlanejamento = chamada
    ? db.respostas
        .filter(
          (r) =>
            r.chamadaId === chamada.id &&
            STATUS_DISPONIVEIS.includes(r.status) &&
            !planejamento.motoristaIds.includes(r.motoristaId),
        )
        .map((r) => porId.get(r.motoristaId))
        .filter((m): m is NonNullable<typeof m> => !!m)
    : []

  const publicar = () => {
    salvarPlanejamento({ ...planejamento, status: 'publicada' })
    for (const m of incluidos) {
      enviarNotificacao({
        motoristaId: m.id,
        chamadaId: planejamento.chamadaId,
        titulo: `Você está no planejamento: ${planejamento.nome}`,
        mensagem: mensagemPlanejamento(m, planejamento, chamada),
      })
    }
  }

  const tabela = (): Tabela => ({
    titulo: planejamento.nome,
    colunas: ['#', 'Motorista', 'Telefone', 'Cidade', 'Veículo'],
    linhas: incluidos.map((m, i) => [
      i + 1,
      m.nome,
      formatarTelefone(m.telefone),
      m.cidade,
      m.veiculo,
    ]),
  })

  const textoGrupo = textoPlanejamentoParaGrupo(planejamento, chamada, incluidos)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{planejamento.nome}</h1>
            <Badge
              className={
                planejamento.status === 'concluida'
                  ? 'border-slate-200 bg-slate-100 text-slate-600'
                  : planejamento.status === 'publicada'
                    ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                    : 'border-amber-200 bg-amber-100 text-amber-800'
              }
            >
              {planejamento.status === 'concluida' ? '✔️ Concluída' : planejamento.status === 'publicada' ? '✅ Publicada' : '✏️ Rascunho'}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            📅 {rotuloDia(planejamento.data)}
            {chamada && (
              <>
                {' '}• 📦 {chamada.operacao} • 🕖 {chamada.horarioInicio} às {chamada.horarioFim} •{' '}
                <Link to={`/chamadas/${chamada.id}`} className="font-semibold text-ml-azul hover:underline">
                  ver chamada →
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" onClick={() => exportarCSV(tabela())}>⬇️ CSV</Button>
          <Button variante="secundario" onClick={() => exportarExcel(tabela())}>⬇️ Excel</Button>
          <Button variante="secundario" onClick={() => exportarPDF(tabela(), rotuloDia(planejamento.data))}>🖨️ PDF</Button>
          {planejamento.status === 'rascunho' && (
            <Button variante="ml" onClick={publicar} disabled={incluidos.length === 0}>
              📢 Publicar e notificar
            </Button>
          )}
          {planejamento.status === 'publicada' && (
            <>
              <Button variante="secundario" onClick={() => setModalMassa(true)}>
                💬 Mensagem em massa
              </Button>
              <Button variante="primario" onClick={() => salvarPlanejamento({ ...planejamento, status: 'concluida' })}>
                ✔️ Concluir planejamento
              </Button>
            </>
          )}
          <Button
            variante="perigo"
            onClick={() => {
              if (confirm('Excluir esta planejamento?')) {
                removerPlanejamento(planejamento.id)
                navigate('/planejamento')
              }
            }}
          >
            🗑️
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-3 font-bold text-slate-900">🚚 No planejamento ({incluidos.length}{chamada ? `/${chamada.qtdNecessaria}` : ''})</h2>
          {incluidos.length === 0 ? (
            <EmptyState icone="🚚" titulo="Nenhum motorista na planejamento" />
          ) : (
            <ul className="space-y-2">
              {incluidos.map((m, i) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5">
                  <span className="w-6 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                  <Avatar nome={m.nome} tamanho="sm" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/motoristas/${m.id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-ml-azul">
                      {m.nome}
                    </Link>
                    <p className="text-[11px] text-slate-500">
                      {m.cidade} • {m.veiculo} • 📱 {formatarTelefone(m.telefone)}
                    </p>
                  </div>
                  <ContactButtons motorista={m} mensagem={mensagemPlanejamento(m, planejamento, chamada)} compacto />
                  {planejamento.status !== 'concluida' && (
                    <button
                      title="Remover do planejamento"
                      onClick={() =>
                        salvarPlanejamento({ ...planejamento, motoristaIds: planejamento.motoristaIds.filter((x) => x !== m.id) })
                      }
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-bold text-slate-900">➕ Disponíveis fora do planejamento ({foraDoPlanejamento.length})</h2>
          {foraDoPlanejamento.length === 0 ? (
            <EmptyState icone="✅" titulo="Todos os disponíveis já estão no planejamento" />
          ) : (
            <ul className="space-y-2">
              {foraDoPlanejamento.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5">
                  <Avatar nome={m.nome} tamanho="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{m.nome}</p>
                    <p className="text-[11px] text-slate-500">{m.cidade} • {m.veiculo}</p>
                  </div>
                  {planejamento.status !== 'concluida' && (
                    <Button
                      variante="secundario"
                      onClick={() => salvarPlanejamento({ ...planejamento, motoristaIds: [...planejamento.motoristaIds, m.id] })}
                    >
                      ➕ Incluir
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Mensagem em massa */}
      <Modal aberto={modalMassa} titulo="💬 Mensagem em massa" onFechar={() => setModalMassa(false)}>
        <p className="mb-2 text-sm text-slate-500">
          Copie o texto para o grupo, ou abra o WhatsApp de cada um com a mensagem individual pronta.
        </p>
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {textoGrupo}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variante="ml"
            onClick={async () => {
              await navigator.clipboard.writeText(textoGrupo)
              setCopiado(true)
              setTimeout(() => setCopiado(false), 2000)
            }}
          >
            {copiado ? '✅ Copiado!' : '📋 Copiar para o grupo'}
          </Button>
          <Button
            variante="secundario"
            onClick={() => {
              for (const m of incluidos) {
                enviarNotificacao({
                  motoristaId: m.id,
                  chamadaId: planejamento.chamadaId,
                  titulo: `Planejamento: ${planejamento.nome}`,
                  mensagem: mensagemPlanejamento(m, planejamento, chamada),
                })
              }
              setModalMassa(false)
            }}
          >
            🔔 Notificar todos no app
          </Button>
        </div>
        <h3 className="mb-2 mt-4 text-sm font-bold text-slate-700">Enviar individualmente:</h3>
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {incluidos.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
              <span className="truncate font-medium">{m.nome}</span>
              <a
                href={linkWhatsApp(m, mensagemPlanejamento(m, planejamento, chamada))}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                💬 Abrir WhatsApp
              </a>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
