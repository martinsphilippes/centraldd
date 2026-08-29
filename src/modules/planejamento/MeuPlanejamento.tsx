import { useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { hojeISO, rotuloDia } from '../../core/dates'
import { Badge, Card, EmptyState } from '../../components/ui'

// Do lado do motorista, a planejamento montada pelo Dispatcher se chama
// PLANEJAMENTO — é o nome que ele entende: o que está planejado para o dia.

/** Visão do motorista: planejamentos publicados em que ele está. */
export function MeuPlanejamento() {
  const db = useDB()
  const { motoristaId } = useSessao()

  const minhas = db.planejamento
    .filter(
      (e) =>
        e.status !== 'rascunho' &&
        motoristaId &&
        (e.motoristaIds.includes(motoristaId) || (e.esperaIds ?? []).includes(motoristaId)),
    )
    .sort((a, b) => b.data.localeCompare(a.data))

  const minhasRotas = db.rotas
    .filter((r) => motoristaId && r.motoristaId === motoristaId && r.data === hojeISO())
    .sort((a, b) => a.rotaExpedicao.localeCompare(b.rotaExpedicao, 'pt-BR', { numeric: true }))

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">📋 Meu planejamento</h1>
        <p className="text-sm text-slate-500">O que o Dispatcher planejou para os seus dias.</p>
      </div>

      {minhasRotas.length > 0 && (
        <Card className="border-marca bg-marca-suave p-4">
          <h2 className="mb-2 font-bold text-slate-900">🛣️ Rota(s) direcionada(s) a você</h2>
          <ul className="space-y-2">
            {minhasRotas.map((r) => (
              <li key={r.id} className="rounded-lg border border-orange-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    {r.rotaExpedicao}
                    {r.rotaOriginal ? ` (${r.rotaOriginal})` : ''} — {r.cidade}
                  </p>
                  {r.finalizadaEm ? (
                    r.resultadoFinalizacao === 'pendente' ? (
                      <Badge className="border-amber-300 bg-amber-100 text-amber-800">
                        ⚠️ Finalizada · pendências
                      </Badge>
                    ) : (
                      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
                        ✅ Finalizada · entregue
                      </Badge>
                    )
                  ) : (
                    <Badge className="border-slate-300 bg-slate-200 text-slate-700">🚚 Em andamento</Badge>
                  )}
                </div>
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
          titulo="Nenhum planejamento publicado para você"
          descricao="Quando o Dispatcher publicar um planejamento com o seu nome, ele aparece aqui."
        />
      ) : (
        <div className="space-y-3">
          {minhas.map((e) => {
            const chamada = db.chamadas.find((c) => c.id === e.chamadaId)
            return (
              <Card key={e.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">{e.nome}</span>
                  {/* Sem a posição: quem cobre falta é decisão do Dispatcher. */}
                  {motoristaId && (e.esperaIds ?? []).includes(motoristaId) ? (
                    <Badge className="border-amber-300 bg-amber-100 text-amber-800">
                      🕐 Fila de espera
                    </Badge>
                  ) : (
                    <Badge
                      className={
                        e.status === 'concluida'
                          ? 'border-slate-200 bg-slate-100 text-slate-600'
                          : 'border-emerald-200 bg-emerald-100 text-emerald-800'
                      }
                    >
                      {e.status === 'concluida' ? '✔️ Concluída' : '✅ Confirmada'}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  📅 {rotuloDia(e.data)}
                  {chamada && (
                    <>
                      <br />📦 {chamada.operacao} • 🕖 {chamada.horarioInicio} às {chamada.horarioFim}
                    </>
                  )}
                  <br />🚚 {e.motoristaIds.length} motorista(s) no planejamento
                </p>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
