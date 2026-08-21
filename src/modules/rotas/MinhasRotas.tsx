// Tela do MOTORISTA: as rotas que o coordenador direcionou para ele.
// Atualiza em tempo real — direcionou na tela de Rotas, aparece aqui na hora.
// A 1ª é a rota principal; as demais são reforços (pacotes de outra rota).

import { useSessao } from '../../context/SessaoContext'
import { useDB } from '../../core/db'
import { Badge, Card, EmptyState } from '../../components/ui'

export function MinhasRotas() {
  const { motoristaId } = useSessao()
  const db = useDB()

  const minhas = db.rotas
    .filter((r) => r.motoristaId === motoristaId)
    .sort((a, b) => a.rotaExpedicao.localeCompare(b.rotaExpedicao, 'pt-BR', { numeric: true }))

  const porMotorista = new Map(db.motoristas.map((m) => [m.id, m.nome]))

  /** Outros motoristas na MESMA rota (linha duplicada = pacotes divididos). */
  const dividadaCom = (rotaExpedicao: string): string[] =>
    db.rotas
      .filter(
        (r) =>
          r.rotaExpedicao === rotaExpedicao &&
          r.motoristaId &&
          r.motoristaId !== motoristaId,
      )
      .map((r) => porMotorista.get(r.motoristaId!) ?? 'outro motorista')

  const LBL = 'text-[10px] font-bold uppercase tracking-wide text-slate-500'
  const VAL = 'text-sm font-semibold text-slate-800'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">🛣️ Minhas rotas</h1>
        <p className="text-sm text-slate-500">
          {minhas.length === 0
            ? 'A rota que o coordenador direcionar para você aparece aqui na hora.'
            : minhas.length === 1
              ? 'Você está direcionado para 1 rota.'
              : `Você está direcionado para ${minhas.length} rotas — a primeira é a principal, as outras são pacotes extras.`}
        </p>
      </div>

      {minhas.length === 0 ? (
        <EmptyState
          icone="🛣️"
          titulo="Nenhuma rota direcionada ainda"
          descricao="Quando a coordenação direcionar uma rota para você, ela aparece aqui automaticamente — sem precisar atualizar."
        />
      ) : (
        minhas.map((r, i) => {
          const compartilhada = dividadaCom(r.rotaExpedicao)
          return (
            <Card key={r.id} className="overflow-hidden">
              <div
                className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${
                  i === 0 ? 'bg-ml-amarelo' : 'bg-sky-100'
                }`}
              >
                <div className="text-lg font-extrabold text-slate-900">{r.rotaExpedicao}</div>
                <Badge
                  className={
                    i === 0
                      ? 'border-yellow-500/40 bg-white/70 text-slate-800'
                      : 'border-sky-300 bg-white/80 text-sky-800'
                  }
                >
                  {i === 0 ? '⭐ Rota principal' : '➕ Pacotes extras'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-3">
                <div>
                  <div className={LBL}>📍 Cidade</div>
                  <div className={VAL}>{r.cidade || '—'}</div>
                </div>
                <div>
                  <div className={LBL}>Rota original</div>
                  <div className={VAL}>{r.rotaOriginal || '—'}</div>
                </div>
                <div>
                  <div className={LBL}>Base</div>
                  <div className={VAL}>{r.base || '—'}</div>
                </div>
                <div>
                  <div className={LBL}>🚐 Veículo</div>
                  <div className={VAL}>{r.veiculo || '—'}</div>
                </div>
                <div>
                  <div className={LBL}>Km</div>
                  <div className={VAL}>{r.km || '—'}</div>
                </div>
                <div>
                  <div className={LBL}>DPS</div>
                  <div className={VAL}>{r.dps || '—'}</div>
                </div>
                <div>
                  <div className={LBL}>Ocupação %</div>
                  <div className={VAL}>{r.ocupacao || '—'}</div>
                </div>
                <div>
                  <div className={LBL}>🚛 Transportadora</div>
                  <div className={VAL}>{r.transportadora || '—'}</div>
                </div>
              </div>
              {compartilhada.length > 0 && (
                <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                  🤝 Rota dividida com <strong>{compartilhada.join(', ')}</strong> — cada um leva uma
                  parte dos pacotes.
                </p>
              )}
            </Card>
          )
        })
      )}

      <p className="text-center text-[11px] text-slate-400">
        Atualização em tempo real — qualquer mudança da coordenação aparece aqui sozinha.
      </p>
    </div>
  )
}
