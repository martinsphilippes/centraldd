// 🏆 Ranking de motoristas do Dashboard: um indicador rápido com o pódio à
// vista e, ao abrir, a lista completa da frota ordenada pelo critério que o
// Dispatcher escolher (parametrizável) — com busca e período.

import { useMemo, useState } from 'react'
import { useDB } from '../../core/db'
import { hojeISO, parseISODate } from '../../core/dates'
import { STATUS_DISPONIVEIS } from '../../core/constants'
import { normalizarTexto } from '../../core/texto'
import type { DB, Motorista } from '../../core/types'
import { Avatar, Card, Input, Select } from '../../components/ui'

type Criterio = 'disponiveis' | 'rotas' | 'domingos' | 'respostas' | 'planejamentos'

interface DefCriterio {
  rotulo: string
  /** O que o número significa, mostrado ao lado do valor. */
  unidade: string
  descricao: string
  valorDe: (db: DB, m: Motorista, inicio: string) => number
}

const domingo = (data: string) => parseISODate(data).getDay() === 0

const CRITERIOS: Record<Criterio, DefCriterio> = {
  disponiveis: {
    rotulo: '✅ Mais disponíveis',
    unidade: 'dia(s) disponível',
    descricao: 'Dias marcados como disponível na Disponibilidade.',
    valorDe: (db, m, inicio) =>
      db.disponibilidade.filter(
        (a) => a.motoristaId === m.id && a.data >= inicio && STATUS_DISPONIVEIS.includes(a.status),
      ).length,
  },
  rotas: {
    rotulo: '🏁 Mais finalizam rotas',
    unidade: 'rota(s) finalizada(s)',
    descricao: 'Rotas direcionadas a ele e finalizadas (encerradas com pendência não contam).',
    valorDe: (db, m, inicio) =>
      db.rotas.filter(
        (r) =>
          r.motoristaId === m.id &&
          r.finalizadaEm &&
          r.finalizadaEm.slice(0, 10) >= inicio &&
          r.resultadoFinalizacao !== 'pendente',
      ).length,
  },
  domingos: {
    rotulo: '🙏 Mais trabalham aos domingos',
    unidade: 'domingo(s)',
    descricao: 'Domingos com disponibilidade marcada ou rota finalizada.',
    valorDe: (db, m, inicio) => {
      const dias = new Set<string>()
      for (const a of db.disponibilidade)
        if (
          a.motoristaId === m.id &&
          a.data >= inicio &&
          STATUS_DISPONIVEIS.includes(a.status) &&
          domingo(a.data)
        )
          dias.add(a.data)
      for (const r of db.rotas)
        if (r.motoristaId === m.id && r.finalizadaEm) {
          const dia = r.finalizadaEm.slice(0, 10)
          if (dia >= inicio && domingo(dia)) dias.add(dia)
        }
      return dias.size
    },
  },
  respostas: {
    rotulo: '✋ Mais respondem às chamadas',
    unidade: 'resposta(s)',
    descricao: 'Chamadas respondidas (qualquer status) — quem nunca deixa no vácuo.',
    valorDe: (db, m, inicio) =>
      db.respostas.filter((r) => r.motoristaId === m.id && r.respondidaEm.slice(0, 10) >= inicio)
        .length,
  },
  planejamentos: {
    rotulo: '📋 Mais entram no planejamento',
    unidade: 'planejamento(s)',
    descricao: 'Vezes em que ele entrou num planejamento publicado ou concluído.',
    valorDe: (db, m, inicio) =>
      db.planejamento.filter(
        (e) => e.data >= inicio && e.status !== 'rascunho' && e.motoristaIds.includes(m.id),
      ).length,
  },
}

const PERIODOS = [
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
  { valor: 'tudo', rotulo: 'Desde o início' },
]

const MEDALHA = ['🥇', '🥈', '🥉']

export function MelhoresMotoristas() {
  const db = useDB()
  const [criterio, setCriterio] = useState<Criterio>('disponiveis')
  const [periodo, setPeriodo] = useState('30')
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')

  const def = CRITERIOS[criterio]
  const inicio = periodo === 'tudo' ? '0000-01-01' : hojeISO(-Number(periodo))

  const ranking = useMemo(
    () =>
      db.motoristas
        .filter((m) => m.ativo && m.aprovado !== false)
        .map((m) => ({ motorista: m, valor: def.valorDe(db, m, inicio) }))
        .sort(
          (a, b) => b.valor - a.valor || a.motorista.nome.localeCompare(b.motorista.nome, 'pt-BR'),
        ),
    [db, def, inicio],
  )

  const chaveBusca = normalizarTexto(busca)
  const visiveis = aberto
    ? ranking.filter(
        (r) => !chaveBusca || normalizarTexto(`${r.motorista.nome} ${r.motorista.cidade}`).includes(chaveBusca),
      )
    : ranking.slice(0, 3)

  return (
    <Card className="p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">🏆 Melhores motoristas</h2>
        <div className="flex flex-wrap gap-2">
          <Select value={criterio} onChange={(e) => setCriterio(e.target.value as Criterio)} style={{ width: 'auto' }}>
            {Object.entries(CRITERIOS).map(([valor, c]) => (
              <option key={valor} value={valor}>
                {c.rotulo}
              </option>
            ))}
          </Select>
          <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 'auto' }}>
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500">{def.descricao}</p>

      {aberto && (
        <Input
          placeholder="🔎 Buscar por nome ou cidade…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="mb-2"
        />
      )}

      {ranking.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Nenhum motorista ativo ainda.</p>
      ) : (
        <ol className={`space-y-1.5 ${aberto ? 'max-h-96 overflow-auto pr-1' : ''}`}>
          {visiveis.map(({ motorista: m, valor }) => {
            const posicao = ranking.findIndex((r) => r.motorista.id === m.id)
            return (
              <li
                key={m.id}
                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
                  posicao < 3 && valor > 0
                    ? 'border-yellow-200 bg-yellow-50/60'
                    : 'border-slate-100 bg-white'
                }`}
              >
                <span className="w-7 shrink-0 text-center text-sm font-bold text-slate-500">
                  {posicao < 3 && valor > 0 ? MEDALHA[posicao] : `${posicao + 1}º`}
                </span>
                <Avatar nome={m.nome} tamanho="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{m.nome}</span>
                  {m.cidade && <span className="block text-[11px] text-slate-400">📍 {m.cidade}</span>}
                </span>
                <span className="whitespace-nowrap text-sm font-bold text-slate-900">
                  {valor}
                  <span className="ml-1 text-[11px] font-medium text-slate-500">{def.unidade}</span>
                </span>
              </li>
            )
          })}
          {aberto && visiveis.length === 0 && (
            <li className="py-3 text-center text-sm text-slate-400">Ninguém encontrado com essa busca.</li>
          )}
        </ol>
      )}

      {ranking.length > 3 && (
        <button
          onClick={() => {
            setAberto((v) => !v)
            setBusca('')
          }}
          className="mt-2 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-ml-azul transition-colors hover:bg-slate-50"
        >
          {aberto ? '▲ Mostrar só o pódio' : `▼ Ver todos os ${ranking.length} motoristas`}
        </button>
      )}
    </Card>
  )
}
