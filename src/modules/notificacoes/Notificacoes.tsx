import { useEffect } from 'react'
import { marcarNotificacoesLidas, useDB } from '../../core/db'
import { useSessao } from '../../context/SessaoContext'
import { formatarDataHora } from '../../core/dates'
import { Card, EmptyState } from '../../components/ui'

/** Central de notificações do motorista (base para push na versão mobile). */
export function Notificacoes() {
  const db = useDB()
  const { motoristaId } = useSessao()

  const minhas = db.notificacoes
    .filter((n) => n.motoristaId === null || n.motoristaId === motoristaId)
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))

  // Marca como lidas ao abrir a central.
  useEffect(() => {
    if (motoristaId && minhas.some((n) => !n.lida)) marcarNotificacoesLidas(motoristaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motoristaId])

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-bold text-slate-900">🔔 Notificações</h1>
      {minhas.length === 0 ? (
        <EmptyState icone="🔕" titulo="Nenhuma notificação" />
      ) : (
        <div className="space-y-2">
          {minhas.map((n) => (
            <Card key={n.id} className={`p-4 ${n.lida ? '' : 'border-marca-texto bg-orange-50/50'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{n.titulo}</p>
                <span className="whitespace-nowrap text-[11px] text-slate-400">{formatarDataHora(n.criadaEm)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{n.mensagem}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
