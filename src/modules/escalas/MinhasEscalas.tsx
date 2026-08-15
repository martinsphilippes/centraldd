import { useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { rotuloDia } from '../../core/dates'
import { Badge, Card, EmptyState } from '../../components/ui'

/** Visão do motorista: escalas publicadas em que ele está. */
export function MinhasEscalas() {
  const db = useDB()
  const { motoristaId } = useSessao()

  const minhas = db.escalas
    .filter((e) => e.status !== 'rascunho' && motoristaId && e.motoristaIds.includes(motoristaId))
    .sort((a, b) => b.data.localeCompare(a.data))

  const minhasRotas = db.rotas
    .filter((r) => motoristaId && r.motoristaId === motoristaId)
    .sort((a, b) => a.rotaExpedicao.localeCompare(b.rotaExpedicao, 'pt-BR', { numeric: true }))

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">📋 Minhas escalas</h1>
        <p className="text-sm text-slate-500">Rotas em que você foi escalado.</p>
      </div>

      {minhasRotas.length > 0 && (
        <Card className="border-ml-amarelo bg-yellow-50 p-4">
          <h2 className="mb-2 font-bold text-slate-900">🛣️ Rota(s) direcionada(s) a você</h2>
          <ul className="space-y-2">
            {minhasRotas.map((r) => (
              <li key={r.id} className="rounded-lg border border-yellow-200 bg-white p-3">
                <p className="text-sm font-bold text-slate-900">
                  {r.rotaExpedicao}
                  {r.rotaOriginal ? ` (${r.rotaOriginal})` : ''} — {r.cidade}
                </p>
                <p className="text-xs text-slate-600">
                  🚐 {r.veiculo} • 📏 {r.km} km • ⏱️ DPS {r.dps} • 🏢 {r.base}
                  {r.transportadora ? ` • 🚛 ${r.transportadora}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {minhas.length === 0 ? (
        <EmptyState
          icone="📋"
          titulo="Nenhuma escala publicada para você"
          descricao="Quando a coordenação publicar uma escala com o seu nome, ela aparece aqui."
        />
      ) : (
        <div className="space-y-3">
          {minhas.map((e) => {
            const chamada = db.chamadas.find((c) => c.id === e.chamadaId)
            return (
              <Card key={e.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">{e.nome}</span>
                  <Badge
                    className={
                      e.status === 'concluida'
                        ? 'border-slate-200 bg-slate-100 text-slate-600'
                        : 'border-emerald-200 bg-emerald-100 text-emerald-800'
                    }
                  >
                    {e.status === 'concluida' ? '✔️ Concluída' : '✅ Confirmada'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  📅 {rotuloDia(e.data)}
                  {chamada && (
                    <>
                      <br />📦 {chamada.operacao} • 🕖 {chamada.horarioInicio} às {chamada.horarioFim}
                    </>
                  )}
                  <br />🚚 {e.motoristaIds.length} motorista(s) na escala
                </p>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
