// 🧭 Roteiro da rota — o mesmo componente para os dois lados.
//
// Motorista (editavel): vê a ordem sugerida partindo da base, ESCOLHE qual
// parada fazer primeiro (ou a próxima, no meio do percurso) e o resto do
// caminho é recalculado a partir da escolha dele na hora. Marca entregue,
// navega pelo Google Maps/Waze, e o progresso fica gravado.
//
// Dispatcher (leitura): o mesmo roteiro com o progresso ao vivo, o mapinha
// das paradas e a comparação Meli × otimizado.

import { useMemo, useState } from 'react'
import { salvarRoteiroConferencia } from '../../core/db'
import {
  kmDaOrdem,
  linksNavegacao,
  montarParadas,
  ordemMeli,
  otimizarRoteiro,
  type Parada,
  type Ponto,
} from '../../core/roteiro'
import { formatarQuandoCurto } from '../../core/dates'
import type { Conferencia } from '../../core/types'
import { Badge, Button } from '../../components/ui'

interface Props {
  c: Conferencia
  /** true = motorista (escolhe próxima, marca entregue). false = Dispatcher. */
  editavel: boolean
}

/** Mapinha das paradas: pontos numerados + traço da ordem, sem serviço externo. */
function MapaParadas({
  ordem,
  base,
  entregues,
  proximaId,
}: {
  ordem: Parada[]
  base: Ponto | null
  entregues: Set<string>
  proximaId: string | null
}) {
  const pontos: Ponto[] = [...ordem, ...(base ? [base] : [])]
  if (pontos.length < 2) return null
  const lats = pontos.map((p) => p.lat)
  const lngs = pontos.map((p) => p.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]
  const L = 560
  const A = 300
  const M = 18
  const x = (p: Ponto) => M + ((p.lng - minLng) / Math.max(1e-9, maxLng - minLng)) * (L - 2 * M)
  const y = (p: Ponto) => A - M - ((p.lat - minLat) / Math.max(1e-9, maxLat - minLat)) * (A - 2 * M)

  const caminho = [...(base ? [base] : []), ...ordem]
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(p).toFixed(1)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="w-full rounded-lg border border-slate-200 bg-slate-50">
      <path d={caminho} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
      {base && (
        <g>
          <rect x={x(base) - 5} y={y(base) - 5} width="10" height="10" fill="#1e293b" rx="2" />
          <text x={x(base)} y={y(base) - 8} textAnchor="middle" fontSize="9" fill="#1e293b" fontWeight="bold">
            BASE
          </text>
        </g>
      )}
      {ordem.map((p, i) => {
        const entregue = entregues.has(p.id)
        const proxima = p.id === proximaId
        return (
          <g key={p.id}>
            <circle
              cx={x(p)}
              cy={y(p)}
              r={proxima ? 9 : 7}
              fill={entregue ? '#10b981' : proxima ? '#ffe600' : '#ffffff'}
              stroke={entregue ? '#059669' : proxima ? '#b45309' : '#64748b'}
              strokeWidth="1.5"
            />
            <text
              x={x(p)}
              y={y(p) + 3}
              textAnchor="middle"
              fontSize="8"
              fontWeight="bold"
              fill={entregue ? '#ffffff' : '#334155'}
            >
              {i + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function RoteiroRota({ c, editavel }: Props) {
  const [verMeli, setVerMeli] = useState(false)

  const paradas = useMemo(() => montarParadas(c.pacotes ?? []), [c.pacotes])
  const base: Ponto | null =
    c.origem?.baseLat != null && c.origem?.baseLng != null
      ? { lat: c.origem.baseLat, lng: c.origem.baseLng }
      : null

  const progresso = c.roteiro ?? { entregues: [], proximaId: null, atualizadoEm: '' }
  const entregues = useMemo(() => new Set(progresso.entregues), [progresso.entregues])

  // Posição atual = última parada entregue (ou a base, no começo do dia).
  const posicaoAtual: Ponto | null = useMemo(() => {
    const ultima = [...progresso.entregues]
      .map((id) => paradas.find((p) => p.id === id))
      .filter(Boolean)
      .pop()
    return ultima ?? base
  }, [progresso.entregues, paradas, base])

  const pendentes = useMemo(() => paradas.filter((p) => !entregues.has(p.id)), [paradas, entregues])

  // O roteiro que vale: pendentes otimizadas a partir da posição atual, com a
  // ESCOLHA do motorista na frente quando houver.
  const ordemExecucao = useMemo(() => {
    const inicio = posicaoAtual ?? pendentes[0] ?? { lat: 0, lng: 0 }
    const proxima = progresso.proximaId && pendentes.some((p) => p.id === progresso.proximaId)
      ? progresso.proximaId
      : null
    return otimizarRoteiro(inicio, pendentes, proxima)
  }, [pendentes, posicaoAtual, progresso.proximaId])

  // Comparação estática (rota inteira desde a base): Meli × otimizado.
  const comparacao = useMemo(() => {
    if (!base || paradas.length === 0) return null
    return {
      meli: kmDaOrdem(base, ordemMeli(paradas)),
      otimizado: kmDaOrdem(base, otimizarRoteiro(base, paradas)),
    }
  }, [base, paradas])

  if (paradas.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
        🧭 Esta conferência não tem as coordenadas dos pacotes — o roteiro só existe quando a lista
        vem da página de rota do Meli.
      </p>
    )
  }

  const proximaDaVez = ordemExecucao[0] ?? null
  const kmRestante = posicaoAtual ? kmDaOrdem(posicaoAtual, ordemExecucao) : null
  const listaMostrada = verMeli ? ordemMeli(paradas) : ordemExecucao

  const marcarEntregue = (p: Parada) => {
    const novos = [...progresso.entregues.filter((id) => id !== p.id), p.id]
    salvarRoteiroConferencia(c.id, {
      entregues: novos,
      proximaId: progresso.proximaId === p.id ? null : progresso.proximaId,
    })
  }
  const desfazerEntregue = (p: Parada) => {
    salvarRoteiroConferencia(c.id, {
      entregues: progresso.entregues.filter((id) => id !== p.id),
      proximaId: progresso.proximaId,
    })
  }
  const escolherProxima = (p: Parada) => {
    salvarRoteiroConferencia(c.id, {
      entregues: progresso.entregues,
      proximaId: progresso.proximaId === p.id ? null : p.id,
    })
  }

  return (
    <div className="space-y-3">
      {/* Cabeçalho: progresso + comparação */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-slate-200 bg-slate-100 text-slate-700">
          📦 {paradas.length - pendentes.length}/{paradas.length} parada(s) entregue(s)
        </Badge>
        {kmRestante !== null && pendentes.length > 0 && (
          <Badge className="border-sky-200 bg-sky-50 text-sky-800">
            🛣️ ~{kmRestante.toFixed(0)} km restantes (linha reta)
          </Badge>
        )}
        {comparacao && (
          <span className="text-xs text-slate-500">
            Rota completa: Meli ~{comparacao.meli.toFixed(0)} km · otimizada ~
            {comparacao.otimizado.toFixed(0)} km
          </span>
        )}
        <button
          onClick={() => setVerMeli((v) => !v)}
          className="ml-auto rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          {verMeli ? '🧭 Ver ordem otimizada' : '📋 Ver ordem do Meli'}
        </button>
      </div>

      {progresso.atualizadoEm && (
        <p className="text-[11px] text-slate-500">
          🕒 Último andamento {formatarQuandoCurto(progresso.atualizadoEm)}
        </p>
      )}

      <MapaParadas
        ordem={listaMostrada}
        base={base}
        entregues={entregues}
        proximaId={editavel && !verMeli ? (proximaDaVez?.id ?? null) : null}
      />

      {/* Próxima parada em destaque (modo execução do motorista) */}
      {editavel && !verMeli && proximaDaVez && (
        <div className="rounded-xl border-2 border-ml-amarelo bg-yellow-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Próxima parada</p>
          <p className="mt-0.5 font-bold text-slate-900">
            {proximaDaVez.endereco} · {proximaDaVez.cidade}
          </p>
          <p className="text-xs capitalize text-slate-600">
            {proximaDaVez.destinatario}
            {proximaDaVez.pacotes.length > 0 && (
              <>
                {' '}· 📦 {proximaDaVez.pacotes.map((x) => x.etiqueta || x.numeracao).join(', ')}
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={linksNavegacao(proximaDaVez).googleMaps}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-ml-azul px-3 py-1.5 text-sm font-bold text-white"
            >
              🗺️ Google Maps
            </a>
            <a
              href={linksNavegacao(proximaDaVez).waze}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-bold text-white"
            >
              🚗 Waze
            </a>
            <Button variante="ml" onClick={() => marcarEntregue(proximaDaVez)}>
              ✅ Entregue → próxima
            </Button>
          </div>
        </div>
      )}

      {editavel && !verMeli && pendentes.length > 0 && (
        <p className="text-[11px] text-slate-500">
          👆 Quer fazer outra primeiro? Toque em <strong>📍 Fazer agora</strong> em qualquer parada —
          ela vira a próxima e o resto do caminho é recalculado a partir dela.
        </p>
      )}

      {/* Lista completa na ordem mostrada */}
      <ol className="max-h-96 space-y-1 overflow-auto pr-1">
        {listaMostrada.map((p, i) => {
          const entregue = entregues.has(p.id)
          const escolhida = progresso.proximaId === p.id
          return (
            <li
              key={p.id}
              className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 ${
                entregue
                  ? 'border-emerald-100 bg-emerald-50/60'
                  : escolhida && !verMeli
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-slate-100 bg-white'
              }`}
            >
              <span className="w-7 shrink-0 text-center text-xs font-bold text-slate-500">
                {verMeli ? (p.ordemMeli ?? '—') : i + 1}º
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-semibold ${entregue ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {p.endereco || 'Endereço não informado'}
                </span>
                <span className="block truncate text-[11px] capitalize text-slate-500">
                  {p.cidade}
                  {p.destinatario && ` · ${p.destinatario}`}
                  {p.pacotes.length > 0 && ` · 📦 ${p.pacotes.map((x) => x.etiqueta || x.numeracao).join(', ')}`}
                </span>
              </span>
              {entregue ? (
                <span className="flex items-center gap-1.5">
                  <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">✅ Entregue</Badge>
                  {editavel && (
                    <button
                      onClick={() => desfazerEntregue(p)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-slate-600"
                    >
                      desfazer
                    </button>
                  )}
                </span>
              ) : (
                editavel &&
                !verMeli && (
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => escolherProxima(p)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors ${
                        escolhida
                          ? 'border-yellow-400 bg-ml-amarelo text-slate-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {escolhida ? '📍 É a próxima ✓' : '📍 Fazer agora'}
                    </button>
                    <button
                      onClick={() => marcarEntregue(p)}
                      className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"
                    >
                      ✅
                    </button>
                  </span>
                )
              )}
            </li>
          )
        })}
      </ol>

      {pendentes.length === 0 && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          🏁 Todas as paradas entregues!
        </p>
      )}

      <p className="text-[11px] text-slate-400">
        As distâncias são em linha reta — servem para comparar caminhos, não são km rodados. A ordem
        é sugestão: a escolha do motorista sempre manda.
      </p>
    </div>
  )
}
