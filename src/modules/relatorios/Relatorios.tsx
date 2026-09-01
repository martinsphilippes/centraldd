import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDB } from '../../core/db'
import { formatarData, hojeISO, parseISODate } from '../../core/dates'
import { estatisticasMotoristas, gradeDisponibilidade, serieDisponibilidade } from '../../core/stats'
import { exportarCSV, exportarExcel, exportarPDF, type Tabela } from '../../core/export'
import { Avatar, Button, Card, EmptyState, SegmentedControl, StatCard } from '../../components/ui'
import { BarChart, Legenda } from '../../components/charts'

type Periodo = 'dia' | 'semana' | 'mes'

const PERIODOS: Record<Periodo, { rotulo: string; dias: number }> = {
  dia: { rotulo: 'Hoje', dias: 0 },
  semana: { rotulo: 'Últimos 7 dias', dias: 6 },
  mes: { rotulo: 'Últimos 30 dias', dias: 29 },
}

export function Relatorios() {
  const db = useDB()
  const [periodo, setPeriodo] = useState<Periodo>('semana')

  const dataIni = hojeISO(-PERIODOS[periodo].dias)
  const dataFim = hojeISO()

  const estatisticas = useMemo(
    () => estatisticasMotoristas(db, dataIni, dataFim),
    [db, dataIni, dataFim],
  )
  const serie = useMemo(() => serieDisponibilidade(db, dataIni, dataFim), [db, dataIni, dataFim])

  const comChamadas = estatisticas.filter((e) => e.totalChamadas > 0)
  const taxaRespostaGeral = comChamadas.length
    ? comChamadas.reduce((s, e) => s + e.taxaResposta, 0) / comChamadas.length
    : 0

  const maisDisponiveis = [...estatisticas]
    .filter((e) => e.respondidas > 0)
    .sort((a, b) => b.taxaDisponibilidade - a.taxaDisponibilidade || b.disponiveis - a.disponiveis)
    .slice(0, 8)

  const maisIndisponiveis = [...estatisticas]
    .filter((e) => e.indisponiveis > 0)
    .sort((a, b) => b.indisponiveis - a.indisponiveis)
    .slice(0, 8)

  const planejamentosPeriodo = db.planejamento.filter((e) => e.data >= dataIni && e.data <= dataFim)

  const tabelaDisponibilidade = (): Tabela => ({
    titulo: `Disponibilidade ${PERIODOS[periodo].rotulo}`,
    colunas: ['Data', 'Disponíveis', 'Indisponíveis', 'Pendentes'],
    linhas: serie.map((p) => [formatarData(p.data), p.disponiveis, p.indisponiveis, p.pendentes]),
  })

  /**
   * A GRADE do período: um motorista por linha, um dia por coluna. Veio da
   * tela de Disponibilidade, que é onde se acompanha o dia — relatório de
   * período é assunto daqui, e aqui ele acompanha o seletor Hoje/7/30 dias
   * em vez de uma janela fixa.
   */
  const diasDoPeriodo = useMemo(() => {
    const total = PERIODOS[periodo].dias + 1
    return Array.from({ length: total }, (_, i) => hojeISO(-(total - 1 - i)))
  }, [periodo])

  const tabelaGrade = (): Tabela => {
    const grade = gradeDisponibilidade(db, diasDoPeriodo)
    return {
      titulo: `Disponibilidade por motorista — ${formatarData(dataIni)} a ${formatarData(dataFim)}`,
      colunas: grade.colunas,
      linhas: grade.linhas,
    }
  }

  const tabelaMotoristas = (): Tabela => ({
    titulo: `Motoristas ${PERIODOS[periodo].rotulo}`,
    colunas: ['Motorista', 'Cidade', 'Chamadas', 'Respondidas', 'Taxa de resposta', 'Disponível', 'Indisponível', 'Taxa de disponibilidade'],
    linhas: estatisticas.map((e) => [
      e.motorista.nome,
      e.motorista.cidade,
      e.totalChamadas,
      e.respondidas,
      `${Math.round(e.taxaResposta * 100)}%`,
      e.disponiveis,
      e.indisponiveis,
      `${Math.round(e.taxaDisponibilidade * 100)}%`,
    ]),
  })

  const Ranking = ({
    titulo,
    itens,
    metrica,
  }: {
    titulo: string
    itens: typeof maisDisponiveis
    metrica: (e: (typeof maisDisponiveis)[number]) => string
  }) => (
    <Card className="p-4">
      <h2 className="mb-3 font-bold text-slate-900">{titulo}</h2>
      {itens.length === 0 ? (
        <EmptyState icone="📉" titulo="Sem dados no período" />
      ) : (
        <ol className="space-y-2">
          {itens.map((e, i) => (
            <li key={e.motorista.id} className="flex items-center gap-2">
              <span className="w-5 text-center text-xs font-bold text-slate-400">{i + 1}º</span>
              <Avatar nome={e.motorista.nome} tamanho="sm" />
              <Link
                to={`/motoristas/${e.motorista.id}`}
                className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 hover:text-marca-texto"
              >
                {e.motorista.nome}
              </Link>
              <span className="text-xs font-bold text-slate-600">{metrica(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">📈 Relatórios</h1>
          <p className="text-sm text-slate-500">{PERIODOS[periodo].rotulo} • {formatarData(dataIni)} a {formatarData(dataFim)}</p>
        </div>
        <SegmentedControl
          opcoes={[
            { valor: 'dia', rotulo: 'Diário' },
            { valor: 'semana', rotulo: 'Semanal' },
            { valor: 'mes', rotulo: 'Mensal' },
          ]}
          valor={periodo}
          onChange={setPeriodo}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icone="⏰" valor={serie.length} rotulo="Chamadas no período" />
        <StatCard icone="💬" valor={`${Math.round(taxaRespostaGeral * 100)}%`} rotulo="Taxa de resposta média" destaque />
        <StatCard icone="✅" valor={serie.reduce((s, p) => s + p.disponiveis, 0)} rotulo="Disponibilidades registradas" />
        <StatCard icone="📋" valor={planejamentosPeriodo.length} rotulo="Planejamentos no período" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-900">📅 Disponibilidade por motorista</h2>
            <p className="text-xs text-slate-500">
              Um motorista por linha, um dia por coluna, com o que cada um marcou —{' '}
              {PERIODOS[periodo].rotulo.toLowerCase()}.
            </p>
          </div>
          <Button variante="marca" onClick={() => exportarExcel(tabelaGrade())}>
            📊 Baixar a grade (Excel)
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900">📊 Disponibilidade por dia</h2>
          <div className="flex gap-2">
            <Button variante="secundario" onClick={() => exportarCSV(tabelaDisponibilidade())}>⬇️ CSV</Button>
            <Button variante="secundario" onClick={() => exportarExcel(tabelaDisponibilidade())}>⬇️ Excel</Button>
            <Button variante="secundario" onClick={() => exportarPDF(tabelaDisponibilidade())}>🖨️ PDF</Button>
          </div>
        </div>
        {serie.length === 0 ? (
          <EmptyState icone="📈" titulo="Nenhuma chamada no período" />
        ) : (
          <>
            <BarChart
              barras={serie.map((p) => ({
                rotulo: parseISODate(p.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                valores: [
                  { valor: p.disponiveis, cor: '#10b981' },
                  { valor: p.indisponiveis, cor: '#ef4444' },
                  { valor: p.pendentes, cor: '#94a3b8' },
                ],
              }))}
            />
            <div className="mt-2">
              <Legenda
                itens={[
                  { rotulo: 'Disponíveis', cor: '#10b981' },
                  { rotulo: 'Indisponíveis', cor: '#ef4444' },
                  { rotulo: 'Pendentes', cor: '#94a3b8' },
                ]}
              />
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Ranking
          titulo="🏆 Motoristas mais disponíveis"
          itens={maisDisponiveis}
          metrica={(e) => `${Math.round(e.taxaDisponibilidade * 100)}% (${e.disponiveis}x)`}
        />
        <Ranking
          titulo="⚠️ Maior frequência de indisponibilidade"
          itens={maisIndisponiveis}
          metrica={(e) => `${e.indisponiveis}x indisponível`}
        />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900">🚚 Desempenho individual (taxa de resposta)</h2>
          <div className="flex gap-2">
            <Button variante="secundario" onClick={() => exportarCSV(tabelaMotoristas())}>⬇️ CSV</Button>
            <Button variante="secundario" onClick={() => exportarExcel(tabelaMotoristas())}>⬇️ Excel</Button>
            <Button variante="secundario" onClick={() => exportarPDF(tabelaMotoristas())}>🖨️ PDF</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Motorista</th>
                <th className="px-2 py-2">Cidade</th>
                <th className="px-2 py-2 text-center">Respondidas</th>
                <th className="px-2 py-2 text-center">Taxa resposta</th>
                <th className="px-2 py-2 text-center">Disponível</th>
                <th className="px-2 py-2 text-center">Taxa disponib.</th>
              </tr>
            </thead>
            <tbody>
              {estatisticas
                .slice()
                .sort((a, b) => b.taxaResposta - a.taxaResposta)
                .map((e) => (
                  <tr key={e.motorista.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-2">
                      <Link to={`/motoristas/${e.motorista.id}`} className="font-semibold text-slate-800 hover:text-marca-texto">
                        {e.motorista.nome}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-slate-600">{e.motorista.cidade}</td>
                    <td className="px-2 py-2 text-center">{e.respondidas}/{e.totalChamadas}</td>
                    <td className="px-2 py-2 text-center font-semibold">{Math.round(e.taxaResposta * 100)}%</td>
                    <td className="px-2 py-2 text-center">{e.disponiveis}</td>
                    <td className="px-2 py-2 text-center font-semibold">{Math.round(e.taxaDisponibilidade * 100)}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
