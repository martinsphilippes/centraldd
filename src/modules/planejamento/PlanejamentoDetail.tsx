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
import { normalizarTexto } from '../../core/texto'
import { parametrosAtuais } from '../../core/alocacao'
import { frotaDoDia } from '../../core/vagas'
import { PainelFrota } from '../../components/PainelFrota'
import { Avatar, Badge, Button, Card, EmptyState, Input, Modal } from '../../components/ui'
import { ContactButtons } from '../../components/ContactButtons'

export function PlanejamentoDetail() {
  const { id } = useParams()
  const db = useDB()
  const navigate = useNavigate()
  const [modalMassa, setModalMassa] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [busca, setBusca] = useState('')

  const planejamento = db.planejamento.find((e) => e.id === id)
  if (!planejamento) return <EmptyState icone="🔍" titulo="Planejamento não encontrada" />

  // Uma busca só atravessa as três listas (planejamento, fila e disponíveis
  // fora): com 50+ nomes, procurar alguém a olho é o que trava o Dispatcher.
  const chaveBusca = normalizarTexto(busca)
  const combina = (m: { nome: string; cidade: string; veiculo: string }) =>
    !chaveBusca || normalizarTexto(`${m.nome} ${m.cidade} ${m.veiculo}`).includes(chaveBusca)

  const chamada = db.chamadas.find((c) => c.id === planejamento.chamadaId)
  const porId = new Map(db.motoristas.map((m) => [m.id, m]))
  const incluidosTodos = planejamento.motoristaIds
    .map((mid) => porId.get(mid))
    .filter((m): m is NonNullable<typeof m> => !!m)
  const incluidos = incluidosTodos.filter(combina)

  // Disponíveis na chamada que ainda não estão na planejamento (para incluir).
  // Fila de espera: na ordem de prioridade gravada na criação.
  const filaEsperaTodos = (planejamento.esperaIds ?? [])
    .map((id) => porId.get(id))
    .filter((m): m is NonNullable<typeof m> => !!m)
  const filaEspera = filaEsperaTodos.filter(combina)

  const foraDoPlanejamento = chamada
    ? db.respostas
        .filter(
          (r) =>
            r.chamadaId === chamada.id &&
            STATUS_DISPONIVEIS.includes(r.status) &&
            !planejamento.motoristaIds.includes(r.motoristaId) &&
            !(planejamento.esperaIds ?? []).includes(r.motoristaId),
        )
        .map((r) => porId.get(r.motoristaId))
        .filter((m): m is NonNullable<typeof m> => !!m)
        .filter(combina)
    : []

  const publicar = () => {
    salvarPlanejamento({ ...planejamento, status: 'publicada' })
    for (const m of incluidosTodos) {
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
    linhas: incluidosTodos.map((m, i) => [
      i + 1,
      m.nome,
      formatarTelefone(m.telefone),
      m.cidade,
      m.veiculo,
    ]),
  })

  const textoGrupo = textoPlanejamentoParaGrupo(planejamento, chamada, incluidosTodos)

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
                <Link to={`/chamadas/${chamada.id}`} className="font-semibold text-marca-texto hover:underline">
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
            <Button variante="marca" onClick={publicar} disabled={incluidosTodos.length === 0}>
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

      {/* A frota do dia ao vivo: mexeu em quem entra, o mix muda na hora. */}
      <PainelFrota
        frota={frotaDoDia(db, planejamento.data)}
        selecionados={incluidosTodos}
        p={parametrosAtuais(db)}
      />

      {/* Busca única: filtra planejamento, fila de espera e disponíveis fora. */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="🔎 Buscar motorista por nome, cidade ou veículo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full sm:w-96"
        />
        {busca && (
          <>
            <Button variante="fantasma" onClick={() => setBusca('')}>
              ✕ Limpar busca
            </Button>
            <span className="text-xs font-semibold text-slate-500">
              {incluidos.length + filaEspera.length} encontrado(s) · 🚚 {incluidos.length} no
              planejamento · 🕐 {filaEspera.length} na fila
            </span>
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-3 font-bold text-slate-900">
            🚚 No planejamento ({incluidosTodos.length}
            {chamada ? `/${chamada.qtdNecessaria}` : ''})
            {busca && (
              <span className="ml-2 text-sm font-semibold text-marca-texto">
                🔎 {incluidos.length} na busca
              </span>
            )}
          </h2>
          {incluidos.length === 0 ? (
            <EmptyState
              icone={busca ? '🔎' : '🚚'}
              titulo={busca ? 'Ninguém com essa busca aqui' : 'Nenhum motorista no planejamento'}
            />
          ) : (
            <ul className="space-y-2">
              {incluidos.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5">
                  <span className="w-6 text-center text-xs font-bold text-slate-400">
                    {incluidosTodos.findIndex((x) => x.id === m.id) + 1}
                  </span>
                  <Avatar nome={m.nome} tamanho="sm" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/motoristas/${m.id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-marca-texto">
                      {m.nome}
                    </Link>
                    <p className="text-[11px] text-slate-500">
                      {m.cidade} • {m.veiculo} • 📱 {formatarTelefone(m.telefone)}
                    </p>
                  </div>
                  <ContactButtons motorista={m} mensagem={mensagemPlanejamento(m, planejamento, chamada)} compacto />
                  {planejamento.status !== 'concluida' && (
                    <button
                      title="Faltou / sair do planejamento — vai para a frente da fila de espera"
                      onClick={() =>
                        salvarPlanejamento({
                          ...planejamento,
                          motoristaIds: planejamento.motoristaIds.filter((x) => x !== m.id),
                          esperaIds: [m.id, ...(planejamento.esperaIds ?? []).filter((x) => x !== m.id)],
                        })
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
          <h2 className="mb-1 font-bold text-slate-900">
            🕐 Fila de espera ({filaEsperaTodos.length})
            {busca && (
              <span className="ml-2 text-sm font-semibold text-marca-texto">
                🔎 {filaEspera.length} na busca
              </span>
            )}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Estavam disponíveis além da meta. Alguém faltou? <strong>⬆️ Promover</strong> coloca o
            primeiro da fila no lugar.
          </p>
          {filaEspera.length === 0 ? (
            <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
              {busca
                ? 'Ninguém com essa busca na fila.'
                : 'Ninguém na fila — a disponibilidade não passou da meta.'}
            </p>
          ) : (
            <ul className="mb-4 space-y-2">
              {filaEspera.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
                  <span className="w-6 text-center text-xs font-bold text-amber-600">
                    {filaEsperaTodos.findIndex((x) => x.id === m.id) + 1}º
                  </span>
                  <Avatar nome={m.nome} tamanho="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{m.nome}</p>
                    <p className="text-[11px] text-slate-500">{m.cidade} • {m.veiculo}</p>
                  </div>
                  {planejamento.status !== 'concluida' && (
                    <Button
                      variante="marca"
                      onClick={() =>
                        salvarPlanejamento({
                          ...planejamento,
                          motoristaIds: [...planejamento.motoristaIds, m.id],
                          esperaIds: (planejamento.esperaIds ?? []).filter((x) => x !== m.id),
                        })
                      }
                    >
                      ⬆️ Promover
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

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
            variante="marca"
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
              for (const m of incluidosTodos) {
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
          {incluidosTodos.map((m) => (
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
