// Quantas paradas (PD) a rota tem — o número que dimensiona o dia para quem
// dirige. Vale no card do Dispatcher e no card do motorista, então mora aqui
// em vez de ser copiado nas duas telas.

import { contarParadas } from '../core/conferencia'
import type { Conferencia } from '../core/types'

/** Só o total, para caber na linha fechada do card. */
export function SeloParadas({ c }: { c: Conferencia }) {
  const { total } = contarParadas(c)
  if (total === 0) return null
  return (
    <span
      className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600"
      title={`${total} parada(s) nesta rota`}
    >
      📍 {total} PD
    </span>
  )
}

/** Total mais a divisão entre comercial e não comercial, para a página da rota. */
export function ParadasDetalhadas({ c }: { c: Conferencia }) {
  const { total, comerciais, naoComerciais, temInfoComercial } = contarParadas(c)
  if (total === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      <span className="font-bold text-slate-800">📍 {total} parada(s)</span>
      {temInfoComercial ? (
        <>
          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            🏪 {comerciais} comercial(is)
          </span>
          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-600">
            🏠 {naoComerciais} não comercial(is)
          </span>
        </>
      ) : (
        // Sem a marcação no documento, mostrar "0 comerciais" seria mentira:
        // o que existe é ausência de informação, não ausência de comércio.
        <span className="text-slate-500">
          o documento desta rota não trouxe a marcação de ponto comercial
        </span>
      )}
    </div>
  )
}
