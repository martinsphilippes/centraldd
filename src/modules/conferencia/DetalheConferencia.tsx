// Detalhe da conferência para o DISPATCHER: tudo que o documento da rota
// entregou, pacote por pacote, com a situação da bipagem de cada um.
// Abre dentro do próprio card — um toque mostra, outro esconde.

import { useMemo, useState } from 'react'
import { removerPacoteConferencia } from '../../core/db'
import { estadoFuncionamento } from '../../core/roteiro'
import { chaveNumeracao } from '../../core/conferencia'
import { normalizarTexto } from '../../core/texto'
import type { Conferencia } from '../../core/types'
import { Badge, Input } from '../../components/ui'
import { RoteiroRota } from '../roteiro/RoteiroRota'

type Situacao = 'bipado' | 'falta' | 'aguardando'

const SELO: Record<Situacao, { texto: string; cor: string }> = {
  bipado: { texto: '✅ Bipado', cor: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  falta: { texto: '❌ Falta', cor: 'border-red-200 bg-red-50 text-red-800' },
  aguardando: { texto: '⏳ Aguardando', cor: 'border-slate-200 bg-slate-50 text-slate-500' },
}

/** CD-2 antes de CD-10: ordena a etiqueta pelo número. */
function ordemEtiqueta(e: string): number {
  const n = /(\d+)/.exec(e)?.[1]
  return n ? Number(n) : 9999
}

export function DetalheConferencia({ c, podeExcluir }: { c: Conferencia; podeExcluir?: boolean }) {
  const [busca, setBusca] = useState('')
  const [soFaltas, setSoFaltas] = useState(false)
  const [soComercios, setSoComercios] = useState(false)
  const [aba, setAba] = useState<'pacotes' | 'roteiro'>('pacotes')
  const temRoteiro = (c.pacotes ?? []).some((p) => p.lat != null)

  const bipados = useMemo(
    () => new Set((c.conferidos ?? []).map(chaveNumeracao)),
    [c.conferidos],
  )
  const situacaoDe = (numeracao: string): Situacao => {
    if (c.conferidos === null) return 'aguardando'
    return bipados.has(chaveNumeracao(numeracao)) ? 'bipado' : 'falta'
  }

  // A lista base é o detalhe dos pacotes (documento do Meli); sem ele, as
  // numerações puras. Tudo que o documento entregou aparece aqui.
  const linhas = useMemo(() => {
    const detalhe = new Map((c.pacotes ?? []).map((p) => [chaveNumeracao(p.numeracao), p]))
    return c.esperados
      .map((numeracao) => {
        const p = detalhe.get(chaveNumeracao(numeracao))
        return {
          numeracao,
          etiqueta: p?.etiqueta ?? '',
          cidade: p?.cidade ?? '',
          endereco: p?.endereco ?? '',
          destinatario: p?.destinatario ?? '',
          comercial: p?.comercial ?? false,
          abre: p?.abre ?? null,
          fecha: p?.fecha ?? null,
          sempreAberto: p?.sempreAberto ?? false,
          situacao: situacaoDe(numeracao),
        }
      })
      .sort((a, b) => ordemEtiqueta(a.etiqueta) - ordemEtiqueta(b.etiqueta))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.esperados, c.pacotes, c.conferidos])

  const aMais = (c.conferidos ?? []).filter(
    (v) => !c.esperados.some((e) => chaveNumeracao(e) === chaveNumeracao(v)),
  )

  const totalComerciais = linhas.filter((l) => l.comercial).length
  const chaveBusca = normalizarTexto(busca)
  const visiveis = linhas.filter((l) => {
    if (soFaltas && l.situacao !== 'falta') return false
    if (soComercios && !l.comercial) return false
    if (!chaveBusca) return true
    return normalizarTexto(
      `${l.numeracao} ${l.etiqueta} ${l.cidade} ${l.endereco} ${l.destinatario}`,
    ).includes(chaveBusca)
  })

  const totalBipados = linhas.filter((l) => l.situacao === 'bipado').length
  const totalFaltas = linhas.filter((l) => l.situacao === 'falta').length
  const cidades = [...new Set(linhas.map((l) => l.cidade).filter(Boolean))]

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      {temRoteiro && (
        <div className="flex gap-1.5">
          <button
            onClick={() => setAba('pacotes')}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${aba === 'pacotes' ? 'bg-ml-amarelo text-slate-900' : 'bg-slate-100 text-slate-600'}`}
          >
            📦 Pacotes
          </button>
          <button
            onClick={() => setAba('roteiro')}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${aba === 'roteiro' ? 'bg-ml-amarelo text-slate-900' : 'bg-slate-100 text-slate-600'}`}
          >
            🧭 Roteiro e progresso
          </button>
        </div>
      )}
      {temRoteiro && aba === 'roteiro' ? (
        <RoteiroRota c={c} editavel={false} />
      ) : (
        <>
      {/* O que o documento disse sobre a rota */}
      {(c.origem || cidades.length > 0) && (
        <p className="text-xs text-slate-600">
          {c.origem?.rota && <>🛣️ <strong>{c.origem.rota}</strong></>}
          {c.origem?.transportadora && <> · 🚛 {c.origem.transportadora}</>}
          {c.origem?.veiculo && <> · 🚐 {c.origem.veiculo}</>}
          {c.origem?.placa && <> · 🪪 {c.origem.placa}</>}
          {cidades.length > 0 && (
            <>
              {c.origem ? ' · ' : ''}📍{' '}
              {cidades
                .map((cid) => `${cid} (${linhas.filter((l) => l.cidade === cid).length})`)
                .join(' · ')}
            </>
          )}
        </p>
      )}

      {/* Números do dia + filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-slate-200 bg-slate-100 text-slate-700">
          📦 {linhas.length} pacote(s)
        </Badge>
        {c.conferidos !== null && (
          <>
            <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
              ✅ {totalBipados} bipado(s)
            </Badge>
            <button
              onClick={() => setSoFaltas((v) => !v)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                soFaltas
                  ? 'border-red-400 bg-red-100 text-red-800'
                  : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
              }`}
              title="Mostrar só o que falta"
            >
              ❌ {totalFaltas} falta(m){soFaltas ? ' ✓' : ''}
            </button>
          </>
        )}
        {aMais.length > 0 && (
          <Badge className="border-amber-300 bg-amber-100 text-amber-800">
            ➕ {aMais.length} fora da lista
          </Badge>
        )}
        {totalComerciais > 0 && (
          <button
            onClick={() => setSoComercios((v) => !v)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${
              soComercios
                ? 'border-indigo-400 bg-indigo-100 text-indigo-800'
                : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
            title="Mostrar só os pontos comerciais"
          >
            🏪 {totalComerciais} comercial(is){soComercios ? ' ✓' : ''}
          </button>
        )}
        <Input
          placeholder="🔎 numeração, CD, cidade, endereço, nome…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="ml-auto w-64 max-w-full"
        />
      </div>

      {/* Pacote por pacote */}
      <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
            <tr>
              <th className="px-2 py-1.5">CD</th>
              <th className="px-2 py-1.5">Numeração</th>
              <th className="px-2 py-1.5">Cidade</th>
              <th className="px-2 py-1.5">Endereço</th>
              <th className="px-2 py-1.5">Destinatário</th>
              {totalComerciais > 0 && <th className="px-2 py-1.5">🏪 Funciona</th>}
              <th className="px-2 py-1.5">Situação</th>
              {podeExcluir && <th className="px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr
                key={l.numeracao}
                className={`border-t border-slate-100 ${l.situacao === 'falta' ? 'bg-red-50/60' : ''}`}
              >
                <td className="px-2 py-1 font-bold text-slate-800">{l.etiqueta || '—'}</td>
                <td className="px-2 py-1 font-mono text-slate-700">{l.numeracao}</td>
                <td className="px-2 py-1 text-slate-600">{l.cidade || '—'}</td>
                <td className="px-2 py-1 text-slate-600">{l.endereco || '—'}</td>
                <td className="px-2 py-1 capitalize text-slate-600">{l.destinatario || '—'}</td>
                {totalComerciais > 0 && (
                  <td className="px-2 py-1">
                    {l.comercial ? (
                      <span className="whitespace-nowrap text-indigo-700">
                        🏪 {l.sempreAberto ? 'sempre aberto' : l.abre && l.fecha ? `${l.abre}–${l.fecha}` : 'sem horário'}
                        {estadoFuncionamento(l, new Date()) === 'ja-fechou' && (
                          <strong className="ml-1 text-red-600">fechado agora</strong>
                        )}
                        {estadoFuncionamento(l, new Date()) === 'ainda-nao-abriu' && (
                          <strong className="ml-1 text-slate-500">não abriu</strong>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                )}
                <td className="px-2 py-1">
                  <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 font-semibold ${SELO[l.situacao].cor}`}>
                    {SELO[l.situacao].texto}
                  </span>
                </td>
                {podeExcluir && (
                  <td className="px-2 py-1 text-right">
                    <button
                      className="rounded px-1.5 py-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Excluir esta linha da conferência"
                      onClick={() => {
                        if (
                          confirm(
                            `Excluir o pacote ${l.numeracao}${l.etiqueta ? ` (${l.etiqueta})` : ''} desta conferência?\n\nEle sai da lista esperada — deixa de contar como falta.`,
                          )
                        )
                          removerPacoteConferencia(c.id, l.numeracao)
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={(podeExcluir ? 7 : 6) + (totalComerciais > 0 ? 1 : 0)} className="px-2 py-4 text-center text-slate-400">
                  Nada encontrado com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {aMais.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900">
            ➕ Bipado pelo motorista mas fora da lista da rota ({aMais.length}):
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {aMais.map((v) => (
              <span key={v} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-900">
                {v}
              </span>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
