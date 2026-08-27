// Dois indicadores do Dashboard:
//  📈 Taxa de sucesso das rotas dia a dia — finalizada sem pendência = sucesso.
//  😊/😠 Clientes satisfeitos e insatisfeitos por motorista — vem das
//  reclamações (claims) que o documento de rota do Meli traz por pacote,
//  gravadas junto com cada conferência.

import { useMemo, useState } from 'react'
import { useDB } from '../../core/db'
import { compararConferencia } from '../../core/conferencia'
import { hojeISO, parseISODate } from '../../core/dates'
import type { DB } from '../../core/types'
import { Avatar, Card, EmptyState, Select } from '../../components/ui'
import { BarChart, Legenda } from '../../components/charts'

const PERIODOS = [
  { valor: '7', rotulo: 'Última semana' },
  { valor: '30', rotulo: 'Último mês' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
]

function inicioDe(periodo: string): string {
  return hojeISO(-Number(periodo))
}

// ─────────────────────────── Taxa de sucesso ───────────────────────────

export function TaxaSucessoRotas() {
  const db = useDB()
  const [periodo, setPeriodo] = useState('7')
  const inicio = inicioDe(periodo)

  // Por dia de finalização: entregue (sucesso) × encerrada com pendência.
  const porDia = useMemo(() => {
    const mapa = new Map<string, { sucesso: number; pendente: number }>()
    for (const r of db.rotas) {
      if (!r.finalizadaEm) continue
      const dia = r.finalizadaEm.slice(0, 10)
      if (dia < inicio) continue
      const atual = mapa.get(dia) ?? { sucesso: 0, pendente: 0 }
      if (r.resultadoFinalizacao === 'pendente') atual.pendente++
      else atual.sucesso++
      mapa.set(dia, atual)
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [db.rotas, inicio])

  const totalSucesso = porDia.reduce((s, [, v]) => s + v.sucesso, 0)
  const totalPendente = porDia.reduce((s, [, v]) => s + v.pendente, 0)
  const total = totalSucesso + totalPendente
  const taxa = total > 0 ? Math.round((totalSucesso / total) * 100) : null

  return (
    <Card className="p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">🎯 Taxa de sucesso das rotas</h2>
        <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 'auto' }}>
          {PERIODOS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </Select>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Rota finalizada e entregue = sucesso; encerrada com pendência conta contra.
      </p>

      {total === 0 ? (
        <EmptyState
          icone="🎯"
          titulo="Nenhuma rota finalizada no período"
          descricao="Quando as rotas do dia forem encerradas, a taxa aparece aqui dia a dia."
        />
      ) : (
        <>
          <p className="mb-3 text-3xl font-bold text-slate-900">
            {taxa}%
            <span className="ml-2 text-sm font-medium text-slate-500">
              {totalSucesso} entregue(s) · {totalPendente} com pendência
            </span>
          </p>
          <BarChart
            barras={porDia.map(([dia, v]) => ({
              rotulo: parseISODate(dia).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
              valores: [
                { valor: v.sucesso, cor: '#10b981' },
                { valor: v.pendente, cor: '#ef4444' },
              ],
            }))}
          />
          <div className="mt-2">
            <Legenda
              itens={[
                { rotulo: 'Entregues', cor: '#10b981' },
                { rotulo: 'Com pendência', cor: '#ef4444' },
              ]}
            />
          </div>
        </>
      )}
    </Card>
  )
}

// ─────────────────────── Satisfação dos clientes ───────────────────────

interface LinhaSatisfacao {
  motoristaId: string
  nome: string
  satisfeitos: number
  insatisfeitos: number
}

/**
 * Por motorista, somando as conferências do período: pacote com reclamação =
 * cliente insatisfeito; pacote entregue sem reclamação = satisfeito.
 */
function satisfacaoPorMotorista(db: DB, inicio: string): LinhaSatisfacao[] {
  const mapa = new Map<string, LinhaSatisfacao>()
  for (const c of db.conferencias) {
    if (c.data < inicio || !c.pacotes?.length) continue
    const nome = db.motoristas.find((m) => m.id === c.motoristaId)?.nome ?? '—'
    const linha = mapa.get(c.motoristaId) ?? {
      motoristaId: c.motoristaId,
      nome,
      satisfeitos: 0,
      insatisfeitos: 0,
    }
    for (const p of c.pacotes) {
      if ((p.reclamacoes ?? 0) > 0) linha.insatisfeitos++
      else if (!p.naoEntregue) linha.satisfeitos++
    }
    mapa.set(c.motoristaId, linha)
  }
  return [...mapa.values()]
}

function MiniRanking({
  titulo,
  linhas,
  valorDe,
  cor,
}: {
  titulo: string
  linhas: LinhaSatisfacao[]
  valorDe: (l: LinhaSatisfacao) => number
  cor: string
}) {
  const top = linhas
    .filter((l) => valorDe(l) > 0)
    .sort((a, b) => valorDe(b) - valorDe(a) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 5)
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-slate-700">{titulo}</p>
      {top.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">Ninguém no período.</p>
      ) : (
        <ul className="space-y-1">
          {top.map((l) => (
            <li key={l.motoristaId} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
              <Avatar nome={l.nome} tamanho="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{l.nome}</span>
              <span className={`text-sm font-bold ${cor}`}>{valorDe(l)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SatisfacaoClientes() {
  const db = useDB()
  const [periodo, setPeriodo] = useState('30')
  const linhas = useMemo(() => satisfacaoPorMotorista(db, inicioDe(periodo)), [db, periodo])
  const temDados = linhas.length > 0

  return (
    <Card className="p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-900">💬 Satisfação dos clientes</h2>
        <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 'auto' }}>
          {PERIODOS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </Select>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Vem das conferências: pacote com reclamação do cliente (claim do Meli) conta como
        insatisfeito; entregue sem reclamação, satisfeito.
      </p>

      {!temDados ? (
        <EmptyState
          icone="💬"
          titulo="Sem conferências com pacotes no período"
          descricao="Crie as conferências com a página de rota do Meli — as reclamações de cada pacote vêm junto."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <MiniRanking
            titulo="😊 Mais clientes satisfeitos"
            linhas={linhas}
            valorDe={(l) => l.satisfeitos}
            cor="text-emerald-700"
          />
          <MiniRanking
            titulo="😠 Mais clientes insatisfeitos"
            linhas={linhas}
            valorDe={(l) => l.insatisfeitos}
            cor="text-red-700"
          />
        </div>
      )}
    </Card>
  )
}


// ─────────────────────────── Conferências ───────────────────────────

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
