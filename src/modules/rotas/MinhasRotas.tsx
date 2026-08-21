// Tela do MOTORISTA: as rotas que o coordenador direcionou para ele.
// Atualiza em tempo real — direcionou na tela de Rotas, aparece aqui na hora.
// O motorista FINALIZA cada rota ao terminar: é isso que o libera para
// receber novas rotas e para entrar na escala do dia seguinte.

import { useSessao } from '../../context/SessaoContext'
import { finalizarRota, useDB } from '../../core/db'
import { Badge, Button, Card, EmptyState } from '../../components/ui'

export function MinhasRotas() {
  const { motoristaId } = useSessao()
  const db = useDB()

  const minhas = db.rotas
    .filter((r) => r.motoristaId === motoristaId)
    .sort((a, b) => a.rotaExpedicao.localeCompare(b.rotaExpedicao, 'pt-BR', { numeric: true }))
  const ativas = minhas.filter((r) => !r.finalizadaEm)
  const finalizadas = minhas.filter((r) => r.finalizadaEm)

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

  const confirmarFinalizacao = (id: string, nome: string) => {
    if (confirm(`Finalizar a rota ${nome}? Isso avisa a coordenação que você concluiu as entregas.`))
      finalizarRota(id)
  }

  const LBL = 'text-[10px] font-bold uppercase tracking-wide text-slate-500'
  const VAL = 'text-sm font-semibold text-slate-800'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">🛣️ Minhas rotas</h1>
        <p className="text-sm text-slate-500">
          {ativas.length === 0
            ? 'A rota que o coordenador direcionar para você aparece aqui na hora.'
            : ativas.length === 1
              ? 'Você tem 1 rota em andamento — finalize ao terminar as entregas.'
              : `Você tem ${ativas.length} rotas em andamento — a primeira é a principal, as outras são pacotes extras.`}
        </p>
      </div>

      {ativas.length === 0 && finalizadas.length > 0 && (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          ✅ Todas as suas rotas estão finalizadas — você está liberado para novas rotas e para a
          próxima escala.
        </p>
      )}
      {minhas.length === 0 && (
        <EmptyState
          icone="🛣️"
          titulo="Nenhuma rota direcionada ainda"
          descricao="Quando a coordenação direcionar uma rota para você, ela aparece aqui automaticamente — sem precisar atualizar."
        />
      )}

      {ativas.map((r, i) => {
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
            <div className="border-t border-slate-100 p-3">
              <Button
                variante="ml"
                className="w-full"
                onClick={() => confirmarFinalizacao(r.id, r.rotaExpedicao)}
              >
                ✅ Finalizei esta rota
              </Button>
            </div>
          </Card>
        )
      })}

      {finalizadas.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-bold text-slate-700">✅ Finalizadas ({finalizadas.length})</h2>
          <ul className="space-y-1.5">
            {finalizadas.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm"
              >
                <span className="font-bold text-slate-800">{r.rotaExpedicao}</span>
                <span className="text-xs text-emerald-700">
                  finalizada às{' '}
                  {new Date(r.finalizadaEm!).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-center text-[11px] text-slate-400">
        Atualização em tempo real — finalizar avisa a coordenação na hora.
      </p>
    </div>
  )
}
