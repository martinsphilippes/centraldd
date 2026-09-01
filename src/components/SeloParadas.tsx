// Quantas paradas (PD) a rota tem — o número que dimensiona o dia para quem
// dirige. Vale no card do Dispatcher e no card do motorista, então mora aqui
// em vez de ser copiado nas duas telas.

import { contarParadas } from '../core/conferencia'
import { useDB } from '../core/db'
import { ondasEDocas } from '../core/ondas'
import type { Conferencia, Rota } from '../core/types'

/**
 * A rota desta conferência. O vínculo direto (rotaId) é o caminho normal;
 * quando ele falta — conferência montada só com a página do Meli — sobra
 * casar pelo código da rota dentro do mesmo dia.
 */
function rotaDaConferencia(c: Conferencia, rotas: Rota[]): Rota | undefined {
  if (c.rotaId) {
    const direta = rotas.find((r) => r.id === c.rotaId)
    if (direta) return direta
  }
  const codigo = (c.origem?.rota ?? '').trim().toUpperCase()
  if (!codigo) return undefined
  return rotas.find(
    (r) =>
      r.data === c.data &&
      (r.rotaExpedicao.trim().toUpperCase() === codigo ||
        r.rotaOriginal.trim().toUpperCase() === codigo),
  )
}

/**
 * Onda e doca da rota desta conferência — onde e quando o veículo encosta.
 *
 * A conta é feita com o dia INTEIRO, como nas outras telas: a posição de cada
 * um depende de todo mundo, e o número tem que ser o mesmo em qualquer lugar
 * do app.
 */
export function SeloOndaDoca({ c }: { c: Conferencia }) {
  const db = useDB()
  const rota = rotaDaConferencia(c, db.rotas)
  if (!rota) return null
  const posto = ondasEDocas(db.rotas.filter((r) => r.data === rota.data)).get(rota.id)
  if (!posto) return null
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
          posto.onda === 1 ? 'bg-marca text-navy' : 'bg-slate-200 text-slate-700'
        }`}
        title={`Onda ${posto.onda} do carregamento`}
      >
        🌊 {posto.onda}ª
      </span>
      <span
        className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700"
        title={`Doca ${posto.doca}`}
      >
        🚪 {posto.doca}
      </span>
    </span>
  )
}

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
