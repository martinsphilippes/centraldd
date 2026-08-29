import { Link } from 'react-router-dom'
import { useDB } from '../../core/db'
import { rotuloDia } from '../../core/dates'
import { formatarData } from '../../core/dates'
import { Badge, Button, Card, EmptyState } from '../../components/ui'

const BADGE_STATUS = {
  rascunho: { texto: '✏️ Rascunho', cls: 'border-amber-200 bg-amber-100 text-amber-800' },
  publicada: { texto: '✅ Publicada', cls: 'border-emerald-200 bg-emerald-100 text-emerald-800' },
  concluida: { texto: '✔️ Concluída', cls: 'border-slate-200 bg-slate-100 text-slate-600' },
} as const

export function PlanejamentoList() {
  const db = useDB()
  const planejamento = [...db.planejamento].sort((a, b) => b.data.localeCompare(a.data))
  // Chamada mais próxima ainda sem planejamento — o próximo passo da esteira.
  const chamadaAberta = db.chamadas
    .filter((c) => c.status === 'aberta' && !db.planejamento.some((e) => e.chamadaId === c.id))
    .sort((a, b) => a.data.localeCompare(b.data))[0]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">📋 Planejamento</h1>
        <p className="text-sm text-slate-500">Monte planejamento a partir do painel de uma chamada.</p>
      </div>
      {planejamento.length === 0 ? (
        // A planejamento nasce da chamada: se já existe chamada aberta, leva direto
        // a ela; senão, o caminho é a Programação (resumo → 📢 chamar).
        <div className="space-y-3">
          <EmptyState
            icone="📋"
            titulo="Nenhuma planejamento criada"
            descricao={
              chamadaAberta
                ? `A planejamento sai da chamada de ${formatarData(chamadaAberta.data)}: abra a chamada e toque em 📋 Montar planejamento.`
                : 'A planejamento vem depois da chamada: na Programação, preencha o resumo do dia e toque em 📢 Chamar motoristas.'
            }
          />
          <div className="text-center">
            <Link to={chamadaAberta ? `/chamadas/${chamadaAberta.id}` : '/programacao'}>
              <Button variante="marca">
                {chamadaAberta
                  ? `📋 Montar planejamento de ${formatarData(chamadaAberta.data)} →`
                  : '📆 Ir para a Programação →'}
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {planejamento.map((e) => {
            const badge = BADGE_STATUS[e.status]
            return (
              <Link key={e.id} to={`/planejamento/${e.id}`}>
                <Card className="flex items-center justify-between p-4 transition-colors hover:border-marca-texto">
                  <div>
                    <span className="font-bold text-slate-900">{e.nome}</span>
                    <p className="text-sm text-slate-500">
                      📅 {rotuloDia(e.data)} • 🚚 {e.motoristaIds.length} motorista(s)
                    </p>
                  </div>
                  <Badge className={badge.cls}>{badge.texto}</Badge>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
