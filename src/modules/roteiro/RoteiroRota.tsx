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
  estadoFuncionamento,
  kmDaOrdem,
  linksNavegacao,
  minutosParaFechar,
  montarParadas,
  ordemMeli,
  otimizarComRelogio,
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
          (p.comercial
            ? `<br/>🏪 <strong>Comercial</strong>${p.sempreAberto ? ' · sempre aberto' : p.abre && p.fecha ? ` · ${p.abre}–${p.fecha}` : ''}`
            : '') +
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

  // relative + z-0 criam um contexto de empilhamento próprio: os z-index
  // internos do Leaflet (até 1000) ficam PRESOS aqui dentro e nunca mais
  // passam por cima do menu, do cabeçalho ou dos modais do app.
  return <div ref={caixaRef} className="relative z-0 h-80 w-full rounded-xl border border-slate-200 sm:h-[26rem]" />
}

type Traco = 'ambas' | 'otimizada' | 'meli'

export function RoteiroRota({ c, editavel }: Props) {
  const [traco, setTraco] = useState<Traco>('ambas')

  const paradas = useMemo(() => montarParadas(c.pacotes ?? []), [c.pacotes])
  const base: Ponto | null =
    c.origem?.baseLat != null && c.origem?.baseLng != null
      ? { lat: c.origem.baseLat, lng: c.origem.baseLng }
      : null

  const progresso = c.roteiro ?? { entregues: [], proximaId: null, atualizadoEm: '' }
  /** A decisão do motorista: seguir a nossa rota ou a ordem do Meli. */
  const seguir = progresso.seguir ?? 'otimizada'
  const avisoMin = progresso.avisoFechamentoMin ?? 60
  const priorizarComercio = progresso.priorizarComercio ?? false

  // Relógio vivo: o estado aberto/fechado dos comerciais se atualiza sozinho.
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])
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
    // O motorista escolheu uma parada específica? A partir dela o SISTEMA
    // recalcula a melhor forma de fazer o resto — vale nas duas ordens.
    if (proxima) {
      const escolhida = pendentes.find((p) => p.id === proxima)!
      const demais = pendentes.filter((p) => p.id !== proxima)
      return [
        escolhida,
        ...(priorizarComercio && seguir === 'otimizada'
          ? otimizarComRelogio(escolhida, demais)
          : otimizarRoteiro(escolhida, demais, null)),
      ]
    }
    // Sem escolha pontual: segue a ordem que ele decidiu usar — com os
    // comerciais puxados para o fechamento, se ele ligou o relógio.
    if (seguir === 'meli') return ordemMeli(pendentes)
    return priorizarComercio
      ? otimizarComRelogio(inicio, pendentes)
      : otimizarRoteiro(inicio, pendentes, null)
  }, [pendentes, posicaoAtual, progresso.proximaId, seguir, priorizarComercio])

  // Comparação da rota completa desde a base: a ordem do Meli × o caminho
  // REAL de hoje (entregues na ordem em que foram feitas + pendentes na ordem
  // atual, com a escolha do motorista dentro) — recalcula a cada mudança.
  const entreguesEmOrdem = useMemo(
    () =>
      progresso.entregues
        .map((id) => paradas.find((x) => x.id === id))
        .filter((x): x is Parada => !!x),
    [progresso.entregues, paradas],
  )
  const comparacao = useMemo(() => {
    if (!base || paradas.length === 0) return null
    return {
      meli: kmDaOrdem(base, ordemMeli(paradas)),
      atual: kmDaOrdem(base, [...entreguesEmOrdem, ...ordemExecucao]),
    }
  }, [base, paradas, entreguesEmOrdem, ordemExecucao])

  // Quanto a ESCOLHA avulsa custou (ou economizou) em relação ao caminho que
  // o sistema sugeriria sem ela, da mesma posição.
  const escolhaValida =
    progresso.proximaId && pendentes.some((p) => p.id === progresso.proximaId)
  const deltaEscolha = useMemo(() => {
    if (!escolhaValida || !posicaoAtual) return null
    const semEscolha =
      seguir === 'meli' ? ordemMeli(pendentes) : otimizarRoteiro(posicaoAtual, pendentes, null)
    return kmDaOrdem(posicaoAtual, ordemExecucao) - kmDaOrdem(posicaoAtual, semEscolha)
  }, [escolhaValida, posicaoAtual, pendentes, ordemExecucao, seguir])

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
  const listaMostrada = ordemExecucao

  const marcarEntregue = (p: Parada) => {
    const novos = [...progresso.entregues.filter((id) => id !== p.id), p.id]
    salvarRoteiroConferencia(c.id, {
      entregues: novos,
      proximaId: progresso.proximaId === p.id ? null : progresso.proximaId,
      seguir,
      avisoFechamentoMin: avisoMin,
      priorizarComercio,
    })
  }
  const desfazerEntregue = (p: Parada) => {
    salvarRoteiroConferencia(c.id, {
      entregues: progresso.entregues.filter((id) => id !== p.id),
      proximaId: progresso.proximaId,
      seguir,
      avisoFechamentoMin: avisoMin,
      priorizarComercio,
    })
  }
  const salvarPreferencias = (mudancas: { avisoFechamentoMin?: number; priorizarComercio?: boolean }) => {
    salvarRoteiroConferencia(c.id, {
      entregues: progresso.entregues,
      proximaId: progresso.proximaId,
      seguir,
      avisoFechamentoMin: mudancas.avisoFechamentoMin ?? avisoMin,
      priorizarComercio: mudancas.priorizarComercio ?? priorizarComercio,
    })
  }

  /** Um toque desfaz a escolha avulsa: volta a valer a rota sugerida. */
  const voltarSugerida = () => {
    salvarRoteiroConferencia(c.id, {
      entregues: progresso.entregues,
      proximaId: null,
      seguir,
      avisoFechamentoMin: avisoMin,
      priorizarComercio,
    })
  }

  const trocarSeguir = (novo: 'otimizada' | 'meli') => {
    salvarRoteiroConferencia(c.id, {
      entregues: progresso.entregues,
      // Trocar de ordem limpa a escolha pontual: a nova ordem assume inteira.
      proximaId: null,
      seguir: novo,
      avisoFechamentoMin: avisoMin,
      priorizarComercio,
    })
  }

  const escolherProxima = (p: Parada) => {
    salvarRoteiroConferencia(c.id, {
      entregues: progresso.entregues,
      proximaId: progresso.proximaId === p.id ? null : p.id,
      seguir,
      avisoFechamentoMin: avisoMin,
      priorizarComercio,
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
          <Badge className="border-slate-300 bg-slate-100 text-slate-700">
            🛣️ ~{kmRestante.toFixed(1).replace('.', ',')} km restantes (linha reta)
          </Badge>
        )}
        {deltaEscolha !== null && Math.abs(deltaEscolha) >= 0.05 && (
          <Badge
            className={
              deltaEscolha > 0
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : 'border-emerald-300 bg-emerald-100 text-emerald-800'
            }
          >
            📍 sua escolha: {deltaEscolha > 0 ? '+' : '−'}
            {Math.abs(deltaEscolha).toFixed(1).replace('.', ',')} km vs o sugerido
          </Badge>
        )}
        {editavel && escolhaValida && (
          <button
            onClick={voltarSugerida}
            className="rounded-full border border-marca-texto bg-orange-50 px-2.5 py-0.5 text-xs font-bold text-marca-texto transition-colors hover:bg-orange-100"
          >
            ↩️ Voltar à rota sugerida
          </button>
        )}
        {comparacao && (
          <span className="text-xs text-slate-500">
            Rota completa: Meli ~{comparacao.meli.toFixed(0)} km · seu caminho ~
            {comparacao.atual.toFixed(0)} km
          </span>
        )}
        {editavel ? (
          <span className="ml-auto flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-bold">
            <button
              onClick={() => trocarSeguir('otimizada')}
              className={`rounded-md px-2.5 py-1 ${seguir === 'otimizada' ? 'bg-marca-texto text-white' : 'text-slate-600'}`}
            >
              🧭 Seguir a nossa
            </button>
            <button
              onClick={() => trocarSeguir('meli')}
              className={`rounded-md px-2.5 py-1 ${seguir === 'meli' ? 'bg-violet-600 text-white' : 'text-slate-600'}`}
            >
              📋 Seguir o Meli
            </button>
          </span>
        ) : (
          <Badge className="ml-auto border-slate-200 bg-slate-100 text-slate-700">
            {seguir === 'meli' ? '📋 seguindo a ordem do Meli' : '🧭 seguindo a nossa rota'}
          </Badge>
        )}
      </div>

      {progresso.atualizadoEm && (
        <p className="text-[11px] text-slate-500">
          🕒 Último andamento {formatarQuandoCurto(progresso.atualizadoEm)}
        </p>
      )}

      {/* 🏪 Alertas dos comerciais: automáticos, com a antecedência que o
          motorista escolher. Fechado/não-abriu aparece sempre. */}
      {(() => {
        const comerciais = pendentes.filter((p) => p.comercial)
        if (comerciais.length === 0) return null
        const fechados = comerciais.filter((p) => estadoFuncionamento(p, agora) === 'ja-fechou')
        const naoAbriram = comerciais.filter((p) => estadoFuncionamento(p, agora) === 'ainda-nao-abriu')
        const fechando = avisoMin > 0
          ? comerciais.filter((p) => {
              const falta = minutosParaFechar(p, agora)
              return falta !== null && falta <= avisoMin
            })
          : []
        if (fechados.length === 0 && naoAbriram.length === 0 && fechando.length === 0) return null
        return (
          <div className="space-y-1.5">
            {fechados.map((p) => (
              <p key={p.id} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                🏪 <strong>{p.endereco}</strong> ({p.cidade}) — comercial <strong>JÁ FECHOU</strong>{' '}
                às {p.fecha}. Reabre {p.abre ? `às ${p.abre}` : 'amanhã'}.
              </p>
            ))}
            {naoAbriram.map((p) => (
              <p key={p.id} className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                🏪 <strong>{p.endereco}</strong> ({p.cidade}) — comercial <strong>ainda não abriu</strong>;
                abre às {p.abre}.
              </p>
            ))}
            {fechando.map((p) => {
              const falta = minutosParaFechar(p, agora)!
              return (
                <p key={p.id} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  ⏰ <strong>{p.endereco}</strong> ({p.cidade}) fecha às {p.fecha} —{' '}
                  <strong>faltam {falta >= 60 ? `${Math.floor(falta / 60)}h${String(falta % 60).padStart(2, '0')}` : `${falta} min`}</strong>.
                </p>
              )
            })}
          </div>
        )
      })()}

      {/* Preferências do motorista sobre os comerciais */}
      {editavel && paradas.some((p) => p.comercial) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <label className="flex items-center gap-2 font-semibold text-slate-700">
            🔔 Avisar fechamento com
            <select
              value={String(avisoMin)}
              onChange={(e) => salvarPreferencias({ avisoFechamentoMin: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1"
            >
              <option value="0">sem aviso</option>
              <option value="30">30 min</option>
              <option value="60">1 hora</option>
              <option value="120">2 horas</option>
              <option value="180">3 horas</option>
            </select>
            de antecedência
          </label>
          <label className="flex items-center gap-2 font-semibold text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={priorizarComercio}
              disabled={seguir === 'meli'}
              onChange={(e) => salvarPreferencias({ priorizarComercio: e.target.checked })}
            />
            ⏰ Comerciais antes do fechamento
            {seguir === 'meli' && <span className="font-normal text-slate-400">(só na nossa rota)</span>}
          </label>
        </div>
      )}

      {/* Mapa com as duas rotas: comparar e ESCOLHER direto nele */}
      <MapaParadas
        // Caminho completo do dia: entregues NA ORDEM em que foram feitas +
        // pendentes na ordem recalculada — a numeração conta a jornada real.
        ordem={[...entreguesEmOrdem, ...ordemExecucao]}
        ordemDoMeli={ordemMeli(paradas)}
        base={base}
        entregues={entregues}
        proximaId={proximaDaVez?.id ?? null}
        escolhidaId={progresso.proximaId}
        mostrarMeli={traco !== 'otimizada'}
        mostrarOtimizada={traco !== 'meli'}
        aoTocar={editavel ? escolherProxima : undefined}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold uppercase tracking-wide text-slate-500">Ver no mapa:</span>
        <span className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 font-bold">
          {(
            [
              ['ambas', '🔵🟣 As duas'],
              ['otimizada', '🔵 Só a nossa'],
              ['meli', '🟣 Só o Meli'],
            ] as [Traco, string][]
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setTraco(valor)}
              className={`rounded-md px-2.5 py-1 ${traco === valor ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              {rotulo}
            </button>
          ))}
        </span>
        <span className="flex items-center gap-3 font-semibold text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-6 rounded bg-marca-texto" /> seu caminho
            {comparacao && ` ~${comparacao.atual.toFixed(1).replace('.', ',')} km`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 border-t-2 border-dashed border-violet-500" /> Meli
            {comparacao && ` ~${comparacao.meli.toFixed(1).replace('.', ',')} km`}
          </span>
        </span>
        {editavel && (
          <span className="ml-auto text-slate-500">
            👆 Toque num ponto para ver o endereço; toque de novo para fazê-lo <strong>agora</strong> — o caminho recalcula.
          </span>
        )}
      </div>

      {/* Próxima parada em destaque (modo execução do motorista) */}
      {editavel && proximaDaVez && (
        <div className="rounded-xl border-2 border-marca bg-marca-suave p-3">
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
              className="rounded-lg bg-marca-texto px-3 py-1.5 text-sm font-bold text-white"
            >
              🗺️ Google Maps
            </a>
            <a
              href={linksNavegacao(proximaDaVez).waze}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-slate-1000 px-3 py-1.5 text-sm font-bold text-white"
            >
              🚗 Waze
            </a>
            <Button variante="marca" onClick={() => marcarEntregue(proximaDaVez)}>
              ✅ Entregue → próxima
            </Button>
          </div>
        </div>
      )}

      {editavel && pendentes.length > 0 && (
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
                  : escolhida
                    ? 'border-orange-300 bg-marca-suave'
                    : 'border-slate-100 bg-white'
              }`}
            >
              <span className="w-7 shrink-0 text-center text-xs font-bold text-slate-500">
                {i + 1}º
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
                {p.comercial && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                      🏪 Comercial{p.sempreAberto ? ' · sempre aberto' : p.abre && p.fecha ? ` · ${p.abre}–${p.fecha}` : ''}
                    </span>
                    {estadoFuncionamento(p, agora) === 'ja-fechou' && (
                      <span className="rounded border border-red-300 bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        FECHADO agora
                      </span>
                    )}
                    {estadoFuncionamento(p, agora) === 'ainda-nao-abriu' && (
                      <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        ainda não abriu
                      </span>
                    )}
                  </span>
                )}
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
                editavel && (
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => escolherProxima(p)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors ${
                        escolhida
                          ? 'border-yellow-400 bg-marca text-slate-900'
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
