import { Link } from 'react-router-dom'
import { useDB } from '../../core/db'
import { rotuloDia } from '../../core/dates'
import { resumoChamada } from '../../core/stats'
import { Badge, Button, Card, EmptyState, ProgressBar } from '../../components/ui'

export function ChamadasList() {
  const db = useDB()
  const chamadas = [...db.chamadas].sort((a, b) => b.data.localeCompare(a.data))
  const abertas = chamadas.filter((c) => c.status === 'aberta')
  const encerradas = chamadas.filter((c) => c.status === 'encerrada')

  const CardChamada = ({ id }: { id: string }) => {
    const c = db.chamadas.find((x) => x.id === id)!
    const r = resumoChamada(db, c)
    return (
      <Link to={`/chamadas/${c.id}`}>
        <Card className="p-4 transition-colors hover:border-marca-texto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{c.titulo}</span>
                {c.status === 'aberta' ? (
                  <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">● Aberta</Badge>
                ) : (
                  <Badge className="border-slate-200 bg-slate-100 text-slate-600">Encerrada</Badge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                📅 {rotuloDia(c.data)} • {c.operacao} • 🕖 {c.horarioInicio} às {c.horarioFim} • 🚚 {c.qtdNecessaria} necessários
              </p>
            </div>
            <div className="flex items-center gap-4 text-center text-xs font-medium">
              <div>
                <div className="text-lg font-bold text-emerald-600">{r.disponiveis}</div>
                disponíveis
              </div>
              <div>
                <div className="text-lg font-bold text-red-500">{r.indisponiveis}</div>
                indisponíveis
              </div>
              <div>
                <div className="text-lg font-bold text-slate-500">{r.pendentes.length}</div>
                pendentes
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <ProgressBar valor={r.respondidos} total={r.total} />
            <span className="whitespace-nowrap text-[11px] text-slate-500">
              {r.respondidos}/{r.total} responderam
            </span>
          </div>
        </Card>
      </Link>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">⏰ Chamadas de disponibilidade</h1>
        <Link to="/programacao">
          <Button variante="marca">📢 Chamar pela Programação →</Button>
        </Link>
      </div>

      {chamadas.length === 0 && (
        <EmptyState
          icone="⏰"
          titulo="Nenhuma chamada criada"
          descricao="A chamada nasce na Programação: preencha o Resumo do Dia e toque em 📢 Chamar motoristas — a meta vem do TOTAL ROTAS."
        />
      )}

      {abertas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Abertas</h2>
          {abertas.map((c) => (
            <CardChamada key={c.id} id={c.id} />
          ))}
        </section>
      )}

      {encerradas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Encerradas</h2>
          {encerradas.map((c) => (
            <CardChamada key={c.id} id={c.id} />
          ))}
        </section>
      )}
    </div>
  )
}
