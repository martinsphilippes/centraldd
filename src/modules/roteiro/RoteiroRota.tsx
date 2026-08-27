// 🧭 Roteiro da rota — o mesmo componente para os dois lados.
//
// Motorista (editavel): vê a ordem sugerida partindo da base, ESCOLHE qual
// parada fazer primeiro (ou a próxima, no meio do percurso) e o resto do
// caminho é recalculado a partir da escolha dele na hora. Marca entregue,
// navega pelo Google Maps/Waze, e o progresso fica gravado.
//
// Dispatcher (leitura): o mesmo roteiro com o progresso ao vivo, o mapinha
// das paradas e a comparação Meli × otimizado.

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
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

/**
 * Mapa DE RUAS interativo (Leaflet + OpenStreetMap): zoom de pinça, arrasto,
 * ruas e nomes de verdade. As duas rotas aparecem em cores diferentes —
 * otimizada em AZUL cheio, ordem do Meli em ROXO tracejado — e no modo do
 * motorista cada parada é um botão: tocar nela a torna a PRÓXIMA e o caminho
 * recalcula na hora.
 */
function MapaParadas({
  ordem,
  ordemDoMeli,
  base,
  entregues,
  proximaId,
  escolhidaId,
  mostrarMeli,
  mostrarOtimizada,
  aoTocar,
}: {
  ordem: Parada[]
  ordemDoMeli: Parada[]
  base: Ponto | null
  entregues: Set<string>
  proximaId: string | null
  escolhidaId: string | null
  mostrarMeli: boolean
  mostrarOtimizada: boolean
  aoTocar?: (p: Parada) => void
}) {
  const caixaRef = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const camadasRef = useRef<L.LayerGroup | null>(null)
  const enquadrouRef = useRef(false)

  // Cria o mapa uma vez; as camadas são redesenhadas a cada mudança.
  useEffect(() => {
    if (!caixaRef.current || mapaRef.current) return
    const mapa = L.map(caixaRef.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(mapa)
    camadasRef.current = L.layerGroup().addTo(mapa)
    mapaRef.current = mapa
    return () => {
      mapa.remove()
      mapaRef.current = null
      camadasRef.current = null
      enquadrouRef.current = false
    }
  }, [])

  useEffect(() => {
    const mapa = mapaRef.current
    const camadas = camadasRef.current
    if (!mapa || !camadas) return
    camadas.clearLayers()

    const ll = (p: Ponto): [number, number] => [p.lat, p.lng]
    const caminho = (lista: Parada[]) => [...(base ? [base] : []), ...lista].map(ll)

    // Traçados: Meli em roxo tracejado, otimizada em azul cheio (por cima).
    if (mostrarMeli && ordemDoMeli.length > 0)
      L.polyline(caminho(ordemDoMeli), { color: '#8b5cf6', weight: 3, dashArray: '8 8', opacity: 0.85 }).addTo(camadas)
    if (mostrarOtimizada && ordem.length > 0)
      L.polyline(caminho(ordem), { color: '#3483fa', weight: 4, opacity: 0.9 }).addTo(camadas)

    if (base) {
      L.marker(ll(base), {
        icon: L.divIcon({
          className: '',
          html: '<div style="background:#1e293b;color:#fff;font-weight:700;font-size:10px;padding:2px 6px;border-radius:6px;white-space:nowrap">🏠 BASE</div>',
          iconAnchor: [24, 10],
        }),
      }).addTo(camadas)
    }

    ordem.forEach((p, i) => {
      const entregue = entregues.has(p.id)
      const proxima = p.id === proximaId
      const escolhida = p.id === escolhidaId
      const cor = entregue ? '#10b981' : proxima ? '#ffe600' : '#ffffff'
      const borda = entregue ? '#059669' : proxima ? '#b45309' : escolhida ? '#f59e0b' : '#475569'
      const marcador = L.marker(ll(p), {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${cor};border:2px ${escolhida && !entregue ? 'dashed' : 'solid'} ${borda};color:${entregue ? '#fff' : '#1e293b'};width:${proxima ? 28 : 24}px;height:${proxima ? 28 : 24}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;box-shadow:0 1px 4px rgba(0,0,0,.35)">${i + 1}</div>`,
          iconAnchor: [proxima ? 14 : 12, proxima ? 14 : 12],
        }),
      }).addTo(camadas)
      const capitaliza = (t: string) => t.replace(/\b\w/g, (c) => c.toUpperCase())
      marcador.bindPopup(
        `<strong>${i + 1}º · ${p.endereco || 'Endereço não informado'}</strong><br/>` +
          `${p.cidade}${p.destinatario ? ` · ${capitaliza(p.destinatario)}` : ''}<br/>` +
          `📦 ${p.pacotes.map((x) => x.etiqueta || x.numeracao).join(', ')}` +
          (aoTocar && !entregue ? '<br/><em>toque no ponto de novo para fazer esta AGORA</em>' : ''),
      )
      if (aoTocar && !entregue) {
        // 1º toque abre o balão; 2º toque no mesmo ponto confirma a escolha.
        marcador.on('click', () => {
          if (escolhida || marcador.isPopupOpen()) aoTocar(p)
        })
      }
    })

    if (!enquadrouRef.current) {
      const pontos = [...ordem, ...ordemDoMeli, ...(base ? [base] : [])]
      if (pontos.length > 0) {
        mapa.fitBounds(L.latLngBounds(pontos.map(ll)), { padding: [24, 24] })
        enquadrouRef.current = true
      }
    }
  }, [ordem, ordemDoMeli, base, entregues, proximaId, escolhidaId, mostrarMeli, mostrarOtimizada, aoTocar])

  return <div ref={caixaRef} className="h-80 w-full rounded-xl border border-slate-200 sm:h-[26rem]" />
}

export function RoteiroRota({ c, editavel }: Props) {
  const [verMeli, setVerMeli] = useState(false)
  const [tracoOtimizada, setTracoOtimizada] = useState(true)
  const [tracoMeli, setTracoMeli] = useState(true)

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

      {/* Mapa com as duas rotas: comparar e ESCOLHER direto nele */}
      <MapaParadas
        // Caminho completo do dia: entregues NA ORDEM em que foram feitas +
        // pendentes na ordem recalculada — a numeração conta a jornada real.
        ordem={[
          ...progresso.entregues
            .map((id) => paradas.find((x) => x.id === id))
            .filter((x): x is Parada => !!x),
          ...ordemExecucao,
        ]}
        ordemDoMeli={ordemMeli(paradas)}
        base={base}
        entregues={entregues}
        proximaId={proximaDaVez?.id ?? null}
        escolhidaId={progresso.proximaId}
        mostrarMeli={tracoMeli}
        mostrarOtimizada={tracoOtimizada}
        aoTocar={editavel ? escolherProxima : undefined}
      />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          onClick={() => setTracoOtimizada((v) => !v)}
          className={`flex items-center gap-1.5 font-semibold ${tracoOtimizada ? 'text-ml-azul' : 'text-slate-400 line-through'}`}
        >
          <span className="inline-block h-1 w-6 rounded bg-ml-azul" /> Nossa rota (azul)
          {comparacao && ` ~${comparacao.otimizado.toFixed(0)} km`}
        </button>
        <button
          onClick={() => setTracoMeli((v) => !v)}
          className={`flex items-center gap-1.5 font-semibold ${tracoMeli ? 'text-slate-600' : 'text-slate-400 line-through'}`}
        >
          <span className="inline-block w-6 border-t-2 border-dashed border-violet-500" /> Ordem do Meli (roxo)
          {comparacao && ` ~${comparacao.meli.toFixed(0)} km`}
        </button>
        {editavel && (
          <span className="ml-auto text-slate-500">
            👆 Toque num ponto para ver o endereço; toque de novo para fazê-lo <strong>agora</strong> — o caminho recalcula.
          </span>
        )}
      </div>

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
