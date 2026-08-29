// Medição das conferências no Dashboard: quantas foram abertas no período,
// quantas bateram com o que o Dispatcher separou, quantos pacotes faltaram e
// quantas ainda esperam o envio do motorista.
//
// O histórico conferência por conferência fica na tela Conferência — aqui é só
// o número do período, para o Dispatcher ver se a operação está fechando.

import { useState } from 'react'
import { useDB } from '../../core/db'
import { compararConferencia } from '../../core/conferencia'
import { hojeISO } from '../../core/dates'
import { Card, EmptyState, Select } from '../../components/ui'

const PERIODOS = [
  { valor: '7', rotulo: 'Última semana' },
  { valor: '30', rotulo: 'Último mês' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
]

function inicioDe(periodo: string): string {
  return hojeISO(-Number(periodo))
}

/** Medição das conferências: quantas, quantas bateram, faltas e pendências. */
export function ConferenciasCard() {
  const db = useDB()
  const [periodo, setPeriodo] = useState('30')
  const inicio = inicioDe(periodo)

  const doPeriodo = db.conferencias.filter((c) => c.data >= inicio)
  const respondidas = doPeriodo.filter((c) => c.conferidos !== null)
  const resultados = respondidas.map((c) => compararConferencia(c.esperados, c.conferidos ?? []))
  const bateram = resultados.filter((r) => r.bateu).length
  const faltas = resultados.reduce((s, r) => s + r.faltando.length, 0)
  const pacotes = doPeriodo.reduce((s, c) => s + c.esperados.length, 0)
  const aguardando = doPeriodo.length - respondidas.length
  const taxa = respondidas.length > 0 ? Math.round((bateram / respondidas.length) * 100) : null

  return (
    <Card className="p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">🔍 Conferências</h2>
        <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 'auto' }}>
          {PERIODOS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </Select>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        O histórico completo fica na tela Conferência — aqui é a medição do período.
      </p>
      {doPeriodo.length === 0 ? (
        <EmptyState icone="🔍" titulo="Nenhuma conferência no período" />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <p className="text-2xl font-bold text-slate-900">{doPeriodo.length}</p>
            <p className="text-[11px] font-medium text-slate-500">conferência(s)</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{taxa === null ? '—' : `${taxa}%`}</p>
            <p className="text-[11px] font-medium text-slate-500">bateram ({bateram}/{respondidas.length})</p>
          </div>
          <div className="rounded-xl bg-red-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{faltas}</p>
            <p className="text-[11px] font-medium text-slate-500">pacote(s) em falta</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{aguardando}</p>
            <p className="text-[11px] font-medium text-slate-500">aguardando motorista</p>
          </div>
          <div className="col-span-2 rounded-xl bg-slate-50 p-3 text-center sm:col-span-4">
            <p className="text-sm font-semibold text-slate-700">📦 {pacotes} pacote(s) conferidos no período</p>
          </div>
        </div>
      )}
    </Card>
  )
}
